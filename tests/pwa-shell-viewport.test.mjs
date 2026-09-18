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

test("正式 PWA 與 PhoneFrame 預覽各自提供頂部安全區來源", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const tokens = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const phoneFrame = await readFile(new URL("../src/mobile/PhoneFrame.tsx", import.meta.url), "utf8");

  assert.match(html, /viewport-fit=cover/);
  assert.match(tokens, /--layout-safe-area-top:\s*env\(safe-area-inset-top, 0px\);/);
  assert.match(styles, /\.app-screen\s*>\s*\.mobile-scroll\s*\{[^}]*top:\s*var\(--layout-safe-area-top\);/s);
  assert.match(phoneFrame, /"--layout-safe-area-top":\s*`\$\{geometry\.safeArea\.top\}px`/);
});
