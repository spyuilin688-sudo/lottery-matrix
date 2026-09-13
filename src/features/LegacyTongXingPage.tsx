import { DAILY_SORTED_ONLY_DESCRIPTION, supportsDrawOrder, useLotteryOrder } from "../use-lottery-order";
import { useRef, useState } from "react";
import { ChevronDownIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { type LotteryId } from "../Prototype";
import { fetchTongXing, type LotteryDrawRecord, type MatrixNumberOrder, type TongXingPair } from "../lottery-api";
import { normalizeLookupNumber } from "../feature-tool-logic";
import { Navigate } from "./navigation";
import { useTimedState, getHistoryOrder, updateLookupInputValues, finalizeLookupInputValues, getDrawIssue, getDrawDate, getHistoryDrawNumbers, FeatureShell, MobilePagePortal, LOTTERIES, LotteryTabs } from "./shared";

export function TongXingPage({ onNavigate }: { onNavigate: Navigate }) {
  const [lottery, setLottery] = useTimedState<LotteryId>("tongxing-lottery", "今彩539");
  const [requestedOrder, setOrder] = useTimedState("tongxing-order", "依號碼由小到大排序");
  const order = useLotteryOrder(lottery, requestedOrder, setOrder, "依號碼由小到大排序");
  const [period, setPeriod] = useTimedState("tongxing-period", "1期");
  const [searched, setSearched] = useTimedState("tongxing-searched", false);
  const [values, setValues] = useTimedState("tongxing-values", ["", "", ""]);
  const [appliedValues, setAppliedValues] = useState<string[]>([]);
  const [appliedLottery, setAppliedLottery] = useState<LotteryId>(lottery);
  const [appliedOrder, setAppliedOrder] = useState(order);
  const [resultGroups, setResultGroups] = useState<TongXingPair[]>([]);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [settingsFloating, setSettingsFloating] = useState(false);
  const [settingsPanelTop, setSettingsPanelTop] = useState(0);
  const resultsEndRef = useRef<HTMLElement>(null);
  const periodOffset = Number(period.replace(/\D/g, "")) || 1;
  const historyOrder = getHistoryOrder(appliedOrder);
  const resultColumns = appliedLottery === "六合彩" || appliedLottery === "大樂透"
    ? ["一", "二", "三", "四", "五", "六", "特"]
    : ["一", "二", "三", "四", "五"];

  const changeLottery = (value: LotteryId) => {
    setLottery(value);
  };

  const updateInputValue = (index: number, rawValue: string) => {
    setValues(updateLookupInputValues(values, index, rawValue));
  };

  const validateInputValue = (index: number) => {
    setValues(finalizeLookupInputValues(values, index));
  };

  const handleSearch = async () => {
    const hasInvalidValue = values.some((value) => value !== "" && !/^(0[1-9]|[1-4][0-9])$/.test(value));
    if (hasInvalidValue) {
      setValues(values.map((value) => /^(0[1-9]|[1-4][0-9])$/.test(value) ? value : ""));
      return;
    }
    const normalizedValues = values.map(normalizeLookupNumber).filter(Boolean);
    setSettingsExpanded(false);
    setSettingsFloating(false);
    setAppliedValues(normalizedValues);
    setAppliedLottery(lottery);
    setAppliedOrder(order);
    setResultGroups([]);
    try {
      const response = await fetchTongXing({
        lottery,
        numberOrder: order as MatrixNumberOrder,
        numbers: normalizedValues,
        futureOffset: periodOffset,
      });
      setResultGroups(response.groups);
    } catch {
      setResultGroups([]);
    }
    setSearched(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resultsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    });
  };

  const toggleSettingsPanel = () => {
    if (settingsExpanded) {
      setSettingsExpanded(false);
      setSettingsFloating(false);
      return;
    }
    const header = document.querySelector<HTMLElement>(".tongxing-screen > .feature-brand-header");
    setSettingsPanelTop((header?.getBoundingClientRect().bottom ?? 0) + 8);
    setSettingsExpanded(true);
    setSettingsFloating(true);
  };

  const renderResultRow = (
    entry: LotteryDrawRecord,
    type: "locked" | "predicted",
  ) => {
    const issue = getDrawIssue(entry);
    const date = getDrawDate(entry);
    const draw = getHistoryDrawNumbers(appliedLottery, entry, historyOrder);
    const displayedNumbers = draw.special ? [...draw.main, draw.special] : [...draw.main];
    const inputNumbers = new Set(appliedValues);

    return (
      <div className="tongxing-table-row" data-row-type={type}>
        <span
          className="tongxing-period-cell"
          aria-label={`${type === "locked" ? "鎖定條件期" : "預測期"} ${issue} ${date.slice(0, 10)}`}
        >
          <strong>{issue}</strong>
          <time>{date.slice(0, 10)}</time>
        </span>
        {displayedNumbers.map((number, index) => (
          <span
            key={`${issue}-${index}`}
            className={type === "locked" && inputNumbers.has(number) ? "locked-input-number" : undefined}
          >
            {number}
          </span>
        ))}
      </div>
    );
  };

  return (
    <FeatureShell
      title="Matrix 同星"
      onNavigate={onNavigate}
      className="tongxing-screen sticky-title-card-screen"
      headerAction={(
        <div className="tongxing-title-actions title-card-compact-actions">
          <button
            type="button"
            className="title-card-compact-action"
            aria-label={settingsExpanded ? "收合同星探索設定" : "展開同星探索設定"}
            aria-expanded={settingsExpanded}
            onClick={toggleSettingsPanel}
          >
            <span>探索設定</span>
            <ChevronDownIcon data-open={settingsExpanded} />
          </button>
        </div>
      )}
    >
      <MobilePagePortal active={settingsFloating}>
      <section
        className="panel tongxing-query tongxing-panel-scope"
        data-floating={settingsFloating}
        role={settingsFloating ? "dialog" : "region"}
        aria-label="同星探索設定"
        hidden={!settingsExpanded}
        style={settingsFloating ? {
          top: `${settingsPanelTop}px`,
          "--select-tech-surface": "#030b13",
          "--select-tech-accent": "#f0bd36",
          "--select-tech-text": "#d4d0c8",
          "--select-tech-cut": "8px",
        } as React.CSSProperties : undefined}
      >
        <div className="query-selects">
          <div className="select-box native-select">
            <select
              aria-label="彩種"
              value={lottery}
              onChange={(event) => changeLottery(event.target.value as LotteryId)}
            >
              {LOTTERIES.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
            <ChevronDownIcon aria-hidden="true" />
          </div>
          <div className="select-box native-select tongxing-order-select">
            <select
              aria-label="號碼順序" aria-description={!supportsDrawOrder(lottery) ? DAILY_SORTED_ONLY_DESCRIPTION : undefined}
              value={order}
              onChange={(event) => setOrder(event.target.value)}
            >
              <option value="依號碼由小到大排序">依號碼由小到大排序</option>
              <option value="依實際開獎順序排序" disabled={!supportsDrawOrder(lottery)}>依實際開獎順序排序</option>
            </select>
            <ChevronDownIcon aria-hidden="true" />
          </div>
        </div>
        <LotteryTabs selected={lottery} onChange={changeLottery} />
        <div className="same-star-fields">
          {values.map((value, index) => (
            <input
              key={index}
              aria-label={`號碼 ${index + 1}`}
              value={value}
              inputMode="numeric"
              pattern="(0[1-9]|[1-4][0-9])"
              maxLength={2}
              onClick={(event) => event.currentTarget.select()}
              onChange={(event) => updateInputValue(index, event.target.value)}
              onBlur={() => validateInputValue(index)}
            />
          ))}
          <span>之後下</span>
          <div className="select-box native-select same-star-period-select">
            <select
              aria-label="之後期數"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              {Array.from({ length: 30 }, (_, index) => `${index + 1}期`).map((item) => (
                <option value={item} key={item}>{item}</option>
              ))}
            </select>
            <ChevronDownIcon aria-hidden="true" />
          </div>
          <span>開出</span>
        </div>
        <button type="button" className="primary-action branded-explore-action" onClick={handleSearch}>
          <MagnifyingGlassIcon /><span>開始探索</span>
        </button>
      </section>
      </MobilePagePortal>
      {searched ? (
        <>
          <div className="ornament-title"><span />探索結果<span /></div>
          <section ref={resultsEndRef} className="panel tongxing-results">
            <div
              className="tongxing-table"
              data-columns={resultColumns.length}
              aria-label={`${appliedLottery}同星探索結果`}
            >
              <div className="tongxing-table-row tongxing-table-head">
                <span>期數</span>
                {resultColumns.map((column) => <span key={column}>{column}</span>)}
              </div>
              {resultGroups.map(({ lockedEntry, predictedEntry }) => (
                <article className="tongxing-result-group" key={getDrawIssue(lockedEntry)}>
                  {renderResultRow(lockedEntry, "locked")}
                  {renderResultRow(predictedEntry, "predicted")}
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </FeatureShell>
  );
}
