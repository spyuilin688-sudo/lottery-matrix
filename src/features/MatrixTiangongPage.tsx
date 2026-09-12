import { SubscriptionCopy } from '../subscription-copy';
import "../explore-result-preview.css";
import "../matrix-tiangong-results.css";
import { displayValidationPeriod } from "./MatrixValidation";
import { Fragment } from "react";
import { ExploreValidationSummary } from "../ExploreValidationSummary";
import { subscribeMatrixDataRevision } from "../matrix-data-revision";
import { useAppDialog } from "../dialog/AppDialog";
import { subscribeAlgorithmCacheScope } from "../auth/algorithm-cache-scope";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, MagnifyingGlassIcon, DoubleArrowLeftIcon, DoubleArrowRightIcon } from "@radix-ui/react-icons";
import { type LotteryId } from "../Prototype";
import { fetchTiangongList, fetchTiangongValidation, type TiangongApiRow, type TiangongListResponse, type TiangongValidation } from "../matrix-algorithm-api";
import { Navigate } from "./navigation";
import { FeatureShell, MatrixPageSwitcher, SectionTitle, SettingLabelIcon, LotteryTabs } from "./shared";
import { MATRIX_RESULTS_PER_PAGE, MatrixResultsPagination } from "./MatrixResultsPagination";

export function TiangongValidationProcess({ validation, loading, lottery = "今彩539", predictionNumber, predictedPosition, item }: { validation?: TiangongValidation; loading: boolean; lottery?: LotteryId; predictionNumber?: string; predictedPosition?: number; item?: TiangongApiRow }) {
  if (loading) return <p className="empty-result">驗證資料載入中</p>;
  if (!validation) return <p className="empty-result">無驗證資料</p>;
  const { rows, d_exclusion: d, stage1_operation: first, stage2_operation: second } = validation.evidence;
  const groups = [...rows].sort((a, b) => ["C", "B", "A"].indexOf(a.group) - ["C", "B", "A"].indexOf(b.group));
  const prediction = rows.find((row) => row.group === "A");
  const number = predictionNumber ?? prediction?.stage2.calculated_number;
  const position = predictedPosition ?? prediction?.stage2.position;
  const positionLabel = position === 7 ? "特別號" : position ? `第${["一", "二", "三", "四", "五", "六"][position - 1]}顆` : "";
  const formula = (base: string, sourcePosition: number, stage: NonNullable<typeof d.stage1>, operation: typeof first) => {
    if (!operation) return "—";
    return <span className="explore-validation-formula-expression">
      {sourcePosition === 7 ? <span>特別號</span> : <><span>第</span><span>{sourcePosition}</span><span>顆</span></>}
      <span>{base}</span>
      {operation.type === "sum" ? <><span>合值</span><span>{operation.value}</span></> : <span>+{operation.residue ?? 0}</span>}
      <span>=</span><span>{stage.calculated_number ?? "—"}</span>
    </span>;
  };
  const summaryDirection = (direction: TiangongApiRow["exploreDirection"]) => direction === "固定" ? "固定" : direction === "依序遞增" ? "由左至右" : "由右至左";
  const summaryPosition = (value: number) => value === 7 ? <span>特別號</span> : <span>第 <i className="validation-summary-position">{value}</i> 顆</span>;
  const summaryFormula = (operation: typeof first) => <span className="tiangong-summary-formula">{operation?.type === "sum" ? <><span>合值</span><i className="validation-summary-formula">{operation.value}</i></> : <i className="validation-summary-formula">{operation ? `+${operation.residue ?? 0}` : "—"}</i>}</span>;
  const separator = <i className="validation-summary-divider" aria-hidden="true">｜</i>;
  return <section className="road-validation-process explore-validation-card tiangong-validation-process" aria-label="天工驗證過程">
    {prediction && item ? <header className="explore-validation-summary-card tiangong-summary-card">
      <ExploreValidationSummary layout="tianyan">
        <span className="tianyan-validation-summary-lines" aria-label="版路摘要">
          <span className="tianyan-validation-summary-row">
            <span><span className="tiangong-summary-prefix">開 <i className="validation-summary-primary">{prediction.source.number}</i> </span>{summaryPosition(prediction.source.position)}</span>
            {separator}<span>{summaryDirection(item.exploreDirection)}</span>
            {separator}{summaryFormula(first)}
            {separator}<span>下 <i className="validation-summary-future">{validation.evidence.stage1_distance ?? "—"}</i> 期開</span>
          </span>
          <span className="tianyan-validation-summary-row">
            <span><span className="tiangong-summary-prefix" aria-hidden="true" style={{visibility:"hidden"}}>開 <i className="validation-summary-primary">{prediction.source.number}</i> </span>{summaryPosition(prediction.stage1.position)}</span>
            {separator}<span>{summaryDirection(item.secondStageDirection)}</span>
            {separator}{summaryFormula(second)}
            {separator}<span>下 <i className="validation-summary-future">{validation.evidence.stage2_distance ?? "—"}</i> 期開</span>
            {separator}<span>{positionLabel}</span>
          </span>
        </span>
      </ExploreValidationSummary>
    </header> : null}
    <div className="explore-validation-groups">
    {groups.map((group, index) => {
      const displayRows = [
        { value: group.source, expression: formula(group.source.number, group.source.position, group.stage1, first) },
        { value: group.stage1, expression: formula(group.stage1.actual_number ?? group.stage1.calculated_number ?? "—", group.stage1.position, group.stage2, second) },
        ...(group.group === "A" ? [] : [{ value: group.stage2, expression: <>［ <strong className="explore-validation-result-number">{group.stage2.calculated_number ?? "—"}</strong> ］</> }]),
      ];
      return <div className="explore-validation-group" data-lottery={lottery} data-wide-numbers={lottery === "六合彩" || lottery === "大樂透" ? "true" : "false"} key={index}>
        <div className="explore-validation-issues explore-validation-numeric-text">
          {displayRows.map(({ value }, i) => <span className="explore-validation-issue" key={i}>{displayValidationPeriod(lottery, value.period)}</span>)}
        </div>
        <div className="explore-validation-numbers-card">
          {displayRows.map(({ value }, i) => <div className="explore-validation-draw-row explore-validation-number-row" key={i}>
            <span className="explore-validation-numbers explore-validation-numeric-text">
              {value.numbers?.length ? value.numbers.map((number, n) => {
                const ball = <i className={`explore-validation-number${n + 1 === value.position ? ` explore-validation-number--${i === 0 ? "hit" : i === 1 ? "source" : "step"}` : ""}`}>{String(number).padStart(2, "0")}</i>;
                return n === 6 ? <span className="explore-validation-special-number" key={n}><i className="explore-validation-special-separator">+</i>{ball}</span> : <Fragment key={n}>{ball}</Fragment>;
              }) : "—"}
            </span>
          </div>)}
        </div>
        <div className="explore-validation-formulas">
          {displayRows.map(({ expression }, i) => <span className="explore-validation-formula-row" key={i}>{expression}</span>)}
        </div>
      </div>;
    })}
    </div>
    {number && positionLabel ? <footer className="explore-validation-prediction">
      <DoubleArrowLeftIcon className="explore-validation-prediction-arrow explore-validation-prediction-arrow--left" aria-hidden="true" />
      <span className="explore-validation-prediction-content">
        <strong><SubscriptionCopy formal="本期預測" alternative="版路結果" /></strong>
        <b className="explore-validation-numeric-text">{number}</b>
        <strong>{positionLabel}</strong>
      </span>
      <DoubleArrowRightIcon className="explore-validation-prediction-arrow explore-validation-prediction-arrow--right" aria-hidden="true" />
    </footer> : null}
  </section>;
}

const directionLabel = { "固定": "固定", "依序遞增": "左至右", "依序遞減": "右至左" };

export function MatrixTiangongPage({ onNavigate }: { onNavigate: Navigate }) {
  const appDialog = useAppDialog();
  type Direction = "固定" | "依序遞增" | "依序遞減";
  type Road = "加減版路" | "合值版路";
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [searchPositions, setSearchPositions] = useState<Direction[]>(["固定"]);
  const [firstPositions, setFirstPositions] = useState<Direction[]>(["固定"]);
  const [firstRoads, setFirstRoads] = useState<Road[]>(["加減版路"]);
  const [secondPositions, setSecondPositions] = useState<Direction[]>(["固定"]);
  const [secondRoads, setSecondRoads] = useState<Road[]>(["加減版路"]);
  const [sameCode, setSameCode] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [resultPage, setResultPage] = useState(1);
  const [searched, setSearched] = useState(false);
  const [response, setResponse] = useState<TiangongListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [validationById, setValidationById] = useState<Record<string, TiangongValidation>>({});
  const [validationLoadingId, setValidationLoadingId] = useState<string | null>(null);
  const numberCounts = new Map<string, number>();
  for (const row of response?.items ?? []) numberCounts.set(row.predictionNumber, (numberCounts.get(row.predictionNumber) ?? 0) + 1);
  const sameAllowed = (response?.items ?? []).filter((row) => !sameCode || (numberCounts.get(row.predictionNumber) ?? 0) > 1);
  const duplicateStats = [...numberCounts].filter(([,count]) => !sameCode || count > 1).sort((a,b) => b[1]-a[1] || Number(a[0])-Number(b[0])).slice(0,18);
  const visibleItems = sameAllowed.filter((row) => !selectedNumber || row.predictionNumber === selectedNumber);
  if (selectedNumber) visibleItems.sort((a,b) => a.predictedPosition-b.predictedPosition || a.interval-b.interval);
  else if (sameCode) visibleItems.sort((a,b) => Number(a.predictionNumber)-Number(b.predictionNumber) || a.predictedPosition-b.predictedPosition || a.interval-b.interval);
  const resultPageCount = Math.max(1, Math.ceil(visibleItems.length / MATRIX_RESULTS_PER_PAGE));
  const paginatedItems = visibleItems.slice((resultPage - 1) * MATRIX_RESULTS_PER_PAGE, resultPage * MATRIX_RESULTS_PER_PAGE);
  const cacheGeneration = useRef(0);
  useEffect(() => {
    const clearResults = () => {
      cacheGeneration.current += 1;
      setResponse(null);
      setSameCode(false);
      setSelectedNumber(null);
      setResultPage(1);
      setValidationById({});
      setExpandedId(null);
      setValidationLoadingId(null);
      setLoading(false);
      setRequestError(null);
      setSearched(false);
    };
    clearResults();
    const unsubscribeSession = subscribeAlgorithmCacheScope(clearResults);
    const unsubscribeData = subscribeMatrixDataRevision(clearResults);
    return () => {
      cacheGeneration.current += 1;
      unsubscribeSession();
      unsubscribeData();
    };
  }, [lottery]);
  const positionOptions: Array<{ value: Direction; label: string }> = [
    { value: "依序遞增", label: "由左至右" },
    { value: "固定", label: "固定" },
    { value: "依序遞減", label: "由右至左" },
  ];
  const roadOptions: Road[] = ["加減版路", "合值版路"];
  const toggle = <T extends string>(value: T, current: T[], setter: React.Dispatch<React.SetStateAction<T[]>>) => {
    if (current.includes(value)) {
      if (current.length > 1) setter(current.filter((item) => item !== value));
    } else setter([...current, value]);
  };
  const startExplore = async () => {
    if (loading) return;
    const generation = ++cacheGeneration.current;
    setExpandedId(null);
    setValidationById({});
    setValidationLoadingId(null);
    setSearched(true);
    setLoading(true);
    setResponse(null);
    setSelectedNumber(null);
    setResultPage(1);
    setRequestError(null);
    try {
      const next = await fetchTiangongList({
        lottery,
        periodRange: 50,
        mode: "two-stage",
        hitCondition: "準2進3",
        exploreDirections: searchPositions,
        firstStageDirections: firstPositions,
        firstRoadTypes: firstRoads.map((item) => item === "加減版路" ? "加減" : "合值"),
        secondStageDirections: secondPositions,
        secondRoadTypes: secondRoads.map((item) => item === "加減版路" ? "加減" : "合值"),
      });
      if (generation !== cacheGeneration.current) return;
      setResponse(next);
      setExpandedId(null);
      setValidationById({});
    } catch (cause) {
      if (generation !== cacheGeneration.current) return;
      const code = String((cause as { code?: unknown })?.code ?? "");
      const message = code === "ANALYSIS_NOT_READY" ? "分析中，請稍後再試"
        : code === "FORBIDDEN" ? "目前 Matrix Pro 方案不符合天工的使用條件"
        : code === "AUTH_REQUIRED" ? "請先登入後再使用 Matrix 天工" : "Matrix API 讀取失敗";
      setRequestError(message);
      if (code === "FORBIDDEN" || code === "AUTH_REQUIRED") {
        void appDialog.alert({
          title: code === "AUTH_REQUIRED" ? "請先登入" : "無法使用 Matrix 天工",
          description: message,
        });
      }
    } finally {
      if (generation === cacheGeneration.current) setLoading(false);
    }
  };
  const toggleResult = (itemId: string) => {
    const generation = cacheGeneration.current;
    if (expandedId === itemId) { setExpandedId(null); return; }
    setExpandedId(itemId);
    if (!response) return;
    const cacheKey = `${response.analysisVersion}:${itemId}`;
    if (validationById[cacheKey]) return;
    setValidationLoadingId(cacheKey);
    void fetchTiangongValidation({ lottery: response.lottery, drawPeriod: response.drawPeriod, analysisVersion: response.analysisVersion }, itemId)
      .then((detail) => {
        if (generation === cacheGeneration.current) setValidationById((current) => ({ ...current, [cacheKey]: detail.validation }));
      })
      .catch(() => {
        if (generation === cacheGeneration.current) setRequestError("Matrix API 讀取失敗");
      })
      .finally(() => {
        if (generation === cacheGeneration.current) setValidationLoadingId((current) => current === cacheKey ? null : current);
      });
  };
  return (
    <FeatureShell title="Matrix 天工" onNavigate={onNavigate} backTarget="explore" className="matrix-explore-screen matrix-explore-main-screen matrix-explore-layout matrix-tiangong-screen">
      <LotteryTabs selected={lottery} onChange={setLottery} />
      <section className="panel explore-settings tiangong-settings tiangong-general-settings">
        <header className="matrix-settings-heading">
          <SectionTitle>天工設定</SectionTitle>
          <MatrixPageSwitcher current="tiangong" onNavigate={onNavigate} />
        </header>
        <div className="setting-grid">
          <label><span id="tiangong-period-label"><SettingLabelIcon type="period" />天工期數</span><div className="segmented tiangong-period-options"><output className="segmented-static" data-selected="true" aria-labelledby="tiangong-period-label">五十期</output></div></label>
          <div className="tiangong-setting-row tiangong-advanced-divider" role="group" aria-label="天工球位"><span className="tiangong-setting-label"><img className="setting-label-icon matrix-explore-setting-icon" src="/assets/lottery/functions/探索球位.png" alt="" aria-hidden="true" />天工球位</span><div className="segmented three">{positionOptions.map(({ value, label }) => <button type="button" data-selected={searchPositions.includes(value)} onClick={() => toggle(value, searchPositions, setSearchPositions)} key={value}>{label}</button>)}</div></div>
        </div>
      </section>
      <section className="panel explore-settings tiangong-settings tiangong-stage-settings">
        <div className="tiangong-stage-block" data-stage="first">
          <SectionTitle>第一段 天工設定</SectionTitle>
          <div className="setting-grid">
            <div className="tiangong-setting-row" role="group" aria-label="天工球位"><span className="tiangong-setting-label"><img className="setting-label-icon matrix-explore-setting-icon" src="/assets/lottery/functions/第一段球位.png" alt="" aria-hidden="true" />天工球位</span><div className="segmented three">{positionOptions.map(({ value, label }) => <button type="button" data-selected={firstPositions.includes(value)} onClick={() => toggle(value, firstPositions, setFirstPositions)} key={value}>{label}</button>)}</div></div>
            <div className="tiangong-setting-row" role="group" aria-label="版路類型"><span className="tiangong-setting-label"><img className="setting-label-icon matrix-explore-setting-icon" src="/assets/lottery/functions/版路類型.png" alt="" aria-hidden="true" />版路類型</span><div className="segmented two">{roadOptions.map((value) => <button type="button" data-selected={firstRoads.includes(value)} onClick={() => toggle(value, firstRoads, setFirstRoads)} key={value}>{value}</button>)}</div></div>
          </div>
        </div>
        <div className="tiangong-stage-block" data-stage="second">
            <SectionTitle>第二段 天工設定</SectionTitle>
            <div className="setting-grid">
              <div className="tiangong-setting-row" role="group" aria-label="天工球位"><span className="tiangong-setting-label"><img className="setting-label-icon matrix-explore-setting-icon" src="/assets/lottery/functions/第二段球位.png" alt="" aria-hidden="true" />天工球位</span><div className="segmented three">{positionOptions.map(({ value, label }) => <button type="button" data-selected={secondPositions.includes(value)} onClick={() => toggle(value, secondPositions, setSecondPositions)} key={value}>{label}</button>)}</div></div>
              <div className="tiangong-setting-row" role="group" aria-label="版路類型"><span className="tiangong-setting-label"><img className="setting-label-icon matrix-explore-setting-icon" src="/assets/lottery/functions/版路類型.png" alt="" aria-hidden="true" />版路類型</span><div className="segmented two">{roadOptions.map((value) => <button type="button" data-selected={secondRoads.includes(value)} onClick={() => toggle(value, secondRoads, setSecondRoads)} key={value}>{value}</button>)}</div></div>
            </div>
        </div>
      </section>
      <button type="button" disabled={loading} className="primary-action branded-explore-action" onClick={() => void startExplore()}><MagnifyingGlassIcon /><span>開始天工</span></button>
      {searched ? <section className="panel repeat-stats-panel">
        <header className="repeat-stats-heading">
          <SectionTitle>重複號碼統計</SectionTitle>
          <button type="button" aria-pressed={sameCode} data-selected={sameCode} onClick={() => {setSameCode(!sameCode);setExpandedId(null);setResultPage(1);}}>同碼</button>
          <span>點選進行版路篩選</span>
        </header>
        <div className="result-summary">{duplicateStats.map(([number,count]) => <button type="button" key={number} aria-label={`篩選預測號碼 ${number}，${count}次`} aria-pressed={selectedNumber === number} data-selected={selectedNumber === number} onClick={() => {setSelectedNumber(selectedNumber === number ? null : number);setExpandedId(null);setResultPage(1);}}><b>{number}</b><small>{count}次</small></button>)}</div>
      </section> : null}
      {searched ? <section className="panel result-panel"><header className="result-title"><SectionTitle>天工結果區</SectionTitle>{!loading && !requestError && response ? <strong className="result-count">探索到&nbsp;<span className="numeric-text">{visibleItems.length}</span>&nbsp;組符合條件版路</strong> : null}</header>
        {loading ? <p role="status" className="explore-request-state">分析結果載入中</p> : null}
        {requestError ? <p role="alert" className="explore-request-state">{requestError}</p> : null}
        <div className="road-results tiangong-results"><div className="road-results-head tiangong-results-head" aria-hidden="true"><span>間距</span><span>位移走向</span><span><SubscriptionCopy formal="預測位置" alternative="查詢位置" /></span><span><SubscriptionCopy formal="預測" alternative="結果" /></span><span>版路類型</span></div>
          {paginatedItems.map((item, index) => <article key={item.id} data-number-group-start={sameCode && index > 0 && paginatedItems[index - 1].predictionNumber !== item.predictionNumber ? "true" : undefined}>
            <button type="button" className="road-result-row tiangong-result-row" aria-expanded={expandedId === item.id} aria-label={`${expandedId === item.id ? "收合" : "展開"}版路 ${item.id}`} onClick={() => toggleResult(item.id)}>
              <span className="tiangong-interval"><span>間距</span><span className="numeric-text">{item.interval}</span></span>
              <span className="tiangong-directions">{[item.exploreDirection, item.firstStageDirection, item.secondStageDirection].map((direction, index) => <Fragment key={index}>{index ? <span>|</span> : null}<span>{directionLabel[direction]}</span></Fragment>)}</span>
              <span className="tiangong-position">{item.predictedPosition === 7 ? "特別號" : <><span>第</span><span className="numeric-text">{item.predictedPosition}</span><span>顆</span></>}</span>
              <strong className="numeric-text">{item.predictionNumber}</strong>
              <span className="road-type-toggle"><span>{item.firstRoadType === item.secondRoadType ? `${item.firstRoadType}版路` : `${item.firstRoadType}${item.secondRoadType}`}</span><ChevronDownIcon data-open={expandedId === item.id} /></span>
            </button>
            {expandedId === item.id && response ? <TiangongValidationProcess item={item} predictionNumber={item.predictionNumber} predictedPosition={item.predictedPosition} lottery={response.lottery} validation={validationById[`${response.analysisVersion}:${item.id}`]} loading={validationLoadingId === `${response.analysisVersion}:${item.id}`} /> : null}
          </article>)}
          {!loading && response && visibleItems.length === 0 ? <p className="empty-result">無符合設定條件</p> : null}
          <MatrixResultsPagination page={resultPage} pageCount={resultPageCount} label="天工結果" onPageChange={(page) => {
            setExpandedId(null);
            setResultPage(page);
          }} />
        </div></section> : null}
    </FeatureShell>
  );
}
