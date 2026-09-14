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

test("我的頁面會員卡裁除素材頂端留白後仍保持內容座標對齊", () => {
  const component = fs.readFileSync(new URL("../src/features/MemberPages.tsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");

  assert.match(component, /showSubscription \\? "0 48 1563 692" : "0 48 1563 339"/);
  assert.match(css, /--membership-profile-height:\\s*21\\.68906cqw;/);
  assert.match(css, /\\.profile-avatar\\s*\\{[^}]*top:\\s*3\\.64698cqw;/s);
  assert.match(css, /\\.profile-copy\\s*\\{[^}]*top:\\s*5\\.81898cqw;/s);
  assert.match(css, /\\.profile-logout\\s*\\{[^}]*top:\\s*10\\.68898cqw;/s);
});
