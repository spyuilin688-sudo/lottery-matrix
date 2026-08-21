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

test("六合彩底線依正式使用情境套用對應間距", async () => {
  const formal = await readFile(new URL("src/number-ball.css", root), "utf8");

  assert.match(
    formal,
    /\.home-screen[^}]*data-lottery="六合彩"[^}]*\{[^}]*--underline-y:\s*-1\.5px/s,
  );
  assert.match(
    formal,
    /\.matrix-explore-main-screen \.history-panel\[data-lottery="六合彩"\][^{]*\{[^}]*--underline-y:\s*-1px/s,
  );
  assert.match(
    formal,
    /\.draw-history-screen[^{}]*data-lottery="六合彩"[^{}]*\{[^}]*--underline-y:\s*-1\.5px/s,
  );
});

test("近10期與歷史開獎六合彩使用各自正式響應規則", async () => {
  const formal = await readFile(new URL("src/number-ball.css", root), "utf8");

  const nearTenRule = formal.match(
    /\.matrix-explore-main-screen \.history-panel\[data-lottery="六合彩"\] \.number-ball-component\.history-lottery-ball\s*\{[^}]*\}/s,
  )?.[0] ?? "";
  assert.match(nearTenRule, /--number-ball-size:\s*var\(--matrix-history-ball-size\)/);
  assert.match(nearTenRule, /--number-font-size:\s*clamp\(7px, 2\.31vw, 9px\)/);
  assert.match(nearTenRule, /--number-y:\s*0px/);
  assert.match(nearTenRule, /--underline-width:\s*clamp\(7px, 2\.31vw, 9px\)/);
  assert.match(nearTenRule, /--underline-height:\s*\.7px/);
  assert.match(nearTenRule, /--underline-y:\s*-1px/);
  assert.match(nearTenRule, /transform:\s*translateY\(2px\)/);

  assert.match(
    formal,
    /\.history-panel \.history-numbers\[data-has-special="true"\] \.number-ball-component\.history-lottery-ball\[data-lottery="六合彩"\]\s*\{[^}]*--number-ball-asset-scale:\s*1\.62/s,
  );

  assert.match(
    formal,
    /\.draw-history-screen[^{}]*:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\)[^{]*\{[^}]*--number-ball-size:\s*26px[^}]*--number-font-size:\s*11px[^}]*--number-y:\s*0px[^}]*--underline-width:\s*10px/s,
  );

  const historyRule = formal.match(
    /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball\[data-lottery="六合彩"\]\s*\{[^}]*\}/s,
  )?.[0] ?? "";
  assert.match(historyRule, /--number-ball-asset-scale:\s*1\.62/);
  assert.match(historyRule, /--underline-height:\s*\.75px/);
  assert.match(historyRule, /--underline-y:\s*-1\.5px/);
  assert.doesNotMatch(historyRule, /--number-ball-size\s*:/);
  assert.doesNotMatch(historyRule, /--number-font-size\s*:/);
  assert.doesNotMatch(historyRule, /--number-y\s*:/);
  assert.doesNotMatch(historyRule, /--underline-width\s*:/);
});
