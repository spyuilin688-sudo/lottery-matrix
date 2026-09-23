import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_TARGETS = [
  ["SMOKE_PWA_URL", "PWA"],
  ["SMOKE_ADMIN_URL", "Admin"],
];

function normalizeHttpUrl(envName, rawValue) {
  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${envName} must be a valid http(s) URL`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${envName} must use http or https`);
  }

  return parsed.href;
}

export function collectSmokeTargets(env = process.env) {
  const missing = REQUIRED_TARGETS
    .filter(([envName]) => !env[envName]?.trim())
    .map(([envName]) => envName);

  if (missing.length > 0) {
    throw new Error(`Missing required smoke URLs: ${missing.join(", ")}`);
  }

  const targets = REQUIRED_TARGETS.map(([envName, name]) => ({
    name,
    url: normalizeHttpUrl(envName, env[envName].trim()),
  }));

  if (env.SMOKE_API_URL?.trim()) {
    targets.push({
      name: "API",
      url: normalizeHttpUrl("SMOKE_API_URL", env.SMOKE_API_URL.trim()),
    });
  }

  return targets;
}

export function evaluateSmokeResponse(name, url, status) {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new Error(`${name} returned an invalid HTTP status for ${url}: ${status}`);
  }

  if (status >= 500) {
    throw new Error(`${name} smoke check failed with HTTP ${status}: ${url}`);
  }

  if (name !== "API" && status >= 400) {
    throw new Error(`${name} smoke check failed with HTTP ${status}: ${url}`);
  }
}

async function fetchSmokeResponse(name, url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: {
        accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        "user-agent": "matrix-lottery-production-smoke/1.0",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${name} smoke request failed: ${url} (${detail})`);
  }
  evaluateSmokeResponse(name, url, response.status);
  console.log(`[smoke] ${name}: HTTP ${response.status} ${url}`);
  return response;
}

async function readSmokeText(name, url, response) {
  try {
    return await response.text();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${name} smoke response could not be read: ${url} (${detail})`);
  }
}

function stampedWorkerAssets(source) {
  const stamp = source.match(/^const STATIC_CACHE_NAME = "matrix-pwa-shell-[a-f0-9]{16}";$/m);
  const assetDeclaration = source.match(/^const BUILD_ASSET_PATHS = (\[[^\n;]+\]);$/m);
  if (!stamp || !assetDeclaration) throw new Error("PWA worker has no valid build stamp or asset list");
  let assets;
  try { assets = JSON.parse(assetDeclaration[1]); } catch { /* Invalid worker stamp. */ }
  if (!Array.isArray(assets) || !assets.some(path => typeof path === "string" && /^\/assets\/.*\.css$/.test(path))
    || !assets.some(path => typeof path === "string" && /^\/assets\/.*\.m?js$/.test(path))) {
    throw new Error("PWA worker has no valid build stamp or asset list");
  }
  return new Set(assets);
}

function htmlEntryAssets(html, url) {
  const paths = new Set();
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)]
      .map(([, key, value]) => [key.toLowerCase(), value]));
    const asset = /^<script/i.test(tag) && attributes.type === "module" ? attributes.src
      : ["stylesheet", "modulepreload"].includes(attributes.rel) ? attributes.href : null;
    if (!asset) continue;
    const path = new URL(asset, url);
    if (path.origin !== new URL(url).origin || !path.pathname.startsWith("/assets/")) {
      throw new Error(`PWA ${url} has an unexpected entry asset: ${asset}`);
    }
    paths.add(path.pathname + path.search);
  }
  if (![...paths].some(path => /\.css(?:\?|$)/.test(path))
    || ![...paths].some(path => /\.m?js(?:\?|$)/.test(path))) {
    throw new Error(`PWA ${url} has no CSS and JS entry assets`);
  }
  return paths;
}

async function checkPwaBuild(pwaUrl, fetchImpl) {
  const rootUrl = new URL("/", pwaUrl).href;
  const indexUrl = new URL("/index.html", pwaUrl).href;
  const workerUrl = new URL("/push-service-worker.js", pwaUrl).href;
  const root = await fetchSmokeResponse("PWA", rootUrl, fetchImpl);
  const index = await fetchSmokeResponse("PWA", indexUrl, fetchImpl);
  const worker = await fetchSmokeResponse("PWA", workerUrl, fetchImpl);
  const workerAssets = stampedWorkerAssets(await readSmokeText("PWA", workerUrl, worker));
  const rootAssets = htmlEntryAssets(await readSmokeText("PWA", rootUrl, root), rootUrl);
  const indexAssets = htmlEntryAssets(await readSmokeText("PWA", indexUrl, index), indexUrl);
  for (const [url, paths] of [[rootUrl, rootAssets], [indexUrl, indexAssets]]) {
    const missing = [...paths].filter(path => !workerAssets.has(path));
    if (missing.length) throw new Error(`PWA ${url} assets missing from stamped worker: ${missing.join(", ")}`);
  }
  if (rootAssets.size !== indexAssets.size || [...rootAssets].some(path => !indexAssets.has(path))) {
    throw new Error(`PWA ${rootUrl} and ${indexUrl} entry assets disagree`);
  }
}

export async function runProductionSmoke({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Global fetch is unavailable; Node.js 18+ is required");
  }

  const targets = collectSmokeTargets(env);

  for (const target of targets) {
    if (target.name === "PWA") await checkPwaBuild(target.url, fetchImpl);
    else await fetchSmokeResponse(target.name, target.url, fetchImpl);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  runProductionSmoke().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
