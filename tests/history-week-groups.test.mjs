import assert from "node:assert/strict";
import test from "node:test";
import { groupHistoryByCalendarWeek, isNearHistoryWeekBoundary } from "../src/history-week-groups.ts";

const record = (period, drawDate) => ({ period, drawDate, numbers: [] });

test("同一個星期一至星期日歸入同一張資訊卡", () => {
  const groups = groupHistoryByCalendarWeek([
    record("6", "2026/08/08（六）"),
    record("5", "2026/08/07（五）"),
    record("4", "2026/08/03（一）"),
    record("3", "2026/08/02（日）"),
  ]);

  assert.deepEqual(groups.map((group) => group.map((item) => item.period)), [["6", "5", "4"], ["3"]]);
});

test("停開不補筆數，只有一期的曆週維持一筆", () => {
  const groups = groupHistoryByCalendarWeek([
    record("3", "2026/08/08（六）"),
    record("2", "2026/08/04（二）"),
    record("1", "2026/07/28（二）"),
  ]);

  assert.deepEqual(groups.map((group) => group.length), [2, 1]);
});

test("近10期依各彩種的跨週開獎日加深分隔線", () => {
  assert.equal(isNearHistoryWeekBoundary("今彩539", "2026/08/10（一）", "2026/08/08（六）"), true);
  assert.equal(isNearHistoryWeekBoundary("天天樂", "2026/08/10（一）", "2026/08/09（日）"), true);
  assert.equal(isNearHistoryWeekBoundary("六合彩", "2026/08/11（二）", "2026/08/08（六）"), true);
  assert.equal(isNearHistoryWeekBoundary("大樂透", "2026/08/11（二）", "2026/08/07（五）"), true);
  assert.equal(isNearHistoryWeekBoundary("六合彩", "2026/08/08（六）", "2026/08/06（四）"), false);
});

test("過年加開日仍依週一至週日的曆週分隔", () => {
  assert.equal(isNearHistoryWeekBoundary("今彩539", "2026/02/23（一）", "2026/02/22（日）"), true);
  assert.equal(isNearHistoryWeekBoundary("大樂透", "2026/02/18（三）", "2026/02/15（日）"), true);
  assert.equal(isNearHistoryWeekBoundary("大樂透", "2026/02/18（三）", "2026/02/17（二）"), false);
});

test("六合彩單週只開一期時該期上下都是週界線", () => {
  assert.equal(isNearHistoryWeekBoundary("六合彩", "2026/08/25（二）", "2026/08/18（二）"), true);
  assert.equal(isNearHistoryWeekBoundary("六合彩", "2026/08/18（二）", "2026/08/11（二）"), true);
});
