import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, GearIcon, ReaderIcon, ReloadIcon } from "@radix-ui/react-icons";
import { LotterySwitcher, type LotteryId } from "../Prototype";
import { QUICK_SETTINGS_DOUBLE_TAP_MS } from "../BottomNavigation";
import { type ExploreValidation } from "../matrix-algorithm-api";
import { fetchMatrixStatus, fetchMatrixStatusValidation, listCustomStatusSettings, resetCustomStatusSetting, saveCustomStatusSetting, type CustomConditionGroup, type CustomConditionRow, type CustomMatrixStatusCode, type CustomStatusConfig, type MatrixStatusCard, type MatrixStatusRoadDetail, type MatrixStatusResponse } from "../matrix-status-api";
import { useDoubleClickAction } from "../useDoubleClickAction";
import { ExploreValidationProcess } from "./MatrixValidation";
import { Navigate } from "./navigation";
import { FeatureShell, MobilePagePortal } from "./shared";
import { createDefaultCustomStatusConfig, normalizeCustomStatusConfig, validateCustomConfigRows } from "../../shared/matrix-status-config";
import { CustomConditionSection } from "./CustomConditionSection";

export const MATRIX_STATUS_LABELS: Record<CustomMatrixStatusCode, string> = {
  ACTIVE: "啟動",
  FOCUS: "聚合",
  RESONANCE: "共振",
  CRITICAL: "臨界",
};

export function MatrixStatusTriggerCard({
  card,
  showColumnHead,
  lottery,
  analysisVersion,
  expandedRoad,
  validationById,
  validationLoadingId,
  validationErrorId,
  onToggleRoad,
}: {
  card: MatrixStatusCard;
  showColumnHead: boolean;
  lottery: LotteryId;
  analysisVersion: string;
  expandedRoad: string | null;
  validationById: Record<string, ExploreValidation>;
  validationLoadingId: string | null;
  validationErrorId: string | null;
  onToggleRoad(cardId: string, road: MatrixStatusRoadDetail): void;
}) {
  return (
    <section className="matrix-status-trigger-group" data-testid="matrix-status-trigger-group">
      <header className="matrix-status-trigger-summary">
        <span className="matrix-status-trigger-result">
          <strong className="numeric-text">
            <span className="matrix-status-prediction-label">預測：</span>
            {card.result.map((number, index) => (
              <span key={index}>
                {index > 0 ? <span className="matrix-status-prediction-separator">、</span> : null}
                {number}
              </span>
            ))}
          </strong>
        </span>
        <span className="matrix-status-trigger-count">
          <strong>{card.sameCodeRoadCountLocked ? "🔒 Matrix Pro" : String(card.sameCodeRoadCount ?? 0) + " 組"}</strong>
        </span>
      </header>
      <div className="road-results matrix-status-road-results">
        {showColumnHead ? (
          <div className="road-results-head" aria-hidden="true">
            <span>位置</span>
            <span>號碼</span>
            <span>預測期</span>
            <span>連準次數</span>
            <span>預測</span>
            <span>版路類型</span>
          </div>
        ) : null}
        {card.roads.map((road) => {
          if (road.locked) {
            return (
              <article className="matrix-status-locked-road" key={road.id}>
                <div className="road-result-row" aria-label="Matrix Pro 鎖定版路">
                  <span className="matrix-status-locked-cell">🔒 Matrix Pro</span>
                  <strong className="numeric-text">{road.result.join(".")}</strong>
                </div>
              </article>
            );
          }
          const rowIdentity = card.id + "|" + road.id;
          const cacheKey = analysisVersion + ":" + road.validationItemId;
          const expanded = expandedRoad === rowIdentity;
          return (
            <article key={road.id}>
              <button
                type="button"
                className="road-result-row"
                aria-expanded={expanded}
                aria-label={(expanded ? "收合" : "展開") + "版路 " + road.id}
                onClick={() => onToggleRoad(card.id, road)}
              >
                <span className="tag">
                  <span>{road.numberOrder === "依實際開獎順序排序" ? "落球" : "順球"}</span>
                  <span className="numeric-text">{road.position}</span>
                </span>
                <span className="result-number numeric-text">{road.lockedNumber}</span>
                <span className="result-period"><span>下</span><span className="numeric-text">{road.predictionDistance}</span><span>期</span></span>
                <span className="result-consecutive"><span>準</span><span className="numeric-text">{road.streak}</span><span>進</span><span className="numeric-text">{road.streak + 1}</span></span>
                <strong className="numeric-text">{road.result.join(".")}</strong>
                <span className="road-type-toggle">
                  <span>{road.algorithmType === "複合" ? road.algorithmType : road.algorithmType + "版路"}</span>
                  <ChevronDownIcon data-open={expanded} aria-hidden="true" />
                </span>
              </button>
              {expanded ? (
                validationErrorId === cacheKey
                  ? <p className="empty-result" role="alert">驗證資料讀取失敗</p>
                  : <ExploreValidationProcess
                      item={{
                        number: road.lockedNumber,
                        position: road.position,
                        predictionPeriod: road.predictionDistance,
                        consecutive: "準" + road.streak + "進" + (road.streak + 1),
                        algorithmType: road.algorithmType,
                        referenceOffset: road.referenceOffset,
                        referencePosition: road.referencePosition,
                      }}
                      lottery={lottery}
                      validation={validationById[cacheKey]}
                      loading={validationLoadingId === cacheKey}
                      loadingLabel="資料載入中"
                    />
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function MatrixStatusPage({ onNavigate, initialLottery = "今彩539" }: { onNavigate: Navigate; initialLottery?: LotteryId }) {
  const [lottery, setLottery] = useState<LotteryId>(initialLottery);
  const [open, setOpen] = useState<MatrixStatusResponse["summary"]["status"] | "">("");
  const [result, setResult] = useState<MatrixStatusResponse | null>(null);
  const [requestError, setRequestError] = useState("");
  const [expandedRoad, setExpandedRoad] = useState<string | null>(null);
  const [validationById, setValidationById] = useState<Record<string, ExploreValidation>>({});
  const [validationLoadingId, setValidationLoadingId] = useState<string | null>(null);
  const [validationErrorId, setValidationErrorId] = useState<string | null>(null);
  const validationRevision = useRef(0);
  const handleStatusSettingsClick = useDoubleClickAction<HTMLButtonElement>(
    () => onNavigate("status-settings"),
    QUICK_SETTINGS_DOUBLE_TAP_MS,
  );
  const statuses = [
    ["臨界", "CRITICAL", "極為罕見版路狀態", "orange"],
    ["共振", "RESONANCE", "具備強烈共振效應", "purple"],
    ["聚合", "FOCUS", "具備明顯規律集中性", "blue"],
    ["啟動", "ACTIVE", "具備基本參考價值", "green"],
  ] as const;

  useEffect(() => {
    let active = true;
    validationRevision.current += 1;
    setResult(null);
    setOpen("");
    setRequestError("");
    setExpandedRoad(null);
    setValidationById({});
    setValidationLoadingId(null);
    setValidationErrorId(null);
    void fetchMatrixStatus(lottery)
      .then((response) => {
        if (!active) return;
        setResult(response);
      })
      .catch((cause) => {
        if (!active) return;
        setRequestError((cause as { code?: string })?.code === "ANALYSIS_NOT_READY" ? "分析中，請稍後再試" : "Matrix 狀態讀取失敗");
      });
    return () => {
      active = false;
      validationRevision.current += 1;
    };
  }, [lottery]);

  const toggleRoad = (cardId: string, road: MatrixStatusRoadDetail) => {
    if (!result) return;
    const rowIdentity = cardId + "|" + road.id;
    if (expandedRoad === rowIdentity) {
      setExpandedRoad(null);
      return;
    }
    setExpandedRoad(rowIdentity);
    const cacheKey = result.analysisVersion + ":" + road.validationItemId;
    if (validationById[cacheKey] || validationLoadingId === cacheKey) return;
    const revision = validationRevision.current + 1;
    validationRevision.current = revision;
    setValidationLoadingId(cacheKey);
    setValidationErrorId(null);
    const validationAnalysisVersion = result.sourceAnalysisVersion
      ?? result.analysisVersion.replace(/:status$/, "");
    void fetchMatrixStatusValidation({
      lottery,
      drawPeriod: result.drawPeriod,
      analysisVersion: validationAnalysisVersion,
    }, road.validationItemId).then((response) => {
      if (validationRevision.current !== revision) return;
      setValidationById((current) => ({ ...current, [cacheKey]: response.validation }));
    }).catch(() => {
      if (validationRevision.current !== revision) return;
      setValidationErrorId(cacheKey);
    }).finally(() => {
      if (validationRevision.current === revision) {
        setValidationLoadingId((current) => current === cacheKey ? null : current);
      }
    });
  };

  return (
    <FeatureShell title="Matrix 狀態" onNavigate={onNavigate} className="matrix-status-screen">
      <LotterySwitcher selected={lottery} onChange={setLottery} className="lottery-switcher--home-style matrix-status-lottery-switcher" />
      {!result && !requestError ? <p role="status" className="matrix-api-state">資料載入中</p> : null}
      {requestError ? <p role="alert" className="matrix-api-state">{requestError}</p> : null}
      {result?.summary.status === "DORMANT" ? <p className="matrix-api-state">{result.summary.message}</p> : null}
      <div className="status-list" aria-busy={!result && !requestError}>
        {statuses.map(([title, titleEn, description, tone]) => {
          const cards = result?.cards.filter((card) => card.status === titleEn) ?? [];
          const count = result?.counts[titleEn] ?? 0;
          const expanded = open === titleEn;
          const detailId = "matrix-status-" + titleEn.toLowerCase();
          return (
            <section className="status-block" data-tone={tone} data-status={titleEn} data-expanded={expanded} key={title}>
              <button
                type="button"
                disabled={!result}
                aria-expanded={expanded}
                aria-controls={detailId}
                onClick={() => {
                  setOpen(expanded ? "" : titleEn);
                  setExpandedRoad(null);
                }}
              >
                <span className="matrix-status-category-heading">
                  <strong>•{title}</strong>
                  <small>{description}</small>
                </span>
                <em className="matrix-status-category-count">{result ? `${count} 組` : requestError ? "—" : "載入中"}</em>
                <ChevronRightIcon data-open={expanded} aria-hidden="true" />
              </button>
              {expanded ? (
                <div className="status-detail" id={detailId}>
                  {cards.length > 0 && result ? (
                    <div className="matrix-status-trigger-list">
                      <article className="matrix-status-trigger-table" data-testid="matrix-status-trigger-table">
                        {cards.map((card) => <MatrixStatusTriggerCard
                          card={card}
                          showColumnHead={true}
                          lottery={lottery}
                          analysisVersion={result.analysisVersion}
                          expandedRoad={expandedRoad}
                          validationById={validationById}
                          validationLoadingId={validationLoadingId}
                          validationErrorId={validationErrorId}
                          onToggleRoad={toggleRoad}
                          key={card.id}
                        />)}
                      </article>
                    </div>
                  ) : <p className="empty-result">尚無成立觸發</p>}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      <MobilePagePortal active>
        <button type="button" className="bottom-navigation-quick-settings matrix-status-settings-entry" aria-label="自訂觸發條件，連續點擊兩下開啟" onClick={handleStatusSettingsClick}>
          <span className="bottom-navigation-quick-settings-visual">
            <GearIcon aria-hidden="true" />
          </span>
        </button>
      </MobilePagePortal>
    </FeatureShell>
  );
}

export const CUSTOM_STATUS_OPTIONS: Array<[CustomMatrixStatusCode, string, string]> = [
  ["ACTIVE", "啟動", "green"], ["FOCUS", "聚合", "blue"],
  ["RESONANCE", "共振", "purple"], ["CRITICAL", "臨界", "orange"],
];

export function MatrixCustomStatusPage({ onNavigate }: { onNavigate: Navigate }) {
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [status, setStatus] = useState<CustomMatrixStatusCode>("ACTIVE");
  const [configs, setConfigs] = useState<Record<string, CustomStatusConfig>>({});
  const [drafts, setDrafts] = useState<Record<string, CustomStatusConfig>>({});
  const [compositeEnabled, setCompositeEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [accessFailure, setAccessFailure] = useState<"AUTH_REQUIRED" | "FORBIDDEN" | null>(null);
  const [reloadRevision, setReloadRevision] = useState(0);
  const [feedback, setFeedback] = useState<Record<string, { message: string; error?: boolean; path?: string }>>({});
  const [pending, setPending] = useState<Record<string, "save" | "reset">>({});
  const pendingSlots = useRef(new Set<string>());
  const revisions = useRef<Record<string, number>>({});
  const mounted = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const slot = lottery + "|" + status;
  const config = drafts[slot] ?? configs[slot] ?? createDefaultCustomStatusConfig(lottery, status);
  const usingDefaults = !drafts[slot] && !configs[slot];
  const busy = Boolean(pending[slot]);
  const notice = feedback[slot];
  const accessMessage = accessFailure === "AUTH_REQUIRED"
    ? "請先登入後再使用自訂觸發條件"
    : "目前 Matrix Pro 方案不符合自訂觸發條件的使用權限";
  const recordAccessFailure = (cause: unknown) => {
    const code = (cause as { code?: string })?.code;
    if (code === "AUTH_REQUIRED" || code === "FORBIDDEN") setAccessFailure(code);
  };

  useEffect(() => {
    mounted.current = true;
    let active = true;
    setLoaded(false);
    setLoadFailed(false);
    setAccessFailure(null);
    void listCustomStatusSettings().then(response => {
      if (!active) return;
      if (!response.entitlements?.canCustomizeStatus) {
        setAccessFailure("FORBIDDEN");
        setLoaded(true);
        return;
      }
      const items: Record<string, CustomStatusConfig> = {};
      for (const item of response.items) {
        const normalized = normalizeCustomStatusConfig(item.config);
        if (!validateCustomConfigRows(normalized).ok) throw new Error("INVALID_REQUEST");
        items[normalized.lottery + "|" + normalized.status] = normalized;
      }
      setConfigs(items);
      setCompositeEnabled(Boolean(response.entitlements?.canUseCompositeCustomRoad));
      setLoaded(true);
    }).catch((cause: unknown) => {
      if (active) { recordAccessFailure(cause); setLoadFailed(true); setLoaded(true); }
    });
    return () => { active = false; mounted.current = false; };
  }, [reloadRevision]);

  useEffect(() => {
    if (notice?.path) {
      const field = Array.from(formRef.current?.querySelectorAll<HTMLElement>("[data-field-path]") ?? [])
        .find(element => element.dataset.fieldPath === notice.path);
      field?.focus();
    }
  }, [notice]);

  const editGroups = (root: "oneCodeGroups" | "twoCodeGroups"): React.Dispatch<React.SetStateAction<CustomConditionGroup[]>> => change => {
    revisions.current[slot] = (revisions.current[slot] ?? 0) + 1;
    setDrafts(current => {
      const previous = current[slot] ?? configs[slot] ?? createDefaultCustomStatusConfig(lottery, status);
      const groups = typeof change === "function" ? change(previous[root]) : change;
      return { ...current, [slot]: { ...previous, [root]: groups } };
    });
    setFeedback(current => { const next = { ...current }; delete next[slot]; return next; });
  };

  const validate = () => {
    for (const root of ["oneCodeGroups", "twoCodeGroups"] as const) {
      for (const [groupIndex, group] of config[root].entries()) {
        for (const [rowIndex, row] of group.rows.entries()) {
          const path = root + "." + groupIndex + ".rows." + rowIndex;
          if (row.consecutiveMin > row.consecutiveMax) return { message: "連準起點不可大於終點", path: path + ".consecutiveMin" };
          if (row.sameCodeMax !== null && row.sameCodeMin > row.sameCodeMax) return { message: "同碼條數的最少不可大於最多", path: path + ".sameCodeMin" };
        }
      }
    }
    const result = validateCustomConfigRows(config);
    if (result.ok) return null;
    const messages: Record<string, string> = {
      INVALID_CONSECUTIVE: "請選擇有效的連準範圍",
      INVALID_ROAD_TYPE: "請至少選擇一種版路",
      INVALID_ROAD_ALTERNATIVES: "每種版路組合須有版路，且不可重複",
      INVALID_SAME_CODE_QUANTITY: "同碼條數須為1至99的整數，最多可不限",
      DUPLICATE_ROW: "同一群組不能有完全相同的條件",
    };
    let path = result.path;
    if (result.code === "INVALID_ROAD_ALTERNATIVES") path = path.replace(/roadTypeAlternatives$/, "roadTypes");
    if (result.code === "DUPLICATE_ROW") path += ".consecutiveMin";
    return { message: messages[result.code] ?? "條件內容有誤，請檢查設定", path };
  };

  const begin = (action: "save" | "reset") => {
    if (pendingSlots.current.has(slot)) return false;
    pendingSlots.current.add(slot);
    setPending(current => ({ ...current, [slot]: action }));
    setFeedback(current => { const next = { ...current }; delete next[slot]; return next; });
    return true;
  };
  const finish = () => {
    pendingSlots.current.delete(slot);
    if (mounted.current) setPending(current => { const next = { ...current }; delete next[slot]; return next; });
  };
  const save = async () => {
    if (busy || loadFailed || accessFailure || !loaded || usingDefaults) return;
    const invalid = validate();
    if (invalid) { setFeedback(current => ({ ...current, [slot]: { ...invalid, error: true } })); return; }
    if (!begin("save")) return;
    const revision = revisions.current[slot] ?? 0;
    try {
      const response = await saveCustomStatusSetting(config);
      const saved = normalizeCustomStatusConfig(response.item);
      if (saved.lottery !== lottery || saved.status !== status || !validateCustomConfigRows(saved).ok) throw new Error("INVALID_RESPONSE");
      if (!mounted.current) return;
      setConfigs(current => ({ ...current, [slot]: saved }));
      if (revision === (revisions.current[slot] ?? 0)) {
        setDrafts(current => { const next = { ...current }; delete next[slot]; return next; });
        setFeedback(current => ({ ...current, [slot]: { message: "設定已儲存並套用至首頁" } }));
      }
    } catch (cause) {
      if (mounted.current) {
        recordAccessFailure(cause);
        setFeedback(current => ({ ...current, [slot]: { error: true, message: "設定尚未儲存，請稍後重試" } }));
      }
    } finally { finish(); }
  };
  const reset = async () => {
    if (loadFailed || accessFailure || !loaded || !begin("reset")) return;
    const revision = revisions.current[slot] ?? 0;
    try {
      await resetCustomStatusSetting(lottery, status);
      if (!mounted.current) return;
      setConfigs(current => { const next = { ...current }; delete next[slot]; return next; });
      if (revision === (revisions.current[slot] ?? 0)) {
        setDrafts(current => { const next = { ...current }; delete next[slot]; return next; });
        setFeedback(current => ({ ...current, [slot]: { message: "已恢復預設條件" } }));
      }
    } catch (cause) {
      if (mounted.current) {
        recordAccessFailure(cause);
        setFeedback(current => ({ ...current, [slot]: { error: true, message: "重置設定失敗" } }));
      }
    } finally { finish(); }
  };

  return <FeatureShell title="Matrix 自訂觸發狀態" onNavigate={onNavigate} backTarget="status" className="matrix-custom-status-screen">
    <LotterySwitcher selected={lottery} onChange={setLottery} className="lottery-switcher--home-style matrix-status-lottery-switcher" />
    <div className="custom-status-tabs" role="tablist" aria-label="選擇狀態">{CUSTOM_STATUS_OPTIONS.map(([code, label, tone]) => <button type="button" role="tab" aria-selected={status === code} data-tone={tone} onClick={() => setStatus(code)} key={code}><strong>{label}</strong><small>{code}</small></button>)}</div>
    <section className="custom-status-explore" aria-label="探索條件">
      <header>
        <h2>探索條件</h2>
        {loaded && !loadFailed && !accessFailure ? <p className="custom-status-default-mode" role="status">{usingDefaults ? "使用預設條件" : "已自訂"}</p> : null}
      </header>
      <dl><div><dt>探索期數</dt><dd>13期</dd></div><div><dt>探索範圍</dt><dd>完整範圍</dd></div></dl>
    </section>
    {!loaded ? <p className="matrix-api-state">設定讀取中</p> : accessFailure
      ? <section className="panel custom-status-access-notice"><p className="custom-status-message" role="alert">{accessMessage}</p><div className="custom-status-actions"><button type="button" onClick={() => onNavigate(accessFailure === "AUTH_REQUIRED" ? "profile" : "pro-plans")}>{accessFailure === "AUTH_REQUIRED" ? "前往登入" : "查看 Matrix Pro 方案"}</button></div></section>
      : loadFailed
      ? <section className="panel"><p className="custom-status-message" role="alert">自訂設定讀取失敗</p><div className="custom-status-actions"><button type="button" aria-label="重新載入自訂設定" onClick={() => setReloadRevision(current => current + 1)}>重新載入</button></div></section>
      : <form className="custom-status-editor" ref={formRef} noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
        <CustomConditionSection hitType="one" groups={config.oneCodeGroups} setGroups={editGroups("oneCodeGroups")}
          compositeEnabled={compositeEnabled} disabled={busy} errorPath={notice?.path} />
        <CustomConditionSection hitType="two" groups={config.twoCodeGroups} setGroups={editGroups("twoCodeGroups")}
          compositeEnabled={compositeEnabled} disabled={busy} errorPath={notice?.path} />
        {notice ? <p id="custom-status-error" role={notice.error ? "alert" : "status"} className="custom-status-message">{notice.message}</p> : null}
        <div className="custom-status-actions">
          <button type="button" aria-label="重置設定" disabled={busy} aria-busy={pending[slot] === "reset"} onClick={() => void reset()}><ReloadIcon />重置設定</button>
          <button type="submit" aria-label="儲存設定" disabled={busy || usingDefaults} aria-busy={pending[slot] === "save"}><ReaderIcon />儲存設定</button>
        </div>
      </form>}
  </FeatureShell>;
}
