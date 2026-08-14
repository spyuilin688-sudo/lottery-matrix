import test from "node:test";
import assert from "node:assert/strict";
import { formatCountdown, parseCountdown } from "../src/countdown.mjs";

test("parses a countdown value into seconds", () => {
  assert.equal(parseCountdown("18:30:00"), 66_600);
});

test("formats countdown seconds after one tick", () => {
  assert.equal(formatCountdown(66_599), "18:29:59");
});

test("never formats a negative countdown", () => {
  assert.equal(formatCountdown(-1), "00:00:00");
});
