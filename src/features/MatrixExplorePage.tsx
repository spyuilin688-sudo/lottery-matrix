import { SubscriptionCopy } from '../subscription-copy';
import { usePermissionSettings } from '../permission-settings';
import { subscribeMatrixDataRevision } from "../matrix-data-revision";
import { subscribeAlgorithmCacheScope } from "../auth/algorithm-cache-scope";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, LockClosedIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { MATRIX_RESULTS_PER_PAGE, MatrixResultsPagination } from "./MatrixResultsPagination";
import { type LotteryId } from "../Prototype";
import { fetchExploreList, fetchExploreValidation, fetchTianyanList, fetchTianyanValidation, type ExploreListResponse, type ExploreValidation, type TianyanListResponse, type TianyanValidation } from "../matrix-algorithm-api";
import { fetchTianhengList, fetchTianhengValidation, type TianhengApiRow, type TianhengListRequest, type TianhengListResponse, type TianhengValidation } from "../matrix-algorithm-api";
import { bootstrapMember, fetchMemberProfile, type MemberProfileResponse } from "../member-api";
import { getExploreEntryDefaults } from "../explore-defaults";
import { useAppDialog } from "../dialog/AppDialog";
import { Navigate } from "./navigation";
import { FeatureShell, MatrixPageSwitcher, SectionTitle, SettingLabelIcon, LotteryTabs, HistoryList } from "./shared";
import { ExploreValidationProcess, TianhengValidationProcess, TianyanValidationProcess, RoadValidationProcess } from "./MatrixValidation";

export function MatrixExplorePage({
  onNavigate,
  title = "Matrix 探索",
  roadTypes = ["加減版路", "合值版路", "拖牌版路"],
}: {
  onNavigate: Navigate;
  title?: "Matrix 探索" | "Matrix 天衡" | "Matrix 天衍" | "Matrix 天工";
  roadTypes?: string[];
}) {
  const appDialog = useAppDialog();
  const isExplore = title === "Matrix 探索";
  const isTianyan = title === "Matrix 天衍";
  const isTianheng = title === "Matrix 天衡";
  const periodOptions = isTianyan
    ? (["十三期"] as const)
    : isTianheng
      ? (["三期", "十三期"] as const)
      : (["二期", "七期", "十三期"] as const);
  const rangeOptions = isTianyan
    ? (["完整範圍"] as const)
    : (["標準範圍", "完整範圍"] as const);
  const permissionSettings = usePermissionSettings();
  const [exploreAccess, setExploreAccess] = useState<MemberProfileResponse['exploreEntitlements']>();
  const initializedDefaultsKey = useRef<string | null>(null);
  const defaultsContextKey = `${title}:${permissionSettings?.revision ?? "unknown"}`;
  type ConsecutiveOption =
    | "準4進5"
    | "準5進6"
    | "準6進7"
    | "準7進8"
    | "準9進10"
    | "準11進12"
    | "準14進15"
    | "準15進16"
    | "準16進17"
    | "準17進18";

  type ExploreDate = "本日 (最新)" | "昨日 (上1期)" | "前日 (上2期)";

  type ExploreResult = {
    id: string;
    position: number;
    number: string;
    predictionPeriod: number;
    consecutive: ConsecutiveOption;
    prediction: string;
    sameCode: boolean;
    algorithmType: string;
    numberOrder: string;
    referenceOffset?: number;
    referencePosition?: number;
    tianhengItem?: TianhengApiRow;
  };

  const filterOptions: Record<string, ConsecutiveOption[]> = {
    "準5+（鎖定1碼）": ["準5進6", "準6進7", "準7進8", "準9進10"],
    "準6+（鎖定2碼）": ["準6進7", "準7進8", "準9進10", "準11進12"],
    "準4+（鎖定1碼）": ["準4進5", "準5進6", "準6進7", "準7進8"],
    "準5+（鎖定2碼）": title === "Matrix 天衍"
      ? ["準11進12", "準14進15", "準15進16", "準16進17", "準17進18"]
      : ["準5進6", "準6進7", "準7進8", "準9進10", "準11進12"],
  };
  const defaultFiltersFor = (hitValue: string, roadValue: string): ConsecutiveOption[] => {
    if (isTianheng) {
      return hitValue.includes("鎖定2碼")
        ? ["準9進10", "準11進12"]
        : filterOptions[hitValue];
    }
    if (title === "Matrix 天衍") {
      return ["準11進12", "準14進15", "準15進16", "準16進17", "準17進18"];
    }
    const isTrailer = roadValue === "拖牌版路";
    if (hitValue === "準4+（鎖定1碼）") {
      return title === "Matrix 探索" && period === "二期"
        ? ["準4進5", "準5進6", "準6進7", "準7進8"]
        : ["準5進6", "準6進7", "準7進8"];
    }
    if (title === "Matrix 探索" && period === "二期") {
      return isTrailer
        ? ["準5進6", "準6進7", "準7進8", "準9進10", "準11進12"]
        : ["準7進8", "準9進10", "準11進12"];
    }
    return isTrailer
      ? ["準6進7", "準7進8", "準9進10", "準11進12"]
      : ["準9進10", "準11進12"];
  };
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const initialExploreDefaults = useMemo(
    () => title === "Matrix 探索"
      ? getExploreEntryDefaults(null)
      : isTianheng ? { period: "三期", range: "標準範圍" } as const
      : isTianyan ? { period: "十三期", range: "完整範圍" } as const
      : { period: "二期", range: "標準範圍" } as const,
    [title],
  );
  const [period, setPeriod] = useState(initialExploreDefaults.period);
  const [road, setRoad] = useState(roadTypes[0]);
  const initialHit = isTianheng ? "準5+（鎖定1碼）" : isTianyan ? "準5+（鎖定2碼）" : "準4+（鎖定1碼）";
  const [hit, setHit] = useState(initialHit);
  const [advanced, setAdvanced] = useState(false);
  const [numberOrder, setNumberOrder] = useState("依號碼由小到大排序");
  const [exploreDate, setExploreDate] = useState<ExploreDate>("本日 (最新)");
  const [exploreRange, setExploreRange] = useState(initialExploreDefaults.range);
  const [searched, setSearched] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [expandedRoad, setExpandedRoad] = useState<string | null>(null);
  const [sameCode, setSameCode] = useState(false);
  const [selectedPredictionNumber, setSelectedPredictionNumber] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [resultPage, setResultPage] = useState(1);
  const [selectedFilters, setSelectedFilters] = useState<ConsecutiveOption[]>(
    defaultFiltersFor(
      initialHit,
      roadTypes[0],
    ),
  );
  const [exploreResponse, setExploreResponse] = useState<ExploreListResponse | null>(null);
  const [tianyanResponse, setTianyanResponse] = useState<TianyanListResponse | null>(null);
  type TianhengAccess = Pick<TianhengListRequest, "explorePeriods" | "exploreRange">;
  const [tianhengResponse, setTianhengResponse] = useState<(TianhengListResponse & { access: TianhengAccess }) | null>(null);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const [validationById, setValidationById] = useState<Record<string, ExploreValidation>>({});
  const [tianyanValidationById, setTianyanValidationById] = useState<Record<string, TianyanValidation>>({});
  const [tianhengValidationById, setTianhengValidationById] = useState<Record<string, TianhengValidation>>({});
  const [validationLoadingId, setValidationLoadingId] = useState<string | null>(null);
  const cacheGeneration = useRef(0);
  const queryRevision = useRef(0);
  useEffect(() => {
    const clearResults = () => {
      cacheGeneration.current += 1;
      setExploreResponse(null);
      setTianyanResponse(null);
      setTianhengResponse(null);
      setValidationById({});
      setTianyanValidationById({});
      setTianhengValidationById({});
      setExpandedRoad(null);
      setValidationLoadingId(null);
      setExploreLoading(false);
      setExploreError(null);
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
  const roadResultRowRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingRoadScrollRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const itemId = pendingRoadScrollRef.current;
    if (!itemId || expandedRoad !== itemId) return;
    pendingRoadScrollRef.current = null;
    roadResultRowRefs.current.get(itemId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [expandedRoad]);

  useEffect(() => {
    if (!isExplore && !isTianyan && !isTianheng) return;
    let active = true;
    void bootstrapMember()
      .then(() => fetchMemberProfile())
      .then((profile) => {
        if (!active) return;
        setExploreAccess(profile.exploreEntitlements);
        if (initializedDefaultsKey.current !== defaultsContextKey) {
          const defaults = getExploreEntryDefaults(profile);
          setPeriod(isTianyan ? "十三期" : isTianheng ? (defaults.period === "十三期" ? "十三期" : "三期") : defaults.period);
          setExploreRange(isTianyan ? "完整範圍" : defaults.range);
          initializedDefaultsKey.current = defaultsContextKey;
        }
      })
      .catch(() => {
        if (!active) return;
        setExploreAccess(undefined);
        if (initializedDefaultsKey.current !== defaultsContextKey) {
          const defaults = getExploreEntryDefaults(null);
          setPeriod(isTianyan ? "十三期" : isTianheng ? "三期" : defaults.period);
          setExploreRange(isTianyan ? "完整範圍" : defaults.range);
          initializedDefaultsKey.current = defaultsContextKey;
        }
      });
    return () => { active = false; };
  }, [defaultsContextKey, isExplore, isTianheng, isTianyan]);

  const visibleResults = useMemo(() => {
    if (isTianheng) {
      return (tianhengResponse?.items ?? []).map((item): ExploreResult => ({
        id: item.id,
        position: item.firstLockedPosition,
        number: item.firstNumber,
        predictionPeriod: item.predictionDistance,
        consecutive: item.consecutive as ConsecutiveOption,
        prediction: item.predictionNumbers.join("."),
        sameCode: true,
        algorithmType: item.algorithmType,
        numberOrder: item.numberOrder,
        referenceOffset: item.referenceOffset,
        referencePosition: item.referencePosition,
        tianhengItem: item,
      }));
    }
    if (title === "Matrix 探索") {
      return (exploreResponse?.items ?? []).map((item): ExploreResult => ({
        id: item.id,
        position: item.lockedPosition,
        number: item.number,
        predictionPeriod: item.predictionDistance,
        consecutive: item.consecutive as ConsecutiveOption,
        prediction: item.predictionNumbers.join("."),
        sameCode: true,
        algorithmType: item.algorithmType,
        numberOrder: item.numberOrder,
        referenceOffset: item.referenceOffset,
        referencePosition: item.referencePosition,
      }));
    }
    return (tianyanResponse?.items ?? []).map((item): ExploreResult => ({
      id: item.id,
      position: item.lockedPosition,
      number: item.number,
      predictionPeriod: item.predictionDistance,
      consecutive: item.consecutive as ConsecutiveOption,
      prediction: item.predictionNumbers.join("."),
      sameCode: true,
      algorithmType: item.roadTypeLabel,
      numberOrder: item.numberOrder,
    }));
  }, [exploreResponse, tianyanResponse, tianhengResponse, title]);

  const activeResponse = isTianheng ? tianhengResponse : isExplore ? exploreResponse : tianyanResponse;
  const duplicateStats = activeResponse?.duplicateStats ?? [];

  const resultsPerPage = MATRIX_RESULTS_PER_PAGE;
  const resultPageCount = Math.max(1, Math.ceil(visibleResults.length / resultsPerPage));
  const paginatedResults = visibleResults.slice(
    (resultPage - 1) * resultsPerPage,
    resultPage * resultsPerPage,
  );
  const resultCount = activeResponse?.total ?? 0;
  const hasCompletedResults = !exploreLoading && !exploreError && Boolean(activeResponse);
  const selectedExplorePeriods = period === "十三期" ? 13 : period === "七期" ? 7 : 2;
  const selectedTianhengPeriods = period === "十三期" ? 13 : 3;
  const exploreDateOffset = exploreDate === "前日 (上2期)" ? 2 : exploreDate === "昨日 (上1期)" ? 1 : 0;

  const loadExplore = async (
    nextFilters = selectedFilters,
    nextSameCode = sameCode,
    nextPredictionNumber = selectedPredictionNumber,
  ) => {
    const generation = cacheGeneration.current;
    const revision = ++queryRevision.current;
    const isCurrent = () => generation === cacheGeneration.current && revision === queryRevision.current;
    setExploreLoading(true);
    setExploreError(null);
    setExploreResponse(null);
    setTianyanResponse(null);
    setTianhengResponse(null);
    try {
      if (isTianheng) {
        const access: TianhengAccess = { explorePeriods: selectedTianhengPeriods, exploreRange };
        const response = await fetchTianhengList({
          lottery,
          ...access,
          numberOrder: numberOrder as "依號碼由小到大排序" | "依實際開獎順序排序",
          exploreDateOffset,
          ruleCount: hit.includes("鎖定2碼") ? 2 : 1,
          roadTypes: [road.startsWith("合值") ? "合值" : road.startsWith("拖牌") ? "拖牌" : "加減"],
          selectedStreaks: nextFilters,
          sameCode: nextSameCode,
          ...(nextPredictionNumber ? { predictionNumber: nextPredictionNumber } : {}),
        });
        if (!isCurrent()) return;
        setTianhengResponse({ ...response, access });
        setTianhengValidationById({});
        setExpandedRoad(null);
        return;
      }
      if (title === "Matrix 天衍") {
        const response = await fetchTianyanList({
          lottery,
          explorePeriods: selectedExplorePeriods,
          exploreRange,
          numberOrder: numberOrder as "依號碼由小到大排序" | "依實際開獎順序排序",
          exploreDateOffset,
          selectedStreaks: nextFilters,
          sameCode: nextSameCode,
          ...(nextPredictionNumber ? { predictionNumber: nextPredictionNumber } : {}),
        });
        if (!isCurrent()) return;
        setTianyanResponse(response);
        setTianyanValidationById({});
        setExpandedRoad(null);
        return;
      }
      if (title !== "Matrix 探索") return;
      const roadType = road.startsWith("合值") ? "合值" : road.startsWith("拖牌") ? "拖牌" : "加減";
      const response = await fetchExploreList({
        lottery,
        numberOrder: numberOrder as "依號碼由小到大排序" | "依實際開獎順序排序",
        explorePeriods: selectedExplorePeriods,
        exploreDateOffset,
        exploreRange: exploreRange as "標準範圍" | "完整範圍",
        ruleCount: hit.includes("鎖定2碼") ? 2 : 1,
        roadTypes: [roadType],
        selectedStreaks: nextFilters,
        sameCode: nextSameCode,
        ...(nextPredictionNumber ? { predictionNumber: nextPredictionNumber } : {}),
      });
      if (!isCurrent()) return;
      setExploreResponse(response);
      setValidationById({});
      setExpandedRoad(null);
    } catch (cause) {
      if (!isCurrent()) return;
      const code = String((cause as { code?: unknown })?.code ?? "");
      const message =
        code === "ANALYSIS_NOT_READY"
          ? "分析中，請稍後再試"
          : code === "FORBIDDEN"
            ? title === "Matrix 天衍"
              ? "目前 Matrix Pro 方案不符合天衍的使用條件"
              : "目前會員權限無法使用此設定"
            : code === "AUTH_REQUIRED"
              ? `請先登入後再使用 ${title}`
              : "Matrix API 讀取失敗";
      setExploreError(message);
      if (code === "FORBIDDEN" || code === "AUTH_REQUIRED") {
        void appDialog.alert({
          title: code === "AUTH_REQUIRED" ? "請先登入" : `無法使用 ${title}`,
          description: message,
        });
      }
    } finally {
      if (isCurrent()) setExploreLoading(false);
    }
  };

  const changeHit = (value: string) => {
    setHit(value);
    setSelectedFilters(defaultFiltersFor(value, road));
    setExpandedRoad(null);
    setResultPage(1);
  };

  const changeRoad = (value: string) => {
    setRoad(value);
    setSelectedFilters(defaultFiltersFor(hit, value));
    setExpandedRoad(null);
    setResultPage(1);
  };

  const changeLottery = (value: LotteryId) => {
    setLottery(value);
    setHistoryExpanded(true);
  };

  const startExplore = () => {
    const nextFilters = defaultFiltersFor(hit, road);
    setSearched(true);
    setHistoryExpanded(false);
    setSameCode(false);
    setSelectedFilters(nextFilters);
    setSelectedPredictionNumber(null);
    setResultPage(1);
    void loadExplore(nextFilters, false, null);
  };

  const toggleFilter = (value: ConsecutiveOption) => {
    const next = selectedFilters.includes(value)
      ? selectedFilters.filter((item) => item !== value)
      : [...selectedFilters, value];
    setSelectedFilters(next);
    setExpandedRoad(null);
    setResultPage(1);
    if (searched) void loadExplore(next, sameCode);
  };

  const toggleSameCode = () => {
    const next = !sameCode;
    setSameCode(next);
    setResultPage(1);
    if (searched) void loadExplore(selectedFilters, next, selectedPredictionNumber);
  };

  const togglePredictionNumber = (number: string) => {
    const next = selectedPredictionNumber === number ? null : number;
    setSelectedPredictionNumber(next);
    setExpandedRoad(null);
    setResultPage(1);
    void loadExplore(selectedFilters, sameCode, next);
  };

  const toggleRoad = (itemId: string) => {
    const generation = cacheGeneration.current;
    const revision = queryRevision.current;
    if (expandedRoad === itemId) {
      pendingRoadScrollRef.current = null;
      setExpandedRoad(null);
      return;
    }
    pendingRoadScrollRef.current = expandedRoad === null ? null : itemId;
    setExpandedRoad(itemId);
    if (isTianheng && tianhengResponse) {
      const cacheKey = `${tianhengResponse.analysisVersion}:${itemId}`;
      if (tianhengValidationById[cacheKey]) return;
      setValidationLoadingId(cacheKey);
      void fetchTianhengValidation({
        lottery: tianhengResponse.lottery,
        drawPeriod: tianhengResponse.drawPeriod,
        analysisVersion: tianhengResponse.analysisVersion,
      }, itemId, tianhengResponse.access).then((response) => {
        if (generation !== cacheGeneration.current || revision !== queryRevision.current) return;
        setTianhengValidationById((current) => ({ ...current, [cacheKey]: response.validation }));
      }).catch(() => {
        if (generation !== cacheGeneration.current || revision !== queryRevision.current) return;
        setExploreError("Matrix API 讀取失敗");
      }).finally(() => {
        if (generation !== cacheGeneration.current || revision !== queryRevision.current) return;
        setValidationLoadingId((current) => current === cacheKey ? null : current);
      });
      return;
    }
    if (title === "Matrix 天衍" && tianyanResponse) {
      const cacheKey = `${tianyanResponse.analysisVersion}:${itemId}`;
      if (tianyanValidationById[cacheKey]) return;
      setValidationLoadingId(cacheKey);
      void fetchTianyanValidation({
        lottery: tianyanResponse.lottery,
        drawPeriod: tianyanResponse.drawPeriod,
        analysisVersion: tianyanResponse.analysisVersion,
      }, itemId).then((response) => {
        if (generation !== cacheGeneration.current || revision !== queryRevision.current) return;
        setTianyanValidationById((current) => ({ ...current, [cacheKey]: response.validation }));
      }).catch(() => {
        if (generation !== cacheGeneration.current || revision !== queryRevision.current) return;
        setExploreError("Matrix API 讀取失敗");
      }).finally(() => {
        if (generation !== cacheGeneration.current || revision !== queryRevision.current) return;
        setValidationLoadingId((current) => current === cacheKey ? null : current);
      });
      return;
    }
    if (title !== "Matrix 探索" || !exploreResponse) return;
    const cacheKey = `${exploreResponse.analysisVersion}:${itemId}`;
    if (validationById[cacheKey]) return;
    setValidationLoadingId(cacheKey);
    void fetchExploreValidation({
      lottery: exploreResponse.lottery,
      drawPeriod: exploreResponse.drawPeriod,
      analysisVersion: exploreResponse.analysisVersion,
    }, itemId, {
      explorePeriods: selectedExplorePeriods,
      exploreRange: exploreRange as "標準範圍" | "完整範圍",
    }).then((response) => {
      if (generation !== cacheGeneration.current || revision !== queryRevision.current) return;
      setValidationById((current) => ({ ...current, [cacheKey]: response.validation }));
    }).catch(() => {
      if (generation !== cacheGeneration.current || revision !== queryRevision.current) return;
      setExploreError("Matrix API 讀取失敗");
    }).finally(() => {
      if (generation !== cacheGeneration.current || revision !== queryRevision.current) return;
      setValidationLoadingId((current) => current === cacheKey ? null : current);
    });
  };

  const hitSettings = (
    <>
        <div className="hit-options" role="group" aria-label="命中條件">
          {(isTianheng ? ["準5+（鎖定1碼）", "準6+（鎖定2碼）"] : isTianyan ? ["準5+（鎖定2碼）"] : ["準4+（鎖定1碼）", "準5+（鎖定2碼）"]).map((v) => (
            <button type="button" key={v} aria-label={v} data-selected={hit === v} aria-pressed={hit === v} onClick={() => changeHit(v)}>
              <span>{v.slice(0, v.indexOf("（"))}</span><span className="hit-lock-detail">{v.slice(v.indexOf("（"))}</span>
            </button>
          ))}
        </div>

        <button type="button" className="advanced-row" onClick={() => setAdvanced(!advanced)}>
          <img src="/assets/lottery/matrixYY.png" alt="" aria-hidden="true" />
          <span>進階探索設定</span><ChevronRightIcon data-open={advanced} />
        </button>
        {advanced ? (
          <div className="advanced-panel">
            <label>
              <span className="advanced-setting-title">
                <SettingLabelIcon type="order" />號碼順序
              </span>
              <div className="select-box native-select">
                <select
                  aria-label="號碼順序"
                  value={numberOrder}
                  onChange={(event) => setNumberOrder(event.target.value)}
                >
                  <option value="依號碼由小到大排序">依號碼由小到大排序</option>
                  <option value="依實際開獎順序排序">依實際開獎順序排序</option>
                </select>
                <ChevronDownIcon aria-hidden="true" />
              </div>
            </label>
            <label>
              <span className="advanced-setting-title">
                <SettingLabelIcon type="date" />探索日期
              </span>
              <div className="segmented three">
                {(["本日 (最新)", "昨日 (上1期)", "前日 (上2期)"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-label={isTianheng ? value : undefined}
                    data-selected={exploreDate === value}
                    onClick={() => setExploreDate(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </label>
            <label>
              <span className="advanced-setting-title">
                <SettingLabelIcon type="range" />探索範圍
              </span>
              <div className={`segmented ${isTianyan ? "one" : "two"}`}>
                {rangeOptions.map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-label={isTianheng ? value : undefined}
                    data-selected={exploreRange === value}
                    onClick={() => setExploreRange(value)}
                  >
                    {value}
                    {(isExplore || isTianheng) && value === "完整範圍" && !exploreAccess?.canUseFullRange ? <em><LockClosedIcon />Matrix Pro</em> : null}
                  </button>
                ))}
              </div>
            </label>
          </div>
        ) : null}
    </>
  );

  return (
    <FeatureShell
      title={title}
      onNavigate={onNavigate}
      backTarget={title === "Matrix 探索" ? "home" : "explore"}
      className={`matrix-explore-screen matrix-explore-main-screen matrix-explore-layout ${isTianheng ? "matrix-tianheng-screen" : isTianyan ? "matrix-tianyan-screen" : ""}`}
    >
      <LotteryTabs selected={lottery} onChange={changeLottery} />
      <section className="panel explore-settings">
        <header className="matrix-settings-heading">
          <SectionTitle>探索設定</SectionTitle>
          <MatrixPageSwitcher current={isTianheng ? "tianheng" : isTianyan ? "tianyan" : "explore"} onNavigate={onNavigate} />
        </header>
        <div className="setting-grid">
          <label><span><SettingLabelIcon type="period" />探索期數</span>
            <div className={`segmented ${isTianyan ? "one" : isTianheng ? "two" : "three"}`}>
              {periodOptions.map((v) => (
                <button type="button" key={v} aria-label={isTianheng ? v : undefined} data-selected={period === v} onClick={() => setPeriod(v)}>
                  {v}
                  {(isExplore || isTianheng) && v === "十三期" && !exploreAccess?.canUseThirteen ? <em><LockClosedIcon />Matrix Pro</em> : null}
                </button>
              ))}
            </div>
          </label>
          <label><span><SettingLabelIcon type="road" />版路類型</span>
            <div className={`segmented ${roadTypes.length === 1 ? "one" : "three"}`}>
              {roadTypes.map((v) => (
                <button type="button" key={v} aria-label={isTianheng ? v : undefined} data-selected={road === v} onClick={() => changeRoad(v)}>
                  {v}
                  {(isExplore || isTianheng) && v === "拖牌版路" ? <em>推薦</em> : null}
                </button>
              ))}
            </div>
          </label>
        </div>
        {!isTianheng ? <div className="explore-hit-settings">{hitSettings}</div> : null}
      </section>

      {isTianheng ? (
        <section className="panel hit-advanced-panel">
          <SectionTitle>命中條件</SectionTitle>
          {hitSettings}
        </section>
      ) : null}

      <button type="button" className="primary-action branded-explore-action" onClick={startExplore}>
        <MagnifyingGlassIcon /><span>{isTianyan ? "開始天衍" : isTianheng ? "開始天衡" : "開始探索"}</span>
      </button>

      {isExplore ? (
        <HistoryList
          lottery={lottery}
          numberOrder={numberOrder}
          onOpenHistory={() => onNavigate("history")}
          collapsible
          collapseControl="title"
          showOrderText={false}
          expanded={historyExpanded}
          onExpandedChange={setHistoryExpanded}
        />
      ) : null}

      {searched ? (
        <>
          <section className="panel repeat-stats-panel">
            <header className="repeat-stats-heading">
              <SectionTitle>重複號碼統計</SectionTitle>
              <button
                type="button"
                aria-pressed={sameCode}
                data-selected={sameCode}
                onClick={toggleSameCode}
              >
                同碼
              </button>
              <span>點選進行版路篩選</span>
            </header>
            <div className="result-summary">
              {duplicateStats.map(({ number, count }) => (isExplore || isTianyan || isTianheng) ? (
                <button
                  type="button"
                  key={number}
                  aria-label={`篩選預測號碼 ${number}，${count}次`}
                  aria-pressed={selectedPredictionNumber === number}
                  data-selected={selectedPredictionNumber === number}
                  onClick={() => togglePredictionNumber(number)}
                >
                  <b>{number}</b><small>{count}次</small>
                </button>
              ) : (
                <div key={number}><b>{number}</b><small>{count}次</small></div>
              ))}
            </div>
          </section>

          <p className="explore-result-disclaimer">
            探索結果依歷史資料與所選條件產生，僅供參考之用，不保證中獎或<span className="explore-disclaimer-nowrap">獲利</span>。
          </p>

          <section className="panel result-panel">
            <header className="result-title">
              <SectionTitle>{isTianheng ? "天衡結果區" : isTianyan ? "天衍結果區" : "探索結果區"}</SectionTitle>
              <button
                type="button"
                className="consecutive-filter-button"
                aria-expanded={filterOpen}
                aria-controls="matrix-explore-consecutive-filter-options"
                onClick={() => setFilterOpen((current) => !current)}
              >
                <span>連準篩選</span><ChevronDownIcon data-open={filterOpen} aria-hidden="true" />
              </button>
              {hasCompletedResults ? <strong className="result-count">
                <span>探索到&nbsp;</span><span className="numeric-text">{resultCount}</span><span>&nbsp;組符合條件版路</span>
              </strong> : null}
            </header>
            {filterOpen ? (
              <div
                id="matrix-explore-consecutive-filter-options"
                className="explore-consecutive-filter-options matrix-explore-consecutive-filter-options"
                role="group"
                aria-label={`${hit}連準篩選`}
              >
                {filterOptions[hit].map((option) => (
                  <button
                    type="button"
                    className="explore-consecutive-filter-option"
                    aria-pressed={selectedFilters.includes(option)}
                    onClick={() => toggleFilter(option)}
                    key={option}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="road-results">
              {exploreLoading ? <p className="explore-request-state" role="status">分析結果載入中</p> : null}
              {exploreError ? <p className="explore-request-state" role="alert">{exploreError}</p> : null}
              <div className="road-results-head" aria-hidden="true">
                <span>位置</span>
                <span>號碼</span>
                <span><SubscriptionCopy formal="預測期" alternative="查詢期" /></span>
                <span>連準次數</span>
                <span><SubscriptionCopy formal="預測" alternative="結果" /></span>
                <span>版路類型</span>
              </div>
              {paginatedResults.map((item, index) => (
                <article
                  data-number-group-start={sameCode && index > 0 && paginatedResults[index - 1]?.prediction !== item.prediction ? "true" : undefined}
                  key={item.id}
                >
                  <button
                    type="button"
                    className="road-result-row"
                    ref={(node) => {
                      if (node) roadResultRowRefs.current.set(item.id, node);
                      else roadResultRowRefs.current.delete(item.id);
                    }}
                    aria-expanded={expandedRoad === item.id}
                    aria-label={`${expandedRoad === item.id ? "收合" : "展開"}版路 ${item.id}`}
                    onClick={() => toggleRoad(item.id)}
                  >
                    {item.tianhengItem ? <>
                      <span className="tag tianheng-lock-positions">
                        <span>{positionLabel(item.tianhengItem.firstLockedPosition, item.numberOrder)}</span>
                        <span>{positionLabel(item.tianhengItem.secondLockedPosition, item.numberOrder)}</span>
                      </span>
                      <span className="result-number numeric-text tianheng-lock-numbers">
                        <span>{item.tianhengItem.firstNumber}</span>
                        <span>{item.tianhengItem.secondNumber}</span>
                      </span>
                    </> : <>
                      <span className="tag">
                        {item.position === 7 ? (
                          <span>特別號</span>
                        ) : (
                          <>
                            <span>{item.numberOrder === "依實際開獎順序排序" ? "落球" : "順球"}</span>
                            <span className="numeric-text">{item.position}</span>
                          </>
                        )}
                      </span>
                      <span className="result-number numeric-text">{item.number}</span>
                    </>}
                    <span className="result-period"><span>下</span><span className="numeric-text">{item.predictionPeriod}</span><span>期</span></span>
                    <span className="result-consecutive">
                      <span>準</span><span className="numeric-text">{item.consecutive.match(/\d+/g)?.[0]}</span><span>進</span><span className="numeric-text">{item.consecutive.match(/\d+/g)?.[1]}</span>
                    </span>
                    <strong className="numeric-text">{item.prediction}</strong>
                    <span className="road-type-toggle">
                      <span>{title === "Matrix 天衍" ? item.algorithmType : item.algorithmType.endsWith("版路") ? item.algorithmType : `${item.algorithmType}版路`}</span>
                      <ChevronDownIcon data-open={expandedRoad === item.id} />
                    </span>
                  </button>
                  {expandedRoad === item.id ? (
                    isTianheng && tianhengResponse && item.tianhengItem
                      ? <TianhengValidationProcess
                          item={item.tianhengItem}
                          lottery={tianhengResponse.lottery}
                          validation={tianhengValidationById[`${tianhengResponse.analysisVersion}:${item.id}`]}
                          loading={validationLoadingId === `${tianhengResponse.analysisVersion}:${item.id}`}
                        />
                      : title === "Matrix 探索" && exploreResponse
                      ? <ExploreValidationProcess
                          item={item}
                          lottery={exploreResponse.lottery}
                          validation={validationById[`${exploreResponse.analysisVersion}:${item.id}`]}
                          loading={validationLoadingId === `${exploreResponse.analysisVersion}:${item.id}`}
                        />
                      : title === "Matrix 天衍" && tianyanResponse
                        ? <TianyanValidationProcess
                            item={item}
                            lottery={tianyanResponse.lottery}
                            validation={tianyanValidationById[`${tianyanResponse.analysisVersion}:${item.id}`]}
                            loading={validationLoadingId === `${tianyanResponse.analysisVersion}:${item.id}`}
                          />
                        : <RoadValidationProcess number={item.number} position={item.position} predictionPeriod={item.predictionPeriod} consecutive={item.consecutive} prediction={item.prediction} roadType={road} />
                  ) : null}
                </article>
              ))}
              {hasCompletedResults && visibleResults.length === 0 ? <p className="empty-result">無符合設定條件</p> : null}
              {visibleResults.length > 0 && resultPageCount > 1 ? (
                <MatrixResultsPagination page={resultPage} pageCount={resultPageCount} onPageChange={(page) => {
                  setExpandedRoad(null);
                  setResultPage(page);
                }} />
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </FeatureShell>
  );
}

function positionLabel(position: number, numberOrder: string) {
  return position === 7 ? "特別號" : `${numberOrder === "依實際開獎順序排序" ? "落球" : "順球"}${position}`;
}
