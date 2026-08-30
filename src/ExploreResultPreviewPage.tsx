import { useEffect, useState } from "react";
import { ChevronDownIcon, Cross2Icon } from "@radix-ui/react-icons";
import { PREVIEW_RESULTS, type PreviewDrawRow, type PreviewResult } from "./explore-result-preview-data";
import "./explore-result-preview.css";

const CONSECUTIVE_OPTIONS = ["準4進5", "準5進6", "準6進7", "準7進8"] as const;

function PreviewNumber({ value, row }: { value: string; row: PreviewDrawRow }) {
  const state = value === row.source ? "source" : value === row.step ? "step" : value === row.hit ? "hit" : "";

  return <i className={state ? `reference-number ${state}` : "reference-number"}>{value}</i>;
}

function formatFormula(formula: string) {
  return formula.replace(/(?<=\d)\+/g, " +");
}

function ReferenceValidationCard({ result }: { result: PreviewResult }) {
  return (
    <section className="reference-validation-card" aria-label={`${result.number} 驗證過程`}>
      <div className="reference-summary-card">
        <p className="reference-card-summary">{result.summary}</p>
        <strong className="reference-consecutive-tag">{result.consecutive}</strong>
      </div>

      <div className="reference-groups">
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
              className="reference-validation-group"
              data-complete={complete ? "true" : "false"}
              data-road-type={result.algorithmType}
              data-wide-numbers={rows.some((row) => row.numbers.length >= 6 || Boolean(row.special)) ? "true" : "false"}
              key={`${result.id}-${groupIndex}`}
            >
              <div className="reference-issues numeric-text">
                {Array.from({ length: rowCount }, (_, rowIndex) => (
                  <span className="reference-issue" key={`issue-${rowIndex}`}>{rows[rowIndex]?.issue ?? ""}</span>
                ))}
              </div>

              <div className="reference-numbers-card">
                {Array.from({ length: rowCount }, (_, rowIndex) => {
                  const row = rows[rowIndex];
                  return (
                    <div
                      className="reference-draw-row reference-number-row"
                      key={row ? `${row.issue}-${row.special ?? ""}` : `empty-${rowIndex}`}
                    >
                      {row ? (
                        <span className="reference-numbers numeric-text">
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

              <div className="reference-formulas numeric-text">
                {formulas.map((formula, rowIndex) => (
                  <span className="reference-formula-row" key={`formula-${rowIndex}`}>{formatFormula(formula)}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="reference-prediction">
        <strong>本期預測</strong>
        <b className="numeric-text">{result.finalPrediction}</b>
      </footer>
    </section>
  );
}

export function ExploreResultPreviewPage() {
  const [expandedResultIds, setExpandedResultIds] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>(["準5進6", "準6進7", "準7進8"]);

  useEffect(() => {
    document.title = "探索結果區 | 樂彩 Matrix";
  }, []);

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
            <button type="button" className="consecutive-filter-button" onClick={() => setFilterOpen(true)}>
              連準篩選
            </button>
            <strong className="result-count">
              <span>探索到&nbsp;</span><span className="numeric-text">{PREVIEW_RESULTS.length}</span><span>&nbsp;組符合條件版路</span>
            </strong>
          </header>

          <div className="road-results">
            <div className="road-results-head" aria-hidden="true">
              <span>位置</span>
              <span>號碼</span>
              <span>預測期</span>
              <span>連準次數</span>
              <span>預測</span>
              <span>版路類型</span>
            </div>

            {PREVIEW_RESULTS.map((result) => {
              const expanded = expandedResultIds.includes(result.id);

              return (
                <article key={result.id}>
                  <div className="road-result-row">
                    <span className="tag"><span>{result.numberOrder}</span><span className="numeric-text">{result.position}</span></span>
                    <span className="result-number numeric-text">{result.number}</span>
                    <span className="result-period">下<span className="numeric-text">{result.predictionPeriod}</span>期</span>
                    <span className="result-consecutive">{result.consecutive}</span>
                    <strong className="numeric-text">{result.prediction}</strong>
                    <button
                      type="button"
                      className="road-type-toggle"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "收合" : "展開"}版路 ${result.id}`}
                      onClick={() => setExpandedResultIds((current) => current.includes(result.id)
                        ? current.filter((id) => id !== result.id)
                        : [...current, result.id])}
                    >
                      <span>{result.algorithmType}</span>
                      <ChevronDownIcon data-open={expanded} />
                    </button>
                  </div>

                  {expanded ? <ReferenceValidationCard result={result} /> : null}
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {filterOpen ? (
        <div className="filter-sheet-backdrop" role="presentation" onClick={() => setFilterOpen(false)}>
          <section
            className="filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-consecutive-filter-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2 id="preview-consecutive-filter-title">連準篩選</h2>
              <button type="button" onClick={() => setFilterOpen(false)} aria-label="關閉"><Cross2Icon /></button>
            </header>
            <div className="filter-options">
              {CONSECUTIVE_OPTIONS.map((option) => (
                <label key={option}>
                  <input
                    type="checkbox"
                    checked={selectedFilters.includes(option)}
                    onChange={() => setSelectedFilters((current) => current.includes(option)
                      ? current.filter((item) => item !== option)
                      : [...current, option])}
                  />
                  <span aria-hidden="true" />
                  <strong>{option}</strong>
                </label>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
