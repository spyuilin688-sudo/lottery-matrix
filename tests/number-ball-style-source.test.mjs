import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const src = new URL("src/", root);

test("NumberBall visual rules have one formal CSS source", async () => {
  const cssFiles = (await readdir(src)).filter((name) => name.endsWith(".css"));
  const forbiddenRule =
    /(?:\.number-ball(?:-component|-asset|-value)?\b|\.history-lottery-ball\b|\.ball-(?:surface|number)\b|--number-ball-size\s*:|--number-font-size\s*:|--underline-(?:width|height|y)\s*:)/;
  const offenders = [];

  for (const name of cssFiles) {
    if (name === "number-ball.css") continue;
    const content = await readFile(new URL(`src/${name}`, root), "utf8");
    if (forbiddenRule.test(content)) offenders.push(name);
  }

  assert.deepEqual(offenders, []);
});

test("legacy NumberBall bridge is removed", async () => {
  await assert.rejects(access(new URL("src/number-ball-bridge.css", root)));
});

test("shared special-ball geometry is declared by number-ball.css", async () => {
  const formal = await readFile(new URL("src/number-ball.css", root), "utf8");
  const homepage = await readFile(new URL("src/homepage-repair.css", root), "utf8");

  assert.match(
    formal,
    /\.home-screen \.latest-draw-card\s*\{[^}]*--draw-special-ball-size:/s,
  );
  assert.doesNotMatch(homepage, /--draw-special-ball-size\s*:/);
});

test("六合彩正式使用情境將底線向上校正", async () => {
  const formal = await readFile(new URL("src/number-ball.css", root), "utf8");
  assert.match(formal, /\.home-screen[^}]*data-lottery="六合彩"[^}]*--underline-y:\s*-1\.5px/s);
  assert.match(formal, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball\[data-lottery="六合彩"\][^}]*--underline-y:\s*-1\.2px/s);
});

test("六合彩沿用同頁大樂透的球徑、數字與底線寬度", async () => {
  const formal = await readFile(new URL("src/number-ball.css", root), "utf8");
  const markSixContextRules = formal.match(/[^{}]*data-lottery="六合彩"[^{}]*\{[^{}]*\}/g) ?? [];

  for (const rule of markSixContextRules.filter((rule) => !rule.includes('data-lottery="大樂透"'))) {
    assert.doesNotMatch(rule, /--number-ball-size\s*:/);
    assert.doesNotMatch(rule, /--number-font-size\s*:/);
    assert.doesNotMatch(rule, /--number-y\s*:/);
    assert.doesNotMatch(rule, /--underline-width\s*:/);
  }

  assert.match(formal, /\.history-panel[^{}]*:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\)[^{]*\{[^}]*--number-ball-size:\s*23\.5px[^}]*--underline-width:\s*10px/s);
  assert.match(formal, /\.draw-history-screen[^{}]*:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\)[^{]*\{[^}]*--number-ball-size:\s*26px[^}]*--number-font-size:\s*11px[^}]*--number-y:\s*0px[^}]*--underline-width:\s*10px/s);
});

test("近10期與歷史開獎只將六合彩彩球視覺直徑放大一像素", async () => {
  const formal = await readFile(new URL("src/number-ball.css", root), "utf8");
  assert.match(formal, /\.history-panel[^{}]*data-lottery="六合彩"[^{}]*\{[^}]*--number-ball-asset-scale:\s*1\.5206[^}]*--underline-y:\s*-1\.25px/s);
  assert.match(formal, /\.draw-history-screen[^{}]*data-lottery="六合彩"[^{}]*\{[^}]*--number-ball-asset-scale:\s*1\.5165[^}]*--underline-y:\s*-1\.2px/s);
});
