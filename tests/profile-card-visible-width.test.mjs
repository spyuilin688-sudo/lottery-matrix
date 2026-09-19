import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("我的頁面會員卡可見金框補償素材左右內縮", () => {
  const main = fs.readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const cssUrl = new URL("../src/feature-pages.css", import.meta.url);
  const css = fs.existsSync(cssUrl) ? fs.readFileSync(cssUrl, "utf8") : "";

  assert.doesNotMatch(main, /profile-card-visible-width\.css/);
  assert.match(css, /\.membership-card-stack\s*\{[^}]*width:\s*calc\(100% \+ 20px\);[^}]*margin-inline:\s*-10px;/s);
});

test("我的頁面會員卡裁除素材頂端留白後仍保持內容座標對齊", () => {
  const component = fs.readFileSync(new URL("../src/features/MemberPages.tsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");

  assert.match(component, /showSubscription \? "0 48 1563 692" : "0 48 1563 339"/);
  assert.match(css, /--membership-profile-height:\s*21\.68906cqw;/);
  assert.match(css, /\.profile-avatar\s*\{[^}]*top:\s*3\.64698cqw;/s);
  assert.match(css, /\.profile-copy\s*\{[^}]*top:\s*5\.81898cqw;/s);
  // 6aa6725 moved the existing artwork coordinate to the shared auth container.
  assert.match(component, /className="profile-auth-actions"/);
  assert.match(css, /\.profile-auth-actions\s*\{[^}]*position:\s*absolute;[^}]*top:\s*10\.68898cqw;[^}]*transform:\s*translateY\(-50%\);/s);
  const logout = css.match(/\.profile-logout\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(logout, /position:\s*static;/);
  assert.match(logout, /min-height:\s*44px;/);
  assert.doesNotMatch(logout, /\b(?:top|left|right|transform):/);
});
