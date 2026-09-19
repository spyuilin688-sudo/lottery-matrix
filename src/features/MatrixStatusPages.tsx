import { subscribeAlgorithmCacheScope } from "../auth/algorithm-cache-scope";
import { subscribeMatrixDataRevision } from "../matrix-data-revision";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { LotterySwitcher, type LotteryId } from "../Prototype";
import { type ExploreValidation } from "../matrix-algorithm-api";
import { fetchMatrixStatus, fetchMatrixStatusValidation, type MatrixTriggerStatusCode, type MatrixStatusCard, type MatrixStatusRoadDetail, type MatrixStatusResponse } from "../matrix-status-api";
import { ExploreValidationProcess } from "./MatrixValidation";
import { Navigate } from "./navigation";
import { FeatureShell } from "./shared";

export const MATRIX_STATUS_LABELS: Record<MatrixTriggerStatusCode, string> = {
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
            <span className="matrix-status-prediction-label">結果：</span>
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
            <span>結果期</span>
            <span>連準次數</span>
            <span>結果</span>
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
                  {road.position === 7 ? (
                    <span>特別號</span>
                  ) : (
                    <>
                      <span>{road.numberOrder === "依實際開獎順序排序" ? "落球" : "順球"}</span>
                      <span className="numeric-text">{road.position}</span>
                    </>
                  )}
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
  const statuses = [
    ["臨界", "CRITICAL", "極為罕見版路狀態", "orange"],
    ["共振", "RESONANCE", "具備強烈共振效應", "purple"],
    ["聚合", "FOCUS", "具備明顯規律集中性", "blue"],
    ["啟動", "ACTIVE", "具備基本參考價值", "green"],
  ] as const;

  useEffect(() => {
    let active = true;
    let listRevision = 0;
    const reload = () => {
      const revision = ++listRevision;
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
          if (!active || revision !== listRevision) return;
          setResult(response);
        })
        .catch((cause) => {
          if (!active || revision !== listRevision) return;
          setRequestError((cause as { code?: string })?.code === "ANALYSIS_NOT_READY" ? "分析中，請稍後再試" : "Matrix 狀態讀取失敗");
        });
    };
    const unsubscribeSession = subscribeAlgorithmCacheScope(reload);
    const unsubscribeData = subscribeMatrixDataRevision(reload);
    reload();
    return () => {
      active = false;
      validationRevision.current += 1;
      unsubscribeSession();
      unsubscribeData();
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
    </FeatureShell>
  );
}
