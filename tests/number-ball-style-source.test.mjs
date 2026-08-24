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

test("六合彩首頁與近10期保留既有基線，歷史開獎改為 0.5px 底線間距", async () => {
  const formal = await readFile(new URL("src/number-ball.css", root), "utf8");

  assert.match(
    formal,
    /\.home-screen[^}]*data-lottery="六合彩"[^}]*\{[^}]*--underline-y:\s*-1\.5px/s,
  );
  const nearTen = ruleBodies(formal, /^\.matrix-explore-main-screen \.matrix-explore-history-panel\[data-lottery="六合彩"\] \.number-ball-component\.history-lottery-ball$/);
  assert.equal(nearTen.length, 1);
  assert.match(nearTen[0], /--underline-y:\s*-.4px;/);
  const history = ruleBodies(formal, /^\.draw-history-screen \.draw-history-panel\[data-lottery="六合彩"\] \.number-ball-component\.history-lottery-ball$/);
  assert.equal(history.length, 1);
  assert.match(history[0], /--underline-y:\s*\.1px;/);
  assert.match(history[0], /transform:\s*translateY\(2px\);/);
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
  assert.match(nearTenRule, /--underline-y:\s*-.4px/);
  assert.match(nearTenRule, /transform:\s*translateY\(2px\)/);

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
  assert.match(historyRules[0], /--number-x:\s*0px/);
  assert.match(historyRules[0], /--number-y:\s*-\.5px/);
  assert.match(historyRules[0], /--underline-y:\s*\.1px/);

  assert.match(
    formal,
    /\.matrix-explore-main-screen \.matrix-explore-history-panel\[data-lottery="六合彩"\] \.number-ball-component\.history-lottery-ball \.number-ball-value,\s*\.draw-history-screen \.draw-history-panel\[data-lottery="六合彩"\] \.number-ball-component\.history-lottery-ball \.number-ball-value\s*\{[^}]*font-weight:\s*900;/s,
  );
  assert.doesNotMatch(formal, /\.draw-history-screen \.draw-history-panel\[data-lottery="六合彩"\][^{]*\[data-tone=/);
});
