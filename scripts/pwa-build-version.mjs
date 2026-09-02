import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WORKER_FILE = "push-service-worker.js";
const BUILD_STAMP = /\n?\/\/ matrix-build:[a-f0-9]{16}\s*$/;
const CACHE_VERSION = /matrix-pwa-shell-(?:__BUILD_ID__|[a-f0-9]{16})/g;

async function listFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(root, absolute);
    return [path.relative(root, absolute).split(path.sep).join("/")];
  }));
  return nested.flat();
}

export async function stampPwaWorker(outDir) {
  const files = (await listFiles(outDir))
    .filter((file) => file !== WORKER_FILE)
    .sort();
  const hash = createHash("sha256");

  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(path.join(outDir, file)));
    hash.update("\0");
  }

  const buildId = hash.digest("hex").slice(0, 16);
  const workerPath = path.join(outDir, WORKER_FILE);
  const worker = (await readFile(workerPath, "utf8"))
    .replace(BUILD_STAMP, "")
    .replace(CACHE_VERSION, `matrix-pwa-shell-${buildId}`)
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
