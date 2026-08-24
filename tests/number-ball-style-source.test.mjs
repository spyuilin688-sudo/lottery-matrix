import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";
import { readLocalCss } from "./helpers/read-local-css.mjs";

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
  const homepage = readLocalCss(new URL("src/homepage-repair.css", root));

  assert.match(
    formal,
    /\.home-screen \.latest-draw-card\s*\{[^}]*--draw-special-ball-size:/s,
  );
  assert.doesNotMatch(homepage, /--draw-special-ball-size\s*:/);
});

test("六合彩首頁使用 -1.5px 底線、兩個歷史情境使用 0px 基線", async () => {
  const formal = await readFile(new URL("src/number-ball.css", root), "utf8");

  assert.match(
    formal,
    /\.home-screen[^}]*data-lottery="六合彩"[^}]*\{[^}]*--underline-y:\s*-1\.5px/s,
  );
  for (const selector of [
    /^\.matrix-explore-main-screen \.matrix-explore-history-panel\[data-lottery="六合彩"\] \.number-ball-component\.history-lottery-ball$/,
    /^\.draw-history-screen \.draw-history-panel\[data-lottery="六合彩"\] \.number-ball-component\.history-lottery-ball$/,
  ]) {
    const bodies = ruleBodies(formal, selector);
    assert.equal(bodies.length, 1);
    assert.match(bodies[0], /--underline-y:\s*0px;/);
    assert.match(bodies[0], /transform:\s*none;/);
  }
});

test("近10期與歷史開獎六合彩使用各自正式響應規則", async () => {
  const formal = await readFile(new URL("src/number-ball.css", root), "utf8");

  const nearTenRules = ruleBodies(
    formal,
    /^\.matrix-explore-main-screen \.matrix-explore-history-panel\[data-lottery="六合彩"\] \.number-ball-component\.history-lottery-ball$/,
  );
  assert.equal(nearTenRules.length, 1);
  const nearTenRule = nearTenRules[0];
  assert.match(nearTenRule, /--number-ball-size:\s*var\(--matrix-history-ball-size\)/);
  assert.match(nearTenRule, /--number-font-size:\s*clamp\(9px, 2\.56vw, 10px\)/);
  assert.match(nearTenRule, /--number-y:\s*0px/);
  assert.match(nearTenRule, /--underline-width:\s*clamp\(8px, 2\.31vw, 9px\)/);
  assert.match(nearTenRule, /--underline-height:\s*\.7px/);
  assert.match(nearTenRule, /--underline-y:\s*0px/);
  assert.match(nearTenRule, /transform:\s*none/);

  assert.match(
    formal,
    /\.history-panel \.history-numbers\[data-has-special="true"\] \.number-ball-component\.history-lottery-ball\[data-lottery="六合彩"\]\s*\{[^}]*--number-ball-asset-scale:\s*1\.62/s,
  );

  const historyRules = ruleBodies(
    formal,
    /^\.draw-history-screen \.draw-history-panel\[data-lottery="六合彩"\] \.number-ball-component\.history-lottery-ball$/,
  );
  assert.equal(historyRules.length, 1);
  assert.match(historyRules[0], /--number-ball-size:\s*var\(--matrix-history-ball-size\)/);
  assert.match(historyRules[0], /--number-font-size:\s*clamp\(9px, 2\.56vw, 10px\)/);
  assert.match(historyRules[0], /--underline-y:\s*0px/);

  const opticalOffsets = [
    ["red", "-0.06px", "0.11px"],
    ["green", "-0.02px", "0.36px"],
    ["blue", "0.48px", "-0.16px"],
  ];
  for (const [tone, x, y] of opticalOffsets) {
    const bodies = ruleBodies(
      formal,
      new RegExp(`^\\.draw-history-screen \\.draw-history-panel\\[data-lottery="六合彩"\\] \\.number-ball-component\\.history-lottery-ball\\[data-tone="${tone}"\\]$`),
    );
    assert.equal(bodies.length, 1);
    assert.match(bodies[0], new RegExp(`--number-x:\\s*${x.replace(".", "\\.")};`));
    assert.match(bodies[0], new RegExp(`--number-y:\\s*${y.replace(".", "\\.")};`));
  }
});
