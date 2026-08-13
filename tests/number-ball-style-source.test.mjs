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
