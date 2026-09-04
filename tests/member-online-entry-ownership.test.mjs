import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mainSource = readFileSync("src/main.tsx", "utf8");
const bridgeSource = readFileSync("src/auth/MemberSessionBridge.tsx", "utf8");

test("production entry does not own member online tracking", () => {
  assert.doesNotMatch(mainSource, /startMemberOnlineTracking/);
  assert.doesNotMatch(mainSource, /postMemberOnline/);
  assert.match(bridgeSource, /startMemberOnlineTracking/);
  assert.match(bridgeSource, /postMemberOnline/);
});
