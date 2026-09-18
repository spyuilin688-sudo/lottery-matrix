#!/usr/bin/env node
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "index.html");
const worker = path.join(root, "worker", "index.js");
const hosting = path.join(root, ".openai", "hosting.json");
const clientStage = path.join(root, ".sites-client-stage");
const client = path.join(dist, "client");

for (const file of [index, worker, hosting]) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

rmSync(clientStage, { recursive: true, force: true });
cpSync(dist, clientStage, { recursive: true });
mkdirSync(client, { recursive: true });
cpSync(clientStage, client, { recursive: true });
rmSync(clientStage, { recursive: true, force: true });

mkdirSync(path.join(dist, "server"), { recursive: true });
mkdirSync(path.join(dist, ".openai"), { recursive: true });
copyFileSync(worker, path.join(dist, "server", "index.js"));
copyFileSync(hosting, path.join(dist, ".openai", "hosting.json"));

console.log("Prepared Sites build: dist/client, dist/server/index.js and dist/.openai/hosting.json");
