import { subscribeLotteryRefresh } from "../lottery-data-refresh";
import { useReferenceWindow } from "../reference-window";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, MagnifyingGlassIcon, ReloadIcon } from "@radix-ui/react-icons";
import { type LotteryId } from "../Prototype";
import { fetchNumberReference, type MatrixNumberOrder, type NumberReferenceRequest, type NumberReferenceItem } from "../lottery-api";
import { normalizeLookupNumber } from "../feature-tool-logic";
import { Navigate } from "./navigation";
import { useTimedState, useLotteryHistory, getHistoryLimit, getHistoryOrder, FeatureShell, MobilePagePortal, LOTTERIES, updateLookupInputValues, finalizeLookupInputValues, getDrawIssue, getHistoryDrawNumbers } from "./shared";

export function NumberReferencePage({ onNavigate }: { onNavigate: Navigate }) {
  const [lottery, setLottery] = useTimedState<LotteryId>("reference-lottery", "今彩539");
  const [range, setRange] = useTimedState("reference-range", "1000期");
  const [order, setOrder] = useTimedState("reference-order", "依號碼由小到大排序");
  const [inputs, setInputs] = useTimedState("reference-inputs", ["", "", ""]);
  const [appliedLottery, setAppliedLottery] = useState<LotteryId>(lottery);
  const [appliedRange, setAppliedRange] = useState(range);
  const [appliedOrder, setAppliedOrder] = useState(order);
  const [markedRows, setMarkedRows] = useState<Set<string>>(new Set());
  const [markedCells, setMarkedCells] = useState<Set<string>>(new Set());
  const [queryExpanded, setQueryExpanded] = useState(true);
  const [queryFloating, setQueryFloating] = useState(false);
  const [queryPanelTop, setQueryPanelTop] = useState(0);
  const resultsEndRef = useRef<HTMLDivElement>(null);
  const queryRevision = useRef(0);
  const appliedRequest = useRef<NumberReferenceRequest | null>(null);
  useEffect(() => () => { queryRevision.current += 1; }, []);
  const [referenceItems, setReferenceItems] = useState<NumberReferenceItem[] | null>(null);
  const [referenceLoadState, setReferenceLoadState] = useState<"idle" | "loading" | "success" | "empty" | "error">("idle");
  const history = useLotteryHistory(appliedLottery, getHistoryLimit(appliedRange));
  const fallbackHistory = useMemo(() => [...history].reverse(), [history]);
  const displayedHistory = referenceItems ?? fallbackHistory;
  const referenceWindow = useReferenceWindow(displayedHistory.length);
  const historyOrder = getHistoryOrder(appliedOrder);
  useEffect(() => subscribeLotteryRefresh(appliedLottery, () => {
    const input = appliedRequest.current;
    if (!input) return;
    const revision = ++queryRevision.current;
    void fetchNumberReference(input).then(response => {
      if (revision !== queryRevision.current) return;
      setReferenceItems(response.items);
      setReferenceLoadState(response.items.length ? "success" : "empty");
    }).catch(() => {
      if (revision !== queryRevision.current) return;
      setReferenceItems([]);
      setReferenceLoadState("error");
    });
  }), [appliedLottery]);

  const resetReference = () => {
    queryRevision.current += 1;
    appliedRequest.current = null;
    setReferenceLoadState("idle");
    setInputs(["", "", ""]);
    setReferenceItems(null);
    setMarkedRows(new Set());
    setMarkedCells(new Set());
  };

  const toggleMarkedRow = (issue: string) => {
    setMarkedCells((cells) => new Set(
      [...cells].filter((key) => !key.startsWith(`${issue}-`)),
    ));
    setMarkedRows((current) => {
      const next = new Set(current);
      if (next.has(issue)) {
        next.delete(issue);
      } else {
        next.add(issue);
      }
      return next;
    });
  };

  const toggleMarkedCell = (issue: string, number: string) => {
    const key = `${issue}-${number}`;
    setMarkedCells((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const startReferenceSearch = async () => {
    const revision = ++queryRevision.current;
    appliedRequest.current = null;
    const normalized = inputs.map(normalizeLookupNumber);
    const unique = normalized.filter((value, index) => value && normalized.indexOf(value) === index);
    const historyRange = Number(range.replace(/\D/g, "")) as 1000 | 3000 | 5000;
    setMarkedRows(new Set());
    setMarkedCells(new Set());
    setInputs(normalized);
    setAppliedLottery(lottery);
    setAppliedRange(range);
    setAppliedOrder(order);
    setReferenceLoadState("loading");
    const input = { lottery, numberOrder: order as MatrixNumberOrder, historyRange, numbers: unique };
    try {
      const response = await fetchNumberReference(input);
      if (revision !== queryRevision.current) return;
      appliedRequest.current = input;
      setReferenceItems(response.items);
      setReferenceLoadState(response.items.length > 0 ? "success" : "empty");
    } catch {
      if (revision !== queryRevision.current) return;
      setReferenceItems([]);
      setReferenceLoadState("error");
    }
    setQueryExpanded(false);
    setQueryFloating(false);
    requestAnimationFrame(() => {
      if (revision !== queryRevision.current) return;
      resultsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  };

  const toggleQueryPanel = () => {
    if (queryExpanded) {
      setQueryExpanded(false);
      setQueryFloating(false);
      return;
    }
    const header = document.querySelector<HTMLElement>(".number-reference-screen > .feature-brand-header");
    setQueryPanelTop((header?.getBoundingClientRect().bottom ?? 0) + 8);
    setQueryExpanded(true);
    setQueryFloating(true);
  };

  return (
    <FeatureShell
      title="號碼對照單"
      onNavigate={onNavigate}
      className="number-reference-screen"
      headerAction={(
        <div className="reference-title-actions title-card-compact-actions">
          <button type="button" className="title-card-compact-action reference-settings-trigger" aria-label={queryExpanded ? "收合探索設定" : "展開探索設定"} aria-expanded={queryExpanded} onClick={toggleQueryPanel}>
            <span>探索設定</span>
            <ChevronDownIcon data-open={queryExpanded} />
          </button>
        </div>
      )}
    >
      <MobilePagePortal active={queryFloating}>
        <div
          className="reference-query-panel"
          data-floating={queryFloating}
          role={queryFloating ? "dialog" : undefined}
          aria-label={queryFloating ? "探索設定" : undefined}
          hidden={!queryExpanded}
          style={queryFloating ? {
            top: `${queryPanelTop}px`,
            "--select-tech-surface": "#030b13",
            "--select-tech-accent": "#f0bd36",
            "--select-tech-text": "#d4d0c8",
            "--select-tech-cut": "8px",
          } as React.CSSProperties : undefined}
        >
        <div className="query-selects three-cols">
        <div className="select-box native-select reference-select">
          <select
            aria-label="彩種"
            value={lottery}
            onChange={(event) => setLottery(event.target.value as LotteryId)}
          >
            {LOTTERIES.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
          <ChevronDownIcon aria-hidden="true" />
        </div>
        <div className="select-box native-select reference-select">
          <select
            aria-label="歷史範圍"
            value={range}
            onChange={(event) => setRange(event.target.value)}
          >
            {["1000期", "3000期", "5000期"].map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
          <ChevronDownIcon aria-hidden="true" />
        </div>
        <div className="select-box native-select reference-select reference-order-select">
          <select
            aria-label="號碼順序"
            value={order}
            onChange={(event) => setOrder(event.target.value)}
          >
            <option value="依號碼由小到大排序">依號碼由小到大排序</option>
            <option value="依實際開獎順序排序">依實際開獎順序排序</option>
          </select>
          <ChevronDownIcon aria-hidden="true" />
        </div>
        <button type="button" className="tool-settings-reset reference-refresh-trigger" onClick={resetReference}><ReloadIcon className="reference-refresh-icon" aria-hidden="true" /><span>刷新</span></button>
        </div>
        <section className="reference-search" aria-label="探索號碼">
          <div>
            {inputs.map((v, i) => (
              <input key={i} value={v} aria-label={`探索號碼 ${i + 1}`} inputMode="numeric" pattern="(0[1-9]|[1-4][0-9])" maxLength={2} data-filled={Boolean(v)}
                onClick={(event) => event.currentTarget.select()}
                onChange={(event) => setInputs(updateLookupInputValues(inputs, i, event.target.value))}
                onBlur={() => setInputs(finalizeLookupInputValues(inputs, i))}
              />
            ))}
            <button type="button" className="gold-button branded-explore-action" onClick={startReferenceSearch}><MagnifyingGlassIcon />開始探索</button>
          </div>
        </section>
        </div>
      </MobilePagePortal>
      {referenceLoadState === "error" ? <div className="panel" role="alert"><span>號碼對照資料載入失敗</span><button type="button" aria-label="重新載入號碼對照資料" onClick={() => void startReferenceSearch()}>重新載入</button></div> : null}
      {referenceLoadState === "loading" ? <p role="status">號碼對照資料載入中</p> : null}
      <section className="panel reference-table-panel" hidden={referenceLoadState === "error" || referenceLoadState === "loading"}>
        <header><h2>{appliedLottery}（{appliedOrder}）</h2></header>
        <div className="reference-table">
          <div className="reference-row head"><span>期數</span><span>開獎號碼</span></div>
          <div ref={referenceWindow.ref} className="reference-window" style={{ position: "relative", height: displayedHistory.length * referenceWindow.rowHeight }}
            onFocusCapture={event => { const row = (event.target as HTMLElement).closest<HTMLElement>("[data-reference-index]"); if (row) referenceWindow.setFocusedIndex(Number(row.dataset.referenceIndex)); }}
            onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) referenceWindow.setFocusedIndex(null); }}>
          {referenceWindow.indices.map((recordIndex) => {
            const record = displayedHistory[recordIndex];
            const issue = getDrawIssue(record);
            const draw = getHistoryDrawNumbers(appliedLottery, record, historyOrder);
            const displayedNumbers = draw.special
              ? [...draw.main, draw.special]
              : [...draw.main];

            return (
              <div
                className="reference-row"
                data-reference-index={recordIndex}
                data-striped={recordIndex % 2 === 0}
                style={{ position: "absolute", top: recordIndex * referenceWindow.rowHeight }}
                data-row-marked={markedRows.has(issue)}
                data-has-special={Boolean(draw.special)}
                key={issue}
              >
                <button
                  type="button"
                  className="reference-issue"
                  aria-pressed={markedRows.has(issue)}
                  onClick={() => toggleMarkedRow(issue)}
                >
                  {issue}
                </button>
                <span>
                  {historyOrder === "落球" && !displayedNumbers.length ? "待公布" : null}
                  {displayedNumbers.map((num, index) => {
                    const autoMatch = Array.isArray(record.matchSlots) ? Number(record.matchSlots[index] ?? 0) : 0;
                    const manuallyMarked = markedCells.has(`${issue}-${num}`);
                    const isSpecial = Boolean(draw.special) && index === displayedNumbers.length - 1;
                    return (
                      <button
                        type="button"
                        data-auto-match={autoMatch}
                        data-cell-marked={manuallyMarked}
                        data-special={isSpecial}
                        aria-pressed={manuallyMarked}
                        aria-label={`${isSpecial ? "特別號" : "號碼"} ${num}`}
                        key={`${num}-${index}`}
                        onClick={() => toggleMarkedCell(issue, num)}
                      >
                        {num}
                      </button>
                    );
                  })}
                </span>
              </div>
            );
          })}
          </div>
        </div>
      </section>
      <div ref={resultsEndRef} className="reference-results-end" aria-hidden="true" />
    </FeatureShell>
  );
}

