// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TianyanApiRow, TianyanValidation } from "../matrix-algorithm-api";
import {
  buildTianyanHistoricalRows,
  TianyanPatchedSummary,
  TianyanExpandedLayoutPatch,
} from "../TianyanExpandedLayoutPatch";

const api = vi.hoisted(() => ({ list: vi.fn(), validation: vi.fn(), history: vi.fn() }));
vi.mock('../matrix-algorithm-api', () => ({ fetchTianyanList: api.list, fetchTianyanValidation: api.validation }));
vi.mock('../lottery-api', () => ({ fetchLotteryHistory: api.history }));
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

describe("Tianyan expanded layout", () => {
  it("reopens seven-number results using the applied lottery and keeps the special-number separator", async () => {
    const wideValidation = structuredClone(validation);
    wideValidation.sourceA!.sourceNumbers.push(41, 49);
    wideValidation.historicalValidation[0].sourceNumbers.push(41, 49);
    wideValidation.historicalValidation[0].predictionNumbers.push(41, 49);
    api.list.mockResolvedValue({ lottery: '六合彩', items: [item], drawPeriod: '115043', analysisVersion: 'v1' });
    api.validation.mockResolvedValue({ validation: wideValidation });
    api.history.mockResolvedValue(['115044', '115045'].map((period) => ({ period, numbers: [1, 2, 3, 4, 5, 41, 49] })));
    const { container } = render(<div className="matrix-tianyan-screen matrix-explore-main-screen">
      <select defaultValue="今彩539"><option>今彩539</option><option>六合彩</option></select>
      <button className="road-result-row" aria-expanded="true" aria-label="收合版路 road-1"><span className="result-consecutive">準15進16</span></button>
      <section aria-label="天衍驗證過程" data-lottery="六合彩"><div>
        <header className="explore-validation-summary-card" />
        <div className="explore-validation-groups" />
      </div></section>
      <TianyanExpandedLayoutPatch active />
    </div>);
    await waitFor(() => expect(container.querySelector('.tianyan-expanded-layout-groups-host .explore-validation-group')).not.toBeNull());
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ lottery: '六合彩' }));
    expect(api.history).toHaveBeenCalledWith('六合彩', 1000);
    const rows = container.querySelectorAll('.tianyan-expanded-layout-groups-host .explore-validation-numbers');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      expect(row.querySelectorAll('.explore-validation-number')).toHaveLength(7);
      expect(row.querySelector('.explore-validation-special-separator')?.textContent).toBe('+');
    });
    expect(container.querySelector('.explore-validation-groups:not(.tianyan-expanded-layout-groups-host)')?.hasAttribute('hidden')).toBe(true);
  });

  it("orders each historical validation block as lock, formula 1, formula 2, result", () => {
    const historyNumbers = new Map<string, Array<string | number>>([
      ["115044", [1, 2, 3, 4, 5]],
      ["115045", [20, 21, 22, 23, 24]],
    ]);

    const rows = buildTianyanHistoricalRows(
      "今彩539",
      validation.historicalValidation[0],
      historyNumbers,
    );

    expect(rows).not.toBeNull();
    expect(rows?.map((row) => row.period)).toEqual(["115043", "115044", "115045", "115048"]);
    expect(rows?.map((row) => row.right.kind)).toEqual(["lock", "formula", "formula", "result"]);
    expect(rows?.[1].numbers).toEqual([1, 2, 3, 4, 5]);
    expect(rows?.[2].numbers).toEqual([20, 21, 22, 23, 24]);
  });

  it("renders the two-line road summary in the requested order and color roles", () => {
    const { container } = render(
      <div className="matrix-explore-main-screen matrix-tianyan-screen">
        <header className="explore-validation-summary-card tianyan-expanded-layout-summary-host">
          <TianyanPatchedSummary item={item} validation={validation} />
        </header>
      </div>,
    );

    const rows = container.querySelectorAll(".tianyan-validation-summary-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent?.replace(/\s+/g, "")).toBe("開10第2顆｜下2期｜第5顆｜合值57");
    expect(rows[1].textContent?.replace(/\s+/g, "")).toContain("下3期｜第2顆｜+31｜下5期開");

    expect(Array.from(container.querySelectorAll(".validation-summary-lookback")).map((node) => node.textContent)).toEqual(["2", "3"]);
    expect(Array.from(container.querySelectorAll(".validation-summary-formula")).map((node) => node.textContent)).toEqual(["57", "+31"]);
    expect(container.querySelector(".validation-summary-future")?.textContent).toBe("5");
    expect(container.querySelector(".explore-validation-consecutive-tag")?.textContent?.replace(/\s+/g, "")).toBe("準15進16");
  });
});
