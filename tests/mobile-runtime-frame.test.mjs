import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("正式入口使用手機模擬外框", async () => {
  const source = await readFile(new URL("../src/mobile/MobileRuntime.tsx", import.meta.url), "utf8");

  assert.match(source, /import \\{ PhoneFrame \\} from "\\.\\/PhoneFrame";/);
  assert.match(source, /<PhoneFrame>[\\s\\S]*<\\/PhoneFrame>/);
  assert.doesNotMatch(source, /<DirectScreen>/);
});
