import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { build } from "vite";

const outDir = await mkdtemp(join(tmpdir(), "lottery-matrix-rendered-html-"));

after(async () => {
  await rm(outDir, { recursive: true, force: true });
});

test("serves current built metadata through the worker SPA fallback", async () => {
  await build({
    logLevel: "silent",
    build: {
      outDir,
      emptyOutDir: true,
    },
  });
  const builtHtml = await readFile(join(outDir, "index.html"), "utf8");
  const { default: worker } = await import(new URL("../worker/index.js", import.meta.url).href);
  const requestedPaths = [];

  const response = await worker.fetch(
    new Request("http://localhost/member/profile", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const pathname = new URL(request.url).pathname;
          requestedPaths.push(pathname);
          return pathname === "/index.html"
            ? new Response(builtHtml, {
              status: 200,
              headers: { "content-type": "text/html; charset=UTF-8" },
            })
            : new Response("Not found", { status: 404 });
        },
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.deepEqual(requestedPaths, ["/member/profile", "/index.html"]);

  const html = await response.text();
  assert.match(html, /<html(?=[^>]*\blang=["']zh-Hant-TW["'])[^>]*>/i);
  assert.match(
    html,
    /<meta(?=[^>]*\bname=["']viewport["'])(?=[^>]*\bcontent=["'][^"']*viewport-fit=cover[^"']*["'])[^>]*>/i,
  );
  assert.match(
    html,
    /<meta(?=[^>]*\bname=["']theme-color["'])(?=[^>]*\bcontent=["']#02070c["'])[^>]*>/i,
  );
  assert.match(html, /<title>\s*樂彩 Matrix\s*<\/title>/i);
});
