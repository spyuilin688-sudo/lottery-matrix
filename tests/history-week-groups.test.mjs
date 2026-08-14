import assert from "node:assert/strict";
import test from "node:test";
import { groupHistoryByCalendarWeek } from "../src/history-week-groups.ts";

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
