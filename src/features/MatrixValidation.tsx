import { SubscriptionCopy } from '../subscription-copy';
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { DoubleArrowLeftIcon, DoubleArrowRightIcon } from "@radix-ui/react-icons";
import { type LotteryId } from "../Prototype";
import { ExploreValidationSummary } from "../ExploreValidationSummary";
import { TianyanPatchedSummary } from "../TianyanExpandedLayoutPatch";
import { type ExploreValidation, type TianhengApiRow, type TianhengValidation, type TianyanValidation } from "../matrix-algorithm-api";
import { ROAD_VALIDATION_SAMPLE_HISTORY } from "./shared";

export function RoadValidationProcess({
  number,
  position,
  predictionPeriod,
  consecutive,
  prediction,
  roadType,
}: {
  number: string;
  position: number;
  predictionPeriod: number;
  consecutive: string;
  prediction: string;
  roadType?: string;
}) {
  const sourceGroups = [ROAD_VALIDATION_SAMPLE_HISTORY.slice(0, 3), ROAD_VALIDATION_SAMPLE_HISTORY.slice(3, 6)];
  const validationGroups = Array.from({ length: 8 }, (_, index) => sourceGroups[index % sourceGroups.length]);
  return (
    <section className="road-validation-process" aria-label="驗證過程">
      <header className="validation-summary-card">
        <span>
          開 <i className="validation-summary-primary">{number}</i>
          第 <i className="validation-summary-position">{position}</i> 顆｜上 <i className="validation-summary-lookback">2</i> 期｜
          第 <i className="validation-summary-position">3</i> 顆｜<i className="validation-summary-formula">{roadType === "合值版路" ? "合值14.24" : "+14.24"}</i>｜
          下 <i className="validation-summary-future">{predictionPeriod}</i> 期開
        </span>
        <em>{consecutive}</em>
      </header>
      {validationGroups.map((group, groupIndex) => (
        <div className="validation-period-block" key={groupIndex}>
          {group.map(([issue, , numbers], rowIndex) => {
            const lockRow = groupIndex % 2 === 0 ? 1 : 0;
            return (
              <div className="validation-period-row" key={issue}>
                <span className="validation-issue">{issue}</span>
                <span className="validation-full-numbers">{numbers.map((value) => <i key={value}>{value}</i>)}</span>
                <span className="validation-formula">
                  {rowIndex < 2 ? <><b>{number} +14.24</b>{rowIndex === lockRow ? <small>鎖定條件</small> : null}</> : <><b>預測期</b><strong>版路結果 {prediction.replace(".", "、")}</strong></>}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

export function useExploreValidationProtection() {
  const [contentProtected, setContentProtected] = useState(() => (
    typeof document !== "undefined" && document.hidden
  ));

  useEffect(() => {
    const syncVisibility = () => setContentProtected(document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  return contentProtected;
}

export function displayValidationPeriod(lottery: LotteryId, period: string) {
  return lottery === "今彩539" || lottery === "大樂透"
    ? period.replace(/^(\d{3})000(\d{3})$/, "$1$2")
    : period;
}

export function ExploreValidationProcess({
  item,
  lottery,
  validation,
  loading,
  loadingLabel = "驗證資料載入中",
}: {
  item: {
    number: string;
    position: number;
    predictionPeriod: number;
    consecutive: string;
    algorithmType: string;
    referenceOffset?: number;
    referencePosition?: number;
  };
  lottery: LotteryId;
  validation?: ExploreValidation;
  loading: boolean;
  loadingLabel?: string;
}) {
  const contentProtected = useExploreValidationProtection();

  if (loading) return <p className="empty-result">{loadingLabel}</p>;
  if (!validation || validation.ruleSets.length === 0) {
    return <p className="empty-result">無驗證資料</p>;
  }

  type ValidationDisplayRow = {
    key: string;
    period: string;
    numbers: Array<string | number>;
    sourceNumber?: string;
    stepNumber?: number;
    hitNumbers?: Array<string | number>;
  };

  const values = (numbers: Array<string | number>) => numbers.map((value) => String(value).padStart(2, "0"));
  const relation = item.referenceOffset === undefined || item.referenceOffset === 0
    ? "同期"
    : `${item.referenceOffset < 0 ? "上" : "下"} ${Math.abs(item.referenceOffset)} 期`;

  const displayNumber = (value: string | number) => String(value).padStart(2, "0");
  const lotteryMaximum = lottery === "今彩539" || lottery === "天天樂" ? 39 : 49;
  const normalizeFormulaNumber = (value: number) => String(
    (((value - 1) % lotteryMaximum) + lotteryMaximum) % lotteryMaximum + 1,
  ).padStart(2, "0");
  const formulaResultNumber = (algorithmType: string, baseNumber: number, ruleValue: number) => (
    normalizeFormulaNumber(algorithmType.startsWith("合值") ? ruleValue - baseNumber : baseNumber + ruleValue)
  );
  const validationFormula = (
    position: number,
    baseNumber: number,
    algorithmType: string,
    ruleValue: number,
  ) => (
    <span className="explore-validation-formula-expression">
      <span className="explore-validation-formula-position">
        <span>第</span>
        <span>{position}</span>
        <span>顆</span>
      </span>
      <span>{displayNumber(baseNumber)}</span>
      {algorithmType.startsWith("合值") ? (
        <>
          <span>合值</span>
          <span>{ruleValue}</span>
        </>
      ) : <span>{`+${ruleValue}`}</span>}
      <span>=</span>
      <span>{formulaResultNumber(algorithmType, baseNumber, ruleValue)}</span>
    </span>
  );
  const resultFormula = (resultNumbers: string) => (
    <>［{" "}<strong className="explore-validation-result-number">{resultNumbers}</strong>{" "}］</>
  );
  const summarySeparator = () => <i className="explore-validation-summary-separator" aria-hidden="true">｜</i>;
  const validationGroup = (
    key: string,
    rows: ValidationDisplayRow[],
    formulas: ReactNode[],
  ) => (
    <div
      className="explore-validation-group"
      data-lottery={lottery}
      data-road-type={item.algorithmType}
      data-row-count={rows.length}
      data-wide-numbers={rows.some((row) => row.numbers.length >= 6) ? "true" : "false"}
      key={key}
    >
      <div className="explore-validation-issues explore-validation-numeric-text">
        {rows.map((row) => <span className="explore-validation-issue" key={`${row.key}-period`}>{displayValidationPeriod(lottery, row.period)}</span>)}
      </div>
      <div className="explore-validation-numbers-card">
        {rows.map((row) => (
          <div className="explore-validation-draw-row explore-validation-number-row" key={`${row.key}-numbers`}>
            <span className="explore-validation-numbers explore-validation-numeric-text">
              {values(row.numbers).map((value, index) => {
                const state = value === displayNumber(row.sourceNumber ?? "")
                  ? "hit"
                  : value === displayNumber(row.stepNumber ?? "")
                    ? "source"
                    : (row.hitNumbers ?? []).some((hit) => value === displayNumber(hit))
                      ? "step"
                      : "";
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
        {rows.map((row, index) => <span className="explore-validation-formula-row" key={`${row.key}-formula`}>{formulas[index] ?? ""}</span>)}
      </div>
    </div>
  );

  return (
    <section
      className="road-validation-process explore-validation-card"
      aria-label="驗證過程"
      data-content-protected={contentProtected ? "true" : "false"}
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      {validation.ruleSets.map((ruleSet, ruleSetIndex) => {
        const ruleDisplayValues = (matchedRules?: ExploreValidation["ruleSets"][number]["historicalValidation"][number]["matchedRules"]) => {
          if (!matchedRules) return ruleSet.rules.map((rule) => rule.display);
          const displays = matchedRules.map((matched) => {
            if (typeof matched !== "number") {
              return ruleSet.rules.find((rule) => (
                rule.value === matched.value && rule.algorithmType === matched.algorithmType
              ))?.display ?? matched.display;
            }
            const valueMatches = ruleSet.rules.filter((rule) => rule.value === matched);
            if (valueMatches.length === 1) return valueMatches[0].display;
            return `共同值${matched}`;
          });
          return [...new Set(displays)];
        };
        const ruleDisplays = (matchedRules?: ExploreValidation["ruleSets"][number]["historicalValidation"][number]["matchedRules"]) => ruleDisplayValues(matchedRules).join("、");
        const formulaRules = (matchedRules?: ExploreValidation["ruleSets"][number]["historicalValidation"][number]["matchedRules"]) => {
          const resolved = matchedRules
            ? matchedRules.map((matched) => {
                if (typeof matched !== "number") {
                  return ruleSet.rules.find((rule) => (
                    rule.value === matched.value && rule.algorithmType === matched.algorithmType
                  )) ?? matched;
                }
                return ruleSet.rules.find((rule) => (
                  rule.value === matched && (
                    rule.algorithmType === item.algorithmType || rule.algorithmType === `${item.algorithmType}版路`
                  )
                )) ?? ruleSet.rules.find((rule) => rule.value === matched) ?? {
                  value: matched,
                  display: String(matched),
                  algorithmType: item.algorithmType,
                };
              })
            : ruleSet.rules;
          return item.algorithmType === "拖牌" ? [...resolved].reverse() : resolved;
        };
        const formulaRows = (
          baseNumber: number,
          matchedRules?: ExploreValidation["ruleSets"][number]["historicalValidation"][number]["matchedRules"],
        ) => formulaRules(matchedRules).slice(0, 2).map((rule) => validationFormula(
          item.referencePosition ?? item.position,
          baseNumber,
          rule.algorithmType,
          rule.value,
        ));
        const summaryFormulaValues = ruleDisplayValues();
        const referenceFirst = (item.referenceOffset ?? 0) < 0;
        const compactValidation = item.algorithmType === "拖牌" || (item.referenceOffset ?? 0) === 0;
        const currentCalculations = validation.sourceA
          ? formulaRows(validation.sourceA.baseNumber)
          : [];
        return (
          <div className="validation-rule-set explore-validation-rule-set" key={`${validation.itemId}-${ruleSetIndex}`}>
            <header className="explore-validation-summary-card">
              <ExploreValidationSummary>
                開 <i className="validation-summary-primary">{item.number}</i> 第 <i className="validation-summary-position">{item.position}</i> 顆{" "}{summarySeparator()}{" "}
                {relation === "同期" ? <i className="validation-summary-position">同期</i> : <>{relation.startsWith("上") ? "上 " : "下 "}<i className="validation-summary-lookback">{Math.abs(item.referenceOffset ?? 0)}</i> 期</>}{" "}{summarySeparator()}{" "}第 <i className="validation-summary-position">{item.referencePosition ?? item.position}</i> 顆{" "}{summarySeparator()}{" "}
                {item.algorithmType === "合值" ? (
                  <span className="validation-summary-formula-sequence">
                    <span className="validation-summary-formula-label">合值</span>
                    <i className="validation-summary-formula">{summaryFormulaValues.map((display) => display.replace(/^合值\s*/, "")).join("、")}</i>
                  </span>
                ) : <i className="validation-summary-formula">{ruleDisplays()}</i>}{" "}{summarySeparator()}{" "}下 <i className="validation-summary-future">{item.predictionPeriod}</i> 期開
              </ExploreValidationSummary>
              <strong className="explore-validation-consecutive-tag">{item.consecutive}</strong>
            </header>
            <div className="explore-validation-groups">
              {ruleSet.historicalValidation.map((row) => {
                const source: ValidationDisplayRow = {
                  key: `source-${row.group}`,
                  period: row.sourcePeriod,
                  numbers: row.sourceNumbers,
                  sourceNumber: item.number,
                  stepNumber: item.algorithmType !== "拖牌" && (item.referenceOffset ?? 0) === 0
                    ? row.baseNumber
                    : undefined,
                };
                const reference: ValidationDisplayRow = {
                  key: `reference-${row.group}`,
                  period: row.referencePeriod,
                  numbers: row.referenceNumbers,
                  stepNumber: row.baseNumber,
                };
                const prediction: ValidationDisplayRow = {
                  key: `prediction-${row.group}`,
                  period: row.predictionPeriod,
                  numbers: row.predictionNumbers,
                  hitNumbers: row.hitNumbers,
                };
                const resultNumbers = values(row.hitNumbers).join("、");
                const calculations = formulaRows(row.baseNumber, row.matchedRules);
                if (compactValidation) {
                  const formulaOnlyRows: ValidationDisplayRow[] = calculations.slice(1, 2).map((_, index) => ({
                    key: `formula-${row.group}-${index + 2}`,
                    period: "",
                    numbers: [],
                  }));
                  return validationGroup(
                    `${ruleSetIndex}-${row.group}-${row.predictionPeriod}`,
                    [source, ...formulaOnlyRows, prediction],
                    [
                      ...calculations.slice(0, 2),
                      resultFormula(resultNumbers),
                    ],
                  );
                }
                const rows = referenceFirst ? [reference, source, prediction] : [source, reference, prediction];
                return validationGroup(
                  `${ruleSetIndex}-${row.group}-${row.predictionPeriod}`,
                  rows,
                  rows.map((displayRow) => displayRow.key.startsWith("reference-")
                    ? calculations[0] ?? ""
                    : displayRow.key.startsWith("source-")
                      ? calculations[1] ?? ""
                      : resultFormula(resultNumbers)),
                );
              })}
              {validation.sourceA ? validationGroup(
                `current-${ruleSetIndex}`,
                compactValidation
                  ? [
                      {
                        key: "current-source",
                        period: validation.sourceA.sourcePeriod,
                        numbers: validation.sourceA.sourceNumbers,
                        sourceNumber: item.number,
                        stepNumber: item.algorithmType !== "拖牌" && (item.referenceOffset ?? 0) === 0
                          ? validation.sourceA.baseNumber
                          : undefined,
                      },
                      ...currentCalculations.slice(1, 2).map((_, index): ValidationDisplayRow => ({
                        key: `current-formula-${index + 2}`,
                        period: "",
                        numbers: [],
                      })),
                    ]
                  : referenceFirst
                  ? [
                      {
                        key: "current-reference",
                        period: validation.sourceA.referencePeriod,
                        numbers: validation.sourceA.referenceNumbers ?? [],
                        stepNumber: validation.sourceA.baseNumber,
                      },
                      {
                        key: "current-source",
                        period: validation.sourceA.sourcePeriod,
                        numbers: validation.sourceA.sourceNumbers,
                        sourceNumber: item.number,
                      },
                    ]
                  : [
                      {
                        key: "current-source",
                        period: validation.sourceA.sourcePeriod,
                        numbers: validation.sourceA.sourceNumbers,
                        sourceNumber: item.number,
                      },
                      {
                        key: "current-reference",
                        period: validation.sourceA.referencePeriod,
                        numbers: validation.sourceA.referenceNumbers ?? [],
                        stepNumber: validation.sourceA.baseNumber,
                      },
                    ],
                compactValidation
                  ? currentCalculations.slice(0, 2)
                  : referenceFirst
                    ? [currentCalculations[0] ?? "", currentCalculations[1] ?? ""]
                    : [currentCalculations[1] ?? "", currentCalculations[0] ?? ""],
              ) : null}
            </div>
            <footer className="explore-validation-prediction">
              <DoubleArrowLeftIcon className="explore-validation-prediction-arrow explore-validation-prediction-arrow--left" aria-hidden="true" />
              <span className="explore-validation-prediction-content">
                <strong><SubscriptionCopy formal="本期預測" alternative="版路結果" /></strong>
                <b className="explore-validation-numeric-text">{values(ruleSet.predictionNumbers).join("、")}</b>
              </span>
              <DoubleArrowRightIcon className="explore-validation-prediction-arrow explore-validation-prediction-arrow--right" aria-hidden="true" />
            </footer>
          </div>
        );
      })}
    </section>
  );
}

export function TianyanValidationProcess({
  item,
  lottery,
  validation,
  loading,
}: {
  item: { number: string; position: number; predictionPeriod: number };
  lottery: LotteryId;
  validation?: TianyanValidation;
  loading: boolean;
}) {
  const contentProtected = useExploreValidationProtection();
  if (loading) return <p className="empty-result">驗證資料載入中</p>;
  if (!validation) return <p className="empty-result">無驗證資料</p>;

  type TianyanDisplayRow = {
    key: string;
    period: string;
    numbers: Array<string | number>;
    sourceNumber?: number;
    hitNumbers?: number[];
  };
  const displayNumber = (value: string | number) => String(value).padStart(2, "0");
  const values = (numbers: Array<string | number>) => numbers.map(displayNumber);
  const validationFormula = (
    position: number,
    baseNumber: number,
    algorithmType: string,
    ruleValue: number,
    calculationResult: number,
  ) => (
    <span className="explore-validation-formula-expression">
      <span className="explore-validation-formula-position">
        <span>第</span>
        <span>{position}</span>
        <span>顆</span>
      </span>
      <span>{displayNumber(baseNumber)}</span>
      {algorithmType.startsWith("合值") ? (
        <><span>合值</span><span>{ruleValue}</span></>
      ) : <span>{`+${ruleValue}`}</span>}
      <span>=</span>
      <span>{displayNumber(calculationResult)}</span>
    </span>
  );
  const resultFormula = (resultNumbers: Array<string | number>) => (
    <>［{" "}<strong className="explore-validation-result-number">{values(resultNumbers).join("、")}</strong>{" "}］</>
  );
  const validationGroup = (key: string, rows: TianyanDisplayRow[], formulas: ReactNode[]) => (
    <div
      className="explore-validation-group"
      data-lottery={lottery}
      data-road-type="複合版路"
      data-row-count={rows.length}
      data-wide-numbers={rows.some((row) => row.numbers.length >= 6) ? "true" : "false"}
      key={key}
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
              {values(row.numbers).map((value, index) => {
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
  const currentFormulas = validation.rules.slice(0, 2).map((rule) => validationFormula(
    rule.validationPosition,
    rule.currentBaseNumber,
    rule.algorithmType,
    rule.ruleValue,
    rule.currentPredictionNumber,
  ));
  return (
    <section
      className="road-validation-process explore-validation-card"
      aria-label="天衍驗證過程"
      data-lottery={lottery}
      data-content-protected={contentProtected ? "true" : "false"}
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="validation-rule-set explore-validation-rule-set">
        <header className="explore-validation-summary-card">
          <TianyanPatchedSummary
            lottery={lottery}
            item={{ number: item.number, lockedPosition: item.position, predictionDistance: item.predictionPeriod }}
            validation={validation}
          />
        </header>
        <div className="explore-validation-groups">
          {validation.historicalValidation.map((row) => {
            const matchedRules = [row.rule1, row.rule2].filter((rule) => rule.hit);
            if (!matchedRules.length) return null;
            return validationGroup(
              `${validation.itemId}-${row.group}-${row.predictionPeriod}`,
              [
                { key: `source-${row.group}`, period: row.sourcePeriod, numbers: row.sourceNumbers, sourceNumber: row.lockedNumber },
                ...matchedRules.slice(1).map((_, index) => ({ key: `formula-${row.group}-${index}`, period: "", numbers: [] })),
                { key: `prediction-${row.group}`, period: row.predictionPeriod, numbers: row.predictionNumbers, hitNumbers: row.hitNumbers },
              ],
              [
                ...matchedRules.map((rule) => validationFormula(rule.validationPosition, rule.baseNumber, rule.algorithmType, rule.ruleValue, rule.calculationResult)),
                resultFormula(row.hitNumbers),
              ],
            );
          })}
          {validation.sourceA && currentFormulas.length === 2 ? validationGroup(
            `${validation.itemId}-current`,
            [
              { key: "current-source", period: validation.sourceA.sourcePeriod, numbers: validation.sourceA.sourceNumbers, sourceNumber: validation.sourceA.lockedNumber },
              { key: "current-formula-2", period: "", numbers: [] },
            ],
            currentFormulas,
          ) : null}
        </div>
        <footer className="explore-validation-prediction">
          <DoubleArrowLeftIcon className="explore-validation-prediction-arrow explore-validation-prediction-arrow--left" aria-hidden="true" />
          <span className="explore-validation-prediction-content">
            <strong><SubscriptionCopy formal="本期預測" alternative="版路結果" /></strong>
            <b className="explore-validation-numeric-text">{values(validation.mergedSearchPredictionNumbers).join("、")}</b>
          </span>
          <DoubleArrowRightIcon className="explore-validation-prediction-arrow explore-validation-prediction-arrow--right" aria-hidden="true" />
        </footer>
      </div>
    </section>
  );
}

export function TianhengValidationProcess({
  item,
  lottery,
  validation,
  loading,
}: {
  item: TianhengApiRow;
  lottery: LotteryId;
  validation?: TianhengValidation;
  loading: boolean;
}) {
  const contentProtected = useExploreValidationProtection();
  if (loading) return <p className="empty-result">驗證資料載入中</p>;
  if (!validation || validation.ruleSets.length === 0) return <p className="empty-result">無驗證資料</p>;

  type TianhengDisplayRow = {
    key: string;
    period: string;
    numbers: Array<string | number>;
    lockedNumbers?: Array<string | number>;
    stepNumber?: number;
    hitNumbers?: Array<string | number>;
    sourceGroup?: string;
  };

  const displayNumber = (value: string | number) => String(value).padStart(2, "0");
  const values = (numbers: Array<string | number>) => numbers.map(displayNumber);
  const lotteryMaximum = lottery === "今彩539" || lottery === "天天樂" ? 39 : 49;
  const normalizeFormulaNumber = (value: number) => String(
    (((value - 1) % lotteryMaximum) + lotteryMaximum) % lotteryMaximum + 1,
  ).padStart(2, "0");
  const validationFormula = (
    position: number,
    baseNumber: number,
    algorithmType: string,
    ruleValue: number,
  ) => (
    <span className="explore-validation-formula-expression">
      <span className="explore-validation-formula-position">
        <span>第</span><span>{position}</span><span>顆</span>
      </span>
      <span>{displayNumber(baseNumber)}</span>
      {algorithmType.startsWith("合值")
        ? <><span>合值</span><span>{ruleValue}</span></>
        : <span>{`+${ruleValue}`}</span>}
      <span>=</span>
      <span>{normalizeFormulaNumber(algorithmType.startsWith("合值") ? ruleValue - baseNumber : baseNumber + ruleValue)}</span>
    </span>
  );
  const resultFormula = (hitNumbers: Array<string | number>) => (
    <>［{" "}<strong className="explore-validation-result-number">{values(hitNumbers).join("、")}</strong>{" "}］</>
  );
  const divider = <i className="validation-summary-divider" aria-hidden="true">｜</i>;
  const summaryLocked = (number: string, position: number) => (
    <span><i className="validation-summary-primary">{number}</i> 第 <i className="validation-summary-position">{position}</i> 顆</span>
  );
  const summaryDirection = () => {
    const offset = item.algorithmType === "拖牌" ? 0 : item.referenceOffset ?? 0;
    if (offset === 0) return <i className="validation-summary-position">同期</i>;
    return <span>{offset < 0 ? "上 " : "下 "}<i className="validation-summary-lookback">{Math.abs(offset)}</i> 期</span>;
  };
  const summaryPosition = item.algorithmType === "拖牌"
    ? item.firstLockedPosition
    : item.referencePosition ?? item.firstLockedPosition;

  const validationGroup = (key: string, rows: TianhengDisplayRow[], formulas: ReactNode[]) => (
    <div
      className="explore-validation-group"
      data-lottery={lottery}
      data-road-type={item.algorithmType}
      data-row-count={rows.length}
      data-wide-numbers={rows.some((row) => row.numbers.length >= 6) ? "true" : "false"}
      key={key}
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
          <div
            className="explore-validation-draw-row explore-validation-number-row"
            data-testid={row.sourceGroup ? `tianheng-source-row-${row.sourceGroup}` : undefined}
            key={`${row.key}-numbers`}
          >
            <span className="explore-validation-numbers explore-validation-numeric-text">
              {values(row.numbers).map((value, index) => {
                const state = (row.lockedNumbers ?? []).some((locked) => value === displayNumber(locked))
                  ? "hit"
                  : value === displayNumber(row.stepNumber ?? "")
                    ? "source"
                    : (row.hitNumbers ?? []).some((hit) => value === displayNumber(hit))
                      ? "step"
                      : "";
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

  return (
    <section
      className="road-validation-process explore-validation-card tianheng-validation-process"
      aria-label="天衡驗證過程"
      data-content-protected={contentProtected ? "true" : "false"}
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      {validation.ruleSets.map((ruleSet, ruleSetIndex) => {
        const ruleFormulas = (
          baseNumber: number,
          matchedRules?: TianhengValidation["ruleSets"][number]["historicalValidation"][number]["matchedRules"],
        ) => {
          const resolved = (matchedRules ?? ruleSet.rules).map((matchedRule) => typeof matchedRule === "number"
            ? ruleSet.rules.find((candidate) => candidate.value === matchedRule) ?? {
                value: matchedRule,
                display: String(matchedRule),
                algorithmType: item.algorithmType,
              }
            : ruleSet.rules.find((candidate) => (
                candidate.value === matchedRule.value && candidate.algorithmType === matchedRule.algorithmType
              )) ?? matchedRule);
          const ordered = item.algorithmType === "拖牌" ? [...resolved].reverse() : resolved;
          return ordered.slice(0, 2).map((rule) => validationFormula(
            item.referencePosition ?? item.firstLockedPosition,
            baseNumber,
            rule.algorithmType,
            rule.value,
          ));
        };
        const compactValidation = item.algorithmType === "拖牌" || (item.referenceOffset ?? 0) === 0;
        const referenceFirst = (item.referenceOffset ?? 0) < 0;
        const ruleDisplays = ruleSet.rules.map((rule) => rule.display).join("、");
        return (
          <div className="validation-rule-set explore-validation-rule-set" key={`${validation.itemId}-${ruleSetIndex}`}>
            <header className="explore-validation-summary-card">
              <ExploreValidationSummary layout="tianyan">
                <span className="tianyan-validation-summary-lines tianheng-summary-lines" aria-label="版路摘要">
                  <span className="tianheng-summary-open-label">開</span>
                  <span className="tianyan-validation-summary-row tianheng-summary-row--first" data-testid="tianheng-summary-row">
                    {summaryLocked(item.firstNumber, item.firstLockedPosition)}
                    {divider}
                    {summaryDirection()}
                    {divider}
                    <span>第 <i className="validation-summary-position">{summaryPosition}</i> 顆</span>
                  </span>
                  <span className="tianyan-validation-summary-row tianheng-summary-row--second" data-testid="tianheng-summary-row">
                    {summaryLocked(item.secondNumber, item.secondLockedPosition)}
                    {divider}
                    {item.algorithmType === "合值" ? (
                      <span className="validation-summary-formula-sequence">
                        <span className="validation-summary-formula-label">合值</span>
                        <i className="validation-summary-formula">
                          {ruleSet.rules.map((rule) => rule.display.replace(/^合值\s*/, "")).join("、")}
                        </i>
                      </span>
                    ) : <i className="validation-summary-formula">{ruleDisplays}</i>}
                    {divider}
                    <span>下 <i className="validation-summary-future">{item.predictionDistance}</i> 期開</span>
                  </span>
                </span>
              </ExploreValidationSummary>
              <strong className="explore-validation-consecutive-tag">{item.consecutive}</strong>
            </header>
            <div className="explore-validation-groups">
              {ruleSet.historicalValidation.map((row) => {
                const source: TianhengDisplayRow = {
                  key: `source-${row.group}`,
                  period: row.sourcePeriod,
                  numbers: row.sourceNumbers,
                  lockedNumbers: row.lockedNumbers,
                  stepNumber: item.algorithmType !== "拖牌" && (item.referenceOffset ?? 0) === 0
                    ? row.baseNumber
                    : undefined,
                  sourceGroup: row.group,
                };
                const reference: TianhengDisplayRow = {
                  key: `reference-${row.group}`,
                  period: row.referencePeriod,
                  numbers: row.referenceNumbers,
                  stepNumber: row.baseNumber,
                };
                const prediction: TianhengDisplayRow = {
                  key: `prediction-${row.group}`,
                  period: row.predictionPeriod,
                  numbers: row.predictionNumbers,
                  hitNumbers: row.hitNumbers,
                };
                const formulas = ruleFormulas(row.baseNumber, row.matchedRules);
                if (compactValidation) {
                  const formulaOnlyRows: TianhengDisplayRow[] = formulas.slice(1).map((_, index) => ({
                    key: `formula-${row.group}-${index + 2}`,
                    period: "",
                    numbers: [],
                  }));
                  return validationGroup(
                    `${ruleSetIndex}-${row.group}-${row.predictionPeriod}`,
                    [source, ...formulaOnlyRows, prediction],
                    [...formulas, resultFormula(row.hitNumbers)],
                  );
                }
                const rows = referenceFirst ? [reference, source, prediction] : [source, reference, prediction];
                return validationGroup(
                  `${ruleSetIndex}-${row.group}-${row.predictionPeriod}`,
                  rows,
                  referenceFirst
                    ? [formulas[0] ?? "", formulas[1] ?? "", resultFormula(row.hitNumbers)]
                    : [formulas[1] ?? "", formulas[0] ?? "", resultFormula(row.hitNumbers)],
                );
              })}
              {validation.sourceA ? (() => {
                const formulas = ruleFormulas(validation.sourceA.baseNumber);
                const source: TianhengDisplayRow = {
                  key: "current-source",
                  period: validation.sourceA.sourcePeriod,
                  numbers: validation.sourceA.sourceNumbers,
                  lockedNumbers: validation.sourceA.lockedNumbers,
                  stepNumber: item.algorithmType !== "拖牌" && (item.referenceOffset ?? 0) === 0
                    ? validation.sourceA.baseNumber
                    : undefined,
                  sourceGroup: "A",
                };
                if (compactValidation) {
                  const formulaOnlyRows: TianhengDisplayRow[] = formulas.slice(1).map((_, index) => ({
                    key: `current-formula-${index + 2}`,
                    period: "",
                    numbers: [],
                  }));
                  return validationGroup(
                    `${ruleSetIndex}-current`,
                    [source, ...formulaOnlyRows],
                    formulas,
                  );
                }
                const reference: TianhengDisplayRow = {
                  key: "current-reference",
                  period: validation.sourceA.referencePeriod,
                  numbers: validation.sourceA.referenceNumbers ?? [],
                  stepNumber: validation.sourceA.baseNumber,
                };
                return validationGroup(
                  `${ruleSetIndex}-current`,
                  referenceFirst ? [reference, source] : [source, reference],
                  referenceFirst
                    ? [formulas[0] ?? "", formulas[1] ?? ""]
                    : [formulas[1] ?? "", formulas[0] ?? ""],
                );
              })() : null}
            </div>
            <footer className="explore-validation-prediction">
              <DoubleArrowLeftIcon className="explore-validation-prediction-arrow explore-validation-prediction-arrow--left" aria-hidden="true" />
              <span className="explore-validation-prediction-content">
                <strong><SubscriptionCopy formal="本期預測" alternative="版路結果" /></strong>
                <b className="explore-validation-numeric-text">{values(ruleSet.predictionNumbers).join("、")}</b>
              </span>
              <DoubleArrowRightIcon className="explore-validation-prediction-arrow explore-validation-prediction-arrow--right" aria-hidden="true" />
            </footer>
          </div>
        );
      })}
    </section>
  );
}
