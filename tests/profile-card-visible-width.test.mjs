import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("我的頁面會員卡可見金框補償素材左右內縮", () => {
  const main = fs.readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const cssUrl = new URL("../src/profile-card-visible-width.css", import.meta.url);
  const css = fs.existsSync(cssUrl) ? fs.readFileSync(cssUrl, "utf8") : "";

  assert.match(main, /import \"\.\/profile-card-visible-width\.css\";/);
  assert.match(css, /\.profile-screen \.membership-card-stack\s*\{[^}]*width:\s*calc\(100% \+ 20px\);[^}]*margin-inline:\s*-10px;/s);
});
