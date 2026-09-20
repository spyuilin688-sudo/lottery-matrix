// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TianyanApiRow, TianyanValidation } from "../matrix-algorithm-api";
import {
  buildTianyanCurrentRows,
  buildTianyanHistoricalRows,
  TianyanExpandedValidationGroups,
  TianyanPatchedSummary,
} from "../TianyanExpandedValidation";

const api = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock("../lottery-api", () => ({ fetchLotteryHistoryPeriods: api.history }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const item: TianyanApiRow = {
  id: "road-1",
  number: "10",
  lockedPosition: 2,
  predictionDistance: 5,
  consecutive: "準15進16",
  highestStreak: 15,
  predictionNumbers: ["12"],
  roadType: "複合",
  roadTypeLabel: "加減合值",
  hitCondition: "準5+（鎖定2碼）",
  numberOrder: "依號碼由小到大排序",
  ruleIds: ["rule-1", "rule-2"],
};

const validation: TianyanValidation = {
  itemId: "road-1",
  sourceA: {
    sourcePeriod: "115043",
    sourceNumbers: [12, 10, 8, 33, 32],
    lockedPosition: 2,
    lockedNumber: 10,
    predictionDistance: 5,
  },
  rules: [
    {
      id: "rule-1",
      validationPeriodOffset: 2,
      validationPeriod: "115044",
      validationPosition: 5,
      referenceOffset: 2,
      referencePosition: 5,
      algorithmType: "合值",
      value: 57,
      ruleValue: 57,
      currentBaseNumber: 4,
      currentPredictionNumber: 13,
    },
    {
      id: "rule-2",
      validationPeriodOffset: 3,
      validationPeriod: "115045",
      validationPosition: 2,
      referenceOffset: 3,
      referencePosition: 2,
      algorithmType: "加減",
      value: 31,
      ruleValue: 31,
      currentBaseNumber: 20,
      currentPredictionNumber: 12,
    },
  ],
  groupCount: 15,
  minimumIndependentHits: 3,
  rule1Only: 0,
  rule2Only: 0,
  bothHit: 15,
  mergedSearchPredictionNumbers: ["12"],
  historicalValidation: [
    {
      group: "g1",
      sourcePeriod: "115043",
      sourceNumbers: [12, 10, 8, 33, 32],
      lockedPosition: 2,
      lockedNumber: 10,
      predictionPeriod: "115048",
      predictionNumbers: [3, 36, 10, 12, 27],
      rule1: {
        validationPeriodOffset: 2,
        validationPeriod: "115044",
        validationPosition: 5,
        baseNumber: 4,
        algorithmType: "合值",
        candidateValues: [57],
        ruleValue: 57,
        calculationResult: 13,
        hit: true,
      },
      rule2: {
        validationPeriodOffset: 3,
        validationPeriod: "115045",
        validationPosition: 2,
        baseNumber: 20,
        algorithmType: "加減",
        candidateValues: [31],
        ruleValue: 31,
        calculationResult: 12,
        hit: true,
      },
      hitType: "bothHit",
      hitNumbers: [12],
      success: true,
    },
  ],
};

describe("Tianyan expanded validation", () => {
  it("renders expanded groups from the supplied validation and only reads lottery history", async () => {
    const wide = structuredClone(validation);
    wide.sourceA!.sourceNumbers.push(41, 49);
    wide.historicalValidation[0].sourceNumbers.push(41, 49);
    wide.historicalValidation[0].predictionNumbers.push(41, 49);
    api.history.mockResolvedValue(["115044", "115045"].map((period) => ({
      period,
      numbers: [1, 2, 3, 4, 5, 41, 49],
      sortedNumbers: [1, 2, 3, 4, 5, 41, 49],
    })));

    const { container } = render(
      <TianyanExpandedValidationGroups
        lottery="六合彩"
        numberOrder="依號碼由小到大排序"
        validation={wide}
      />,
    );

    await waitFor(() => expect(container.querySelector(".tianyan-expanded-validation-group")).not.toBeNull());
    expect(api.history).toHaveBeenCalledWith("六合彩", expect.arrayContaining(["115044", "115045"]));
    const rows = container.querySelectorAll(".tianyan-expanded-validation-group .explore-validation-numbers");
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      expect(row.querySelectorAll(".explore-validation-number")).toHaveLength(7);
      expect(row.querySelector(".explore-validation-special-separator")?.textContent).toBe("+");
    });
  });

  it("orders a historical block as lock, formula 1, formula 2, result", () => {
    const rows = buildTianyanHistoricalRows("今彩539", validation.historicalValidation[0], new Map([
      ["115044", [1, 2, 3, 4, 5]],
      ["115045", [20, 21, 22, 23, 24]],
    ]));
    expect(rows).not.toBeNull();
    expect(rows?.map((row) => row.period)).toEqual(["115043", "115044", "115045", "115048"]);
    expect(rows?.map((row) => row.right.kind)).toEqual(["lock", "formula", "formula", "result"]);
    expect(rows?.[1].numbers).toEqual([1, 2, 3, 4, 5]);
    expect(rows?.[2].numbers).toEqual([20, 21, 22, 23, 24]);
  });

  it("orders validation periods around the lock period", () => {
    const group = structuredClone(validation.historicalValidation[0]);
    group.rule1.validationPeriodOffset = -1;
    group.rule1.validationPeriod = "115042";
    group.rule2.validationPeriodOffset = 1;
    group.rule2.validationPeriod = "115044";
    const rows = buildTianyanHistoricalRows("今彩539", group, new Map([
      ["115042", [1, 2, 3, 4, 5]],
      ["115044", [20, 21, 22, 23, 24]],
    ]));
    expect(rows?.map((row) => row.period)).toEqual(["115042", "115043", "115044", "115048"]);
    expect(rows?.map((row) => row.right.kind)).toEqual(["formula", "lock", "formula", "result"]);
  });

  it("merges a same-period formula into the lock row", () => {
    const group = structuredClone(validation.historicalValidation[0]);
    group.rule1.validationPeriodOffset = 0;
    group.rule1.validationPeriod = group.sourcePeriod;
    group.rule1.validationPosition = 3;
    group.rule1.baseNumber = 8;
    const rows = buildTianyanHistoricalRows("今彩539", group, new Map([
      [group.rule2.validationPeriod, [20, 21, 22, 23, 24]],
    ]));
    expect(rows?.map((row) => row.period)).toEqual(["115043", "115045", "115048"]);
    expect(rows?.[0].right.kind).toBe("formula");
    expect(rows?.[0].lockedNumbers).toEqual([10]);
    expect(rows?.[0].sourceNumbers).toEqual([8]);
    expect(rows?.[0].right.kind === "formula" ? rows[0].right.formulas : []).toHaveLength(1);
  });

  it("does not add a source highlight when the same-period validation number equals the locked number", () => {
    const group = structuredClone(validation.historicalValidation[0]);
    group.rule1.validationPeriodOffset = 0;
    group.rule1.validationPeriod = group.sourcePeriod;
    group.rule1.validationPosition = group.lockedPosition;
    group.rule1.baseNumber = group.lockedNumber;
    const rows = buildTianyanHistoricalRows("今彩539", group, new Map([
      [group.rule2.validationPeriod, [20, 21, 22, 23, 24]],
    ]));
    expect(rows?.[0].lockedNumbers).toEqual([10]);
    expect(rows?.[0].sourceNumbers).toEqual([]);
  });

  it("renders drag rules as wrapped +offsets without adding a same-period row", () => {
    const group = structuredClone(validation.historicalValidation[0]);
    group.lockedNumber = 31;
    group.sourceNumbers = [31, 33, 36, 41, 47];
    group.rule1 = {
      ...group.rule1,
      validationPeriodOffset: 0,
      validationPeriod: group.sourcePeriod,
      validationPosition: 1,
      baseNumber: 31,
      algorithmType: "拖牌",
      ruleValue: 33,
      calculationResult: 33,
    };
    group.rule2.hit = false;
    group.hitNumbers = [33];
    const rows = buildTianyanHistoricalRows("六合彩", group, new Map());
    expect(rows?.map((row) => row.period)).toEqual([group.sourcePeriod, group.predictionPeriod]);
    expect(rows?.[0].right.kind).toBe("formula");
    expect(rows?.[0].right.kind === "formula" ? rows[0].right.formulas[0] : null).toMatchObject({
      baseNumber: 31,
      ruleValue: 2,
      calculationResult: 33,
    });
  });

  it("applies the same same-period merge to current validation rows", () => {
    const current = structuredClone(validation);
    current.rules[0].validationPeriodOffset = 0;
    current.rules[0].validationPeriod = current.sourceA!.sourcePeriod;
    current.rules[0].referenceOffset = 0;
    current.rules[0].referencePosition = 3;
    current.rules[0].currentBaseNumber = 8;
    const rows = buildTianyanCurrentRows("今彩539", current, new Map([
      [current.rules[1].validationPeriod, [20, 21, 22, 23, 24]],
    ]));
    expect(rows.map((row) => row.period)).toEqual(["115043", "115045"]);
    expect(rows[0].right.kind).toBe("formula");
    expect(rows[0].lockedNumbers).toEqual([10]);
    expect(rows[0].sourceNumbers).toEqual([8]);
  });

  it.each([1, 2])("omits missed rule %s without requiring its history", (missedRule) => {
    const group = structuredClone(validation.historicalValidation[0]);
    const missed = missedRule === 1 ? group.rule1 : group.rule2;
    const hit = missedRule === 1 ? group.rule2 : group.rule1;
    missed.hit = false;
    const rows = buildTianyanHistoricalRows("今彩539", group, new Map([
      [hit.validationPeriod, [1, 2, 3, 4, 5]],
    ]));
    expect(rows?.map((row) => row.period)).toEqual([group.sourcePeriod, hit.validationPeriod, group.predictionPeriod]);
    expect(rows?.map((row) => row.right.kind)).toEqual(["lock", "formula", "result"]);
  });

  it("omits a historical group when neither rule hit", () => {
    const group = structuredClone(validation.historicalValidation[0]);
    group.rule1.hit = false;
    group.rule2.hit = false;
    expect(buildTianyanHistoricalRows("今彩539", group, new Map())).toBeNull();
  });

  it("renders the two-line summary with the existing order and color roles", () => {
    const { container } = render(
      <header className="explore-validation-summary-card">
        <TianyanPatchedSummary lottery="今彩539" item={item} validation={validation} />
      </header>,
    );
    const rows = container.querySelectorAll(".tianyan-validation-summary-row");
    expect(rows).toHaveLength(2);
    const indent = rows[1].querySelector(".tianyan-expanded-summary-indent");
    expect(indent?.getAttribute("aria-hidden")).toBe("true");
    expect(indent?.querySelector(".validation-summary-divider")).toBeNull();
    expect(indent?.nextElementSibling?.textContent).toBe("｜");
    expect(rows[0].textContent?.replace(/\s+/g, "")).toBe("開10第2顆｜下2期｜第5顆｜合值57");
    expect(rows[1].textContent?.replace(/\s+/g, "")).toContain("下3期｜第2顆｜+31｜下5期開");
    expect(Array.from(container.querySelectorAll(".validation-summary-lookback")).map((node) => node.textContent)).toEqual(["2", "3"]);
    expect(Array.from(container.querySelectorAll(".validation-summary-formula")).map((node) => node.textContent)).toEqual(["57", "+31"]);
    expect(container.querySelector(".validation-summary-future")?.textContent).toBe("5");
    expect(container.querySelector(".explore-validation-consecutive-tag")?.textContent?.replace(/\s+/g, "")).toBe("準15進16");
  });

  it.each([
    ["今彩539", 39],
    ["天天樂", 39],
    ["六合彩", 49],
    ["大樂透", 49],
  ] as const)("formats Tianyan drag targets as a wrapped +offset for %s", (lottery, maximum) => {
    const dragValidation = structuredClone(validation);
    dragValidation.sourceA!.lockedNumber = 31;
    dragValidation.rules[1] = {
      ...dragValidation.rules[1],
      algorithmType: "拖牌",
      referenceOffset: 0,
      referencePosition: 1,
      currentBaseNumber: 31,
      ruleValue: maximum === 39 ? 2 : 33,
      currentPredictionNumber: maximum === 39 ? 2 : 33,
    };
    const dragItem = { ...item, number: "31", lockedPosition: 1 };
    const { container } = render(
      <header className="explore-validation-summary-card">
        <TianyanPatchedSummary lottery={lottery} item={dragItem} validation={dragValidation} />
      </header>,
    );
    const secondRow = container.querySelectorAll(".tianyan-validation-summary-row")[1];
    expect(secondRow.textContent?.replace(/\s+/g, "")).toContain(maximum === 39 ? "+10" : "+2");
    expect(secondRow.textContent).not.toContain("拖牌");
  });
});
