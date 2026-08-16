import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("正式 PWA 外層使用全螢幕深色背景", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /name="theme-color" content="#02070c"/);
  assert.match(styles, /:root[\s\S]*background: #02070c;/);
  assert.match(styles, /html,\s*body,\s*#root[\s\S]*height: 100dvh;[\s\S]*background: #02070c;/);
});
