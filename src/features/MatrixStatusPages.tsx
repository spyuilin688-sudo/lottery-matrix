import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, GearIcon, PlusIcon, ReaderIcon, ReloadIcon, TrashIcon } from "@radix-ui/react-icons";
import { LotterySwitcher, type LotteryId } from "../Prototype";
import { QUICK_SETTINGS_DOUBLE_TAP_MS } from "../BottomNavigation";
import { type ExploreValidation } from "../matrix-algorithm-api";
import { fetchMatrixStatus, fetchMatrixStatusValidation, listCustomStatusSettings, resetCustomStatusSetting, saveCustomStatusSetting, type CustomConditionGroup, type CustomConditionRow, type CustomMatrixStatusCode, type CustomStatusConfig, type MatrixStatusCard, type MatrixStatusRoadDetail, type MatrixStatusResponse } from "../matrix-status-api";
import { useDoubleClickAction } from "../useDoubleClickAction";
import { ExploreValidationProcess } from "./MatrixValidation";
import { Navigate } from "./navigation";
import { FeatureShell, MobilePagePortal } from "./shared";

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
          {card.hitType === "one-code" ? <small>單碼結果</small> : null}
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
      {requestError ? <p role="alert" className="matrix-api-state">{requestError}</p> : null}
      {result?.summary.status === "DORMANT" ? <p className="matrix-api-state">{result.summary.message}</p> : null}
      <div className="status-list">
        {statuses.map(([title, titleEn, description, tone]) => {
          const cards = result?.cards.filter((card) => card.status === titleEn) ?? [];
          const count = result?.counts[titleEn] ?? 0;
          const expanded = open === titleEn;
          const detailId = "matrix-status-" + titleEn.toLowerCase();
          return (
            <section className="status-block" data-tone={tone} data-status={titleEn} data-expanded={expanded} key={title}>
              <button
                type="button"
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
                <em className="matrix-status-category-count">{count} 組</em>
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

export const ONE_CODE_STREAKS = ["準4進5", "準5進6", "準6進7", "準7進8"];

export const TWO_CODE_STREAKS = ["準5進6", "準6進7", "準7進8", "準9進10", "準11進12"];

export type Chapter15DefaultRule = {
  consecutive: string;
  roadType: string;
  numberOrder: "順球";
  quantity: string;
};

export const CHAPTER_15_DEFAULT_RULES: Record<CustomMatrixStatusCode, { one: Chapter15DefaultRule[]; two: Chapter15DefaultRule[] }> = {
  ACTIVE: {
    one: [
      { consecutive: "準5進6～準6進7", roadType: "加減＋合值", numberOrder: "順球", quantity: "2～4組" },
    ],
    two: [
      { consecutive: "準7進8～準9進10", roadType: "加減＋合值", numberOrder: "順球", quantity: "3～5組" },
    ],
  },
  FOCUS: {
    one: [
      { consecutive: "準5進6～準6進7", roadType: "加減＋合值", numberOrder: "順球", quantity: "5～6組" },
      { consecutive: "準5進6～準6進7", roadType: "加減＋拖牌，或合值＋拖牌（各至少1組）", numberOrder: "順球", quantity: "3～4組" },
      { consecutive: "準7進8", roadType: "拖牌", numberOrder: "順球", quantity: "1組" },
    ],
    two: [
      { consecutive: "準7進8～準9進10", roadType: "加減＋合值", numberOrder: "順球", quantity: "6～7組" },
      { consecutive: "準11進12＋準7進8～準9進10", roadType: "加減＋合值", numberOrder: "順球", quantity: "1組以上＋1組" },
      { consecutive: "準7進8～準11進12＋準5進6～準6進7", roadType: "加減＋合值", numberOrder: "順球", quantity: "3組以上＋6～7組" },
    ],
  },
  RESONANCE: {
    one: [
      { consecutive: "準7進8", roadType: "加減＋合值", numberOrder: "順球", quantity: "1組" },
      { consecutive: "準5進6～準6進7", roadType: "加減＋合值", numberOrder: "順球", quantity: "7組以上" },
      { consecutive: "準5進6～準6進7", roadType: "加減＋拖牌，或合值＋拖牌（各至少1組）", numberOrder: "順球", quantity: "5組以上" },
      { consecutive: "拖牌準7進8＋加減準5進6～準6進7", roadType: "拖牌＋加減", numberOrder: "順球", quantity: "各1組以上" },
      { consecutive: "拖牌準7進8＋合值準5進6～準6進7", roadType: "拖牌＋合值", numberOrder: "順球", quantity: "各1組以上" },
    ],
    two: [
      { consecutive: "準7進8～準9進10", roadType: "加減＋合值", numberOrder: "順球", quantity: "8組以上" },
      { consecutive: "準11進12＋準7進8～準9進10", roadType: "加減＋合值", numberOrder: "順球", quantity: "1組以上＋2組以上" },
      { consecutive: "準7進8～準11進12＋準5進6～準6進7", roadType: "加減＋合值", numberOrder: "順球", quantity: "6組以上＋8組以上" },
      { consecutive: "拖牌準7進8～準9進10＋加減準5進6～準6進7", roadType: "拖牌＋加減", numberOrder: "順球", quantity: "1組以上＋6組以上" },
      { consecutive: "拖牌準7進8～準9進10＋合值準5進6～準6進7", roadType: "拖牌＋合值", numberOrder: "順球", quantity: "1組以上＋6組以上" },
    ],
  },
  CRITICAL: {
    one: [
      { consecutive: "準7進8", roadType: "加減＋合值", numberOrder: "順球", quantity: "2組以上" },
      { consecutive: "準7進8", roadType: "加減＋拖牌，或合值＋拖牌（各至少1組）", numberOrder: "順球", quantity: "2組以上" },
      { consecutive: "準7進8", roadType: "拖牌", numberOrder: "順球", quantity: "2組以上" },
    ],
    two: [
      { consecutive: "準11進12", roadType: "加減＋合值", numberOrder: "順球", quantity: "2組以上" },
    ],
  },
};

export function defaultCustomRow(hitType: "one" | "two"): CustomConditionRow {
  return {
    consecutive: hitType === "one" ? "準4進5" : "準5進6",
    roadType: "加減",
    numberOrder: "依號碼由小到大排序",
    sameCodeQuantity: 1,
  };
}

export function duplicateCustomRows(groups: CustomConditionGroup[]) {
  return groups.some((group) => {
    const keys = group.rows.map((row) => [row.consecutive, row.roadType, row.numberOrder, row.sameCodeQuantity].join("|"));
    return new Set(keys).size !== keys.length;
  });
}

export function Chapter15DefaultTable({ statusLabel, hitLabel, rules }: {
  statusLabel: string;
  hitLabel: string;
  rules: Chapter15DefaultRule[];
}) {
  return <table className="custom-status-default-table" aria-label={`${statusLabel}預設觸發條件（${hitLabel}）`}>
    <thead><tr><th>連準次數</th><th>版路類型</th><th>號碼順序</th><th>數量</th></tr></thead>
    <tbody>{rules.map((rule, index) => <tr key={`${rule.consecutive}-${rule.roadType}-${rule.quantity}-${index}`}>
      <td>{rule.consecutive}</td><td>{rule.roadType}</td><td>{rule.numberOrder}</td><td>{rule.quantity}</td>
    </tr>)}</tbody>
  </table>;
}

export function CustomConditionSection({
  title, hitType, groups, setGroups, compositeEnabled, usingDefaults, defaultRules, statusLabel,
}: {
  title: string;
  hitType: "one" | "two";
  groups: CustomConditionGroup[];
  setGroups: React.Dispatch<React.SetStateAction<CustomConditionGroup[]>>;
  compositeEnabled: boolean;
  usingDefaults: boolean;
  defaultRules: Chapter15DefaultRule[];
  statusLabel: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const streaks = hitType === "one" ? ONE_CODE_STREAKS : TWO_CODE_STREAKS;
  const updateRow = (groupIndex: number, rowIndex: number, patch: Partial<CustomConditionRow>) => {
    setGroups((current) => current.map((group, index) => index === groupIndex
      ? { ...group, rows: group.rows.map((row, itemIndex) => itemIndex === rowIndex ? { ...row, ...patch } : row) }
      : group));
  };
  const removeRow = (groupIndex: number, rowIndex: number) => setGroups((current) => current.map((group, index) => index === groupIndex
    ? { ...group, rows: group.rows.filter((_, itemIndex) => itemIndex !== rowIndex) }
    : group));
  return <section className="custom-status-hit-section">
    <button type="button" className="custom-status-hit-header" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <strong>{title}</strong><span>{usingDefaults ? `預設觸發條件（${defaultRules.length} 則）` : `觸發條件組合（${groups.length} 組）`}</span><ChevronDownIcon data-open={expanded} />
    </button>
    {expanded ? <div className="custom-status-groups">
      {usingDefaults ? <Chapter15DefaultTable statusLabel={statusLabel} hitLabel={title} rules={defaultRules} /> : null}
      {groups.map((group, groupIndex) => <article className="custom-status-group" key={group.id}>
        <header><strong>組合 {groupIndex + 1}</strong><button type="button" aria-label={`刪除組合 ${groupIndex + 1}`} onClick={() => setGroups((current) => current.filter((item) => item.id !== group.id))}><TrashIcon /></button></header>
        {group.rows.map((condition, rowIndex) => <div className="custom-status-condition-row" key={`${group.id}-${rowIndex}`}>
          <label>連準次數<select aria-label={`組合 ${groupIndex + 1} 條件 ${rowIndex + 1} 連準次數`} value={condition.consecutive} onChange={(event) => updateRow(groupIndex, rowIndex, { consecutive: event.target.value })}>{streaks.map((streak) => <option key={streak}>{streak}</option>)}</select></label>
          <label>版路類型<select aria-label={`組合 ${groupIndex + 1} 條件 ${rowIndex + 1} 版路類型`} value={condition.roadType} onChange={(event) => updateRow(groupIndex, rowIndex, { roadType: event.target.value as CustomConditionRow['roadType'] })}>{["加減", "合值", "拖牌", "複合"].map((road) => <option key={road} value={road} disabled={road === "複合" && !compositeEnabled}>{road}{road === "複合" && !compositeEnabled ? "（季費以上）" : ""}</option>)}</select></label>
          <label>號碼順序<select aria-label={`組合 ${groupIndex + 1} 條件 ${rowIndex + 1} 號碼順序`} value={condition.numberOrder} onChange={(event) => updateRow(groupIndex, rowIndex, { numberOrder: event.target.value as CustomConditionRow['numberOrder'] })}><option>依號碼由小到大排序</option><option>依實際開獎順序排序</option></select></label>
          <label>同碼數量<input aria-label="同碼數量" type="number" min={1} max={99} value={condition.sameCodeQuantity} onChange={(event) => updateRow(groupIndex, rowIndex, { sameCodeQuantity: Math.min(99, Math.max(1, Number(event.target.value) || 1)) })} /></label>
          {group.rows.length > 1 ? <button type="button" aria-label={`組合 ${groupIndex + 1} 刪除條件 ${rowIndex + 1}`} onClick={() => removeRow(groupIndex, rowIndex)}><TrashIcon /></button> : null}
        </div>)}
        <button type="button" className="custom-status-add-button" aria-label={`組合 ${groupIndex + 1} 新增條件`} disabled={group.rows.length >= 10} onClick={() => setGroups((current) => current.map((item) => item.id === group.id ? { ...item, rows: [...item.rows, defaultCustomRow(hitType)] } : item))}><PlusIcon />新增條件（最多 10 條）</button>
      </article>)}
      <button type="button" className="custom-status-add-button" aria-label={`新增${hitType === "one" ? "一碼" : "二碼"}觸發條件組合`} disabled={groups.length >= 20} onClick={() => setGroups((current) => [...current, { id: `${hitType}-${Date.now()}-${current.length}`, rows: [defaultCustomRow(hitType)] }])}><PlusIcon />新增觸發條件組合（最多 20 組）</button>
    </div> : null}
  </section>;
}

export function MatrixCustomStatusPage({ onNavigate }: { onNavigate: Navigate }) {
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [status, setStatus] = useState<CustomMatrixStatusCode>("ACTIVE");
  const [configs, setConfigs] = useState<CustomStatusConfig[]>([]);
  const [oneCodeGroups, setOneCodeGroups] = useState<CustomConditionGroup[]>([]);
  const [twoCodeGroups, setTwoCodeGroups] = useState<CustomConditionGroup[]>([]);
  const [compositeEnabled, setCompositeEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const selectedSlotRef = useRef({ lottery, status });
  selectedSlotRef.current = { lottery, status };

  useEffect(() => {
    let active = true;
    void listCustomStatusSettings().then((response) => {
      if (!active) return;
      setConfigs(response.items.map((item) => item.config));
      setCompositeEnabled(Boolean(response.entitlements?.canUseCompositeCustomRoad));
      setLoadFailed(false);
      setLoaded(true);
    }).catch(() => { if (active) { setLoadFailed(true); setMessage("自訂設定讀取失敗"); setLoaded(true); } });
    return () => { active = false; };
  }, []);

  useLayoutEffect(() => {
    if (!loaded) return;
    const selected = configs.find((config) => config.lottery === lottery && config.status === status);
    setOneCodeGroups(selected?.oneCodeGroups ?? []);
    setTwoCodeGroups(selected?.twoCodeGroups ?? []);
    setMessage("");
  }, [loaded, lottery, status]);

  const save = async () => {
    if (duplicateCustomRows([...oneCodeGroups, ...twoCodeGroups])) {
      setMessage("同一組合不能有完全相同的條件");
      return;
    }
    const requestedSlot = { lottery, status };
    const value: CustomStatusConfig = { ...requestedSlot, explorePeriods: 13, exploreRange: "完整範圍", oneCodeGroups, twoCodeGroups };
    try {
      const response = await saveCustomStatusSetting(value);
      setConfigs((current) => [...current.filter((item) => item.lottery !== requestedSlot.lottery || item.status !== requestedSlot.status), response.item]);
      if (selectedSlotRef.current.lottery === requestedSlot.lottery && selectedSlotRef.current.status === requestedSlot.status) {
        setMessage("設定已儲存並套用至首頁");
      }
    } catch {
      if (selectedSlotRef.current.lottery === requestedSlot.lottery && selectedSlotRef.current.status === requestedSlot.status) {
        setMessage("目前方案或設定內容無法儲存");
      }
    }
  };
  const reset = async () => {
    const requestedSlot = { lottery, status };
    try {
      await resetCustomStatusSetting(requestedSlot.lottery, requestedSlot.status);
      setConfigs((current) => current.filter((item) => item.lottery !== requestedSlot.lottery || item.status !== requestedSlot.status));
      if (selectedSlotRef.current.lottery === requestedSlot.lottery && selectedSlotRef.current.status === requestedSlot.status) {
        setOneCodeGroups([]); setTwoCodeGroups([]);
        setMessage("已恢復第15章預設");
      }
    } catch {
      if (selectedSlotRef.current.lottery === requestedSlot.lottery && selectedSlotRef.current.status === requestedSlot.status) setMessage("重置設定失敗");
    }
  };

  const selectedConfig = configs.find((config) => config.lottery === lottery && config.status === status);
  const usingDefaults = !loadFailed && !selectedConfig && oneCodeGroups.length === 0 && twoCodeGroups.length === 0;
  const statusLabel = CUSTOM_STATUS_OPTIONS.find(([code]) => code === status)?.[1] ?? status;
  const defaultRules = CHAPTER_15_DEFAULT_RULES[status];

  return <FeatureShell title="Matrix 自訂觸發狀態" onNavigate={onNavigate} backTarget="status" className="matrix-custom-status-screen">
    <LotterySwitcher selected={lottery} onChange={setLottery} className="lottery-switcher--home-style matrix-status-lottery-switcher" />
    <div className="custom-status-tabs" role="tablist" aria-label="選擇狀態">{CUSTOM_STATUS_OPTIONS.map(([code, label, tone]) => <button type="button" role="tab" aria-selected={status === code} data-tone={tone} onClick={() => setStatus(code)} key={code}><strong>{label}</strong><small>{code}</small></button>)}</div>
    <p className="custom-status-fixed-rule">探索期數均為十三期，探索範圍均為完整範圍。</p>
    {!loaded ? <p className="matrix-api-state">設定讀取中</p> : <>
      {usingDefaults ? <p className="custom-status-default-mode">目前使用第15章預設觸發條件</p> : null}
      <CustomConditionSection title="準4+（鎖定1碼）" hitType="one" groups={oneCodeGroups} setGroups={setOneCodeGroups} compositeEnabled={compositeEnabled} usingDefaults={usingDefaults} defaultRules={defaultRules.one} statusLabel={statusLabel} />
      <CustomConditionSection title="準5+（鎖定2碼）" hitType="two" groups={twoCodeGroups} setGroups={setTwoCodeGroups} compositeEnabled={compositeEnabled} usingDefaults={usingDefaults} defaultRules={defaultRules.two} statusLabel={statusLabel} />
      {message ? <p role="alert" className="custom-status-message">{message}</p> : null}
      <div className="custom-status-actions"><button type="button" aria-label="重置設定" onClick={() => void reset()}><ReloadIcon />重置設定</button><button type="button" aria-label="儲存設定" onClick={() => void save()}><ReaderIcon />儲存設定</button></div>
    </>}
  </FeatureShell>;
}
