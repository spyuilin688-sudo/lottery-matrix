import { subscribeMatrixDataRevision } from "../matrix-data-revision";
import { subscribeAlgorithmCacheScope } from "../auth/algorithm-cache-scope";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { type LotteryId } from "../Prototype";
import { fetchTiangongList, fetchTiangongValidation, type TiangongListResponse, type TiangongValidation } from "../matrix-algorithm-api";
import { Navigate } from "./navigation";
import { FeatureShell, MatrixPageSwitcher, SectionTitle, SettingLabelIcon, LOTTERIES } from "./shared";

export function TiangongValidationProcess({ validation, loading }: { validation?: TiangongValidation; loading: boolean }) {
  if (loading) return <p className="empty-result">驗證資料載入中</p>;
  if (!validation) return <p className="empty-result">無驗證資料</p>;
  const { rows, d_exclusion: d } = validation.evidence;
  const stage = (label: string, value: TiangongValidation["evidence"]["rows"][number]["stage1"]) => `${label} ${value.period} 第${value.position}位：${value.calculated_number ?? "—"}／${value.actual_number ?? "—"}`;
  return (
    <section className="road-validation-process" aria-label="天工驗證過程">
      {rows.length === 0 ? <p className="empty-result">無驗證資料</p> : null}
      {rows.map((row, index) => (
        <div className="validation-period-block" key={`${validation.itemId}-${index}`}>
          <div className="validation-period-row">
            <strong>{row.group}</strong><span>{`來源 ${row.source.period} 第${row.source.position}位：${row.source.number}｜${stage("第一段", row.stage1)}｜${stage("第二段", row.stage2)}`}</span>
          </div>
        </div>
      ))}
      {d.source && d.stage1 ? <div className="validation-period-block"><div className="validation-period-row"><strong>D</strong><span>{`D 來源 ${d.source.period} 第${d.source.position}位：${d.source.number}｜${stage("第一段", d.stage1)}${d.stage2 ? `｜${stage("第二段", d.stage2)}` : ""}`}</span></div></div> : null}
      <p className="empty-result">D 排除：{d.status}</p>
    </section>
  );
}

export function MatrixTiangongPage({ onNavigate }: { onNavigate: Navigate }) {
  type Direction = "固定" | "依序遞增" | "依序遞減";
  type Road = "加減版路" | "合值版路";
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [period, setPeriod] = useState<"五十期" | "八十期">("五十期");
  const [searchPositions, setSearchPositions] = useState<Direction[]>(["固定"]);
  const [firstPositions, setFirstPositions] = useState<Direction[]>(["固定"]);
  const [firstRoads, setFirstRoads] = useState<Road[]>(["加減版路"]);
  const [secondPositions, setSecondPositions] = useState<Direction[]>(["固定"]);
  const [secondRoads, setSecondRoads] = useState<Road[]>(["加減版路"]);
  const [searched, setSearched] = useState(false);
  const [response, setResponse] = useState<TiangongListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [validationById, setValidationById] = useState<Record<string, TiangongValidation>>({});
  const [validationLoadingId, setValidationLoadingId] = useState<string | null>(null);
  const cacheGeneration = useRef(0);
  useEffect(() => {
    const clearResults = () => {
      cacheGeneration.current += 1;
      setResponse(null);
      setValidationById({});
      setExpandedId(null);
      setValidationLoadingId(null);
      setLoading(false);
      setRequestError(null);
      setSearched(false);
    };
    const unsubscribeSession = subscribeAlgorithmCacheScope(clearResults);
    const unsubscribeData = subscribeMatrixDataRevision(clearResults);
    return () => {
      cacheGeneration.current += 1;
      unsubscribeSession();
      unsubscribeData();
    };
  }, []);
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
    const generation = cacheGeneration.current;
    setSearched(true);
    setLoading(true);
    setRequestError(null);
    try {
      const next = await fetchTiangongList({
        lottery,
        periodRange: period === "五十期" ? 50 : 80,
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
      setRequestError(code === "ANALYSIS_NOT_READY" ? "分析中，請稍後再試" : code === "FORBIDDEN" ? "目前會員權限無法使用 Matrix 天工" : code === "AUTH_REQUIRED" ? "請先登入後再使用 Matrix 天工" : "Matrix API 讀取失敗");
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
    <FeatureShell title="Matrix 天工" onNavigate={onNavigate} backTarget="explore" className="matrix-explore-screen matrix-explore-main-screen matrix-explore-layout matrix-tiangong-screen" headerAction={<MatrixPageSwitcher current="tiangong" onNavigate={onNavigate} />}>
      <section className="panel explore-settings tiangong-settings tiangong-general-settings">
        <SectionTitle>探索設定</SectionTitle>
        <div className="setting-grid">
          <label><span><SettingLabelIcon type="lottery" /><b>彩球類型</b></span><div className="select-box native-select"><select aria-label="彩球類型" value={lottery} onChange={(event) => setLottery(event.target.value as LotteryId)}>{LOTTERIES.map((item) => <option key={item}>{item}</option>)}</select><ChevronDownIcon /></div></label>
          <label><span><SettingLabelIcon type="period" />探索期數</span><div className="segmented two">{(["五十期", "八十期"] as const).map((value) => <button type="button" data-selected={period === value} onClick={() => setPeriod(value)} key={value}>{value}</button>)}</div></label>
          <div className="tiangong-setting-row tiangong-advanced-divider" role="group" aria-label="探索球位"><span className="tiangong-setting-label"><img className="setting-label-icon matrix-explore-setting-icon" src="/assets/lottery/functions/探索球位.png" alt="" aria-hidden="true" />探索球位</span><div className="segmented three">{positionOptions.map(({ value, label }) => <button type="button" data-selected={searchPositions.includes(value)} onClick={() => toggle(value, searchPositions, setSearchPositions)} key={value}>{label}</button>)}</div></div>
        </div>
      </section>
      <section className="panel explore-settings tiangong-settings tiangong-stage-settings">
        <div className="tiangong-stage-block" data-stage="first">
          <SectionTitle>第一段 探索設定</SectionTitle>
          <div className="setting-grid">
            <div className="tiangong-setting-row" role="group" aria-label="探索球位"><span className="tiangong-setting-label"><img className="setting-label-icon matrix-explore-setting-icon" src="/assets/lottery/functions/第一段球位.png" alt="" aria-hidden="true" />探索球位</span><div className="segmented three">{positionOptions.map(({ value, label }) => <button type="button" data-selected={firstPositions.includes(value)} onClick={() => toggle(value, firstPositions, setFirstPositions)} key={value}>{label}</button>)}</div></div>
            <div className="tiangong-setting-row" role="group" aria-label="版路類型"><span className="tiangong-setting-label"><img className="setting-label-icon matrix-explore-setting-icon" src="/assets/lottery/functions/版路類型.png" alt="" aria-hidden="true" />版路類型</span><div className="segmented two">{roadOptions.map((value) => <button type="button" data-selected={firstRoads.includes(value)} onClick={() => toggle(value, firstRoads, setFirstRoads)} key={value}>{value}</button>)}</div></div>
          </div>
        </div>
        <div className="tiangong-stage-block" data-stage="second">
            <SectionTitle>第二段 探索設定</SectionTitle>
            <div className="setting-grid">
              <div className="tiangong-setting-row" role="group" aria-label="探索球位"><span className="tiangong-setting-label"><img className="setting-label-icon matrix-explore-setting-icon" src="/assets/lottery/functions/第二段球位.png" alt="" aria-hidden="true" />探索球位</span><div className="segmented three">{positionOptions.map(({ value, label }) => <button type="button" data-selected={secondPositions.includes(value)} onClick={() => toggle(value, secondPositions, setSecondPositions)} key={value}>{label}</button>)}</div></div>
              <div className="tiangong-setting-row" role="group" aria-label="版路類型"><span className="tiangong-setting-label"><img className="setting-label-icon matrix-explore-setting-icon" src="/assets/lottery/functions/版路類型.png" alt="" aria-hidden="true" />版路類型</span><div className="segmented two">{roadOptions.map((value) => <button type="button" data-selected={secondRoads.includes(value)} onClick={() => toggle(value, secondRoads, setSecondRoads)} key={value}>{value}</button>)}</div></div>
            </div>
        </div>
      </section>
      <button type="button" disabled={loading} className="primary-action branded-explore-action" onClick={() => void startExplore()}><MagnifyingGlassIcon /><span>開始探索</span></button>
      {searched ? <section className="panel result-panel"><header className="result-title"><SectionTitle>探索結果區</SectionTitle><strong className="result-count">探索到&nbsp;<span className="numeric-text">{response?.total ?? 0}</span>&nbsp;組符合條件版路</strong></header>
        {loading ? <p role="status" className="explore-request-state">分析結果載入中</p> : null}
        {requestError ? <p role="alert" className="explore-request-state">{requestError}</p> : null}
        <div className="road-results tiangong-results"><div className="tiangong-results-head" aria-hidden="true"><span>間距期數</span><span>預測位置</span><span>預測</span><span>版路類型</span></div>
          {(response?.items ?? []).map((item) => <article key={item.id}><div className="tiangong-result-row"><span className="numeric-text">{item.interval}</span><span className="numeric-text">{item.predictedPosition}</span><strong className="numeric-text">{item.predictionNumber}</strong><button type="button" className="road-type-toggle" aria-expanded={expandedId === item.id} aria-label={`${expandedId === item.id ? "收合" : "展開"}版路 ${item.id}`} onClick={() => toggleResult(item.id)}><span>{item.roadType}</span><ChevronDownIcon data-open={expandedId === item.id} /></button></div>{expandedId === item.id && response ? <TiangongValidationProcess validation={validationById[`${response.analysisVersion}:${item.id}`]} loading={validationLoadingId === `${response.analysisVersion}:${item.id}`} /> : null}</article>)}
          {!loading && response && response.items.length === 0 ? <p className="empty-result">無符合設定條件</p> : null}
        </div></section> : null}
    </FeatureShell>
  );
}
