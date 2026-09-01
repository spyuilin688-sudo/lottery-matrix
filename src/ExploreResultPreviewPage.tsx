import { useEffect, useState } from "react";
import { ChevronDownIcon, DoubleArrowLeftIcon, DoubleArrowRightIcon } from "@radix-ui/react-icons";
import { PREVIEW_RESULTS, type PreviewDrawRow, type PreviewResult } from "./explore-result-preview-data";
import "./explore-result-preview.css";

type HitCondition = "準4+" | "準5+";

const CONSECUTIVE_FILTERS = {
  "準4+": {
    label: "準4+（鎖定1碼）",
    options: ["準4進5", "準5進6", "準6進7", "準7進8"],
    selected: ["準5進6", "準6進7", "準7進8"],
  },
  "準5+": {
    label: "準5+（鎖定2碼）",
    options: ["準5進6", "準6進7", "準7進8", "準9進10", "準11進12"],
    selected: ["準7進8", "準9進10", "準11進12"],
  },
} as const satisfies Record<HitCondition, { label: string; options: readonly string[]; selected: readonly string[] }>;

function PreviewNumber({ value, row }: { value: string; row: PreviewDrawRow }) {
  const state = value === row.source ? "source" : value === row.step ? "step" : value === row.hit ? "hit" : "";

  return <i className={state ? `explore-validation-number explore-validation-number--${state}` : "explore-validation-number"}>{value}</i>;
}

function formatFormula(formula: string) {
  return formula.replace(/(?<=\d)\+/g, " +");
}

function ExploreValidationCard({ result }: { result: PreviewResult }) {
  return (
    <section className="explore-validation-card" aria-label={`${result.number} 驗證過程`}>
      <div className="explore-validation-summary-card">
        <p className="explore-validation-summary">{result.summary}</p>
        <strong className="explore-validation-consecutive-tag">{result.consecutive}</strong>
      </div>

      <div className="explore-validation-groups">
        {result.groups.map((group, groupIndex) => {
          const complete = groupIndex < result.groups.length - 1;
          const rows = group.rows.slice(0, 3);
          const rowCount = Math.min(3, Math.max(rows.length, group.formulas.length));
          const formulas = Array.from({ length: rowCount }, () => "");

          if (complete) {
            formulas[0] = group.formulas[0] ?? "";
            formulas[rowCount - 1] = group.formulas[1] ?? "";
          } else {
            group.formulas.slice(0, rowCount).forEach((formula, index) => {
              formulas[index] = formula;
            });
          }

          return (
            <div
              className="explore-validation-group"
              data-complete={complete ? "true" : "false"}
              data-road-type={result.algorithmType}
              data-wide-numbers={rows.some((row) => row.numbers.length >= 6 || Boolean(row.special)) ? "true" : "false"}
              key={`${result.id}-${groupIndex}`}
            >
              <div className="explore-validation-issues explore-validation-numeric-text">
                {Array.from({ length: rowCount }, (_, rowIndex) => (
                  <span className="explore-validation-issue" key={`issue-${rowIndex}`}>{rows[rowIndex]?.issue ?? ""}</span>
                ))}
              </div>

              <div className="explore-validation-numbers-card">
                {Array.from({ length: rowCount }, (_, rowIndex) => {
                  const row = rows[rowIndex];
                  return (
                    <div
                      className="explore-validation-draw-row explore-validation-number-row"
                      key={row ? `${row.issue}-${row.special ?? ""}` : `empty-${rowIndex}`}
                    >
                      {row ? (
                        <span className="explore-validation-numbers explore-validation-numeric-text">
                          {row.numbers.map((value, index) => (
                            <PreviewNumber value={value} row={row} key={`${value}-${index}`} />
                          ))}
                          {row.special ? <><b>＋</b><em>{row.special}</em></> : null}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="explore-validation-formulas explore-validation-numeric-text">
                {formulas.map((formula, rowIndex) => (
                  <span className="explore-validation-formula-row" key={`formula-${rowIndex}`}>{formatFormula(formula)}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="explore-validation-prediction">
        <DoubleArrowLeftIcon className="explore-validation-prediction-arrow explore-validation-prediction-arrow--left" aria-hidden="true" />
        <span className="explore-validation-prediction-content">
          <strong>本期預測</strong>
          <b className="explore-validation-numeric-text">{result.finalPrediction}</b>
        </span>
        <DoubleArrowRightIcon className="explore-validation-prediction-arrow explore-validation-prediction-arrow--right" aria-hidden="true" />
      </footer>
    </section>
  );
}

export function ExploreResultPreviewPage({ hitCondition = "準4+" }: { hitCondition?: HitCondition }) {
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterConfig = CONSECUTIVE_FILTERS[hitCondition];
  const [selectedFilters, setSelectedFilters] = useState<string[]>(() => [...filterConfig.selected]);
  const filteredResults = PREVIEW_RESULTS.filter((result) => selectedFilters.includes(result.consecutive));

  useEffect(() => {
    document.title = "探索結果區 | 樂彩 Matrix";
  }, []);

  useEffect(() => {
    setSelectedFilters([...filterConfig.selected]);
  }, [filterConfig]);

  return (
    <main className="feature-screen matrix-explore-screen matrix-explore-main-screen explore-result-preview-screen" aria-label="探索結果區">
      <header className="feature-brand-header integrated-title-header">
        <div className="matrix-title-banner">
          <img src="/assets/lottery/functions/探索標題K.png" alt="Matrix 探索" draggable={false} />
          <a className="integrated-title-back" href="/" aria-label="返回" />
        </div>
      </header>

      <div className="feature-body">
        <section className="panel result-panel">
          <header className="result-title">
            <h2 className="section-title"><span />探索結果區</h2>
            <button
              type="button"
              className="explore-consecutive-filter-button"
              aria-expanded={filterOpen}
              aria-controls="preview-consecutive-filter-options"
              onClick={() => setFilterOpen((current) => !current)}
            >
              <span>連準篩選</span>
              <ChevronDownIcon data-open={filterOpen} aria-hidden="true" />
            </button>
            <strong className="result-count">
              <span>探索到&nbsp;</span><span className="numeric-text explore-result-count-number">{filteredResults.length}</span><span>&nbsp;組符合條件版路</span>
            </strong>
          </header>

          {filterOpen ? (
            <div
              id="preview-consecutive-filter-options"
              className="explore-consecutive-filter-options"
              role="group"
              aria-label={`${filterConfig.label}連準篩選`}
            >
              {filterConfig.options.map((option) => {
                const selected = selectedFilters.includes(option);

                return (
                  <button
                    type="button"
                    className="explore-consecutive-filter-option"
                    aria-pressed={selected}
                    onClick={() => setSelectedFilters((current) => current.includes(option)
                      ? current.filter((item) => item !== option)
                      : [...current, option])}
                    key={option}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="road-results">
            <div className="road-results-head" aria-hidden="true">
              <span>位置</span>
              <span>號碼</span>
              <span>預測期</span>
              <span>連準次數</span>
              <span>預測</span>
              <span>版路類型</span>
            </div>

            {filteredResults.map((result) => {
              const expanded = expandedResultId === result.id;

              return (
                <article key={result.id}>
                  <div className="road-result-row explore-result-row">
                    <span className="tag"><span>{result.numberOrder}</span><span className="numeric-text">{result.position}</span></span>
                    <span className="result-number numeric-text explore-result-column-number">{result.number}</span>
                    <span className="result-period">下<span className="numeric-text">{result.predictionPeriod}</span>期</span>
                    <span className="result-consecutive">{result.consecutive}</span>
                    <strong className="numeric-text">{result.prediction}</strong>
                    <button
                      type="button"
                      className="explore-result-road-toggle"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "收合" : "展開"}版路 ${result.id}`}
                      onClick={() => setExpandedResultId((current) => current === result.id ? null : result.id)}
                    >
                      <span>{result.algorithmType}</span>
                      <ChevronDownIcon data-open={expanded} />
                    </button>
                  </div>

                  {expanded ? <ExploreValidationCard result={result} /> : null}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
