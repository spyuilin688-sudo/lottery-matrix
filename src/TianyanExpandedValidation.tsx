import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ExploreValidationSummary } from "./ExploreValidationSummary";
import { fetchLotteryHistoryPeriods, type LotteryDrawRecord } from "./lottery-api";
import type {
  MatrixNumberOrder,
  TianyanApiRow,
  TianyanRuleValidation,
  TianyanValidation,
} from "./matrix-algorithm-api";
import type { NumberBallLottery } from "./NumberBall";

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
  lockedNumbers: number[];
  sourceNumbers: number[];
  resultNumbers: number[];
  right:
    | { kind: "lock" }
    | { kind: "formula"; formulas: FormulaModel[] }
    | { kind: "result"; numbers: number[] };
};

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

function historyRecordNumbers(record: LotteryDrawRecord, numberOrder: MatrixNumberOrder) {
  const values = numberOrder === "依實際開獎順序排序"
    ? record.drawOrderNumbers ?? []
    : record.sortedNumbers?.length ? record.sortedNumbers : record.numbers;
  return [...values];
}

function buildHistoryNumbers(
  lottery: NumberBallLottery,
  numberOrder: MatrixNumberOrder,
  records: LotteryDrawRecord[],
) {
  const lookup = new Map<string, Array<string | number>>();
  records.forEach((record) => {
    const period = normalizePeriodKey(lottery, record.period ?? record.issue);
    if (period) lookup.set(period, historyRecordNumbers(record, numberOrder));
  });
  return lookup;
}

function requiredRulePeriods(lottery: NumberBallLottery, validation: TianyanValidation) {
  return [
    ...validation.historicalValidation.flatMap((group) => [group.rule1, group.rule2]
      .filter((rule) => rule.hit)
      .map((rule) => ({ period: rule.validationPeriod, sourcePeriod: group.sourcePeriod }))),
    ...validation.rules.slice(0, 2).map((rule) => ({
      period: rule.validationPeriod,
      sourcePeriod: validation.sourceA?.sourcePeriod,
    })),
  ].filter(({ period, sourcePeriod }) => (
    Boolean(period)
    && normalizePeriodKey(lottery, period) !== normalizePeriodKey(lottery, sourcePeriod)
  )).map(({ period }) => period);
}

function hasRequiredPeriods(
  lottery: NumberBallLottery,
  lookup: Map<string, Array<string | number>>,
  validation: TianyanValidation,
) {
  return requiredRulePeriods(lottery, validation).every((period) => lookup.has(normalizePeriodKey(lottery, period)));
}

function lotteryMaximum(lottery: NumberBallLottery) {
  return lottery === "今彩539" || lottery === "天天樂" ? 39 : 49;
}

function wrappedOffset(baseNumber: number, targetNumber: number, maximum: number) {
  return ((targetNumber - baseNumber) % maximum + maximum) % maximum;
}

function formulaFromHistoricalRule(
  lottery: NumberBallLottery,
  rule: TianyanRuleValidation,
): FormulaModel {
  const isDrag = rule.algorithmType === "拖牌";
  return {
    position: rule.validationPosition,
    baseNumber: rule.baseNumber,
    algorithmType: rule.algorithmType,
    ruleValue: isDrag
      ? wrappedOffset(rule.baseNumber, rule.ruleValue, lotteryMaximum(lottery))
      : rule.ruleValue,
    calculationResult: isDrag ? rule.ruleValue : rule.calculationResult,
  };
}

function distinctNumbers(values: number[]) {
  return [...new Set(values)];
}

function appendFormula(
  right: TianyanPatchedValidationRow["right"],
  formula: FormulaModel,
): TianyanPatchedValidationRow["right"] {
  return right.kind === "formula"
    ? { kind: "formula", formulas: [...right.formulas, formula] }
    : { kind: "formula", formulas: [formula] };
}

export function buildTianyanHistoricalRows(
  lottery: NumberBallLottery,
  group: TianyanValidation["historicalValidation"][number],
  historyNumbers: Map<string, Array<string | number>>,
): TianyanPatchedValidationRow[] | null {
  const matchedRules = [group.rule1, group.rule2]
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.hit);
  if (!matchedRules.length) return null;
  const sourcePeriodKey = normalizePeriodKey(lottery, group.sourcePeriod);
  const orderedRows: Array<{ offset: number; order: number; row: TianyanPatchedValidationRow }> = [{
    offset: 0,
    order: -1,
    row: {
      key: `${group.group}-lock`,
      period: group.sourcePeriod,
      numbers: group.sourceNumbers,
      lockedNumbers: [group.lockedNumber],
      sourceNumbers: [],
      resultNumbers: [],
      right: { kind: "lock" },
    },
  }];

  for (const { rule, index } of matchedRules) {
    const periodKey = normalizePeriodKey(lottery, rule.validationPeriod);
    const numbers = periodKey === sourcePeriodKey
      ? group.sourceNumbers
      : historyNumbers.get(periodKey);
    if (!numbers) return null;
    let target = orderedRows.find(({ row }) => normalizePeriodKey(lottery, row.period) === periodKey);
    if (!target) {
      target = {
        offset: rule.validationPeriodOffset,
        order: index,
        row: {
          key: `${group.group}-rule-${index + 1}`,
          period: rule.validationPeriod,
          numbers,
          lockedNumbers: [],
          sourceNumbers: [],
          resultNumbers: [],
          right: { kind: "lock" },
        },
      };
      orderedRows.push(target);
    }
    target.row.sourceNumbers = distinctNumbers([
      ...target.row.sourceNumbers,
      ...(!target.row.lockedNumbers.includes(rule.baseNumber) ? [rule.baseNumber] : []),
    ]);
    target.row.right = appendFormula(target.row.right, formulaFromHistoricalRule(lottery, rule));
  }

  return [
    ...orderedRows
      .sort((left, right) => left.offset - right.offset || left.order - right.order)
      .map(({ row }) => row),
    {
      key: `${group.group}-result`,
      period: group.predictionPeriod,
      numbers: group.predictionNumbers,
      lockedNumbers: [],
      sourceNumbers: [],
      resultNumbers: group.hitNumbers,
      right: { kind: "result", numbers: group.hitNumbers },
    },
  ];
}

export function buildTianyanCurrentRows(
  lottery: NumberBallLottery,
  validation: TianyanValidation,
  historyNumbers: Map<string, Array<string | number>>,
): TianyanPatchedValidationRow[] {
  const source = validation.sourceA;
  const [rule1, rule2] = validation.rules;
  if (!source || !rule1 || !rule2) return [];
  const sourcePeriodKey = normalizePeriodKey(lottery, source.sourcePeriod);

  const currentFormula = (rule: typeof rule1): FormulaModel => ({
    position: rule.referencePosition,
    baseNumber: rule.currentBaseNumber,
    algorithmType: rule.algorithmType,
    ruleValue: rule.algorithmType === "拖牌"
      ? wrappedOffset(rule.currentBaseNumber, rule.ruleValue, lotteryMaximum(lottery))
      : rule.ruleValue,
    calculationResult: rule.algorithmType === "拖牌"
      ? rule.ruleValue
      : rule.currentPredictionNumber,
  });

  const orderedRows: Array<{ offset: number; order: number; row: TianyanPatchedValidationRow }> = [{
    offset: 0,
    order: -1,
    row: {
      key: "current-lock",
      period: source.sourcePeriod,
      numbers: source.sourceNumbers,
      lockedNumbers: [source.lockedNumber],
      sourceNumbers: [],
      resultNumbers: [],
      right: { kind: "lock" },
    },
  }];

  for (const [index, rule] of [rule1, rule2].entries()) {
    const periodKey = normalizePeriodKey(lottery, rule.validationPeriod);
    const numbers = periodKey === sourcePeriodKey
      ? source.sourceNumbers
      : historyNumbers.get(periodKey);
    if (!numbers) return [];
    let target = orderedRows.find(({ row }) => normalizePeriodKey(lottery, row.period) === periodKey);
    if (!target) {
      target = {
        offset: rule.referenceOffset,
        order: index,
        row: {
          key: `current-rule-${index + 1}`,
          period: rule.validationPeriod,
          numbers,
          lockedNumbers: [],
          sourceNumbers: [],
          resultNumbers: [],
          right: { kind: "lock" },
        },
      };
      orderedRows.push(target);
    }
    target.row.sourceNumbers = distinctNumbers([
      ...target.row.sourceNumbers,
      ...(!target.row.lockedNumbers.includes(rule.currentBaseNumber) ? [rule.currentBaseNumber] : []),
    ]);
    target.row.right = appendFormula(target.row.right, currentFormula(rule));
  }

  return orderedRows
    .sort((left, right) => left.offset - right.offset || left.order - right.order)
    .map(({ row }) => row);
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

function SummaryFormula({
  lottery,
  rule,
}: {
  lottery: NumberBallLottery;
  rule: TianyanValidation["rules"][number];
}) {
  const formulaValue = rule.algorithmType === "拖牌"
    ? wrappedOffset(rule.currentBaseNumber, rule.ruleValue, lotteryMaximum(lottery))
    : rule.ruleValue;
  const numeric = rule.algorithmType === "加減" || rule.algorithmType === "拖牌"
    ? `${formulaValue >= 0 ? "+" : ""}${formulaValue}`
    : String(formulaValue);
  if (rule.algorithmType === "加減" || rule.algorithmType === "拖牌") {
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
  lottery,
  item,
  validation,
}: {
  lottery: NumberBallLottery;
  item: Pick<TianyanApiRow, "number" | "lockedPosition" | "predictionDistance">;
  validation: TianyanValidation;
}) {
  const rulePairs = Array.from({ length: Math.ceil(validation.rules.length / 2) },
    (_, index) => validation.rules.slice(index * 2, index * 2 + 2));
  if (!rulePairs.length) return null;
  const lockedNumber = validation.sourceA?.lockedNumber ?? item.number;
  const lockedPosition = validation.sourceA?.lockedPosition ?? item.lockedPosition;
  const predictionDistance = validation.sourceA?.predictionDistance ?? item.predictionDistance;

  return (
    <>
      <ExploreValidationSummary layout="tianyan">
        <span className="tianyan-validation-summary-lines tianyan-expanded-summary-lines" aria-label="版路摘要">
          {rulePairs.map(([rule1, rule2]) => (
            <Fragment key={rule1.id}>
              <span className="tianyan-validation-summary-row">
                <SummaryLocked number={lockedNumber} position={lockedPosition} />
                <i className="validation-summary-divider" aria-hidden="true">｜</i>
                <SummaryDirection offset={rule1.referenceOffset} />
                <i className="validation-summary-divider" aria-hidden="true">｜</i>
                <SummaryPosition position={rule1.referencePosition} />
                <i className="validation-summary-divider" aria-hidden="true">｜</i>
                <SummaryFormula lottery={lottery} rule={rule1} />
              </span>
              {rule2 ? <span className="tianyan-validation-summary-row">
                <span className="tianyan-expanded-summary-indent" aria-hidden="true">
                  <SummaryLocked number={lockedNumber} position={lockedPosition} />
                </span>
                <i className="validation-summary-divider" aria-hidden="true">｜</i>
                <SummaryDirection offset={rule2.referenceOffset} />
                <i className="validation-summary-divider" aria-hidden="true">｜</i>
                <SummaryPosition position={rule2.referencePosition} />
                <i className="validation-summary-divider" aria-hidden="true">｜</i>
                <SummaryFormula lottery={lottery} rule={rule2} />
                <i className="validation-summary-divider" aria-hidden="true">｜</i>
                <span>下 <i className="validation-summary-future">{predictionDistance}</i> 期開</span>
              </span> : null}
            </Fragment>
          ))}
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
        : <span>{`${formula.ruleValue >= 0 ? "+" : ""}${formula.ruleValue}`}</span>}
      <span>=</span><span>{displayNumber(formula.calculationResult)}</span>
    </span>
  );
}

function ValidationRight({ row }: { row: TianyanPatchedValidationRow }) {
  if (row.right.kind === "lock") return null;
  if (row.right.kind === "formula") return (
    <span className="tianyan-expanded-formula-list">
      {row.right.formulas.map((formula, index) => (
        <ValidationFormula formula={formula} key={`${row.key}-formula-${index}`} />
      ))}
    </span>
  );
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
                const highlightClass = row.lockedNumbers.includes(numeric)
                  ? " explore-validation-number--hit"
                  : row.sourceNumbers.includes(numeric)
                    ? " explore-validation-number--source"
                    : row.resultNumbers.includes(numeric)
                      ? " explore-validation-number--step"
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

type FallbackRow = {
  key: string;
  period: string;
  numbers: Array<string | number>;
  sourceNumber?: number;
  hitNumbers?: number[];
};

function FallbackValidationGroup({
  lottery,
  keyValue,
  rows,
  formulas,
}: {
  lottery: NumberBallLottery;
  keyValue: string;
  rows: FallbackRow[];
  formulas: ReactNode[];
}) {
  return (
    <div
      className="explore-validation-group"
      data-lottery={lottery}
      data-road-type="複合版路"
      data-row-count={rows.length}
      data-wide-numbers={rows.some((row) => row.numbers.length >= 6) ? "true" : "false"}
      key={keyValue}
    >
      <div className="explore-validation-issues explore-validation-numeric-text">
        {rows.map((row) => (
          <span className="explore-validation-issue" key={`${row.key}-period`}>
            {displayValidationPeriod(lottery, row.period)}
          </span>
        ))}
      </div>
      <div className="explore-validation-numbers-card">
        {rows.map((row) => (
          <div className="explore-validation-draw-row explore-validation-number-row" key={`${row.key}-numbers`}>
            <span className="explore-validation-numbers explore-validation-numeric-text">
              {row.numbers.map(displayNumber).map((value, index) => {
                const state = row.sourceNumber !== undefined && value === displayNumber(row.sourceNumber)
                  ? "hit"
                  : (row.hitNumbers ?? []).some((hit) => value === displayNumber(hit)) ? "step" : "";
                const number = (
                  <i className={state ? `explore-validation-number explore-validation-number--${state}` : "explore-validation-number"}>{value}</i>
                );
                return index === 6 && (lottery === "六合彩" || lottery === "大樂透") ? (
                  <span className="explore-validation-special-number" key={`${value}-${index}`}>
                    <i className="explore-validation-special-separator" aria-hidden="true">+</i>
                    {number}
                  </span>
                ) : <Fragment key={`${value}-${index}`}>{number}</Fragment>;
              })}
            </span>
          </div>
        ))}
      </div>
      <div className="explore-validation-formulas">
        {rows.map((row, index) => (
          <span className="explore-validation-formula-row" key={`${row.key}-formula`}>{formulas[index] ?? ""}</span>
        ))}
      </div>
    </div>
  );
}

function fallbackFormula(
  position: number,
  baseNumber: number,
  algorithmType: string,
  ruleValue: number,
  calculationResult: number,
) {
  return (
    <span className="explore-validation-formula-expression">
      <span className="explore-validation-formula-position">
        <span>第</span><span>{position}</span><span>顆</span>
      </span>
      <span>{displayNumber(baseNumber)}</span>
      {algorithmType.startsWith("合值")
        ? <><span>合值</span><span>{ruleValue}</span></>
        : <span>{`+${ruleValue}`}</span>}
      <span>=</span><span>{displayNumber(calculationResult)}</span>
    </span>
  );
}

function TianyanFallbackGroups({
  lottery,
  validation,
}: {
  lottery: NumberBallLottery;
  validation: TianyanValidation;
}) {
  const currentFormulas = validation.rules.slice(0, 2).map((rule) => fallbackFormula(
    rule.validationPosition,
    rule.currentBaseNumber,
    rule.algorithmType,
    rule.ruleValue,
    rule.currentPredictionNumber,
  ));
  return (
    <div className="explore-validation-groups">
      {validation.historicalValidation.map((row) => {
        const matchedRules = [row.rule1, row.rule2].filter((rule) => rule.hit);
        if (!matchedRules.length) return null;
        return (
          <FallbackValidationGroup
            lottery={lottery}
            keyValue={`${validation.itemId}-${row.group}-${row.predictionPeriod}`}
            key={`${validation.itemId}-${row.group}-${row.predictionPeriod}`}
            rows={[
              { key: `source-${row.group}`, period: row.sourcePeriod, numbers: row.sourceNumbers, sourceNumber: row.lockedNumber },
              ...matchedRules.slice(1).map((_, index) => ({ key: `formula-${row.group}-${index}`, period: "", numbers: [] })),
              { key: `prediction-${row.group}`, period: row.predictionPeriod, numbers: row.predictionNumbers, hitNumbers: row.hitNumbers },
            ]}
            formulas={[
              ...matchedRules.map((rule) => fallbackFormula(
                rule.validationPosition,
                rule.baseNumber,
                rule.algorithmType,
                rule.ruleValue,
                rule.calculationResult,
              )),
              <>［{" "}<strong className="explore-validation-result-number">{row.hitNumbers.map(displayNumber).join("、")}</strong>{" "}］</>,
            ]}
          />
        );
      })}
      {validation.sourceA && currentFormulas.length === 2 ? (
        <FallbackValidationGroup
          lottery={lottery}
          keyValue={`${validation.itemId}-current`}
          rows={[
            { key: "current-source", period: validation.sourceA.sourcePeriod, numbers: validation.sourceA.sourceNumbers, sourceNumber: validation.sourceA.lockedNumber },
            { key: "current-formula-2", period: "", numbers: [] },
          ]}
          formulas={currentFormulas}
        />
      ) : null}
    </div>
  );
}

export function TianyanExpandedValidationGroups({
  lottery,
  numberOrder,
  validation,
}: {
  lottery: NumberBallLottery;
  numberOrder: MatrixNumberOrder;
  validation: TianyanValidation;
}) {
  const [historyNumbers, setHistoryNumbers] = useState<Map<string, Array<string | number>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHistoryNumbers(null);

    const resolve = async () => {
      const required = requiredRulePeriods(lottery, validation);
      if (required.length === 0) {
        if (!cancelled) setHistoryNumbers(new Map());
        return;
      }

      const lookup = buildHistoryNumbers(lottery, numberOrder,
        await fetchLotteryHistoryPeriods(lottery, [...new Set(required)]));
      if (!cancelled && hasRequiredPeriods(lottery, lookup, validation)) {
        setHistoryNumbers(lookup);
      }
    };

    void resolve().catch(() => {
      if (!cancelled) setHistoryNumbers(null);
    });
    return () => { cancelled = true; };
  }, [lottery, numberOrder, validation]);

  if (!historyNumbers) {
    return <TianyanFallbackGroups lottery={lottery} validation={validation} />;
  }

  const historicalGroups = validation.historicalValidation
    .map((group) => ({
      key: group.group,
      rows: buildTianyanHistoricalRows(lottery, group, historyNumbers),
    }))
    .filter((group): group is { key: string; rows: TianyanPatchedValidationRow[] } => Boolean(group.rows));
  const currentRows = buildTianyanCurrentRows(lottery, validation, historyNumbers);

  return (
    <div className="explore-validation-groups">
      {historicalGroups.map((group) => (
        <PatchedValidationGroup
          lottery={lottery}
          rows={group.rows}
          groupKey={group.key}
          key={group.key}
        />
      ))}
      {currentRows.length ? (
        <PatchedValidationGroup
          lottery={lottery}
          rows={currentRows}
          groupKey="current"
        />
      ) : null}
    </div>
  );
}
