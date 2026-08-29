import { useEffect, useState } from "react";
import { ChevronDownIcon, Cross2Icon } from "@radix-ui/react-icons";
import "./explore-result-preview.css";

const PREVIEW_RESULT = {
  id: "api-item-1",
  position: 2,
  number: "44",
  predictionPeriod: 3,
  consecutive: "準5進6",
  prediction: "22.26",
  algorithmType: "加減版路",
  numberOrder: "順球",
} as const;

const CONSECUTIVE_OPTIONS = ["準4進5", "準5進6", "準6進7", "準7進8"] as const;

export function ExploreResultPreviewPage() {
  const [expanded, setExpanded] = useState(false);
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
              <span>探索到&nbsp;</span><span className="numeric-text">1</span><span>&nbsp;組符合條件版路</span>
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

            <article>
              <div className="road-result-row">
                <span className="tag"><span>{PREVIEW_RESULT.numberOrder}</span><span className="numeric-text">{PREVIEW_RESULT.position}</span></span>
                <span className="result-number numeric-text">{PREVIEW_RESULT.number}</span>
                <span className="result-period"><span>下</span><span className="numeric-text">{PREVIEW_RESULT.predictionPeriod}</span><span>期</span></span>
                <span className="result-consecutive"><span>準</span><span className="numeric-text">5</span><span>進</span><span className="numeric-text">6</span></span>
                <strong className="numeric-text">{PREVIEW_RESULT.prediction}</strong>
                <button
                  type="button"
                  className="road-type-toggle"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "收合" : "展開"}版路 ${PREVIEW_RESULT.id}`}
                  onClick={() => setExpanded((current) => !current)}
                >
                  <span>{PREVIEW_RESULT.algorithmType}</span>
                  <ChevronDownIcon data-open={expanded} />
                </button>
              </div>

              {expanded ? (
                <section className="road-validation-process" aria-label="驗證過程">
                  <header className="validation-summary-card">
                    <span>開 44 第 2 顆｜上 7 期｜第 4 顆｜+14.24｜下 3 期開</span>
                  </header>
                  <div className="validation-period-head" aria-hidden="true">
                    <span>期數</span><span>開獎號碼</span><span>驗證公式</span>
                  </div>
                  <div className="validation-period-block">
                    <div className="validation-period-row">
                      <span className="validation-issue">114000118</span>
                      <span className="validation-full-numbers"><i>01</i><i>08</i><i>14</i><i>24</i><i>30</i></span>
                      <span className="validation-formula"><strong>+14.24</strong></span>
                    </div>
                  </div>
                </section>
              ) : null}
            </article>
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
