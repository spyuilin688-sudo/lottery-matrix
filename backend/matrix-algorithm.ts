export type MatrixLottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';
export type MatrixNumberOrder = '依號碼由小到大排序' | '依實際開獎順序排序';
export type MatrixAlgorithmType = '加減' | '合值' | '拖牌';
export type MatrixDraw = { period: string; drawDate: string; numbers: string[]; sortedNumbers?: string[]; drawOrderNumbers?: string[] | null };
export type MatrixAlgorithmRequest = { lottery: MatrixLottery; numberOrder: MatrixNumberOrder; lockedPosition: number; lockedNumber: number; lockedSourcePeriod?: string; referenceOffset?: number; referencePosition?: number; predictionDistance: number; ruleCount: 1 | 2; algorithmType: MatrixAlgorithmType };
export type MatrixExploreGroupInput = { lottery: MatrixLottery; numberOrder: MatrixNumberOrder; algorithmType: MatrixAlgorithmType; lockedSourceIndex: number; lockedPosition: number; explorePeriods: 13; exploreDateOffset: 0; exploreRange: '完整範圍'; minPredictionDistance: 1; maxPredictionDistance: 30 };
export type MatrixAlgorithmRule = { value: number; display: string; algorithmType: MatrixAlgorithmType };
export type MatrixValidationRow = { group: string; sourcePeriod: string; sourceNumbers: number[]; sourceSortedNumbers: Array<string | number>; sourceDrawOrderNumbers: Array<string | number> | null; referencePeriod: string; referenceNumbers: number[]; referenceSortedNumbers: Array<string | number>; referenceDrawOrderNumbers: Array<string | number> | null; baseNumber: number; predictionPeriod: string; predictionNumbers: Array<string | number>; candidateRules: number[]; matchedRules: number[]; hitNumbers: number[]; success: boolean };
export type MatrixAlgorithmRuleSet = { rules: MatrixAlgorithmRule[]; predictionNumbers: number[]; historicalValidation: MatrixValidationRow[] };
export type MatrixExploreRow = { id: string; number: string; lockedPosition: number; predictionDistance: number; consecutive: string; highestStreak: number; predictionNumbers: string[]; algorithmType: MatrixAlgorithmType; searchCondition: MatrixAlgorithmRequest; sourceA?: Record<string, unknown>; ruleSets: MatrixAlgorithmRuleSet[] };
export type MatrixValidationDetail = { itemId: string; sourceA?: Record<string, unknown>; ruleSets: MatrixAlgorithmRuleSet[] };
type Lottery = MatrixLottery;
type NumberOrder = MatrixNumberOrder;
type AlgorithmType = MatrixAlgorithmType;
type Draw = MatrixDraw;
type MatrixRequest = MatrixAlgorithmRequest;
type MatrixExploreRequest = { lottery: Lottery; numberOrder: NumberOrder; explorePeriods: 2 | 7 | 13; algorithmType: AlgorithmType; ruleCount: 1 | 2; exploreDateOffset: 0 | 1 | 2; exploreRange: '標準範圍' | '完整範圍'; minPredictionDistance: number; maxPredictionDistance: number };
type CandidateGroup = { group: string; source: Draw; reference: Draw; prediction: Draw; baseNumber: number; lockedBaseNumber: number; candidateMap: Map<string, number[]> };

const lotteries: Lottery[] = ['今彩539', '天天樂', '六合彩', '大樂透'];
const numberOrders: NumberOrder[] = ['依號碼由小到大排序', '依實際開獎順序排序'];
const algorithmTypes: AlgorithmType[] = ['加減', '合值', '拖牌'];
const MAX_VALIDATION_STREAK = 13;

export function normalizeMatrixNumber(value: number, maxNumber: number) {
  return ((value - 1) % maxNumber + maxNumber) % maxNumber + 1;
}

function maxNumber(lottery: Lottery) { return lottery === '今彩539' || lottery === '天天樂' ? 39 : 49; }
function ballCount(lottery: Lottery) { return lottery === '今彩539' || lottery === '天天樂' ? 5 : 7; }
function integer(value: unknown, name: string) { const parsed = Number(value); if (!Number.isInteger(parsed)) throw new Error(name + '必須為整數'); return parsed; }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('請提供完整演算法條件'); return value as Record<string, unknown>; }

function parseRequest(input: unknown): MatrixRequest {
  const body = record(input);
  const lottery = String(body.lottery ?? '') as Lottery;
  const numberOrderInput = String(body.numberOrder ?? '');
  const algorithmTypeInput = String(body.algorithmType ?? '');
  const numberOrder = (numberOrderInput === '依號碼由小到大' ? '依號碼由小到大排序' : numberOrderInput === '依實際開獎順序' ? '依實際開獎順序排序' : numberOrderInput) as NumberOrder;
  const algorithmType = (algorithmTypeInput === '加減版路' ? '加減' : algorithmTypeInput === '合值版路' ? '合值' : algorithmTypeInput === '拖牌版路' ? '拖牌' : algorithmTypeInput) as AlgorithmType;
  if (!lotteries.includes(lottery)) throw new Error('未知彩種');
  if (!numberOrders.includes(numberOrder)) throw new Error('未知號碼順序');
  if (!algorithmTypes.includes(algorithmType)) throw new Error('未知版路類型');
  const lockedPosition = integer(body.lockedPosition, '鎖定位置');
  const lockedNumber = integer(body.lockedNumber, '鎖定號碼');
  const predictionDistance = integer(body.predictionDistance, '預測期距離');
  const ruleCount = integer(body.ruleCount, '規則數量');
  const count = ballCount(lottery);
  const max = maxNumber(lottery);
  if (lockedPosition < 1 || lockedPosition > count) throw new Error('鎖定位置超出彩種位置範圍');
  if (lockedNumber < 1 || lockedNumber > max) throw new Error('鎖定號碼超出彩種號碼範圍');
  if (predictionDistance < 1) throw new Error('預測期距離必須大於0');
  if (ruleCount !== 1 && ruleCount !== 2) throw new Error('規則數量只能是一碼或二碼');
  if (algorithmType === '拖牌') return { lottery, numberOrder, lockedPosition, lockedNumber, predictionDistance, ruleCount, algorithmType };
  const referenceOffset = integer(body.referenceOffset, '參照位移');
  const referencePosition = integer(body.referencePosition, '參照位置');
  if (referencePosition < 1 || referencePosition > count) throw new Error('參照位置超出彩種位置範圍');
  if (referenceOffset >= predictionDistance) throw new Error('參照期不得等於或晚於預測期');
  return { lottery, numberOrder, lockedPosition, lockedNumber, referenceOffset, referencePosition, predictionDistance, ruleCount, algorithmType };
}

function orderedNumbers(draw: Draw, lottery: Lottery, order: NumberOrder) {
  if (order === '依實際開獎順序排序') return Array.isArray(draw.drawOrderNumbers) && draw.drawOrderNumbers.length === ballCount(lottery) ? draw.drawOrderNumbers.map(Number) : [];
  if (Array.isArray(draw.sortedNumbers) && draw.sortedNumbers.length === ballCount(lottery)) return draw.sortedNumbers.map(Number);
  const values = draw.numbers.map(Number);
  if (ballCount(lottery) === 7) return [...values.slice(0, 6).sort((a, b) => a - b), values[6]];
  return [...values].sort((a, b) => a - b);
}

function numberAt(draw: Draw, lottery: Lottery, order: NumberOrder, position: number) {
  const value = orderedNumbers(draw, lottery, order)[position - 1];
  return Number.isInteger(value) ? value : null;
}

function baseForSource(history: Draw[], sourceIndex: number, request: MatrixRequest) {
  if (request.algorithmType === '拖牌') {
    const base = numberAt(history[sourceIndex], request.lottery, request.numberOrder, request.lockedPosition);
    return base === null ? null : { reference: history[sourceIndex], baseNumber: base };
  }
  const referenceIndex = sourceIndex + (request.referenceOffset ?? 0);
  if (referenceIndex < 0 || referenceIndex >= history.length) return null;
  const reference = history[referenceIndex];
  const base = numberAt(reference, request.lottery, request.numberOrder, request.referencePosition ?? 0);
  return base === null ? null : { reference, baseNumber: base };
}

function candidateRule(algorithmType: AlgorithmType, baseNumber: number, targetNumber: number, max: number) {
  if (algorithmType === '合值') return normalizeMatrixNumber(baseNumber + targetNumber, max);
  return (targetNumber - baseNumber + max) % max;
}

function applyRule(algorithmType: AlgorithmType, baseNumber: number, rule: number, max: number) {
  if (algorithmType === '合值') return normalizeMatrixNumber(rule - baseNumber, max);
  return normalizeMatrixNumber(baseNumber + rule, max);
}

function typedRuleKey(algorithmType: AlgorithmType, value: number) { return algorithmType + ':' + value; }
function typedRuleParts(key: string) { const separator = key.indexOf(':'); return { algorithmType: key.slice(0, separator) as AlgorithmType, value: Number(key.slice(separator + 1)) }; }
function addTypedRule(map: Map<string, number[]>, algorithmType: AlgorithmType, value: number, target: number) { const key = typedRuleKey(algorithmType, value); const targets = map.get(key) ?? []; if (!targets.includes(target)) targets.push(target); map.set(key, targets); }

function groupName(index: number) {
  const code = 66 + index;
  return code <= 90 ? String.fromCharCode(code) : 'B' + String(index + 1);
}

function buildCandidateGroup(history: Draw[], sourceIndex: number, request: MatrixRequest, group: string): CandidateGroup | null {
  const predictionIndex = sourceIndex + request.predictionDistance;
  if (predictionIndex < 0 || predictionIndex >= history.length) return null;
  const base = baseForSource(history, sourceIndex, request);
  if (!base) return null;
  const source = history[sourceIndex];
  const lockedBaseNumber = numberAt(source, request.lottery, request.numberOrder, request.lockedPosition);
  if (lockedBaseNumber === null) return null;
  const max = maxNumber(request.lottery);
  const prediction = history[predictionIndex];
  const candidateMap = new Map<string, number[]>();
  const lockedConditionIsArithmeticReference = request.referenceOffset === 0 && request.referencePosition === request.lockedPosition;
  for (const target of prediction.numbers.map(Number)) {
    const dragRule = candidateRule('拖牌', lockedBaseNumber, target, max);
    if (request.algorithmType === '拖牌') addTypedRule(candidateMap, '拖牌', dragRule, target);
    else {
      const rule = candidateRule(request.algorithmType, base.baseNumber, target, max);
      if (request.algorithmType === '加減' && rule === 0) addTypedRule(candidateMap, '拖牌', 0, target);
      else if (!(request.algorithmType === '加減' && lockedConditionIsArithmeticReference)) addTypedRule(candidateMap, request.algorithmType, rule, target);
      if (request.ruleCount === 2) addTypedRule(candidateMap, '拖牌', dragRule, target);
    }
  }
  return { group, source, reference: base.reference, prediction, baseNumber: base.baseNumber, lockedBaseNumber, candidateMap };
}

function streak(groups: CandidateGroup[], rules: string[]) {
  let count = 0;
  for (const group of groups) {
    if (!rules.some(rule => group.candidateMap.has(rule))) break;
    count += 1;
  }
  return count;
}

function twoRuleCoverage(groups: CandidateGroup[], rules: string[], streakLength: number) {
  const covered = groups.slice(0, streakLength);
  const hitIndexes = rules.map(rule => covered.flatMap((group, index) => group.candidateMap.has(rule) ? [index] : []));
  const valid = hitIndexes.every(indexes => indexes.length > 0 && (indexes.length > 1 || (indexes[0] > 0 && indexes[0] < streakLength - 1)));
  const hitCounts = hitIndexes.map(indexes => indexes.length).sort((a, b) => a - b);
  return { valid, hitCounts };
}

function highestRuleSets(groups: CandidateGroup[], ruleCount: 1 | 2) {
  const candidates = [...new Set(groups.flatMap(group => [...group.candidateMap.keys()]))].sort();
  let highest = 0;
  let bestMinimumHits = 0;
  let bestMaximumHits = 0;
  const sets: string[][] = [];
  const consider = (rules: string[]) => {
    const current = streak(groups, rules);
    if (current === 0) return;
    const coverage = ruleCount === 2 ? twoRuleCoverage(groups, rules, current) : { valid: true, hitCounts: [current, current] };
    if (!coverage.valid) return;
    const minimumHits = coverage.hitCounts[0] ?? 0;
    const maximumHits = coverage.hitCounts[coverage.hitCounts.length - 1] ?? minimumHits;
    const better = current > highest || (current === highest && (minimumHits > bestMinimumHits || (minimumHits === bestMinimumHits && maximumHits > bestMaximumHits)));
    const equal = current === highest && minimumHits === bestMinimumHits && maximumHits === bestMaximumHits;
    if (better) { highest = current; bestMinimumHits = minimumHits; bestMaximumHits = maximumHits; sets.length = 0; sets.push(rules); }
    else if (equal) sets.push(rules);
  };
  if (ruleCount === 1) for (const candidate of candidates) consider([candidate]);
  else for (let first = 0; first < candidates.length; first += 1) for (let second = first + 1; second < candidates.length; second += 1) consider([candidates[first], candidates[second]]);
  return { highest, sets };
}

function validation(groups: CandidateGroup[], rules: string[], request: MatrixRequest) {
  const rows: MatrixValidationRow[] = [];
  for (const group of groups) {
    const matchedRuleKeys = rules.filter(rule => group.candidateMap.has(rule));
    const hitNumbers = [...new Set(matchedRuleKeys.flatMap(rule => group.candidateMap.get(rule) ?? []))].sort((a, b) => a - b);
    const success = matchedRuleKeys.length > 0;
    const candidateRules = [...new Set([...group.candidateMap.keys()].map(rule => typedRuleParts(rule).value))].sort((a, b) => a - b);
    const matchedRules = matchedRuleKeys.map(rule => typedRuleParts(rule).value);
    rows.push({ group: group.group, sourcePeriod: group.source.period, sourceNumbers: orderedNumbers(group.source, request.lottery, request.numberOrder), sourceSortedNumbers: group.source.sortedNumbers ?? group.source.numbers, sourceDrawOrderNumbers: group.source.drawOrderNumbers ?? null, referencePeriod: group.reference.period, referenceNumbers: orderedNumbers(group.reference, request.lottery, request.numberOrder), referenceSortedNumbers: group.reference.sortedNumbers ?? group.reference.numbers, referenceDrawOrderNumbers: group.reference.drawOrderNumbers ?? null, baseNumber: group.baseNumber, predictionPeriod: group.prediction.period, predictionNumbers: group.prediction.sortedNumbers ?? group.prediction.numbers, candidateRules, matchedRules, hitNumbers, success });
    if (!success) break;
  }
  return rows;
}

function ruleLabel(algorithmType: AlgorithmType, value: number) { return algorithmType === '合值' ? String(value) : '+' + String(value); }

function matchingSourceIndexes(request: MatrixRequest, history: Draw[]) {
  return history
    .map((draw, index) => ({ draw, index }))
    .filter((item) => numberAt(
      item.draw, request.lottery, request.numberOrder, request.lockedPosition,
    ) === request.lockedNumber)
    .map((item) => item.index);
}

function evaluatePreparedMatrixAlgorithm(
  request: MatrixRequest,
  history: Draw[],
  sourceIndexes: number[],
  requestedSourceIndex?: number,
) {
  if (sourceIndexes.length === 0) return { valid: false, reason: '找不到符合鎖定條件的來源期', searchCondition: request, results: [] };
  const exactSourceIndex = request.lockedSourcePeriod
    ? requestedSourceIndex ?? history.findIndex((draw) => draw.period === request.lockedSourcePeriod)
    : -1;
  const aIndex = request.lockedSourcePeriod ? exactSourceIndex : sourceIndexes[sourceIndexes.length - 1];
  if (aIndex < 0 || !sourceIndexes.includes(aIndex)) return { valid: false, reason: '找不到指定鎖定條件來源期', searchCondition: request, results: [] };
  const aBase = baseForSource(history, aIndex, request);
  if (!aBase) return { valid: false, reason: 'A組找不到完整參照期或參照位置號碼', searchCondition: request, results: [] };
  const historicalIndexes = sourceIndexes.filter((index) => index < aIndex).reverse();
  const groups: CandidateGroup[] = [];
  const countedPredictionPeriods = new Set<string>();
  for (const sourceIndex of historicalIndexes) {
    const predictionIndex = sourceIndex + request.predictionDistance;
    if (predictionIndex >= history.length) continue;
    const group = buildCandidateGroup(history, sourceIndex, request, groupName(groups.length));
    if (!group) break;
    if (request.ruleCount === 2 && countedPredictionPeriods.has(group.prediction.period)) continue;
    countedPredictionPeriods.add(group.prediction.period);
    groups.push(group);
    if (groups.length >= MAX_VALIDATION_STREAK) break;
  }
  if (groups.length === 0) return { valid: false, reason: '沒有可完成歷史驗證的來源組', searchCondition: request, results: [] };
  const found = highestRuleSets(groups, request.ruleCount);
  if (found.highest === 0 || found.sets.length === 0) return { valid: false, reason: '找不到成立規則', searchCondition: request, results: [] };
  const max = maxNumber(request.lottery);
  const predictionIndex = aIndex + request.predictionDistance;
  const aPrediction = predictionIndex >= 0 && predictionIndex < history.length ? history[predictionIndex] : null;
  const resultSets = found.sets.map(rules => {
    const parsedRules = rules.map(rule => typedRuleParts(rule));
    const predictions = [...new Set(parsedRules.map(rule => applyRule(rule.algorithmType, rule.algorithmType === '拖牌' ? request.lockedNumber : aBase.baseNumber, rule.value, max)))].sort((a, b) => a - b);
    return { rules: parsedRules.map(rule => ({ value: rule.value, display: ruleLabel(rule.algorithmType, rule.value), algorithmType: rule.algorithmType })), predictionNumbers: predictions, historicalValidation: validation(groups, rules, request) };
  });
  if (request.ruleCount === 2 && resultSets.length > 1) {
    const distinctRules = [...new Set(found.sets.flat())].sort();
    const conflictingRules = distinctRules.map(rule => typedRuleParts(rule).value);
    if (distinctRules.length > 2) return { valid: false, reason: '相同連準層級需要三個以上規則才能覆蓋全部歷史驗證組，整筆版路無效，不得輸出', searchCondition: request, highestStreak: found.highest, displayStreak: '準' + found.highest + '進' + (found.highest + 1), conflictingRules, results: [] };
    const merged = [...new Set(resultSets.flatMap(item => item.predictionNumbers))].sort((a, b) => a - b);
    if (merged.length > 2) return { valid: false, reason: '相同連準層級需要三個以上規則才能覆蓋全部歷史驗證組，整筆版路無效，不得輸出', searchCondition: request, highestStreak: found.highest, displayStreak: '準' + found.highest + '進' + (found.highest + 1), conflictingRules: distinctRules, results: [] };
    return { valid: true, searchCondition: request, highestStreak: found.highest, displayStreak: '準' + found.highest + '進' + (found.highest + 1), sourceA: { sourcePeriod: history[aIndex].period, sourceNumbers: orderedNumbers(history[aIndex], request.lottery, request.numberOrder), sourceSortedNumbers: history[aIndex].sortedNumbers ?? history[aIndex].numbers, sourceDrawOrderNumbers: history[aIndex].drawOrderNumbers ?? null, referencePeriod: aBase.reference.period, baseNumber: aBase.baseNumber, predictionPeriod: aPrediction?.period ?? null, predictionCompleted: Boolean(aPrediction) }, predictionNumbers: merged, ruleSets: resultSets };
  }
  return { valid: true, searchCondition: request, highestStreak: found.highest, displayStreak: '準' + found.highest + '進' + (found.highest + 1), sourceA: { sourcePeriod: history[aIndex].period, sourceNumbers: orderedNumbers(history[aIndex], request.lottery, request.numberOrder), sourceSortedNumbers: history[aIndex].sortedNumbers ?? history[aIndex].numbers, sourceDrawOrderNumbers: history[aIndex].drawOrderNumbers ?? null, referencePeriod: aBase.reference.period, baseNumber: aBase.baseNumber, predictionPeriod: aPrediction?.period ?? null, predictionCompleted: Boolean(aPrediction) }, results: resultSets };
}

function evaluateMatrixAlgorithm(request: MatrixRequest, newestFirst: Draw[]) {
  const history = [...newestFirst].reverse();
  if (request.numberOrder === '依實際開獎順序排序') { const missing = history.filter(draw => !Array.isArray(draw.drawOrderNumbers) || draw.drawOrderNumbers.length !== ballCount(request.lottery)); if (missing.length > 0) return { valid: false, reason: '實際開獎順序（落球）資料不完整，不得以順球資料代替', searchCondition: request, missingDrawOrderCount: missing.length, missingDrawOrderPeriods: missing.slice(-20).map(draw => draw.period), results: [] }; }
  return evaluatePreparedMatrixAlgorithm(request, history, matchingSourceIndexes(request, history));
}

export function runMatrixAlgorithmWithHistory(input: unknown, newestFirst: Draw[]) {
  return evaluateMatrixAlgorithm(parseRequest(input), newestFirst);
}

function parseExploreRequest(input: unknown): MatrixExploreRequest {
  const body = record(input); const lottery = String(body.lottery ?? '') as Lottery; const numberOrderInput = String(body.numberOrder ?? ''); const algorithmTypeInput = String(body.algorithmType ?? body.roadType ?? '');
  const numberOrder = (numberOrderInput === '依號碼由小到大' ? '依號碼由小到大排序' : numberOrderInput === '依實際開獎順序' ? '依實際開獎順序排序' : numberOrderInput) as NumberOrder;
  const algorithmType = (algorithmTypeInput === '加減版路' ? '加減' : algorithmTypeInput === '合值版路' ? '合值' : algorithmTypeInput === '拖牌版路' ? '拖牌' : algorithmTypeInput) as AlgorithmType;
  const periodDigits = String(body.explorePeriods ?? body.period ?? '').replace(/\D/g, ''); const explorePeriods = Number(periodDigits) as 2 | 7 | 13; const hitText = String(body.hitCondition ?? body.hit ?? ''); const ruleCount = Number(body.ruleCount ?? (hitText.includes('鎖定2碼') ? 2 : 1)) as 1 | 2; const dateText = String(body.exploreDate ?? '本日'); const exploreDateOffset = Number(body.exploreDateOffset ?? (dateText.includes('前日') ? 2 : dateText.includes('昨日') ? 1 : 0)) as 0 | 1 | 2; const exploreRange = String(body.exploreRange ?? '標準範圍') as MatrixExploreRequest['exploreRange']; const minPredictionDistance = integer(body.minPredictionDistance, '最小預測期距離'); const maxPredictionDistance = integer(body.maxPredictionDistance, '最大預測期距離');
  if (!lotteries.includes(lottery)) throw new Error('未知彩種'); if (!numberOrders.includes(numberOrder)) throw new Error('未知號碼順序'); if (!algorithmTypes.includes(algorithmType)) throw new Error('未知版路類型'); if (![2,7,13].includes(explorePeriods)) throw new Error('探索期數只能是二期、七期或十三期'); if (ruleCount !== 1 && ruleCount !== 2) throw new Error('命中條件只能是鎖定1碼或鎖定2碼'); if (![0,1,2].includes(exploreDateOffset)) throw new Error('探索日期只能是本日、昨日或前日'); if (exploreRange !== '標準範圍' && exploreRange !== '完整範圍') throw new Error('探索範圍只能是標準範圍或完整範圍'); if (minPredictionDistance < 1) throw new Error('最小預測期距離必須大於0'); if (maxPredictionDistance < minPredictionDistance) throw new Error('最大預測期距離不得小於最小預測期距離'); return { lottery, numberOrder, explorePeriods, algorithmType, ruleCount, exploreDateOffset, exploreRange, minPredictionDistance, maxPredictionDistance };
}

export function runMatrixAutomaticExploreWithHistory(input: unknown, newestFirst: Draw[]) {
  const explore = parseExploreRequest(input); const anchorHistory = newestFirst.slice(explore.exploreDateOffset); const lockSources = anchorHistory.slice(0, explore.explorePeriods); const count = ballCount(explore.lottery); const referenceBack = explore.exploreRange === '完整範圍' ? 14 : 7; const results: Array<Record<string, unknown>> = []; const seen = new Set<string>();
  for (let lockedPosition = 1; lockedPosition <= count; lockedPosition += 1) for (const source of lockSources) { const lockedNumber = numberAt(source, explore.lottery, explore.numberOrder, lockedPosition); if (lockedNumber === null) continue; for (let predictionDistance = explore.minPredictionDistance; predictionDistance <= explore.maxPredictionDistance; predictionDistance += 1) { const offsets = explore.algorithmType === '拖牌' ? [0] : Array.from({ length: referenceBack + predictionDistance }, (_, index) => index - referenceBack).filter(offset => offset < predictionDistance); const positions = explore.algorithmType === '拖牌' ? [lockedPosition] : Array.from({ length: count }, (_, index) => index + 1); for (const referenceOffset of offsets) for (const referencePosition of positions) { const request: MatrixRequest = { lottery: explore.lottery, numberOrder: explore.numberOrder, lockedPosition, lockedNumber, predictionDistance, ruleCount: explore.ruleCount, algorithmType: explore.algorithmType, ...(explore.algorithmType === '拖牌' ? {} : { referenceOffset, referencePosition }) }; const evaluated = evaluateMatrixAlgorithm(request, anchorHistory); if (!evaluated.valid || !evaluated.highestStreak) continue; const minimumStreak = explore.ruleCount === 1 ? 4 : 5; if (evaluated.highestStreak < minimumStreak) continue; const predictionNumbers = [...new Set((evaluated.predictionNumbers ?? evaluated.results?.flatMap(item => item.predictionNumbers) ?? []).map(Number))].sort((a, b) => a - b); if (predictionNumbers.length < 1 || predictionNumbers.length > 2) continue; const key = [lockedPosition, lockedNumber, referenceOffset, referencePosition, predictionDistance, explore.algorithmType, explore.ruleCount, evaluated.highestStreak, predictionNumbers.join('.')].join('|'); if (seen.has(key)) continue; seen.add(key); results.push({ id: key, number: String(lockedNumber).padStart(2, '0'), lockedPosition, predictionDistance, consecutive: evaluated.displayStreak, highestStreak: evaluated.highestStreak, predictionNumbers: predictionNumbers.map(value => String(value).padStart(2, '0')), algorithmType: explore.algorithmType, searchCondition: request, sourceA: evaluated.sourceA, ruleSets: evaluated.results ?? evaluated.ruleSets ?? [] }); } } }
  results.sort((left, right) => Number(right.highestStreak) - Number(left.highestStreak) || Number(left.predictionDistance) - Number(right.predictionDistance) || Number(left.lockedPosition) - Number(right.lockedPosition)); const duplicate = new Map<string, number>(); for (const result of results) for (const number of result.predictionNumbers as string[]) duplicate.set(number, (duplicate.get(number) ?? 0) + 1); const duplicateStats = [...duplicate.entries()].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0])).map(([number, countValue]) => ({ number, count: countValue })); return { searchCondition: explore, resultCount: results.length, duplicateStats, results };
}

export function runMatrixExploreGroupWithHistory(input: MatrixExploreGroupInput, newestFirst: Draw[]) {
  const count = ballCount(input.lottery);
  if (!numberOrders.includes(input.numberOrder)) throw new Error('未知號碼順序');
  if (!algorithmTypes.includes(input.algorithmType)) throw new Error('未知版路類型');
  if (!Number.isInteger(input.lockedSourceIndex) || input.lockedSourceIndex < 0 || input.lockedSourceIndex >= Math.min(13, newestFirst.length)) throw new Error('鎖定來源期超出前十三期');
  if (!Number.isInteger(input.lockedPosition) || input.lockedPosition < 1 || input.lockedPosition > count) throw new Error('鎖定位置超出彩種位置範圍');
  const source = newestFirst[input.lockedSourceIndex];
  const lockedNumber = numberAt(source, input.lottery, input.numberOrder, input.lockedPosition);
  if (lockedNumber === null) return { results: [] };
  const history = [...newestFirst].reverse();
  if (input.numberOrder === '依實際開獎順序排序') {
    const missing = history.some((draw) => (
      !Array.isArray(draw.drawOrderNumbers) || draw.drawOrderNumbers.length !== count
    ));
    if (missing) return { results: [] };
  }
  const sourceRequest = {
    lottery: input.lottery,
    numberOrder: input.numberOrder,
    lockedPosition: input.lockedPosition,
    lockedNumber,
  } as MatrixRequest;
  const sourceIndexes = matchingSourceIndexes(sourceRequest, history);
  const requestedSourceIndex = history.length - input.lockedSourceIndex - 1;
  const referenceBack = 14;
  const results: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const ruleCount of [1, 2] as const) {
    for (let predictionDistance = input.minPredictionDistance; predictionDistance <= input.maxPredictionDistance; predictionDistance += 1) {
      const offsets = input.algorithmType === '拖牌'
        ? [0]
        : Array.from({ length: referenceBack + predictionDistance }, (_, index) => index - referenceBack).filter((offset) => offset < predictionDistance);
      const positions = input.algorithmType === '拖牌'
        ? [input.lockedPosition]
        : Array.from({ length: count }, (_, index) => index + 1);
      for (const referenceOffset of offsets) for (const referencePosition of positions) {
        const request: MatrixRequest = {
          lottery: input.lottery,
          numberOrder: input.numberOrder,
          lockedPosition: input.lockedPosition,
          lockedNumber,
          lockedSourcePeriod: source.period,
          predictionDistance,
          ruleCount,
          algorithmType: input.algorithmType,
          ...(input.algorithmType === '拖牌' ? {} : { referenceOffset, referencePosition }),
        };
        const evaluated = evaluatePreparedMatrixAlgorithm(
          request,
          history,
          sourceIndexes,
          requestedSourceIndex,
        );
        if (!evaluated.valid || !evaluated.highestStreak) continue;
        const minimumStreak = ruleCount === 1 ? 4 : 5;
        if (evaluated.highestStreak < minimumStreak) continue;
        const predictionNumbers = [...new Set((evaluated.predictionNumbers ?? evaluated.results?.flatMap((item) => item.predictionNumbers) ?? []).map(Number))].sort((a, b) => a - b);
        if (predictionNumbers.length < 1 || predictionNumbers.length > 2) continue;
        const key = [source.period, input.lockedPosition, lockedNumber, referenceOffset, referencePosition, predictionDistance, input.algorithmType, ruleCount, evaluated.highestStreak, predictionNumbers.join('.')].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          id: key,
          number: String(lockedNumber).padStart(2, '0'),
          lockedPosition: input.lockedPosition,
          lockedSourceIndex: input.lockedSourceIndex,
          lockedSourcePeriod: source.period,
          predictionDistance,
          consecutive: evaluated.displayStreak,
          highestStreak: evaluated.highestStreak,
          predictionNumbers: predictionNumbers.map((value) => String(value).padStart(2, '0')),
          algorithmType: input.algorithmType,
          ruleCount,
          searchCondition: request,
          sourceA: evaluated.sourceA,
          ruleSets: evaluated.results ?? evaluated.ruleSets ?? [],
        });
      }
    }
  }
  return { results };
}

export async function runMatrixAutomaticExplore(input: unknown) { const request = parseExploreRequest(input); const { getMatrixHistory } = await import('./scraper'); const newestFirst = await getMatrixHistory(request.lottery, null) as Draw[]; return runMatrixAutomaticExploreWithHistory(input, newestFirst); }

export async function runMatrixAlgorithm(input: unknown) {
  const body = record(input); if (body.explorePeriods !== undefined || body.period !== undefined || body.hitCondition !== undefined || body.exploreRange !== undefined || body.exploreDate !== undefined) return runMatrixAutomaticExplore(input); const request = parseRequest(input); const { getMatrixHistory } = await import('./scraper'); const newestFirst = await getMatrixHistory(request.lottery, null) as Draw[]; return evaluateMatrixAlgorithm(request, newestFirst);
}
