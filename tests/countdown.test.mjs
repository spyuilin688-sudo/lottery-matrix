import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCountdown,
  formatNextDrawAt,
  nextCountdownSeconds,
  parseCountdown,
  secondsUntil,
} from "../src/countdown.mjs";

test("將 HH:MM:SS 轉成秒數", () => {
  assert.equal(parseCountdown("18:30:00"), 66_600);
});

test("每秒遞減後維持 HH:MM:SS 格式", () => {
  assert.equal(formatCountdown(66_599), "18:29:59");
});

test("API 未提供 nextDrawAt 時，備用倒數每秒遞減而不是重設固定值", () => {
  assert.equal(nextCountdownSeconds(66_600), 66_599);
});

test("備用倒數到零後維持零秒", () => {
  assert.equal(nextCountdownSeconds(0), 0);
});

test("倒數到零後不顯示負數", () => {
  assert.equal(formatCountdown(-1), "00:00:00");
});

test("依 API 的 nextDrawAt 與目前時間計算剩餘秒數", () => {
  assert.equal(
    secondsUntil("2026-08-14T20:30:00+08:00", Date.parse("2026-08-14T20:29:59+08:00")),
    1,
  );
});

test("API 開獎時間已過時維持零秒", () => {
  assert.equal(
    secondsUntil("2026-08-14T20:30:00+08:00", Date.parse("2026-08-14T20:30:01+08:00")),
    0,
  );
});

test("將 API 開獎時間顯示為台北日期、星期與時間", () => {
  assert.equal(formatNextDrawAt("2026-08-14T20:30:00+08:00"), "08/14 (五) 20:30");
});
