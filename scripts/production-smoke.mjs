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

export async function runProductionSmoke({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Global fetch is unavailable; Node.js 18+ is required");
  }

  const targets = collectSmokeTargets(env);

  for (const target of targets) {
    let response;
    try {
      response = await fetchImpl(target.url, {
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
      throw new Error(`${target.name} smoke request failed: ${target.url} (${detail})`);
    }

    evaluateSmokeResponse(target.name, target.url, response.status);
    console.log(`[smoke] ${target.name}: HTTP ${response.status} ${target.url}`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  runProductionSmoke().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
