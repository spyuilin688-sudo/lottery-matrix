import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTongXingPairs,
  filterHistoryRecords,
  isDuplicateLookupNumber,
  normalizeLookupNumber,
} from "../src/feature-tool-logic.ts";

test("normalizeLookupNumber accepts 01-49 and pads single digits", () => {
  assert.equal(normalizeLookupNumber("1"), "01");
  assert.equal(normalizeLookupNumber("9"), "09");
  assert.equal(normalizeLookupNumber("10"), "10");
  assert.equal(normalizeLookupNumber("49"), "49");
  assert.equal(normalizeLookupNumber("0"), "");
  assert.equal(normalizeLookupNumber("50"), "");
  assert.equal(normalizeLookupNumber("a1"), "01");
});

test("isDuplicateLookupNumber ignores the field being edited", () => {
  const values = ["02", "07", ""];
  assert.equal(isDuplicateLookupNumber(values, 2, "02"), true);
  assert.equal(isDuplicateLookupNumber(values, 0, "02"), false);
});

test("filterHistoryRecords applies issue and selected date", () => {
  const records = [
    { issue: "115000031", drawDate: "2026-07-31 20:30:00", numbers: ["01"] },
    { issue: "115000030", drawDate: "2026-07-30 20:30:00", numbers: ["02"] },
  ];

  assert.deepEqual(filterHistoryRecords(records, { issue: "0031", date: "2026/07/31" }), [records[0]]);
  assert.deepEqual(filterHistoryRecords(records, { issue: "", date: "" }), records);
});

test("buildTongXingPairs finds matching locked draws and uses the selected future offset", () => {
  const records = [
    { issue: "D", numbers: ["20", "21", "22"] },
    { issue: "C", numbers: ["30", "31", "32"] },
    { issue: "B", numbers: ["40", "41", "42"] },
    { issue: "A", numbers: ["01", "02", "03"] },
  ];

  const afterTwo = buildTongXingPairs(records, ["01", "02"], 2);
  const afterThree = buildTongXingPairs(records, ["01", "02"], 3);
  assert.deepEqual(afterTwo, [{ lockedEntry: records[3], predictedEntry: records[1] }]);
  assert.deepEqual(afterThree, [{ lockedEntry: records[3], predictedEntry: records[0] }]);
  assert.deepEqual(buildTongXingPairs(records, [], 2), []);
});
