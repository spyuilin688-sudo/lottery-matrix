import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WORKER_FILE = "push-service-worker.js";
const BUILD_STAMP = /\n?\/\/ matrix-build:[a-f0-9]{16}\s*$/;
const CACHE_VERSION = /matrix-pwa-shell-(?:__BUILD_ID__|[a-f0-9]{16})/g;
const BUILD_ASSETS = /const BUILD_ASSET_PATHS = \[[^;]*\];/;
const SOURCE_SHA = /const BUILD_SOURCE_SHA = ["'](?:__SOURCE_SHA__|[a-f0-9]{7,40}|unknown)["'];/;

async function listFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(root, absolute);
    return [path.relative(root, absolute).split(path.sep).join("/")];
  }));
  return nested.flat();
}

export async function stampPwaWorker(outDir, options = {}) {
  const files = (await listFiles(outDir))
    .filter((file) => file !== WORKER_FILE)
    .sort();
  const hash = createHash("sha256");
  const workerPath = path.join(outDir, WORKER_FILE);
  const template = (await readFile(workerPath, "utf8"))
    .replace(BUILD_STAMP, "")
    .replace(CACHE_VERSION, "matrix-pwa-shell-__BUILD_ID__")
    .replace(SOURCE_SHA, 'const BUILD_SOURCE_SHA = "__SOURCE_SHA__";')
    .replace(BUILD_ASSETS, "const BUILD_ASSET_PATHS = [];")
    .trimEnd();
  hash.update(WORKER_FILE).update("\0").update(template).update("\0");

  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(path.join(outDir, file)));
    hash.update("\0");
  }

  const buildId = hash.digest("hex").slice(0, 16);
  const candidateSha = String(options.sourceSha || process.env.CF_PAGES_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "unknown").trim().toLowerCase();
  const sourceSha = /^[a-f0-9]{7,40}$/.test(candidateSha) ? candidateSha : "unknown";
  const worker = template
    .replace(CACHE_VERSION, `matrix-pwa-shell-${buildId}`)
    .replace(SOURCE_SHA, `const BUILD_SOURCE_SHA = "${sourceSha}";`)
    .replace(BUILD_ASSETS, `const BUILD_ASSET_PATHS = ${JSON.stringify(files.filter(file => /^assets\/.*\.(?:css|m?js)$/.test(file)).map(file => `/${file}`))};`)
    .trimEnd();
  await writeFile(workerPath, `${worker}\n// matrix-build:${buildId}\n`);
  return buildId;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) throw new Error("PWA build output directory is required");
  const buildId = await stampPwaWorker(path.resolve(target));
  console.log(`Stamped PWA service worker: ${buildId}`);
}
