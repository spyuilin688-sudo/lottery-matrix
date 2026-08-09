import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';

const workerSource = `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);

    if (response.status !== 404 || request.method !== "GET") {
      return response;
    }

    const accept = request.headers.get("accept") || "";
    if (!accept.includes("text/html")) {
      return response;
    }

    const indexUrl = new URL("/index.html", request.url);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
`;

for (const entry of await readdir('dist')) {
  if (entry !== 'client') {
    await rm(`dist/${entry}`, { recursive: true, force: true });
  }
}

await rm('dist/client/resources/lottery-matrix', { force: true });

await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await writeFile('dist/server/index.js', workerSource, 'utf8');
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
