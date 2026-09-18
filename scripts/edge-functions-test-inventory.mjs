import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functionsRoot = path.join(repoRoot, "supabase", "functions");
const edgeConfigPath = path.join(repoRoot, "vitest.edge-functions.config.ts");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

export async function findOmittedTestedEdgeFunctionDirs() {
  const files = await walk(functionsRoot);
  const testedDirs = new Set(
    files
      .filter((file) => /\.test\.(?:ts|tsx|js|mjs)$/.test(file))
      .map((file) => path.relative(functionsRoot, path.dirname(file)).split(path.sep)[0])
      .filter(Boolean),
  );

  const config = await readFile(edgeConfigPath, "utf8");
  return [...testedDirs]
    .filter((dir) => !config.includes(`supabase/functions/${dir}/`))
    .sort();
}

