import fs from 'node:fs';

const featurePath = 'src/FeaturePages.tsx';
const prototypePath = 'src/Prototype.tsx';
const cssPath = 'src/feature-pages.css';

const replaceOnce = (source, from, to, label) => {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Document update anchor not found: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Document update anchor is not unique: ${label}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
};

const replaceAllExact = (source, from, to, label) => {
  if (!source.includes(from)) throw new Error(`Document update anchor not found: ${label}`);
  return source.split(from).join(to);
};

const replaceRegexOnce = (source, pattern, to, label) => {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) throw new Error(`Document update regex expected 1 match, got ${matches.length}: ${label}`);
  return source.replace(pattern, to);
};

let feature = fs.readFileSync(featurePath, 'utf8');
let prototype = fs.readFileSync(prototypePath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

// 本次指定圖示：通知、Matrix 探索、快捷及 Matrix 筆記本。
try {
const exploreIconFiles = {
  lottery: '/resources/explore-lottery.png',
  period: '/resources/explore-period.png',
  road: '/resources/explore-road.png',
  order: '/resources/explore-order.png',
  date: '/resources/explore-date.png',
  range: '/resources/explore-range.png',
};
const exploreStart = feature.indexOf('export function MatrixExplorePage({');
const exploreEnd = feature.indexOf('export function TongXingPage', exploreStart);
if (exploreStart < 0 || exploreEnd < 0) throw new Error('MatrixExplorePage icon scope was not found');
let exploreBlock = feature.slice(exploreStart, exploreEnd);
for (const [type, url] of Object.entries(exploreIconFiles)) {
  const pattern = new RegExp('<SettingLabelIcon\\s+type=["\\x27]' + type + '["\\x27]\\s*\\/>');
  if (!pattern.test(exploreBlock)) throw new Error('MatrixExplorePage icon anchor was not found: ' + type);
  exploreBlock = exploreBlock.replace(pattern, '{title === "Matrix 探索" ? <img className="setting-label-icon matrix-explore-setting-icon" src="' + url + '" alt="" aria-hidden="true" /> : <SettingLabelIcon type="' + type + '" />}');
}
feature = feature.slice(0, exploreStart) + exploreBlock + feature.slice(exploreEnd);
} catch (error) { console.warn('Matrix 探索圖示略過：', error instanceof Error ? error.message : error); }

try {
const quickIcons = {
  'Matrix 同星': '/resources/quick-tongxing.png',
  '號碼對照單': '/resources/quick-number-reference.png',
  '連碰立柱計算機': '/resources/quick-calculator.png',
  '歷史開獎號碼': '/resources/quick-history.png',
  'Matrix 筆記本': '/resources/quick-notebook.png',
};
const quickLabels = Object.keys(quickIcons);
let quickBlockStart = -1;
let quickBlockEnd = -1;
let quickAnchor = prototype.indexOf('歷史開獎號碼');
while (quickAnchor >= 0 && quickBlockStart < 0) {
  const candidateStart = prototype.lastIndexOf('const ', quickAnchor);
  const simpleEnd = prototype.indexOf('];', quickAnchor);
  const constEnd = prototype.indexOf('] as const;', quickAnchor);
  const endings = [
    simpleEnd >= 0 ? { start: simpleEnd, end: simpleEnd + 2 } : null,
    constEnd >= 0 ? { start: constEnd, end: constEnd + '] as const;'.length } : null,
  ].filter(Boolean).sort((a, b) => a.start - b.start);
  const closing = endings[0];
  if (candidateStart >= 0 && closing && closing.start > candidateStart) {
    const candidate = prototype.slice(candidateStart, closing.end);
    if (candidate.length < 8000 && quickLabels.every((label) => candidate.includes(label))) {
      quickBlockStart = candidateStart;
      quickBlockEnd = closing.end;
      break;
    }
  }
  quickAnchor = prototype.indexOf('歷史開獎號碼', quickAnchor + 1);
}
if (quickBlockStart < 0) throw new Error('Quick option icon block was not found');
let quickBlock = prototype.slice(quickBlockStart, quickBlockEnd);
for (const [label, url] of Object.entries(quickIcons)) {
  const labelIndex = quickBlock.indexOf(label);
  const itemStart = quickBlock.lastIndexOf('{', labelIndex);
  const itemEnd = quickBlock.indexOf('}', labelIndex);
  if (labelIndex < 0 || itemStart < 0 || itemEnd < 0) throw new Error('Quick icon item was not found: ' + label);
  let item = quickBlock.slice(itemStart, itemEnd + 1);
  const propertyPattern = /((?:image|icon|src)\s*:\s*)["'][^"']+["']/;
  if (propertyPattern.test(item)) item = item.replace(propertyPattern, '$1"' + url + '"');
  else {
    const pathPattern = /["']\/[^"']+\.(?:png|webp|svg)["']/;
    if (!pathPattern.test(item)) throw new Error('Quick icon path was not found: ' + label);
    item = item.replace(pathPattern, '"' + url + '"');
  }
  quickBlock = quickBlock.slice(0, itemStart) + item + quickBlock.slice(itemEnd + 1);
}
prototype = prototype.slice(0, quickBlockStart) + quickBlock + prototype.slice(quickBlockEnd);
} catch (error) { console.warn('快捷圖示略過：', error instanceof Error ? error.message : error); }

try {
const notebookHeadingClass = 'className="notebook-heading-v2"';
let notebookHeadingIndex = feature.indexOf(notebookHeadingClass);
if (notebookHeadingIndex < 0) {
  const notebookTextIndex = feature.indexOf('Matrix 筆記本');
  notebookHeadingIndex = feature.lastIndexOf('<header', notebookTextIndex);
}
const notebookImageStart = feature.indexOf('<img', notebookHeadingIndex);
const notebookImageEnd = feature.indexOf('>', notebookImageStart);
if (notebookHeadingIndex < 0 || notebookImageStart < 0 || notebookImageEnd < 0 || notebookImageStart - notebookHeadingIndex > 1200) throw new Error('Matrix notebook heading icon was not found');
let notebookImageTag = feature.slice(notebookImageStart, notebookImageEnd + 1);
if (!/\bsrc=["'][^"']+["']/.test(notebookImageTag)) throw new Error('Matrix notebook heading image source was not found');
notebookImageTag = notebookImageTag.replace(/\bsrc=["'][^"']+["']/, 'src="/resources/quick-notebook.png"');
feature = feature.slice(0, notebookImageStart) + notebookImageTag + feature.slice(notebookImageEnd + 1);
} catch (error) { console.warn('Matrix 筆記本圖示略過：', error instanceof Error ? error.message : error); }

// 通知名稱。
try {
feature = replaceOnce(feature, '["result", "開獎結果通知", "今彩539、天天樂、六合彩、大樂透", "/assets/notifications/result.png"]', '["result", "開獎結果", "今彩539、天天樂、六合彩、大樂透", "/assets/notifications/result.png"]', 'notification result title');
feature = replaceOnce(feature, '["status", "Matrix 狀態通知", "", "/assets/notifications/status.png"]', '["status", "Matrix 狀態", "", "/assets/notifications/status.png"]', 'notification status title');
feature = replaceOnce(feature, '["card", "Matrix 牌單通知", "今彩539、天天樂、六合彩、大樂透", "/assets/notifications/card.png"]', '["card", "Matrix 牌單", "今彩539、天天樂、六合彩、大樂透", "/assets/notifications/card.png"]', 'notification card title');
feature = replaceOnce(feature, '["collision", "Matrix 獨碰通知", "", "/assets/notifications/collision.png"]', '["collision", "Matrix 摘星", "", "/assets/notifications/collision.png"]', 'notification collision title');
feature = replaceAllExact(feature, '/assets/notifications/bet.png', '/resources/notify-bet.png', 'notification bet icon');
feature = replaceAllExact(feature, '/assets/notifications/result.png', '/resources/notify-result.png', 'notification result icon');
feature = replaceAllExact(feature, '/assets/notifications/win.png', '/resources/notify-win.png', 'notification win icon');
feature = replaceAllExact(feature, '/assets/notifications/status.png', '/resources/notify-status.png', 'notification status icon');
feature = replaceAllExact(feature, '/assets/notifications/card.png', '/resources/notify-card-v2.png?v=20260809-3', 'notification card icon');
feature = replaceAllExact(feature, '/assets/notifications/collision.png', '/resources/notify-collision-v2.png?v=20260809-3', 'notification collision icon');
feature = replaceAllExact(feature, '/assets/notifications/expiry.png', '/resources/notify-expiry.png', 'notification expiry icon');
feature = replaceAllExact(feature, '/assets/notifications/system.png', '/resources/notify-system-v2.png?v=20260809-3', 'notification system icon');
} catch (error) { console.warn('通知圖示略過：', error instanceof Error ? error.message : error); }

// 歷史開獎號碼範圍名稱。
feature = replaceAllExact(feature, '"近1000期"', '"1000期"', 'history range 1000');
feature = replaceAllExact(feature, '"近3000期"', '"3000期"', 'history range 3000');
feature = replaceAllExact(feature, '"近5000期"', '"5000期"', 'history range 5000');

// 快捷選定後立即開啟功能頁。
prototype = replaceOnce(prototype,
`  const selectQuickTarget = (next: ScreenId) => {
    setQuickTarget(next);
    window.localStorage.setItem("matrix-quick-target", next);
    setQuickSettingsOpen(false);
    if (screen === "notebook" && next !== "notebook") navigate("home");
  };`,
`  const selectQuickTarget = (next: ScreenId) => {
    setQuickTarget(next);
    window.localStorage.setItem("matrix-quick-target", next);
    setQuickSettingsOpen(false);
    setQuickReturnScreen(screen);
    if (next === "history") setHistoryReturnScreen(screen);
    setQuickActive(true);
    setScreen(next);
  };`, 'quick target immediate open');

// 驗證過程共用元件。
const validationComponent = String.raw`
function RoadValidationProcess({
  number,
  position,
  predictionPeriod,
  consecutive,
  prediction,
}: {
  number: string;
  position: number;
  predictionPeriod: number;
  consecutive: string;
  prediction: string;
}) {
  const validationGroups = [HISTORY.slice(0, 3), HISTORY.slice(3, 6)];
  return (
    <section className="road-validation-process" aria-label="驗證過程">
      <header className="validation-summary-card">
        <span><strong>條件摘要</strong>開 {number} 第 {position} 顆｜上 2 期｜第 3 顆｜+14.24｜下 {predictionPeriod} 期開</span>
        <em>{consecutive}</em>
      </header>
      {validationGroups.map((group, groupIndex) => (
        <div className="validation-period-block" key={groupIndex}>
          {group.map(([issue, , numbers], rowIndex) => {
            const lockRow = groupIndex === 0 ? 1 : 0;
            return (
              <div className="validation-period-row" key={issue}>
                <span className="validation-issue">{issue}</span>
                <span className="validation-full-numbers">{numbers.map((value) => <i key={value}>{value}</i>)}</span>
                <span className="validation-formula">
                  {rowIndex < 2 ? <><b>{number} +14.24</b>{rowIndex === lockRow ? <small>鎖定條件</small> : null}</> : <><b>預測期</b><strong>版路結果 08、37</strong></>}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

`;
feature = replaceOnce(feature, 'export function MatrixExplorePage({', validationComponent + 'export function MatrixExplorePage({', 'insert validation component');

// Matrix 天衍：固定命中條件、複合版路及完整連準篩選。
feature = replaceOnce(feature,
`  type ConsecutiveOption =
    | "準4進5"
    | "準5進6"
    | "準6進7"
    | "準7進8"
    | "準9進10"
    | "準11進12";`,
`  type ConsecutiveOption =
    | "準4進5"
    | "準5進6"
    | "準6進7"
    | "準7進8"
    | "準9進10"
    | "準11進12"
    | "準13進14"
    | "準15進16"
    | "準17進18+";`, 'tianyan consecutive type');
feature = replaceOnce(feature,
`    "準5+（鎖定2碼）": ["準5進6", "準6進7", "準7進8", "準9進10", "準11進12"],`,
`    "準5+（鎖定2碼）": ["準5進6", "準6進7", "準7進8", "準9進10", "準11進12", "準13進14", "準15進16", "準17進18+"],`, 'tianyan filter options');
feature = replaceOnce(feature,
`    "準5+（鎖定2碼）": ["準7進8", "準9進10", "準11進12"],`,
`    "準5+（鎖定2碼）": ["準9進10", "準11進12", "準13進14", "準15進16", "準17進18+"],`, 'tianyan default filters');
feature = replaceOnce(feature, '  const [hit, setHit] = useState("準4+（鎖定1碼）");', '  const [hit, setHit] = useState(title === "Matrix 天衍" ? "準5+（鎖定2碼）" : "準4+（鎖定1碼）");', 'tianyan fixed hit default');
feature = replaceOnce(feature, '    defaultFilters["準4+（鎖定1碼）"],', '    defaultFilters[title === "Matrix 天衍" ? "準5+（鎖定2碼）" : "準4+（鎖定1碼）"],', 'tianyan selected filter default');
feature = replaceOnce(feature,
`          {["準4+（鎖定1碼）", "準5+（鎖定2碼）"].map((v) => (`,
`          {(title === "Matrix 天衍" ? ["準5+（鎖定2碼）"] : ["準4+（鎖定1碼）", "準5+（鎖定2碼）"]).map((v) => (`, 'tianyan fixed hit option');
feature = replaceAllExact(feature, '{v === "十三期" ? <em><LockClosedIcon />Matrix Pro</em> : null}', '{title === "Matrix 探索" && v === "十三期" ? <em><LockClosedIcon />Matrix Pro</em> : null}', 'remove pro period labels from tools');
feature = replaceAllExact(feature, '{value === "完整範圍" ? <em><LockClosedIcon />Matrix Pro</em> : null}', '{title === "Matrix 探索" && value === "完整範圍" ? <em><LockClosedIcon />Matrix Pro</em> : null}', 'remove pro range labels from tools');
feature = replaceRegexOnce(feature,
/                    <div className="road-validation">\n                      <strong>版路驗證過程<\/strong>\n                      <span>位置：順球 \{item\.position\}<\/span>\n                      <span>號碼： \{item\.number\}<\/span>\n                      <span>連準次數： \{item\.consecutive\.replace\(\/準\(\\d\+\)進\(\\d\+\)\/, "準 \$1 進 \$2"\)\}<\/span>\n                      <span>預測： \{item\.prediction\}<\/span>\n                    <\/div>/,
`                    <RoadValidationProcess number={item.number} position={item.position} predictionPeriod={item.predictionPeriod} consecutive={item.consecutive} prediction={item.prediction} />`, 'explore validation process');

// Matrix 天工專用探索設定與結果；不含近10期及連準篩選。
const tiangongComponent = String.raw`
function MatrixTiangongPage({ onNavigate }: { onNavigate: Navigate }) {
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [period, setPeriod] = useState("五十期");
  const [mode, setMode] = useState("一段式");
  const [hit, setHit] = useState("準2進3");
  const [searchPositions, setSearchPositions] = useState(["固定"]);
  const [firstPositions, setFirstPositions] = useState(["固定"]);
  const [firstRoads, setFirstRoads] = useState(["加減版路"]);
  const [secondPositions, setSecondPositions] = useState(["固定"]);
  const [secondRoads, setSecondRoads] = useState(["加減版路"]);
  const [searched, setSearched] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const toggle = (value: string, current: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const positionOptions = ["固定", "依序遞增", "依序遞減"];
  const roadOptions = ["加減版路", "合值版路"];
  return (
    <FeatureShell title="Matrix 天工" onNavigate={onNavigate} backTarget="explore" className="matrix-explore-screen matrix-tiangong-screen">
      <section className="panel explore-settings tiangong-settings">
        <SectionTitle>探索設定</SectionTitle>
        <div className="setting-grid">
          <label><span><SettingLabelIcon type="lottery" /><b>彩種</b></span><div className="select-box native-select"><select value={lottery} onChange={(event) => setLottery(event.target.value as LotteryId)}>{LOTTERIES.map((item) => <option key={item}>{item}</option>)}</select><ChevronDownIcon /></div></label>
          <label><span><SettingLabelIcon type="period" />探索期數</span><div className="segmented two">{["五十期", "八十期"].map((value) => <button type="button" data-selected={period === value} onClick={() => setPeriod(value)} key={value}>{value}</button>)}</div></label>
          <label><span><SettingLabelIcon type="road" />探索模式</span><div className="segmented two">{["一段式", "二段式"].map((value) => <button type="button" data-selected={mode === value} onClick={() => setMode(value)} key={value}>{value}</button>)}</div></label>
          <label><span>命中條件</span><div className="segmented two">{["準2進3", "準3進4"].map((value) => <button type="button" data-selected={hit === value} onClick={() => setHit(value)} key={value}>{value}</button>)}</div></label>
          <fieldset><legend>探索球位</legend><div className="segmented three">{positionOptions.map((value) => <button type="button" data-selected={searchPositions.includes(value)} onClick={() => toggle(value, searchPositions, setSearchPositions)} key={value}>{value}</button>)}</div></fieldset>
          <fieldset><legend>第一段球位</legend><div className="segmented three">{positionOptions.map((value) => <button type="button" data-selected={firstPositions.includes(value)} onClick={() => toggle(value, firstPositions, setFirstPositions)} key={value}>{value}</button>)}</div></fieldset>
          <fieldset><legend>第一段版路類型</legend><div className="segmented two">{roadOptions.map((value) => <button type="button" data-selected={firstRoads.includes(value)} onClick={() => toggle(value, firstRoads, setFirstRoads)} key={value}>{value}</button>)}</div></fieldset>
          {mode === "二段式" ? <><fieldset><legend>第二段球位</legend><div className="segmented three">{positionOptions.map((value) => <button type="button" data-selected={secondPositions.includes(value)} onClick={() => toggle(value, secondPositions, setSecondPositions)} key={value}>{value}</button>)}</div></fieldset><fieldset><legend>第二段版路類型</legend><div className="segmented two">{roadOptions.map((value) => <button type="button" data-selected={secondRoads.includes(value)} onClick={() => toggle(value, secondRoads, setSecondRoads)} key={value}>{value}</button>)}</div></fieldset></> : null}
        </div>
      </section>
      <button type="button" className="primary-action branded-explore-action" onClick={() => setSearched(true)}><MagnifyingGlassIcon /><span>開始探索</span></button>
      {searched ? <section className="panel result-panel"><header className="result-title"><SectionTitle>探索結果區</SectionTitle></header><div className="road-results"><article><div className="road-result-row"><span className="tag"><span>順球</span><span className="numeric-text">4</span></span><span className="result-number numeric-text">25</span><span className="result-period"><span>下</span><span className="numeric-text">2</span><span>期</span></span><span className="result-consecutive">準3進4</span><strong className="numeric-text">08.37</strong><button type="button" className="road-type-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span>版路類型</span><ChevronDownIcon data-open={expanded} /></button></div>{expanded ? <RoadValidationProcess number="25" position={4} predictionPeriod={2} consecutive="準3進4" prediction="08.37" /> : null}</article></div></section> : null}
    </FeatureShell>
  );
}

`;
feature = replaceOnce(feature, 'export function TongXingPage({ onNavigate }', tiangongComponent + 'export function TongXingPage({ onNavigate }', 'insert tiangong component');
feature = replaceOnce(feature, '  if (screen === "tiangong") return <MatrixExplorePage onNavigate={onNavigate} title="Matrix 天工" roadTypes={["自訂版路"]} />;', '  if (screen === "tiangong") return <MatrixTiangongPage onNavigate={onNavigate} />;', 'route tiangong component');

// Matrix 狀態驗證過程改用同一三期三欄元件。
feature = replaceRegexOnce(feature, /\{openRoad === index \? <div className="status-validation status-table-validation">[\s\S]*?<\/div> : null\}/, '{openRoad === index ? <RoadValidationProcess number={road.number} position={road.position} predictionPeriod={road.period} consecutive={road.consecutive} prediction={road.prediction} /> : null}', 'status validation process');

// Matrix 筆記本預設玩法與金額。
feature = replaceOnce(feature, 'type PlayDraft = { bets: string; costPerBet: string; cost: string; costManual: boolean; playPrize: string };', 'const formatNotebookAmount = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);\ntype PlayDraft = { quantity: string };', 'record play quantity type');
feature = replaceRegexOnce(feature, /const DEFAULT_RECORD_SETTINGS = \(\): Record<LotteryId, LotteryRecordSettings> => Object\.fromEntries\([\s\S]*?\) as Record<LotteryId, LotteryRecordSettings>;/, String.raw`const DEFAULT_RECORD_SETTINGS = (): Record<LotteryId, LotteryRecordSettings> => Object.fromEntries(
  LOTTERIES.map((lottery) => {
    const isThirtyNine = lottery === "今彩539" || lottery === "天天樂";
    const singlePrize = isThirtyNine ? 21200 : 28500;
    const singleBets = isThirtyNine ? 38 : 48;
    const singleFixedCost = isThirtyNine ? 3040 : 3840;
    const twoStarPrize = isThirtyNine ? 5300 : 5700;
    const fourStarPrize = isThirtyNine ? 800000 : 750000;
    return [lottery, {
      tags: [
        { name: "單號", costMode: "依照碰數" as CostMode, defaultBets: singleBets, costPerBet: 80, fixedCost: singleFixedCost, prizePerBet: singlePrize },
        { name: "二星", costMode: "固定成本" as CostMode, defaultBets: 1, costPerBet: 80, fixedCost: 80, prizePerBet: twoStarPrize },
        { name: "三星", costMode: "固定成本" as CostMode, defaultBets: 1, costPerBet: 80, fixedCost: 80, prizePerBet: 57000 },
        { name: "四星", costMode: "固定成本" as CostMode, defaultBets: 1, costPerBet: 80, fixedCost: 80, prizePerBet: fourStarPrize },
      ],
    }];
  }),
) as Record<LotteryId, LotteryRecordSettings>;`, 'record default settings');
feature = replaceOnce(feature,
`      if (!stored) return DEFAULT_RECORD_SETTINGS();
      return Object.fromEntries(LOTTERIES.map((item) => [item, { tags: (stored[item]?.tags ?? DEFAULT_RECORD_SETTINGS()[item].tags).filter((play) => play.name !== "自訂") }])) as Record<LotteryId, LotteryRecordSettings>;`,
`      if (!stored) return DEFAULT_RECORD_SETTINGS();
      const defaults = DEFAULT_RECORD_SETTINGS();
      return Object.fromEntries(LOTTERIES.map((item) => [item, { tags: [...defaults[item].tags, ...(stored[item]?.tags ?? []).filter((play) => !["單號", "二星", "三星", "四星", "自訂"].includes(play.name)).map((play) => ({ ...play, defaultBets: Math.min(9999999, Math.max(1, Number(play.defaultBets) || 1)), costPerBet: Math.min(9999999, Math.max(1, Number(play.costPerBet) || 1)), fixedCost: Math.min(9999999, Math.max(1, Number(play.fixedCost) || 1)), prizePerBet: Math.min(9999999, Math.max(1, Number(play.prizePerBet) || 1)) }))] }])) as Record<LotteryId, LotteryRecordSettings>;`, 'record settings migration');
feature = replaceAllExact(feature, 'setColumnTexts(["", "", ""])', 'setColumnTexts(Array.from({ length: 12 }, () => ""))', 'record twelve-column resets');
feature = replaceOnce(feature, '  const [columnTexts, setColumnTexts] = useState(["", "", ""]);', '  const [columnTexts, setColumnTexts] = useState(() => Array.from({ length: 12 }, () => ""));', 'record twelve-column state');
feature = replaceOnce(feature, '  const [numberPicker, setNumberPicker] = useState<{ type: "numbers" | "column"; column?: number } | null>(null);', '  const [numberPicker, setNumberPicker] = useState<{ type: "numbers" | "column" | "special"; column?: number } | null>(null);\n  const [specialNumber, setSpecialNumber] = useState("");\n  const [dateInfoOpen, setDateInfoOpen] = useState(false);\n  const [expandedRecordIds, setExpandedRecordIds] = useState<string[]>([]);\n  const [recordLotteryFilters, setRecordLotteryFilters] = useState<LotteryId[]>([...LOTTERIES]);\n  const [customStartDate, setCustomStartDate] = useState(() => new Date().toISOString().slice(0, 10));\n  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().slice(0, 10));', 'record extra states');
feature = replaceOnce(feature, '  const [customPlayOpen, setCustomPlayOpen] = useState(false);\n', '', 'remove record custom dialog state');
feature = replaceOnce(feature, '  const [quantity, setQuantity] = useState(1);\n', '', 'remove shared record quantity state');
feature = replaceOnce(feature, '  const [statsPeriod, setStatsPeriod] = useState<"每日" | "每週" | "本月">("每日");', '  const [statsPeriod, setStatsPeriod] = useState<"本日" | "本週" | "自訂">("本日");', 'record custom period state');
feature = replaceRegexOnce(feature, /  const selectedPlayRows = selectedTags\.map\(\(name\) => \{[\s\S]*?\n  \}\);/, String.raw`  const selectedPlayRows = selectedTags.map((name) => {
    const setting = currentTags.find((play) => play.name === name);
    const draft = playDrafts[name];
    const playQuantity = Math.min(9999999, Math.max(0.1, Number(draft?.quantity || 1)));
    const baseBets = getCalculatedBets(name);
    const bets = baseBets * playQuantity;
    const cost = setting?.costMode === "固定成本"
      ? (setting.fixedCost ?? 0) * playQuantity
      : bets * (setting?.costPerBet ?? 0);
    const playPrize = (setting?.prizePerBet ?? 0) * playQuantity;
    const unitCost = bets ? cost / bets : 0;
    const unitPrize = bets ? playPrize / bets : 0;
    return { name, quantity: playQuantity, bets, costPerBet: setting?.costPerBet ?? 0, cost, playPrize, unitCost, unitPrize };
  });`, 'record per-play quantity calculation');
feature = replaceOnce(feature, '    if (statsPeriod === "每日") return record.date === today.toISOString().slice(0, 10);\n    if (statsPeriod === "本月") return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();', '    if (!recordLotteryFilters.includes(record.lottery)) return false;\n    if (statsPeriod === "本日") return record.date === today.toISOString().slice(0, 10);\n    if (statsPeriod === "自訂") return record.date >= customStartDate && record.date <= customEndDate;', 'record date and lottery filter');
feature = replaceOnce(feature, '  }), [records, statsPeriod]);', '  }), [customEndDate, customStartDate, recordLotteryFilters, records, statsPeriod]);', 'record filter dependencies');
feature = replaceOnce(feature, 'setQuantity(1); setView("record")', 'setSpecialNumber(""); setView("record")', 'reset special number on new record');
feature = replaceOnce(feature, '      lottery, plays: selectedPlayRows, quantity,', '      lottery, plays: selectedPlayRows, quantity: 1,', 'record snapshot quantity');
feature = replaceOnce(feature, '      id: `record-${Date.now()}`, lottery, date: recordDate, mode, numbers, columns: parsedColumns,\n      tags: selectedTags, quantity, bets: computedBets, cost: computedCost, estimatedPrize,', '      id: `record-${Date.now()}`, lottery, date: recordDate, mode, numbers: specialNumber ? [...numbers, specialNumber] : numbers, columns: parsedColumns,\n      tags: selectedTags, quantity: 1, bets: computedBets, cost: computedCost, estimatedPrize,', 'record special number save');
feature = replaceRegexOnce(feature, /  const addCustomTag = \(\) => \{[\s\S]*?\n  \};\n  const togglePlay/, '  const togglePlay', 'remove record page custom add');
feature = replaceRegexOnce(feature, /  const togglePlay = \(name: string\) => \{[\s\S]*?\n  \};\n  const updatePlayDraft = \(name: string, patch: Partial<PlayDraft>\) => setPlayDrafts\(\(current\) => \{[\s\S]*?\n  \}\);/, String.raw`  const togglePlay = (name: string) => {
    setSelectedTags((current) => current.includes(name) ? current.filter((play) => play !== name) : [...current, name]);
    if (!playDrafts[name]) setPlayDrafts((current) => ({ ...current, [name]: { quantity: "1" } }));
  };
  const updatePlayDraft = (name: string, patch: Partial<PlayDraft>) => setPlayDrafts((current) => ({ ...current, [name]: { quantity: current[name]?.quantity ?? "1", ...patch } }));`, 'record play draft helpers');
feature = replaceRegexOnce(feature, /  const togglePickedNumber = \(number: string\) => \{[\s\S]*?\n  \};\n  const exportBackup/, String.raw`  const togglePickedNumber = (number: string) => {
    if (!numberPicker) return;
    if (numberPicker.type === "special") {
      setSpecialNumber((current) => current === number ? "" : number);
      setNumberText((current) => parseRecordNumbers(current, maxNumber).filter((item) => item !== number).join(" "));
      setColumnTexts((columns) => columns.map((value) => parseRecordNumbers(value, maxNumber).filter((item) => item !== number).join(" ")));
      return;
    }
    setSpecialNumber((current) => current === number ? "" : current);
    if (numberPicker.type === "numbers") {
      if (mode === "單號") setNumberText(number);
      else setNumberText((parsedNumbers.includes(number) ? parsedNumbers.filter((item) => item !== number) : [...parsedNumbers, number]).join(" "));
      return;
    }
    const columnIndex = numberPicker.column ?? 0;
    const current = parsedColumns[columnIndex] ?? [];
    const removing = current.includes(number);
    setColumnTexts((columns) => columns.map((value, index) => {
      const values = parseRecordNumbers(value, maxNumber).filter((item) => item !== number);
      if (index === columnIndex && !removing) values.push(number);
      return values.join(" ");
    }));
  };
  const exportBackup`, 'record unique and special selection');
feature = replaceOnce(feature, 'const selected = numberPicker.type === "numbers" ? parsedNumbers.includes(number) : parsedColumns[numberPicker.column ?? 0]?.includes(number);', 'const selected = numberPicker.type === "special" ? specialNumber === number : numberPicker.type === "numbers" ? parsedNumbers.includes(number) : parsedColumns[numberPicker.column ?? 0]?.includes(number);', 'record special picker selected state');
feature = replaceOnce(feature, '<section className="panel record-form-section"><h3>日期</h3><div className="record-week-row">{weekDates.map((date) => <button type="button" data-selected={recordDate === date.value} onClick={() => setRecordDate(date.value)} key={date.value}><span>{date.label}</span><strong>{date.day}</strong></button>)}</div></section>', '<section className="panel record-form-section record-date-section"><button type="button" className="record-date-toggle" aria-expanded={dateInfoOpen} onClick={() => setDateInfoOpen(!dateInfoOpen)}><h3>日期</h3><ChevronDownIcon data-open={dateInfoOpen} /></button>{dateInfoOpen ? <div className="record-week-row">{weekDates.map((date) => <button type="button" data-selected={recordDate === date.value} onClick={() => setRecordDate(date.value)} key={date.value}><span>{date.label}</span><strong>{date.day}</strong></button>)}</div> : null}</section>', 'record collapsible date');
feature = replaceOnce(feature, '<section className="panel record-form-section"><h3>玩法</h3><div className="record-tag-options">{currentTags.filter((play) => mode !== "單號" || !["二星", "三星", "四星"].includes(play.name)).map((play) => <button type="button" data-selected={selectedTags.includes(play.name)} onClick={() => togglePlay(play.name)} key={play.name}>{play.name}</button>)}<button type="button" onClick={() => { setSettingsLottery(lottery); setNewTagName(""); setCustomPlayOpen(true); }}>自訂</button></div></section>', '<section className="panel record-form-section"><h3>玩法</h3><div className="record-tag-options">{currentTags.filter((play) => mode === "單號" ? !["二星", "三星", "四星"].includes(play.name) : play.name !== "單號").map((play) => <button type="button" data-selected={selectedTags.includes(play.name)} onClick={() => togglePlay(play.name)} key={play.name}>{play.name}</button>)}</div></section>', 'record remove custom option');
feature = replaceOnce(feature, '{mode !== "立柱" ? <button type="button" className="record-number-picker-button" onClick={() => setNumberPicker({ type: "numbers" })}><span>{parsedNumbers.length ? parsedNumbers.join("、") : "選取號碼"}</span><ChevronRightIcon /></button> : <div className="record-columns">{columnTexts.map((value, index) => <label key={index}>第{index + 1}柱<button type="button" onClick={() => setNumberPicker({ type: "column", column: index })}><span>{parseRecordNumbers(value, maxNumber).length ? parseRecordNumbers(value, maxNumber).join("、") : "選取號碼"}</span><ChevronRightIcon /></button></label>)}</div>}', '<div className="record-number-and-special">{mode !== "立柱" ? <button type="button" className="record-number-picker-button" onClick={() => setNumberPicker({ type: "numbers" })}><span>{parsedNumbers.length ? parsedNumbers.join("、") : "選取號碼"}</span><ChevronRightIcon /></button> : <div className="record-columns">{columnTexts.map((value, index) => <label key={index}>第{index + 1}柱<button type="button" onClick={() => setNumberPicker({ type: "column", column: index })}><span>{parseRecordNumbers(value, maxNumber).length ? parseRecordNumbers(value, maxNumber).join("、") : "選取號碼"}</span><ChevronRightIcon /></button></label>)}</div>}{lottery === "六合彩" || lottery === "大樂透" ? <button type="button" className="record-special-picker-button" onClick={() => setNumberPicker({ type: "special" })}><span>特別號</span><strong>{specialNumber || "—"}</strong></button> : null}</div>', 'record special picker');
feature = replaceAllExact(feature, 'setLottery(item); setSettingsLottery(item); setNumberText(""); setColumnTexts(Array.from({ length: 12 }, () => "")); setSelectedTags([]); setPlayDrafts({});', 'setLottery(item); setSettingsLottery(item); setNumberText(""); setColumnTexts(Array.from({ length: 12 }, () => "")); setSpecialNumber(""); setSelectedTags([]); setPlayDrafts({});', 'reset special number on lottery change');
feature = replaceAllExact(feature, 'setMode(item); setNumberText(""); setColumnTexts(Array.from({ length: 12 }, () => "")); setSelectedTags([]); setPlayDrafts({});', 'setMode(item); setNumberText(""); setColumnTexts(Array.from({ length: 12 }, () => "")); setSpecialNumber(""); setSelectedTags([]); setPlayDrafts({});', 'reset special number on mode change');
feature = replaceRegexOnce(feature, /        \{selectedPlayRows\.map\(\(play\) => \{[\s\S]*?        \}\)}\n        <section className="panel record-form-section record-quantity">[\s\S]*?<\/section>/, `        {selectedPlayRows.map((play) => <section className="panel record-play-setting" key={play.name}><h3>{play.name}</h3><div className="record-play-metrics"><label>數量 <input type="number" min="0.1" max="9999999" step="0.1" value={playDrafts[play.name]?.quantity ?? "1"} onChange={(event) => updatePlayDraft(play.name, { quantity: event.target.value })} /></label><p className="record-formula"><span>碰數 <strong>{formatNotebookAmount(play.bets)}</strong> × 1碰金額 <strong>{formatNotebookAmount(play.unitCost)}</strong> = 玩法成本 <strong>NT {formatNotebookAmount(play.cost)}</strong></span></p><p className="record-formula"><span>碰數 <strong>{formatNotebookAmount(play.bets)}</strong> × 1碰獎金 <strong>{formatNotebookAmount(play.unitPrize)}</strong> = 最高獎金 <strong>{formatNotebookAmount(play.playPrize)}</strong></span></p></div></section>)}
        <section className="panel record-form-section record-quantity"><span>總碰數 <strong>{formatNotebookAmount(computedBets)}</strong></span><span>玩法成本 <strong>NT {formatNotebookAmount(computedCost)}</strong></span><span>最高獎金 <strong>{formatNotebookAmount(estimatedPrize)}</strong></span></section>`, 'record per-play quantity UI');
feature = replaceRegexOnce(feature, /      \{customPlayOpen && document\.querySelector<HTMLElement>\("\.mobile-page"\) \? createPortal\([\s\S]*? : null\}\n/, '', 'remove record custom modal');
feature = replaceOnce(feature, '{["二星", "三星", "四星"].includes(tag.name) || !settingsEditMode ? <strong>{tag.name}</strong>', '{["單號", "二星", "三星", "四星"].includes(tag.name) || !settingsEditMode ? <strong>{tag.name}</strong>', 'record reserved setting names');
feature = replaceAllExact(feature, '<input type="number" value={tag.fixedCost} onChange={(event) => updateTag(index, { fixedCost: Number(event.target.value) })} />', '<input type="number" min="1" max="9999999" value={tag.fixedCost || ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTag(index, { fixedCost: Math.min(9999999, Math.max(1, Number(event.target.value))) })} />', 'record fixed cost range');
feature = replaceAllExact(feature, '<input type="number" value={tag.prizePerBet} onChange={(event) => updateTag(index, { prizePerBet: Number(event.target.value) })} />', '<input type="number" min="1" max="9999999" value={tag.prizePerBet} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTag(index, { prizePerBet: Math.min(9999999, Math.max(1, Number(event.target.value))) })} />', 'record prize range');
feature = replaceAllExact(feature, '<input type="number" value={tag.defaultBets} onChange={(event) => updateTag(index, { defaultBets: Number(event.target.value) })} />', '<input type="number" min="1" max="9999999" value={tag.defaultBets} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTag(index, { defaultBets: Math.min(9999999, Math.max(1, Number(event.target.value))) })} />', 'record bets range');
feature = replaceAllExact(feature, '<input type="number" value={tag.costPerBet} onChange={(event) => updateTag(index, { costPerBet: Number(event.target.value) })} />', '<input type="number" min="1" max="9999999" value={tag.costPerBet} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTag(index, { costPerBet: Math.min(9999999, Math.max(1, Number(event.target.value))) })} />', 'record per-bet cost range');
feature = replaceOnce(feature, '          costPerBet: 0,\n          fixedCost: 0,\n          prizePerBet: 0,', '          costPerBet: 1,\n          fixedCost: 1,\n          prizePerBet: 1,', 'record custom setting minimum defaults');

// 紀錄列表分類、自訂日期與展開／收合。
feature = replaceOnce(feature, '<div className="notebook-create-actions">\n            {notebookMode === "筆記"\n              ? <button type="button" onClick={() => startNote()}><PlusIcon />新增筆記</button>\n              : <button type="button" onClick={startRecord}><PlusIcon />新增紀錄</button>}\n          </div>', '<div className="notebook-create-actions" data-mode={notebookMode}>{notebookMode === "紀錄" ? <div className="record-lottery-filters" aria-label="彩種分類">{LOTTERIES.map((item) => <button type="button" data-selected={recordLotteryFilters.includes(item)} onClick={() => setRecordLotteryFilters((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} key={item}>{item}</button>)}</div> : null}{notebookMode === "筆記" ? <button type="button" onClick={() => startNote()}><PlusIcon />新增筆記</button> : <button type="button" onClick={startRecord}><PlusIcon />新增紀錄</button>}</div>', 'record compact create button and lottery filters');
feature = replaceOnce(feature, '<header><div>{(["每日", "每週", "本月"] as const).map((period) => <button type="button" data-selected={statsPeriod === period} onClick={() => setStatsPeriod(period)} key={period}>{period}</button>)}</div><button type="button" onClick={openSettings}><GearIcon />設定</button></header>', '<header><div>{(["本日", "本週", "自訂"] as const).map((period) => <button type="button" data-selected={statsPeriod === period} onClick={() => setStatsPeriod(period)} key={period}>{period}</button>)}</div><button type="button" onClick={openSettings}><GearIcon />設定</button></header>{statsPeriod === "自訂" ? <div className="record-custom-range"><input type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} /><span>至</span><input type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} /></div> : null}', 'record custom date range');
feature = replaceOnce(feature, '<span>總成本<strong>NT${stats.cost}</strong></span><span>總獎金<strong>NT${stats.prize}</strong></span><span>總損益<strong>NT${stats.prize - stats.cost}</strong></span>', '<span>玩法成本 <strong>NT {formatNotebookAmount(stats.cost)}</strong></span><span>已確認獎金 <strong>{formatNotebookAmount(stats.prize)}</strong></span><span>金額差額 <strong>NT {formatNotebookAmount(stats.prize - stats.cost)}</strong></span>', 'record stats labels');
feature = replaceRegexOnce(feature, /: records\.map\(\(record\) => <article className="panel notebook-record-card"[\s\S]*?<\/article>\)\}/, `: visibleRecords.map((record) => {
            const expanded = expandedRecordIds.includes(record.id);
            return <article className="panel notebook-record-card" key={record.id}>
              <button type="button" className="record-card-toggle" aria-expanded={expanded} onClick={() => setExpandedRecordIds((current) => current.includes(record.id) ? current.filter((id) => id !== record.id) : [...current, record.id])}>
                <span><strong>{record.lottery}</strong><small>{record.date}</small></span><em>{record.status}</em><ChevronDownIcon data-open={expanded} />
              </button>
              {expanded ? <div className="record-card-details"><p>{record.mode}｜{record.tags.join("、")}</p><div className="record-number-row">{record.numbers.map((number, index) => <i key={number + "-" + index}>{number}</i>)}</div><footer><span>總碰數 <strong>{formatNotebookAmount(record.bets)}</strong></span><span>玩法成本 <strong>NT {formatNotebookAmount(record.cost)}</strong></span><span>已確認獎金 <strong>{formatNotebookAmount(record.actualPrize)}</strong></span><span>金額差額 <strong>NT {formatNotebookAmount(record.actualPrize - record.cost)}</strong></span></footer><div className="record-status-actions"><em>{record.status}</em><button type="button" onClick={() => { if (window.confirm("確定刪除此紀錄？")) setRecords((current) => current.filter((item) => item.id !== record.id)); }}><TrashIcon />刪除</button></div></div> : null}
            </article>;
          })}`, 'record expandable cards');
feature = replaceOnce(feature, '{notebookMode === "紀錄" && records.length === 0 ?', '{notebookMode === "紀錄" && visibleRecords.length === 0 ?', 'record filtered empty state');
feature = replaceOnce(feature, 'const numbers = mode === "立柱" ? parsedColumns.flat() : parsedNumbers;', 'const numbers = mode === "立柱" ? parsedColumns.flat() : parsedNumbers;\n    if (mode === "立柱" && new Set(numbers).size !== numbers.length) return;', 'record unique column guard');

// 指南逐項文字。
const guideReplacements = [
  ['樂彩 Matrix 是歷史開獎資料查詢、比對、驗證與探索工具，支援今彩539、天天樂、六合彩及大樂透。', '樂彩 Matrix 提供公開的開獎資料查詢、整理、比對、驗證及探索功能，支援今彩539、天天樂、六合彩及大樂透。'],
  ['使用 LINE 登入後進入首頁。', '使用 LINE 登入之後進入首頁。'],
  ['先切換彩種，再查看最新開獎、下次開獎與 Matrix 狀態。', '切換彩種，查看最新開獎資訊、下次開獎時間與 Matrix 狀態。'],
  ['依需求進入 Matrix 探索、Matrix 同星、號碼對照單、連碰立柱計算機、Matrix 牌單或 Matrix 指南。', '依需求使用 Matrix 探索、Matrix 同星、號碼對照單、連碰立柱計算機、Matrix 牌單及 Matrix 指南。'],
  ['首頁：查看四彩種資訊與主要功能入口。', '首頁：查看四彩種最新的資訊與主要功能入口。'],
  ['Matrix 狀態與主要功能入口。', 'Matrix 狀態及主要功能入口。'],
  [', "五大入口為 Matrix 同星、號碼對照單、連碰立柱計算機、Matrix 牌單及 Matrix 指南。"', ''],
  ['探索期數：二期、七期、十三期；十三期為 Matrix Pro 功能。', '探索期數：二期、七期、十三期 (Matrix Pro)。'],
  ['命中條件：準4+（鎖定1碼）或準5+（鎖定2碼），兩者為單選。', '命中條件：準4+ (鎖定1碼)或準5+ (鎖定2碼) 單選。'],
  ['探索日期：本日（最新）、昨日（上1期）、前日（上2期）。', '探索日期：本日、昨日、前日。'],
  ['自動分析並篩選較高參考價值的版路結果，依規則分為啟動、聚合、共振與臨界。', '顯示符合條件的版路結果，依規則分為啟動、聚合、共振及臨界。'],
  ['每條版路顯示位置、號碼、預測期、連準次數、預測及類型。', '每條版路顯示位置、號碼、預測期、連準次數及版路類型。'],
  ['輸入指定號碼與之後期數，查詢同一期指定號碼條件及後續開獎結果。', '輸入指定號碼後，查詢指定期數的開獎結果。'],
  ['選擇彩種、1000期／3000期／5000期歷史範圍與號碼順序。', '選擇彩種、歷史範圍（1000／3000／5000期）及號碼順序。'],
  ['快捷可指定常用功能；Matrix 筆記本分為筆記與紀錄兩種模式。', '快捷可快速開啟已設定的功能；Matrix 筆記本提供筆記與紀錄兩種模式。'],
  ['長按三秒可設定 Matrix 同星、號碼對照單、連碰立柱計算機、歷史開獎號碼或 Matrix 筆記本。', '長按三秒可設定快捷功能。'],
  ['返回列表前若內容有變動且尚未寫入，會出現提醒。', '返回列表前若內容尚未寫入，將提醒是否儲存。'],
  ['摘要顯示總成本、總獎金與總損益；統計提供每日、每週與本月。', '摘要顯示玩法成本、已確認獎金及金額差額；統計提供本日、本週與自訂日期。'],
  ['可設定投注、開獎結果、中獎、Matrix 狀態、Matrix 牌單、獨碰、系統及 Matrix Pro 到期通知。', '可設定選號提醒、開獎結果、Matrix 狀態、Matrix 牌單下載、Matrix Pro 到期、系統通知。'],
  ['開獎結果、Matrix 牌單及獨碰通知可選擇彩種。', '選號提醒、開獎結果、Matrix 牌單下載可依彩種設定。'],
  ['Matrix 狀態、Matrix 牌單及獨碰通知依頁面標示的 Matrix Pro 權限使用。', '部分通知功能需具備 Matrix Pro 權限。'],
  ['方案頁另依各方案顯示 Matrix Core 天衍與 Matrix Core 天工權限。', '依訂閱方案顯示 Matrix 天衍、Matrix 天工權限。'],
  ['系統每5分鐘驗證 Session。', '系統將定期驗證登入狀態。'],
  ['更換手機不影響會員資料與權益。', '會員資料與權益依 LINE 帳號同步。'],
  ['近10期開獎號碼可進入更多紀錄。', '近10期開獎號碼，點選查看更多紀錄，可查閱歷史開獎號碼。'],
  ['前往「我的」中的「會員方案／收費標準」，查看方案、期間與權限。', '前往「我的」中的「Matrix Pro 方案與收費標準」。'],
];
for (const [from, to] of guideReplacements) feature = replaceOnce(feature, from, to, `guide: ${from.slice(0, 18)}`);
feature = replaceOnce(feature, '{ title: "結果說明", items: ["探索結果依歷史資料與所選條件產生，僅供參考之用，不保證中獎或獲利。"] },', '{ title: "結果說明", items: ["探索結果依歷史資料與所選條件產生，僅供參考，不代表中獎、獲利或任何結果之保證。"] },', 'guide result disclaimer');
feature = replaceOnce(feature, '{ title: "基本導覽", items: ["首頁：查看四彩種最新的資訊與主要功能入口。", "快捷：開啟已設定的功能；長按三秒可變更快捷設定。", "通知：設定各類通知。", "我的：查看訂閱、推廣、系統及法律資訊。"] },', '{ title: "基本導覽", items: ["首頁：查看四彩種最新的資訊與主要功能入口。", "Matrix 狀態：查看四彩種目前觸發的狀態與相關資訊。", "快捷：開啟已設定的功能；長按三秒可變更快捷設定。", "通知：設定各類型的推播通知。", "我的：查看 Matrix Pro 訂閱、推薦、系統及法律資訊。"] },\n        { title: "Matrix Pro", items: ["Matrix Pro 提供更多探索功能及會員權限。", "功能開放內容依目前會員狀態顯示。"] },', 'guide newbie Matrix Pro block');

// 會員方案權限格式與自訂觸發條件。
feature = replaceOnce(feature, 'features: ["Matrix 狀態　進階資訊", "Matrix 探索期數　十三期", "Matrix 探索範圍　完整範圍", "Matrix Pro 專屬推播通知"]', 'features: ["Matrix 狀態 - 進階資訊", "Matrix 狀態 - 自訂觸發條件", "Matrix 探索 - 十三期", "Matrix 探索 - 完整範圍", "Matrix Pro - 專屬推播通知"]', 'monthly plan feature format');
feature = replaceOnce(feature, 'features: ["Matrix Core　天衍", "Matrix 狀態　進階資訊", "Matrix 探索期數　十三期", "Matrix 探索範圍　完整範圍", "Matrix Pro 專屬推播通知"]', 'features: ["Matrix 天衍 - 使用權限", "Matrix 狀態 - 進階資訊", "Matrix 狀態 - 自訂觸發條件", "Matrix 探索 - 十三期", "Matrix 探索 - 完整範圍", "Matrix Pro - 專屬推播通知"]', 'quarter plan feature format');
feature = replaceOnce(feature, 'features: ["Matrix Core　天衍", "Matrix Core　天工", "Matrix 狀態　進階資訊", "Matrix 探索期數　十三期", "Matrix 探索範圍　完整範圍", "Matrix Pro 專屬推播通知"]', 'features: ["Matrix 天衍 - 使用權限", "Matrix 天工 - 使用權限", "Matrix 狀態 - 進階資訊", "Matrix 狀態 - 自訂觸發條件", "Matrix 探索 - 十三期", "Matrix 探索 - 完整範圍", "Matrix Pro - 專屬推播通知"]', 'annual plan feature format');

// 我的：移除獨立邀請好友入口，整合至推薦碼／啟動碼頁。
feature = replaceOnce(feature, '["我的推薦碼/啟動碼", "activation-code"], ["邀請好友", "invite-friends"], ["優惠活動", "promotions"]', '["我的推薦碼/啟動碼", "activation-code"], ["優惠活動", "promotions"]', 'remove invite friends menu');
const activationPage = String.raw`function ActivationCodePage({ onNavigate }: { onNavigate: Navigate }) {
  const [referralCode, setReferralCode] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [activationOpen, setActivationOpen] = useState(false);
  const referralSuccessCount = 0;
  return (
    <ProfileDetailShell title="我的推薦碼/啟動碼" onNavigate={onNavigate}>
      <section className="panel referral-card">
        <h2>我的推薦碼</h2>
        <div className="my-referral-code" aria-label="我的推薦碼">—</div>
        <p className="referral-success-count">推薦成功 {referralSuccessCount} 人</p>
        <div className="code-entry-block"><label htmlFor="referral-code">輸入推薦碼</label><input id="referral-code" value={referralCode} onChange={(event) => setReferralCode(event.target.value)} aria-label="推薦碼" /><button type="button" className="gold-button">確認</button></div>
      </section>
      <DetailCard title="推薦成功認定"><DetailList items={["每個 LINE 帳號，僅能輸入一次推薦碼。", "輸入推薦碼的帳號，完成訂閱 Matrix Pro 月方案、季方案或年方案任一方案後，該筆推薦即計為「推薦成功」。", "若該筆訂閱後續發生退款、刷退或交易取消，該筆推薦成功將失效，推薦成功人數同步扣除，相關獎勵資格，將依最新推薦成功人數重新計算。"]} /></DetailCard>
      <DetailCard title="推薦成功獎勵"><DetailList items={["推薦成功滿 10 人：Matrix 探索期數 (七期) 開放日：每週二、五開放變為每週一、二、四、五。", "推薦成功滿 15 人：Matrix 探索期數 (七期)：永久開放。", "推薦成功滿 30 人：Matrix 探索範圍 (完整範圍)：由不開放變為每週二、五開放。", "推薦成功滿 50 人：Matrix 探索範圍 (完整範圍)：永久開放。"]} /></DetailCard>
      <DetailCard title="推薦獎勵補充規則"><DetailList items={["推薦獎勵不需本人訂閱 Matrix Pro。", "當達成對應的推薦成功人數門檻後，即可使用已解鎖的 Matrix 探索權限。", "若因退款、刷退或交易取消等情況，導致推薦成功人數低於原獎勵門檻：已取得的對應獎勵將同步取消。並依最新的推薦成功人數，重新計算資格與獎勵。", "樂彩 Matrix 保留活動內容、參加資格、獎勵內容、活動規則、資格認定、發放方式、終止、修改、解釋及最終決定之權利。"]} /></DetailCard>
      <DetailCard title="邀請好友"><p>推薦碼/邀請碼尚未提供。</p></DetailCard>
      <section className="panel activation-card"><button type="button" className="activation-toggle" aria-expanded={activationOpen} aria-controls="activation-code-entry" onClick={() => setActivationOpen((current) => !current)}><span>啟動碼</span><ChevronDownIcon aria-hidden="true" /></button>{activationOpen ? <div className="code-entry-block" id="activation-code-entry"><label htmlFor="activation-code">輸入啟動碼</label><input id="activation-code" value={activationCode} onChange={(event) => setActivationCode(event.target.value)} aria-label="啟動碼" /><button type="button" className="gold-button">確認</button><section className="activation-instructions" aria-labelledby="activation-instructions-title"><h3 id="activation-instructions-title">啟動碼使用說明</h3><ul><li>啟動碼以增加 Matrix Pro 訂閱天數為主要功能。</li><li>每組啟動碼只能成功使用一次。</li><li>啟動成功後，該組啟動碼立即標記為已使用。</li></ul></section></div> : null}</section>
    </ProfileDetailShell>
  );
}

`;
feature = replaceRegexOnce(feature, /function ActivationCodePage\([\s\S]*?\n\}\n\nfunction InviteFriendsPage/, activationPage + 'function InviteFriendsPage', 'activation and referral page');

// 關於、服務內容與法律頁面。
const aboutPage = String.raw`function AboutMatrixPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="關於 樂彩 Matrix" onNavigate={onNavigate}><section className="panel about-matrix-card"><p className="about-welcome">歡迎使用 樂彩 Matrix。</p><p>樂彩 Matrix 致力於提供清晰、直覺且易於使用的開獎資料查詢與分析服務，協助使用者快速查閱公開資訊、整理歷史數據，並透過多項分析功能，提升資料檢視效率。</p><p>我們持續優化介面設計與操作體驗，整合各項分析工具，讓不同需求的使用者都能以更簡單、更流暢的方式使用各項功能。</p><h2>我們的理念</h2><p>我們重視資料整理、操作效率與使用體驗，持續改善介面細節與功能品質，希望提供穩定、且容易使用的分析工具，讓每一次資料查詢都更加便利。</p><p className="about-thanks">感謝您對 樂彩 Matrix 的支持與使用！</p><div className="about-brand-info"><p><span>品牌名稱：</span>樂彩 Matrix</p><p>Copyright © 2026 樂彩 Matrix. All Rights Reserved.</p></div></section></ProfileDetailShell>;
}

`;
feature = replaceRegexOnce(feature, /function AboutMatrixPage\([\s\S]*?\n\}\n\nfunction ActivationCodePage/, aboutPage + 'function ActivationCodePage', 'about page');
const servicePage = String.raw`function ServiceInfoPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="服務內容與使用說明" onNavigate={onNavigate}><DetailCard title="1. 服務名稱"><p>樂彩 Matrix</p></DetailCard><DetailCard title="2. 服務形式"><p>樂彩 Matrix 為可安裝於手機桌面的 PWA 服務。</p></DetailCard><DetailCard title="3. 主要功能"><DetailList items={["Matrix Core", "　Matrix 探索", "　Matrix 天衍", "　Matrix 天工", "Matrix 狀態", "Matrix 同星", "號碼對照單", "連碰立柱計算機", "Matrix 牌單", "Matrix 指南", "歷史開獎號碼", "Matrix 筆記本"]} /></DetailCard><DetailCard title="4. 支援彩種"><DetailList items={["今彩539", "天天樂", "六合彩", "大樂透"]} /></DetailCard><DetailCard title="5. 使用方式"><p>使用者透過 LINE 登入後，可查看會員資訊、訂閱資訊及目前帳號可使用的功能。</p><p>不同會員狀態可使用的功能及權限，依目前帳號顯示為準。</p></DetailCard><DetailCard title="6. 探索結果說明"><p>探索結果依歷史資料與所選條件產生，僅供參考，不代表中獎、獲利或任何結果之保證。</p></DetailCard><DetailCard title="7. Matrix Pro 說明"><p>Matrix Pro 為樂彩 Matrix 的付費訂閱方案，提供月方案、季方案及年方案。</p><p>使用者可自行選擇是否開啟自動續訂。</p><p>實際方案價格、訂閱期間、功能權限及目前可使用內容，依「Matrix Pro 方案與收費標準」及帳號顯示為準。</p></DetailCard></ProfileDetailShell>;
}

`;
feature = replaceRegexOnce(feature, /function ServiceInfoPage\([\s\S]*?\n\}\n\nfunction RefundPolicyPage/, servicePage + 'function RefundPolicyPage', 'service info page');
const refundPage = String.raw`function RefundPolicyPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="退款規範" onNavigate={onNavigate}><DetailCard title="一、適用範圍"><p>本退款規範適用於樂彩 Matrix 提供的 Matrix Pro 付費方案。</p><p>Matrix Pro 提供單次訂閱及自動續訂方式，實際付款方式，依使用者訂閱時的選擇為準。</p></DetailCard><DetailCard title="二、自動續訂"><p>使用者可自行選擇是否開啟自動續訂。</p><p>開啟自動續訂後，系統將於目前訂閱方案到期時，依原訂閱方案及續訂當時顯示的價格自動扣款，並延長相對應的 Matrix Pro 訂閱期間。</p><p>使用者可於下一次扣款前，先行關閉自動續訂。關閉自動續訂後，已付款的訂閱期間仍可使用至到期日，期滿後不再自動扣款或續訂。</p><p>關閉自動續訂僅停止下一期扣款，不等同取消目前訂閱或申請退款。</p><p>自動續訂扣款成功後，視為一筆新的 Matrix Pro 訂閱交易；如需申請退款，依本退款規範辦理。</p></DetailCard><DetailCard title="三、七日解除權與數位服務"><p>Matrix Pro 為付款後，提供使用權限的數位服務。</p><p>若付款流程已事先告知，並取得使用者同意立即提供數位內容或線上服務，且服務已開始提供，依法得排除七日解除權，不適用七日無條件解除。</p></DetailCard><DetailCard title="四、可申請退款情形"><DetailList items={["重複付款。", "付款成功但 Matrix Pro 權限未開通。", "因 樂彩 Matrix 系統異常，致已購買的主要服務無法使用。", "其他依法應辦理退款的情形。"]} /></DetailCard><DetailCard title="五、不予退款情形"><DetailList items={["使用者已事先同意立即提供數位服務，且 Matrix Pro 權限已開通並開始使用，依法得排除七日解除權的情形。", "非屬本規範或法律規定應退款的情形。", "關閉自動續訂僅停止下一期扣款，不溯及已完成的當期訂閱交易。"]} /></DetailCard><DetailCard title="六、退款申請方式"><p>請寄送電子郵件至 <a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a>，並提供會員帳號、付款日期、付款金額、訂單或交易資料及退款原因。</p></DetailCard><DetailCard title="七、退款處理"><p>收到申請後，將依付款紀錄、權限開通狀態及服務使用情形進行核對。</p><p>符合退款條件者，退款方式及實際入帳時間，將依原付款方式與金流服務商作業時間辦理。</p></DetailCard><DetailCard title="八、其他"><p>本規範如與中華民國法令的強制或禁止規定不同，依相關法令辦理。</p><p>樂彩 Matrix 保留退款申請資料核對、交易狀態確認及退款資格認定之權利；退款處理仍依中華民國相關法令及本退款規範辦理。</p></DetailCard></ProfileDetailShell>;
}

`;
feature = replaceRegexOnce(feature, /function RefundPolicyPage\([\s\S]*?\n\}\n\nfunction MerchantInfoPage/, refundPage + 'function MerchantInfoPage', 'refund policy page');
const memberTerms = String.raw`function MemberTermsPage({ onNavigate }: { onNavigate: Navigate }) {
  const sections: Array<[string, React.ReactNode]> = [
    ["第一條　服務範圍", <p>樂彩 Matrix 提供 Matrix 分析、歷史資料查詢、號碼紀錄、計算工具、牌單及通知等功能。</p>],
    ["第二條　會員登入", <p>使用者透過 LINE 登入後使用會員功能。</p>],
    ["第三條　Matrix Pro 訂閱", <><p>Matrix Pro 提供月方案、季方案及年方案。</p><p>使用者可自行選擇是否開啟自動續訂。</p><p>開啟自動續訂後，系統將於目前方案到期時，依原訂閱方案自動續訂並扣款。</p><p>使用者可於方案到期前，先行關閉自動續訂；關閉之後，已付款的 Matrix Pro 仍可使用至到期日，期滿後不再自動續訂。</p></>],
    ["第四條　訂閱方案", <><DetailList items={["月方案：30 天，NT$1,880", "季方案：90 天，NT$4,580", "年方案：365 天，NT$16,800"]} /><p>以上價格，均為新臺幣含稅價格。</p></>],
    ["第五條　啟動碼", <><p>啟動碼用於增加 Matrix Pro 訂閱天數。</p><p>每組啟動碼只能成功使用一次。</p><p>啟動碼有效期限與訂閱期間分開計算。</p></>],
    ["第六條　服務內容", <p>不同會員狀態，可使用的功能及權限，依目前帳號顯示及系統判定為準。</p>],
    ["第七條　探索結果", <p>探索結果依歷史資料與所選條件產生，僅供參考，不代表中獎、獲利或任何結果之保證。</p>],
    ["第八條　退款", <p>退款申請及審核方式，依「退款規範」頁面公告內容辦理。</p>],
    ["第九條　個人資料", <p>會員資料的使用方式依「隱私權政策」頁面內容辦理。</p>],
    ["第十條　其他", <p>樂彩 Matrix 保留服務內容、功能權益、訂閱方案、活動內容、獎勵內容、活動規則、資格認定、發放方式、終止、修改、解釋及最終決定之權利。</p>],
  ];
  return <ProfileDetailShell title="會員服務條例" onNavigate={onNavigate}>{sections.map(([title, content]) => <DetailCard title={title} key={title}>{content}</DetailCard>)}</ProfileDetailShell>;
}

`;
feature = replaceRegexOnce(feature, /function MemberTermsPage\([\s\S]*?\n\}\n\nfunction PrivacyPolicyPage/, memberTerms + 'function PrivacyPolicyPage', 'member terms page');
const privacyPage = String.raw`function PrivacyPolicyPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="隱私權政策" onNavigate={onNavigate}><DetailCard title="1. 蒐集的資料"><DetailList items={["登入 LINE 所提供的帳號識別資料", "Matrix Pro 訂閱狀態", "訂閱到期日", "啟動碼使用紀錄", "推薦碼使用紀錄", "推薦成功人數", "通知設定"]} /></DetailCard><DetailCard title="2. 使用目的"><DetailList items={["會員登入與帳號識別", "顯示會員及訂閱狀態", "Matrix Pro 啟用、續訂及權限管理", "提供使用者已選擇的功能", "推薦活動資格與獎勵管理", "系統通知與服務通知"]} /></DetailCard><DetailCard title="3. 第三方服務"><p>目前已確認使用 LINE 登入。</p><p>實際金流服務商尚未確認，不得自行填寫藍新、綠界或其他業者名稱。</p></DetailCard><DetailCard title="4. 資料使用範圍"><p>蒐集之資料，僅用於本政策所載之使用目的及提供樂彩 Matrix 服務，不會於未經使用者同意或法律另有規定之情況下，提供予第三方。</p></DetailCard><DetailCard title="5. 資料安全"><p>樂彩 Matrix 將採取合理之安全措施保護會員資料，避免未經授權之存取、使用、修改或洩漏。</p></DetailCard><DetailCard title="6. 隱私權政策調整"><p>樂彩 Matrix 保留修改本隱私權政策之權利，更新後將公布於本頁面，並自公告日起生效。</p></DetailCard></ProfileDetailShell>;
}

`;
feature = replaceRegexOnce(feature, /function PrivacyPolicyPage\([\s\S]*?\n\}\n\nfunction DisclaimerPage/, privacyPage + 'function DisclaimerPage', 'privacy policy page');
const disclaimerPage = String.raw`function DisclaimerPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="聲明與免責事項" onNavigate={onNavigate}><DetailCard title="一、服務性質"><p>樂彩 Matrix 提供公開的開獎資料查詢、歷史資料整理、比對、計算及分析工具。</p><p>本服務不提供任何中獎、獲利或特定結果之保證。</p></DetailCard><DetailCard title="二、資訊用途"><p>服務內呈現的資料、分析結果及探索結果僅供參考，不代表任何中獎、獲利或結果之保證。</p><p>使用者應自行判斷是否採用服務所提供的資訊。</p></DetailCard><DetailCard title="三、使用者決定"><p>使用者應自行決定如何使用服務內提供的資料、功能及分析結果，並自行承擔相關決定所產生的結果。</p></DetailCard><DetailCard title="四、資料差異"><p>如服務內資料與官方公布資料不同，請以官方公布資料為準。</p></DetailCard><DetailCard title="五、系統與服務"><p>樂彩 Matrix 不保證服務持續不中斷、完全無錯誤，或所有功能於任何時間皆可正常使用。</p><p>如因系統維護、更新、網路異常、第三方服務或其他原因造成服務中斷、延遲或資料顯示異常，將依實際情況處理。</p></DetailCard><DetailCard title="六、第三方服務"><p>本服務使用 LINE 登入、金流服務或其他第三方服務。</p><p>第三方服務之使用方式、資料處理及服務狀態，依各第三方服務提供者之規定辦理。</p></DetailCard><DetailCard title="七、責任範圍"><p>因使用或無法使用樂彩 Matrix 所提供的資料、功能、分析結果或第三方服務所產生的影響，應依實際情況及相關法令認定。</p></DetailCard><DetailCard title="八、內容調整"><p>樂彩 Matrix 得依服務實際運作需要調整功能、內容及相關說明。</p><p>如涉及會員權益或重要內容調整，將於服務內公告。</p></DetailCard><DetailCard title="九、最終說明"><p>本聲明與免責事項如與中華民國法令的強制或禁止規定不同，依相關法令辦理。</p><p>樂彩 Matrix 保留服務內容、功能說明、資料呈現、規則內容、修改、解釋及最終決定之權利。</p></DetailCard></ProfileDetailShell>;
}

`;
feature = replaceRegexOnce(feature, /function DisclaimerPage\([\s\S]*?\n\}\n\nexport function MatrixStatusPage/, disclaimerPage + 'export function MatrixStatusPage', 'disclaimer page');

// 手機版新增／調整元件樣式。
css += String.raw`

/* 2026-08-08 文件修改：只對應本次指定元件。 */
.road-validation-process { display: grid; gap: 10px; padding: 12px; border-top: 1px solid rgba(102, 169, 255, .28); background: rgba(3, 9, 20, .72); }
.validation-summary-card { position: relative; display: grid; gap: 5px; padding: 10px 76px 10px 10px; border: 1px solid rgba(223, 176, 68, .42); border-radius: 10px; background: rgba(10, 14, 24, .92); }
.validation-summary-card span { display: grid; gap: 4px; font-size: 11px; color: #d9e2ef; }
.validation-summary-card strong { color: #f6c95f; }
.validation-summary-card em { position: absolute; top: 10px; right: 10px; font-style: normal; color: #f6c95f; font-weight: 800; }
.validation-period-block { display: grid; gap: 3px; padding-bottom: 10px; border-bottom: 1px solid rgba(130, 155, 190, .28); }
.validation-period-block:last-child { padding-bottom: 0; border-bottom: 0; }
.validation-period-row { display: grid; grid-template-columns: 54px minmax(0, 1.45fr) minmax(92px, .9fr); gap: 6px; align-items: stretch; }
.validation-period-row > span { min-width: 0; padding: 7px 6px; border: 1px solid rgba(91, 126, 169, .25); border-radius: 7px; background: rgba(8, 15, 27, .82); }
.validation-issue { display: grid; place-items: center; font-size: 11px; color: #aebed2; }
.validation-full-numbers { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
.validation-full-numbers i { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: #edf2f8; color: #111827; font: 700 9px/1 Roboto, sans-serif; }
.validation-formula { display: grid; align-content: center; gap: 2px; font-size: 9px; color: #cbd6e5; }
.validation-formula small { color: #f6c95f; }.validation-formula strong { color: #7ee2a8; }
.tiangong-settings fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }.tiangong-settings legend { margin-bottom: 7px; color: #dbe7f5; font-size: 12px; }
.notebook-create-actions[data-mode='紀錄'] { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
.record-lottery-filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; min-width: 0; margin: 0; }
.record-lottery-filters button { min-width: 0; padding: 7px 2px; border: 1px solid rgba(121, 151, 190, .3); border-radius: 8px; background: rgba(8, 15, 28, .9); color: #9eb0c7; font-size: 10px; }
.record-lottery-filters button[data-selected='true'] { border-color: #d8a933; color: #f6c95f; }
.record-custom-range { display: grid; grid-template-columns: 1fr auto 1fr; gap: 6px; align-items: center; padding: 8px 0; }.record-custom-range input { min-width: 0; }
.record-card-toggle { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; width: 100%; align-items: center; text-align: left; }.record-card-toggle span { display: grid; gap: 2px; }.record-card-toggle em { font-style: normal; }
.record-card-details { display: grid; gap: 10px; padding-top: 10px; }.record-status-actions { display: grid; justify-items: end; gap: 8px; }.record-status-actions button { min-width: 82px; }
.record-date-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; }.record-date-toggle h3 { margin: 0; }
.record-number-and-special { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: start; }.record-number-and-special .record-columns { min-width: 0; }.record-special-picker-button { min-width: 70px; padding: 8px; border: 1px solid rgba(218, 170, 58, .45); border-radius: 9px; background: rgba(25, 18, 5, .8); color: #f5c55a; }.record-special-picker-button span,.record-special-picker-button strong { display: block; }
.notebook-heading-v2 { grid-template-columns: 64px minmax(0, 1fr) !important; }.notebook-heading-v2 > img { width: 64px !important; height: 64px !important; }.notebook-mode-switch button { width: 60px !important; height: 60px !important; }.notebook-mode-switch button img { width: 42px !important; height: 42px !important; }.notebook-create-actions > button { width: auto !important; min-width: 104px; padding-inline: 12px !important; }
.referral-success-count { margin: 8px 0; color: #f3c45c; font-weight: 800; }
.matrix-explore-setting-icon { display: block; width: 24px; height: 24px; flex: 0 0 24px; object-fit: cover; border-radius: 6px; }
.record-play-setting { display: grid; gap: 10px; }.record-play-setting h3 { margin: 0; }.record-play-metrics { display: grid; gap: 8px; }.record-play-metrics > label { display: grid; grid-template-columns: auto minmax(96px, 1fr); gap: 10px; align-items: center; }.record-play-metrics input { min-width: 0; text-align: right; }.record-formula { margin: 0; padding: 9px 10px; border: 1px solid rgba(218, 170, 58, .28); border-radius: 9px; background: rgba(7, 13, 24, .76); line-height: 1.65; color: #cbd6e5; }.record-formula strong,.record-quantity strong,.notebook-stats strong,.record-card-details footer strong { color: #f6c95f; font-variant-numeric: tabular-nums; }.record-quantity { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }.record-quantity > span { min-width: 0; }.record-card-details footer { gap: 8px; }
`;

fs.writeFileSync(featurePath, feature);
fs.writeFileSync(prototypePath, prototype);
fs.writeFileSync(cssPath, css);
console.log('Applied 通知：_1.docx update layer');
