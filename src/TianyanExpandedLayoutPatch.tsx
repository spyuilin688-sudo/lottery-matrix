import { Fragment, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExploreValidationSummary } from "./ExploreValidationSummary";
import { fetchLotteryHistory, type LotteryDrawRecord } from "./lottery-api";
import {
  fetchTianyanList,
  fetchTianyanValidation,
  type TianyanApiRow,
  type TianyanValidation,
  type TianyanRuleValidation,
} from "./matrix-algorithm-api";
import type { NumberBallLottery } from "./NumberBall";
import "./tianyan-expanded-layout-patch.css";

type ActiveTianyanTarget = {
  itemId: string;
  button: HTMLElement;
  section: HTMLElement;
  root: HTMLElement;
};

type FormulaModel = {
  position: number;
  baseNumber: number;
  algorithmType: "加減" | "合值" | "拖牌";
  ruleValue: number;
  calculationResult: number;
};

export type TianyanPatchedValidationRow = {
  key: string;
  period: string;
  numbers: Array<string | number>;
  highlightNumbers: number[];
  highlightKind: "locked" | "source" | "result" | null;
  right:
    | { kind: "lock" }
    | { kind: "formula"; formula: FormulaModel }
    | { kind: "result"; numbers: number[] };
};

type ResolvedTianyanLayout = {
  lottery: NumberBallLottery;
  item: TianyanApiRow;
  validation: TianyanValidation;
  historyNumbers: Map<string, Array<string | number>>;
};

type PortalHosts = {
  summary: HTMLElement;
  groups: HTMLElement;
};

const TIANyan_LOTTERIES: NumberBallLottery[] = ["今彩539", "天天樂", "六合彩", "大樂透"];

function displayNumber(value: string | number) {
  return String(value).padStart(2, "0");
}

function normalizePeriodKey(lottery: NumberBallLottery, value: string | number | undefined) {
  const period = String(value ?? "").trim();
  if (lottery !== "今彩539" && lottery !== "大樂透") return period;
  const legacy = period.match(/^(\d{2,3})000(\d{3})$/);
  return legacy ? `${legacy[1].padStart(3, "0")}${legacy[2]}` : period;
}

function displayValidationPeriod(lottery: NumberBallLottery, value: string | number | undefined) {
  return normalizePeriodKey(lottery, value);
}

function findActiveTianyanTarget(): ActiveTianyanTarget | null {
  const root = document.querySelector<HTMLElement>(".matrix-tianyan-screen");
  if (!root) return null;
  const section = root.querySelector<HTMLElement>('section[aria-label="天衍驗證過程"]');
  const button = root.querySelector<HTMLElement>(
    '.road-result-row[aria-expanded="true"][aria-label^="收合版路 "]',
  );
  if (!section || !button) return null;
  const match = button.getAttribute("aria-label")?.match(/^收合版路\s+(.+)$/);
  if (!match?.[1]) return null;
  return { itemId: match[1], button, section, root };
}

function readLottery(section: HTMLElement): NumberBallLottery | null {
  const lottery = section.dataset.lottery as NumberBallLottery | undefined;
  return lottery && TIANyan_LOTTERIES.includes(lottery) ? lottery : null;
}

function readExploreDateOffset(root: HTMLElement): 0 | 1 | 2 | null {
  const selected = Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-selected="true"]'))
    .map((button) => button.textContent?.trim() ?? "")
    .find((label) => /^(本日|昨日|前日)/.test(label));
  if (!selected) return null;
  if (selected.startsWith("前日")) return 2;
  if (selected.startsWith("昨日")) return 1;
  return 0;
}

function readConsecutive(button: HTMLElement) {
  const text = button.querySelector<HTMLElement>(".result-consecutive")?.textContent?.replace(/\s+/g, "").trim();
  return text && /^準\d+進\d+$/.test(text) ? text : null;
}

function historyRecordNumbers(record: LotteryDrawRecord, item: TianyanApiRow) {
  const values = item.numberOrder === "依實際開獎順序排序"
    ? record.drawOrderNumbers?.length ? record.drawOrderNumbers : record.numbers
    : record.sortedNumbers?.length ? record.sortedNumbers : record.numbers;
  return [...values];
}

function buildHistoryNumbers(
  lottery: NumberBallLottery,
  item: TianyanApiRow,
  records: LotteryDrawRecord[],
) {
  const lookup = new Map<string, Array<string | number>>();
  records.forEach((record) => {
    const period = normalizePeriodKey(lottery, record.period ?? record.issue);
    if (period) lookup.set(period, historyRecordNumbers(record, item));
  });
  return lookup;
}

function requiredRulePeriods(validation: TianyanValidation) {
  return [
    ...validation.historicalValidation.flatMap((group) => [group.rule1.validationPeriod, group.rule2.validationPeriod]),
    ...validation.rules.slice(0, 2).map((rule) => rule.validationPeriod),
  ].filter(Boolean);
}

function hasRequiredPeriods(
  lottery: NumberBallLottery,
  lookup: Map<string, Array<string | number>>,
  validation: TianyanValidation,
) {
  return requiredRulePeriods(validation).every((period) => lookup.has(normalizePeriodKey(lottery, period)));
}

function formulaFromHistoricalRule(rule: TianyanRuleValidation): FormulaModel {
  return {
    position: rule.validationPosition,
    baseNumber: rule.baseNumber,
    algorithmType: rule.algorithmType,
    ruleValue: rule.ruleValue,
    calculationResult: rule.calculationResult,
  };
}

export function buildTianyanHistoricalRows(
  lottery: NumberBallLottery,
  group: TianyanValidation["historicalValidation"][number],
  historyNumbers: Map<string, Array<string | number>>,
): TianyanPatchedValidationRow[] | null {
  const rule1Numbers = historyNumbers.get(normalizePeriodKey(lottery, group.rule1.validationPeriod));
  const rule2Numbers = historyNumbers.get(normalizePeriodKey(lottery, group.rule2.validationPeriod));
  if (!rule1Numbers || !rule2Numbers) return null;

  return [
    {
      key: `${group.group}-lock`,
      period: group.sourcePeriod,
      numbers: group.sourceNumbers,
      highlightNumbers: [group.lockedNumber],
      highlightKind: "locked",
      right: { kind: "lock" },
    },
    {
      key: `${group.group}-rule-1`,
      period: group.rule1.validationPeriod,
      numbers: rule1Numbers,
      highlightNumbers: [group.rule1.baseNumber],
      highlightKind: "source",
      right: { kind: "formula", formula: formulaFromHistoricalRule(group.rule1) },
    },
    {
      key: `${group.group}-rule-2`,
      period: group.rule2.validationPeriod,
      numbers: rule2Numbers,
      highlightNumbers: [group.rule2.baseNumber],
      highlightKind: "source",
      right: { kind: "formula", formula: formulaFromHistoricalRule(group.rule2) },
    },
    {
      key: `${group.group}-result`,
      period: group.predictionPeriod,
      numbers: group.predictionNumbers,
      highlightNumbers: group.hitNumbers,
      highlightKind: "result",
      right: { kind: "result", numbers: group.hitNumbers },
    },
  ];
}

function buildTianyanCurrentRows(
  lottery: NumberBallLottery,
  validation: TianyanValidation,
  historyNumbers: Map<string, Array<string | number>>,
): TianyanPatchedValidationRow[] {
  const source = validation.sourceA;
  const [rule1, rule2] = validation.rules;
  if (!source || !rule1 || !rule2) return [];
  const rule1Numbers = historyNumbers.get(normalizePeriodKey(lottery, rule1.validationPeriod));
  const rule2Numbers = historyNumbers.get(normalizePeriodKey(lottery, rule2.validationPeriod));
  if (!rule1Numbers || !rule2Numbers) return [];

  const currentFormula = (rule: typeof rule1): FormulaModel => ({
    position: rule.referencePosition,
    baseNumber: rule.currentBaseNumber,
    algorithmType: rule.algorithmType,
    ruleValue: rule.ruleValue,
    calculationResult: rule.currentPredictionNumber,
  });

  return [
    {
      key: "current-lock",
      period: source.sourcePeriod,
      numbers: source.sourceNumbers,
      highlightNumbers: [source.lockedNumber],
      highlightKind: "locked",
      right: { kind: "lock" },
    },
    {
      key: "current-rule-1",
      period: rule1.validationPeriod,
      numbers: rule1Numbers,
      highlightNumbers: [rule1.currentBaseNumber],
      highlightKind: "source",
      right: { kind: "formula", formula: currentFormula(rule1) },
    },
    {
      key: "current-rule-2",
      period: rule2.validationPeriod,
      numbers: rule2Numbers,
      highlightNumbers: [rule2.currentBaseNumber],
      highlightKind: "source",
      right: { kind: "formula", formula: currentFormula(rule2) },
    },
  ];
}

function SummaryDirection({ offset }: { offset: number }) {
  if (offset === 0) return <span>同期</span>;
  return (
    <span>
      {offset < 0 ? "上" : "下"}{" "}
      <i className="validation-summary-lookback">{Math.abs(offset)}</i>{" "}期
    </span>
  );
}

function SummaryPosition({ position }: { position: number }) {
  return <span>第 <i className="validation-summary-position">{position}</i> 顆</span>;
}

function SummaryFormula({ rule }: { rule: TianyanValidation["rules"][number] }) {
  const numeric = rule.algorithmType === "加減"
    ? `${rule.ruleValue >= 0 ? "+" : ""}${rule.ruleValue}`
    : String(rule.ruleValue);
  if (rule.algorithmType === "加減") {
    return <i className="validation-summary-formula">{numeric}</i>;
  }
  return <span>{rule.algorithmType} <i className="validation-summary-formula">{numeric}</i></span>;
}

function SummaryLocked({ number, position }: { number: string | number; position: number }) {
  return (
    <span>
      開 <i className="validation-summary-primary">{displayNumber(number)}</i>{" "}
      第 <i className="validation-summary-position">{position}</i> 顆
    </span>
  );
}

export function TianyanPatchedSummary({
  item,
  validation,
}: {
  item: TianyanApiRow;
  validation: TianyanValidation;
}) {
  const [rule1, rule2] = validation.rules;
  if (!rule1 || !rule2) return null;
  const lockedNumber = validation.sourceA?.lockedNumber ?? item.number;
  const lockedPosition = validation.sourceA?.lockedPosition ?? item.lockedPosition;
  const predictionDistance = validation.sourceA?.predictionDistance ?? item.predictionDistance;

  return (
    <>
      <ExploreValidationSummary>
        <span className="tianyan-validation-summary-lines tianyan-expanded-summary-lines" aria-label="版路摘要">
          <span className="tianyan-validation-summary-row">
            <SummaryLocked number={lockedNumber} position={lockedPosition} />
            <i className="validation-summary-divider" aria-hidden="true">｜</i>
            <SummaryDirection offset={rule1.referenceOffset} />
            <i className="validation-summary-divider" aria-hidden="true">｜</i>
            <SummaryPosition position={rule1.referencePosition} />
            <i className="validation-summary-divider" aria-hidden="true">｜</i>
            <SummaryFormula rule={rule1} />
          </span>
          <span className="tianyan-validation-summary-row">
            <span className="tianyan-expanded-summary-indent" aria-hidden="true">
              <SummaryLocked number={lockedNumber} position={lockedPosition} />
              <i className="validation-summary-divider">｜</i>
            </span>
            <SummaryDirection offset={rule2.referenceOffset} />
            <i className="validation-summary-divider" aria-hidden="true">｜</i>
            <SummaryPosition position={rule2.referencePosition} />
            <i className="validation-summary-divider" aria-hidden="true">｜</i>
            <SummaryFormula rule={rule2} />
            <i className="validation-summary-divider" aria-hidden="true">｜</i>
            <span>下 <i className="validation-summary-future">{predictionDistance}</i> 期開</span>
          </span>
        </span>
      </ExploreValidationSummary>
      <strong className="explore-validation-consecutive-tag">
        準{validation.groupCount}進{validation.groupCount + 1}
      </strong>
    </>
  );
}

function ValidationFormula({ formula }: { formula: FormulaModel }) {
  return (
    <span className="explore-validation-formula-expression">
      <span className="explore-validation-formula-position">
        <span>第</span><span>{formula.position}</span><span>顆</span>
      </span>
      <span>{displayNumber(formula.baseNumber)}</span>
      {formula.algorithmType === "合值"
        ? <><span>合值</span><span>{formula.ruleValue}</span></>
        : formula.algorithmType === "加減"
          ? <span>{`${formula.ruleValue >= 0 ? "+" : ""}${formula.ruleValue}`}</span>
          : <><span>拖牌</span><span>{formula.ruleValue}</span></>}
      <span>=</span><span>{displayNumber(formula.calculationResult)}</span>
    </span>
  );
}

function ValidationRight({ row }: { row: TianyanPatchedValidationRow }) {
  if (row.right.kind === "lock") return <span className="tianyan-expanded-lock-condition">鎖定條件</span>;
  if (row.right.kind === "formula") return <ValidationFormula formula={row.right.formula} />;
  return (
    <>［<strong className="explore-validation-result-number">
      {row.right.numbers.map(displayNumber).join("、")}
    </strong>］</>
  );
}

function PatchedValidationGroup({
  lottery,
  rows,
  groupKey,
}: {
  lottery: NumberBallLottery;
  rows: TianyanPatchedValidationRow[];
  groupKey: string;
}) {
  return (
    <div
      className="explore-validation-group tianyan-expanded-validation-group"
      data-lottery={lottery}
      data-wide-numbers={rows.some((row) => row.numbers.length >= 6) ? "true" : "false"}
      data-row-count={rows.length}
      data-validation-group={groupKey}
    >
      <div className="explore-validation-issues">
        {rows.map((row) => (
          <span className="explore-validation-issue" key={`${row.key}-period`}>
            {displayValidationPeriod(lottery, row.period)}
          </span>
        ))}
      </div>
      <div className="explore-validation-numbers-card">
        {rows.map((row) => (
          <div className="explore-validation-draw-row explore-validation-number-row" key={`${row.key}-numbers`}>
            <span className="explore-validation-numbers">
              {row.numbers.map((number, index) => {
                const numeric = Number(number);
                const highlighted = row.highlightNumbers.includes(numeric);
                const highlightClass = highlighted
                  ? row.highlightKind === "locked"
                    ? " explore-validation-number--hit"
                    : row.highlightKind === "source"
                      ? " explore-validation-number--source"
                      : " explore-validation-number--step"
                  : "";
                const isSpecial = (lottery === "六合彩" || lottery === "大樂透") && index === 6;
                if (isSpecial) {
                  return <span className="explore-validation-special-number" key={`${row.key}-${index}`}>
                    <i className="explore-validation-special-separator" aria-hidden="true">+</i>
                    <i className={`explore-validation-number${highlightClass} explore-validation-number--special`}>
                      {displayNumber(number)}
                    </i>
                  </span>;
                }
                return (
                  <i className={`explore-validation-number${highlightClass}`} key={`${row.key}-${index}`}>
                    {displayNumber(number)}
                  </i>
                );
              })}
            </span>
          </div>
        ))}
      </div>
      <div className="explore-validation-formulas">
        {rows.map((row) => (
          <span className="explore-validation-formula-row" key={`${row.key}-formula`}>
            <ValidationRight row={row} />
          </span>
        ))}
      </div>
    </div>
  );
}

async function resolveTianyanLayout(target: ActiveTianyanTarget): Promise<ResolvedTianyanLayout | null> {
  const lottery = readLottery(target.section);
  const consecutive = readConsecutive(target.button);
  if (!lottery || !consecutive) return null;

  const detectedOffset = readExploreDateOffset(target.root);
  const offsets: Array<0 | 1 | 2> = detectedOffset === null ? [0, 1, 2] : [detectedOffset];
  let listResponse: Awaited<ReturnType<typeof fetchTianyanList>> | null = null;
  let item: TianyanApiRow | undefined;

  for (const exploreDateOffset of offsets) {
    const candidate = await fetchTianyanList({
      lottery,
      exploreDateOffset,
      selectedStreaks: [consecutive],
      sameCode: false,
    });
    const matched = candidate.items.find((row) => row.id === target.itemId);
    if (matched) {
      listResponse = candidate;
      item = matched;
      break;
    }
  }
  if (!listResponse || !item) return null;

  const validationResponse = await fetchTianyanValidation(
    {
      lottery,
      drawPeriod: listResponse.drawPeriod,
      analysisVersion: listResponse.analysisVersion,
    },
    target.itemId,
  );
  const validation = validationResponse.validation;

  let historyNumbers = buildHistoryNumbers(lottery, item, await fetchLotteryHistory(lottery, 1000));
  if (!hasRequiredPeriods(lottery, historyNumbers, validation)) {
    historyNumbers = buildHistoryNumbers(lottery, item, await fetchLotteryHistory(lottery, 5000));
  }
  if (!hasRequiredPeriods(lottery, historyNumbers, validation)) return null;

  return { lottery, item, validation, historyNumbers };
}

export function TianyanExpandedLayoutPatch({ active }: { active: boolean }) {
  const [target, setTarget] = useState<ActiveTianyanTarget | null>(null);
  const [resolved, setResolved] = useState<ResolvedTianyanLayout | null>(null);
  const [hosts, setHosts] = useState<PortalHosts | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setTarget(null);
      return;
    }
    const updateTarget = () => {
      const next = findActiveTianyanTarget();
      setTarget((current) => (
        current?.itemId === next?.itemId
        && current?.button === next?.button
        && current?.section === next?.section
          ? current
          : next
      ));
    };
    updateTarget();
    const observer = new MutationObserver(updateTarget);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-expanded"],
    });
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    let cancelled = false;
    setResolved(null);
    if (!active || !target) return () => { cancelled = true; };
    void resolveTianyanLayout(target)
      .then((next) => {
        if (!cancelled) setResolved(next);
      })
      .catch(() => {
        if (!cancelled) setResolved(null);
      });
    return () => { cancelled = true; };
  }, [active, target]);

  useLayoutEffect(() => {
    setHosts(null);
    if (!active || !target || !resolved) return;
    const originalHeader = target.section.querySelector<HTMLElement>(
      ".explore-validation-summary-card:not(.tianyan-expanded-layout-summary-host)",
    );
    const originalGroups = target.section.querySelector<HTMLElement>(
      ".explore-validation-groups:not(.tianyan-expanded-layout-groups-host)",
    );
    const parent = originalHeader?.parentElement;
    if (!originalHeader || !originalGroups || !parent || originalGroups.parentElement !== parent) return;

    const summaryHost = document.createElement("header");
    summaryHost.className = "explore-validation-summary-card tianyan-expanded-layout-summary-host";
    const groupsHost = document.createElement("div");
    groupsHost.className = "explore-validation-groups tianyan-expanded-layout-groups-host";
    const headerWasHidden = originalHeader.hidden;
    const groupsWereHidden = originalGroups.hidden;

    parent.insertBefore(summaryHost, originalHeader);
    parent.insertBefore(groupsHost, originalHeader);
    originalHeader.hidden = true;
    originalGroups.hidden = true;
    setHosts({ summary: summaryHost, groups: groupsHost });

    return () => {
      originalHeader.hidden = headerWasHidden;
      originalGroups.hidden = groupsWereHidden;
      summaryHost.remove();
      groupsHost.remove();
    };
  }, [active, resolved, target]);

  if (!resolved || !hosts) return null;

  const historicalGroups = resolved.validation.historicalValidation
    .map((group) => ({
      key: group.group,
      rows: buildTianyanHistoricalRows(resolved.lottery, group, resolved.historyNumbers),
    }))
    .filter((group): group is { key: string; rows: TianyanPatchedValidationRow[] } => Boolean(group.rows));
  const currentRows = buildTianyanCurrentRows(resolved.lottery, resolved.validation, resolved.historyNumbers);

  return (
    <>
      {createPortal(
        <TianyanPatchedSummary item={resolved.item} validation={resolved.validation} />,
        hosts.summary,
      )}
      {createPortal(
        <>
          {historicalGroups.map((group) => (
            <PatchedValidationGroup
              lottery={resolved.lottery}
              rows={group.rows}
              groupKey={group.key}
              key={group.key}
            />
          ))}
          {currentRows.length ? (
            <PatchedValidationGroup
              lottery={resolved.lottery}
              rows={currentRows}
              groupKey="current"
            />
          ) : null}
        </>,
        hosts.groups,
      )}
    </>
  );
}
