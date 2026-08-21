import { runMatrixAlgorithmWithHistory } from './matrix-algorithm';
import { getMatrixHistory } from './scraper';

type Draw = { period: string; drawDate: string; numbers: string[]; sortedNumbers: string[]; drawOrderNumbers: string[] };
type Spec = { name: string; body: { lottery: string; numberOrder: string; lockedPosition: number; lockedNumber: number; referenceOffset: number; referencePosition: number; predictionDistance: number; ruleCount: number; algorithmType: string }; expectedValid?: boolean; expectedStreak: number; expectedRules: number[]; expectedPredictions: number[]; bases: number[]; hits: number[][]; aBase: number };

const specs: Spec[] = [
  { name: '案例01｜順球4開24｜下10期第4支+8+37｜下12期', expectedStreak: 7, expectedRules: [8,37], expectedPredictions: [11,21], bases: [36,30,31,16,27,25,29], hits: [[5,12,16,21,32],[6,8,31,37,38],[11,15,18,29,33],[19,24,29,32,34],[2,15,25,31,38],[3,20,21,22,33],[13,27,30,37,38]], aBase: 13, body: { lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 4, lockedNumber: 24, referenceOffset: 10, referencePosition: 4, predictionDistance: 12, ruleCount: 2, algorithmType: '加減版路' } },
  { name: '案例02｜順球4開24｜同期第2支+21+22｜下12期', expectedStreak: 7, expectedRules: [21,22], expectedPredictions: [37,38], bases: [10,16,11,13,17,12,15], hits: [[5,12,16,21,32],[6,8,31,37,38],[11,15,18,29,33],[19,24,29,32,34],[2,15,25,31,38],[3,20,21,22,33],[13,27,30,37,38]], aBase: 16, body: { lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 4, lockedNumber: 24, referenceOffset: 0, referencePosition: 2, predictionDistance: 12, ruleCount: 2, algorithmType: '加減版路' } },
  { name: '案例03｜順球4開36｜上2期第6支+24｜下8期', expectedStreak: 5, expectedRules: [24], expectedPredictions: [17], bases: [48,43,45,41,36], hits: [[7,11,13,15,23,39,42],[4,16,18,29,33,35,37],[2,6,9,19,20,25,30],[3,15,16,31,32,42,45],[1,11,22,28,35,36,40]], aBase: 42, body: { lottery: '六合彩', numberOrder: '依號碼由小到大', lockedPosition: 4, lockedNumber: 36, referenceOffset: -2, referencePosition: 6, predictionDistance: 8, ruleCount: 1, algorithmType: '加減版路' } },
  { name: '案例04｜特別號開37｜上6期第6支+26｜下10期', expectedStreak: 6, expectedRules: [26], expectedPredictions: [13], bases: [43,21,46,48,31,49], hits: [[14,20,28,32,35,42,48],[5,7,9,14,17,30,47],[12,21,23,32,36,39,43],[5,11,25,39,40,45,47],[5,8,12,13,25,36,48],[1,2,6,16,18,26,47]], aBase: 36, body: { lottery: '六合彩', numberOrder: '依號碼由小到大', lockedPosition: 7, lockedNumber: 37, referenceOffset: -6, referencePosition: 6, predictionDistance: 10, ruleCount: 1, algorithmType: '加減版路' } },
  { name: '案例05｜落球4開35｜上5期第5支+19｜下6期', expectedStreak: 7, expectedRules: [19], expectedPredictions: [24], bases: [16,8,31,13,6,5,25], hits: [[9,22,24,30,35],[4,15,23,27,38],[11,12,14,17,32],[6,8,20,22,32],[9,21,25,27,30],[8,16,24,27,37],[5,17,27,29,36]], aBase: 5, body: { lottery: '今彩539', numberOrder: '依實際開獎順序', lockedPosition: 4, lockedNumber: 35, referenceOffset: -5, referencePosition: 5, predictionDistance: 6, ruleCount: 1, algorithmType: '加減版路' } },
  { name: '案例06｜落球4開35｜上13期第2支合32｜下3期', expectedStreak: 6, expectedRules: [32], expectedPredictions: [18], bases: [15,5,18,13,29,13], hits: [[14,17,20,24,37],[4,8,21,27,29],[2,3,14,16,20],[12,19,27,37,39],[3,9,16,24,35],[6,11,12,13,19]], aBase: 14, body: { lottery: '今彩539', numberOrder: '依實際開獎順序', lockedPosition: 4, lockedNumber: 35, referenceOffset: -13, referencePosition: 2, predictionDistance: 3, ruleCount: 1, algorithmType: '合值版路' } },
  { name: '案例07｜落球3開05｜上7期第1支合36.38｜下10期', expectedStreak: 7, expectedRules: [36,38], expectedPredictions: [1,38], bases: [8,12,3,35,16,7,17], hits: [[12,16,23,27,30],[12,16,23,24,29],[1,12,21,35,37],[3,6,9,31,39],[10,20,28,29,36],[6,13,21,29,34],[4,14,21,31,32]], aBase: 37, body: { lottery: '今彩539', numberOrder: '依實際開獎順序', lockedPosition: 3, lockedNumber: 5, referenceOffset: -7, referencePosition: 1, predictionDistance: 10, ruleCount: 2, algorithmType: '合值版路' } },
  { name: '案例08｜落球3開37｜上9期第4支合24.30｜下5期', expectedValid: false, expectedStreak: 7, expectedRules: [24,30], expectedPredictions: [], bases: [29,17,2,21,1,2,11], hits: [[1,5,33,36,38],[4,7,11,16,26],[11,13,19,22,27],[3,10,11,13,23],[7,25,26,29,31],[18,22,28,35,37],[10,12,13,20,24]], aBase: 29, body: { lottery: '今彩539', numberOrder: '依實際開獎順序', lockedPosition: 3, lockedNumber: 37, referenceOffset: -9, referencePosition: 4, predictionDistance: 5, ruleCount: 2, algorithmType: '合值版路' } },
  { name: '案例09｜順球4開24｜下2期第1支合21.38｜下3期', expectedStreak: 7, expectedRules: [21,38], expectedPredictions: [16,33], bases: [4,16,16,6,9,2,5], hits: [[3,6,11,30,34],[5,12,16,21,32],[5,22,28,35,36],[6,8,20,22,32],[2,9,11,29,30],[2,3,18,19,21],[4,7,8,16,38]], aBase: 5, body: { lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 4, lockedNumber: 24, referenceOffset: 2, referencePosition: 1, predictionDistance: 3, ruleCount: 2, algorithmType: '合值版路' } },
  { name: '案例10｜順球2開11｜下5期第3支+18+36｜下7期', expectedStreak: 7, expectedRules: [18,36], expectedPredictions: [9,30], bases: [20,17,15,14,12,28,13], hits: [[6,9,11,16,17],[9,14,27,29,33],[5,6,12,36,37],[11,15,30,34,36],[1,11,23,30,34],[10,25,27,35,38],[13,25,28,30,31]], aBase: 12, body: { lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 2, lockedNumber: 11, referenceOffset: 5, referencePosition: 3, predictionDistance: 7, ruleCount: 2, algorithmType: '加減版路' } },
  { name: '回推上限｜準13進14', expectedStreak: 13, expectedRules: [5], expectedPredictions: [25], bases: Array(14).fill(20), hits: Array(14).fill([1,2,3,4,25]), aBase: 20, body: { lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 1, lockedNumber: 10, referenceOffset: 0, referencePosition: 2, predictionDistance: 1, ruleCount: 1, algorithmType: '加減版路' } },
  { name: '案例11｜落球5開35｜下1期第3支+14+40｜下9期', expectedStreak: 11, expectedRules: [14,40], expectedPredictions: [7,30], bases: [15,29,30,16,46,21,26,32,26,25,47], hits: [[29,1,2,3,4,5,6],[20,1,2,3,4,5,6],[21,1,2,3,4,5,6],[7,1,2,3,4,5,6],[37,1,2,3,4,5,6],[12,1,2,3,4,5,6],[17,1,2,3,4,5,6],[23,1,2,3,4,5,6],[40,1,2,3,4,5,6],[16,1,2,3,4,5,6],[12,1,2,3,4,5,6]], aBase: 16, body: { lottery: '六合彩', numberOrder: '依實際開獎順序', lockedPosition: 5, lockedNumber: 35, referenceOffset: 1, referencePosition: 3, predictionDistance: 9, ruleCount: 2, algorithmType: '加減版路' } },
  { name: '案例12｜特別號開03｜同期第7支+8+24｜下6期｜順球', expectedStreak: 5, expectedRules: [8,24], expectedPredictions: [11,27], bases: [3,3,3,3,3], hits: [[27,1,2,4,5,6,49],[27,7,8,9,10,12,48],[27,13,14,15,16,17,47],[11,18,19,20,21,22,46],[11,23,24,25,26,28,45]], aBase: 3, body: { lottery: '六合彩', numberOrder: '依號碼由小到大', lockedPosition: 7, lockedNumber: 3, referenceOffset: 0, referencePosition: 7, predictionDistance: 6, ruleCount: 2, algorithmType: '拖牌版路' } },
  { name: '案例13｜落球5開48｜同期第5支+19+35｜下3期', expectedStreak: 6, expectedRules: [19,35], expectedPredictions: [18,34], bases: [48,48,48,48,48,48], hits: [[18,1,2,3,4,5,6],[34,1,2,3,4,5,6],[18,1,2,3,4,5,6],[34,1,2,3,4,5,6],[18,1,2,3,4,5,6],[18,1,2,3,4,5,6]], aBase: 48, body: { lottery: '六合彩', numberOrder: '依實際開獎順序', lockedPosition: 5, lockedNumber: 48, referenceOffset: 0, referencePosition: 5, predictionDistance: 3, ruleCount: 2, algorithmType: '拖牌版路' } },
  { name: '案例14｜特別號開03｜同期第7支+8+24｜下6期｜落球', expectedStreak: 5, expectedRules: [8,24], expectedPredictions: [11,27], bases: [3,3,3,3,3], hits: [[27,1,2,4,5,6,49],[27,1,2,4,5,6,49],[27,1,2,4,5,6,49],[11,1,2,4,5,6,49],[11,1,2,4,5,6,49]], aBase: 3, body: { lottery: '六合彩', numberOrder: '依實際開獎順序', lockedPosition: 7, lockedNumber: 3, referenceOffset: 0, referencePosition: 7, predictionDistance: 6, ruleCount: 2, algorithmType: '拖牌版路' } },
  { name: '案例15｜落球1開42｜上12期第1支+6+38｜下6期', expectedStreak: 11, expectedRules: [6,38], expectedPredictions: [26,43], bases: [42,49,40,41,24,11,12,13,23,12,6], hits: [[1,2,3,4,5,6,48],[38,1,2,3,4,5,6],[29,46,1,2,3,4,5],[47,1,2,3,4,5,6],[13,30,1,2,3,4,5],[17,1,2,3,4,5,6],[1,2,3,4,5,6,7],[2,3,4,5,6,7,8],[29,1,2,3,4,5,6],[18,1,2,3,4,5,6],[44,1,2,3,4,5,6]], aBase: 37, body: { lottery: '六合彩', numberOrder: '依實際開獎順序', lockedPosition: 1, lockedNumber: 42, referenceOffset: -12, referencePosition: 1, predictionDistance: 6, ruleCount: 2, algorithmType: '加減版路' } },
  { name: '案例16｜落球6開40｜上8期第7支合35.49｜下3期', expectedStreak: 11, expectedRules: [35,49], expectedPredictions: [24,38], bases: [20,27,17,27,19,21,28,20,1,46,30], hits: [[29,1,2,3,4,5,6],[8,1,2,3,4,5,6],[32,1,2,3,4,5,6],[8,1,2,3,4,5,6],[30,1,2,3,4,5,6],[14,28,1,2,3,4,5],[7,1,2,3,4,5,6],[15,1,2,3,4,5,6],[48,1,2,3,4,5,6],[3,1,2,4,5,6,7],[5,1,2,3,4,6,7]], aBase: 11, body: { lottery: '六合彩', numberOrder: '依實際開獎順序', lockedPosition: 6, lockedNumber: 40, referenceOffset: -8, referencePosition: 7, predictionDistance: 3, ruleCount: 2, algorithmType: '合值版路' } },
];

function sameNumbers(left: number[], right: number[]) { const a = [...left].sort((x,y) => x-y); const b = [...right].sort((x,y) => x-y); return a.length === b.length && a.every((value,index) => value === b[index]); }
function countFor(spec: Spec) { return spec.body.lottery === '六合彩' || spec.body.lottery === '大樂透' ? 7 : 5; }
function maxFor(spec: Spec) { return countFor(spec) === 7 ? 49 : 39; }
function strings(values: number[]) { return values.map(value => String(value).padStart(2,'0')); }

function buildOrdered(spec: Spec, constraints: Map<number,number>) {
  const count = countFor(spec); const max = maxFor(spec);
  if (spec.body.numberOrder === '依實際開獎順序') {
    const values = Array<number>(count); const used = new Set<number>();
    for (const [position,value] of constraints) { values[position-1] = value; used.add(value); }
    let candidate = 1;
    for (let index=0; index<count; index+=1) if (!values[index]) { while (used.has(candidate)) candidate+=1; values[index]=candidate; used.add(candidate); }
    return values;
  }
  const mainCount = count === 7 ? 6 : 5; const fixedSpecial = count === 7 ? constraints.get(7) : undefined; const mainConstraints = new Map([...constraints].filter(([position]) => position <= mainCount)); const values = Array<number>(mainCount);
  const solve = (index: number, minimum: number): boolean => {
    if (index >= mainCount) return true;
    const fixed = mainConstraints.get(index+1); const start = fixed ?? minimum; const end = fixed ?? max;
    for (let value=start; value<=end; value+=1) { if (value < minimum || value === fixedSpecial) continue; values[index]=value; if (solve(index+1,value+1)) return true; }
    return false;
  };
  if (!solve(0,1)) throw new Error('案例固定球位無法建立');
  if (count === 5) return values;
  let special = fixedSpecial ?? 1; while (values.includes(special)) special+=1;
  return [...values,special];
}

function drawFromOrder(spec: Spec, period: string, order: number[]): Draw {
  const sorted = countFor(spec) === 7 ? [...order.slice(0,6).sort((a,b) => a-b),order[6]] : [...order].sort((a,b) => a-b);
  return { period, drawDate: '', numbers: strings(sorted), sortedNumbers: strings(sorted), drawOrderNumbers: strings(order) };
}

function constrainedDraw(spec: Spec, period: string, constraints: Map<number,number>, source: boolean): Draw {
  const attempt = (next: Map<number,number>) => { try { return buildOrdered(spec,next); } catch { return null; } };
  let order = attempt(constraints);
  if (!order) throw new Error('案例固定球位無法建立');
  if (!source && order[spec.body.lockedPosition-1] === spec.body.lockedNumber) {
    for (let value=1; value<=maxFor(spec); value+=1) {
      if (value === spec.body.lockedNumber || [...constraints.values()].includes(value)) continue;
      const next = new Map(constraints); next.set(spec.body.lockedPosition,value); const candidate = attempt(next);
      if (candidate && candidate[spec.body.lockedPosition-1] !== spec.body.lockedNumber) { order=candidate; break; }
    }
  }
  return drawFromOrder(spec,period,order);
}

function predictionDraw(spec: Spec, period: string, values: number[]): Draw {
  return drawFromOrder(spec,period,[...values]);
}

function isLockedSource(spec: Spec, draw: Draw) {
  const values = spec.body.numberOrder === '依實際開獎順序' ? draw.drawOrderNumbers : draw.sortedNumbers;
  return Number(values[spec.body.lockedPosition-1]) === spec.body.lockedNumber;
}

function buildHistory(spec: Spec) {
  const history: Draw[] = []; let cursor = 0; let previousPredictionIndex: number | null = null; const minDelta = Math.min(0,spec.body.referenceOffset);
  const fill = (start: number,end: number,prefix: string) => { for (let index=start; index<=end; index+=1) if (!history[index]) history[index]=constrainedDraw(spec,prefix+'-'+index,new Map(),false); };
  const place = (index: number,draw: Draw) => { history[index]=draw; };
  spec.bases.forEach((base,groupIndex) => {
    const overlap = previousPredictionIndex !== null && isLockedSource(spec,history[previousPredictionIndex]);
    const sourceIndex = overlap ? previousPredictionIndex as number : cursor+1-minDelta; const referenceIndex=sourceIndex+spec.body.referenceOffset; const predictionIndex=sourceIndex+spec.body.predictionDistance; const start=overlap ? Math.min(sourceIndex,referenceIndex,predictionIndex) : cursor; const end=Math.max(sourceIndex,referenceIndex,predictionIndex)+1; fill(start,end,'C'+(groupIndex+1));
    const sourceConstraints=new Map<number,number>([[spec.body.lockedPosition,spec.body.lockedNumber]]); if (referenceIndex===sourceIndex) sourceConstraints.set(spec.body.referencePosition,base);
    if (!overlap) place(sourceIndex,constrainedDraw(spec,'G'+(groupIndex+1)+'-S',sourceConstraints,true));
    if (referenceIndex===sourceIndex && Number((spec.body.numberOrder === '依實際開獎順序' ? history[sourceIndex].drawOrderNumbers : history[sourceIndex].sortedNumbers)[spec.body.referencePosition-1]) !== base) throw new Error(spec.name + '重疊期參照號碼不一致');
    if (referenceIndex!==sourceIndex) place(referenceIndex,constrainedDraw(spec,'G'+(groupIndex+1)+'-R',new Map([[spec.body.referencePosition,base]]),false));
    place(predictionIndex,predictionDraw(spec,'G'+(groupIndex+1)+'-P',spec.hits[groupIndex])); previousPredictionIndex=predictionIndex; cursor=Math.max(cursor,end+1);
  });
  const overlap = previousPredictionIndex !== null && isLockedSource(spec,history[previousPredictionIndex]); const sourceIndex=overlap ? previousPredictionIndex as number : cursor+1-minDelta; const referenceIndex=sourceIndex+spec.body.referenceOffset; const start=overlap ? Math.min(sourceIndex,referenceIndex) : cursor; const end=Math.max(sourceIndex,referenceIndex)+1; fill(start,end,'A');
  const sourceConstraints=new Map<number,number>([[spec.body.lockedPosition,spec.body.lockedNumber]]); if (referenceIndex===sourceIndex) sourceConstraints.set(spec.body.referencePosition,spec.aBase);
  if (!overlap) place(sourceIndex,constrainedDraw(spec,'A-S',sourceConstraints,true));
  if (referenceIndex===sourceIndex && Number((spec.body.numberOrder === '依實際開獎順序' ? history[sourceIndex].drawOrderNumbers : history[sourceIndex].sortedNumbers)[spec.body.referencePosition-1]) !== spec.aBase) throw new Error(spec.name + 'A組重疊期參照號碼不一致');
  if (referenceIndex!==sourceIndex) place(referenceIndex,constrainedDraw(spec,'A-R',new Map([[spec.body.referencePosition,spec.aBase]]),false));
  return [...history].reverse();
}

type ReferenceSpec = { name: string; lottery: '今彩539' | '六合彩' | '大樂透'; numberOrder: '依號碼由小到大' | '依實際開獎順序'; lockedPosition: number; lockedNumber: number; referenceOffset?: number; referencePosition?: number; predictionDistance: number; ruleCount: 1 | 2; algorithmType: '加減版路' | '合值版路' | '拖牌版路'; expectedStreak: number; expectedPredictions: number[] };

const referenceSpecs: ReferenceSpec[] = [
  { name: '參考圖01｜順球2開11｜上12期第3支+37｜下6期', lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 2, lockedNumber: 11, referenceOffset: -12, referencePosition: 3, predictionDistance: 6, ruleCount: 1, algorithmType: '加減版路', expectedStreak: 6, expectedPredictions: [6] },
  { name: '參考圖02｜順球4開32｜上6期第2支合38.44｜下1期', lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 4, lockedNumber: 32, referenceOffset: -6, referencePosition: 2, predictionDistance: 1, ruleCount: 2, algorithmType: '合值版路', expectedStreak: 9, expectedPredictions: [26,32] },
  { name: '參考圖03｜順球1開04｜同期第1支+3+7｜下2期', lottery: '六合彩', numberOrder: '依號碼由小到大', lockedPosition: 1, lockedNumber: 4, predictionDistance: 2, ruleCount: 2, algorithmType: '拖牌版路', expectedStreak: 6, expectedPredictions: [7,11] },
  { name: '參考圖04｜順球4開31｜上1期第3支+21｜下10期', lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 4, lockedNumber: 31, referenceOffset: -1, referencePosition: 3, predictionDistance: 10, ruleCount: 1, algorithmType: '加減版路', expectedStreak: 6, expectedPredictions: [33] },
  { name: '參考圖05｜順球2開11｜上12期第3支+13+37｜下6期', lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 2, lockedNumber: 11, referenceOffset: -12, referencePosition: 3, predictionDistance: 6, ruleCount: 2, algorithmType: '加減版路', expectedStreak: 9, expectedPredictions: [6,21] },
  { name: '參考圖06｜順球2開06｜上4期第1支+10+27｜下1期', lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 2, lockedNumber: 6, referenceOffset: -4, referencePosition: 1, predictionDistance: 1, ruleCount: 2, algorithmType: '加減版路', expectedStreak: 7, expectedPredictions: [17,34] },
  { name: '參考圖07｜順球1開02｜上14期第5支合59.68｜下1期', lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 1, lockedNumber: 2, referenceOffset: -14, referencePosition: 5, predictionDistance: 1, ruleCount: 2, algorithmType: '合值版路', expectedStreak: 7, expectedPredictions: [24,33] },
  { name: '參考圖08｜順球3開21｜同期第3支+19+29｜下5期', lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 3, lockedNumber: 21, predictionDistance: 5, ruleCount: 2, algorithmType: '拖牌版路', expectedStreak: 6, expectedPredictions: [1,11] },
  { name: '參考圖09｜順球2開12｜同期第2支+11+31｜下7期', lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 2, lockedNumber: 12, predictionDistance: 7, ruleCount: 2, algorithmType: '拖牌版路', expectedStreak: 6, expectedPredictions: [4,23] },
  { name: '參考圖10｜順球2開06｜同期第2支+1+15｜下1期', lottery: '今彩539', numberOrder: '依號碼由小到大', lockedPosition: 2, lockedNumber: 6, predictionDistance: 1, ruleCount: 2, algorithmType: '拖牌版路', expectedStreak: 5, expectedPredictions: [7,21] },
  { name: '參考圖11｜落球5開35｜下1期第3支+14+40｜下9期', lottery: '六合彩', numberOrder: '依實際開獎順序', lockedPosition: 5, lockedNumber: 35, referenceOffset: 1, referencePosition: 3, predictionDistance: 9, ruleCount: 2, algorithmType: '加減版路', expectedStreak: 11, expectedPredictions: [7,30] },
  { name: '參考圖12｜特別號開03｜順球｜同期第7支+8+24｜下6期', lottery: '六合彩', numberOrder: '依號碼由小到大', lockedPosition: 7, lockedNumber: 3, predictionDistance: 6, ruleCount: 2, algorithmType: '拖牌版路', expectedStreak: 5, expectedPredictions: [11,27] },
  { name: '參考圖13｜落球5開48｜同期第5支+19+35｜下3期', lottery: '六合彩', numberOrder: '依實際開獎順序', lockedPosition: 5, lockedNumber: 48, predictionDistance: 3, ruleCount: 2, algorithmType: '拖牌版路', expectedStreak: 6, expectedPredictions: [18,34] },
  { name: '參考圖14｜特別號開03｜落球｜同期第7支+8+24｜下6期', lottery: '六合彩', numberOrder: '依實際開獎順序', lockedPosition: 7, lockedNumber: 3, predictionDistance: 6, ruleCount: 2, algorithmType: '拖牌版路', expectedStreak: 5, expectedPredictions: [11,27] },
  { name: '參考圖15｜落球1開42｜上12期第1支+6+38｜下6期', lottery: '六合彩', numberOrder: '依實際開獎順序', lockedPosition: 1, lockedNumber: 42, referenceOffset: -12, referencePosition: 1, predictionDistance: 6, ruleCount: 2, algorithmType: '加減版路', expectedStreak: 11, expectedPredictions: [26,43] },
  { name: '參考圖16｜落球6開40｜上8期第7支合35.49｜下3期', lottery: '六合彩', numberOrder: '依實際開獎順序', lockedPosition: 6, lockedNumber: 40, referenceOffset: -8, referencePosition: 7, predictionDistance: 3, ruleCount: 2, algorithmType: '合值版路', expectedStreak: 11, expectedPredictions: [24,38] },
];

export async function runMatrixAlgorithmCaseChecks() {
  const syntheticCases = specs.map(spec => {
    const result = runMatrixAlgorithmWithHistory(spec.body,buildHistory(spec)) as any; const sets = (result.results ?? result.ruleSets ?? []) as any[];
    const matching = sets.find(set => sameNumbers((set.rules ?? []).map((rule: any) => Number(rule.value)),spec.expectedRules));
    const predictionNumbers = [...new Set((result.predictionNumbers ?? matching?.predictionNumbers ?? []).map(Number))] as number[]; const rows = (matching?.historicalValidation ?? []) as any[];
    const expectedValid = spec.expectedValid !== false;
    const pass = expectedValid ? result.valid === true && result.highestStreak === spec.expectedStreak && Boolean(matching) && sameNumbers(predictionNumbers,spec.expectedPredictions) && rows.length >= spec.expectedStreak && rows.slice(0,spec.expectedStreak).every(row => row.success === true && (row.matchedRules ?? []).length > 0) : result.valid === false && result.highestStreak === spec.expectedStreak && predictionNumbers.length === 0 && String(result.reason ?? '').includes('三個以上規則');
    return { name: spec.name, pass, valid: result.valid === true, expectedValid, reason: result.reason, highestStreak: result.highestStreak, predictionNumbers };
  });
  const histories = new Map<string, Draw[]>();
  for (const lottery of ['今彩539','六合彩','大樂透'] as const) histories.set(lottery, await getMatrixHistory(lottery, null) as Draw[]);
  const referenceCases = referenceSpecs.map(spec => {
    const body = { lottery: spec.lottery, numberOrder: spec.numberOrder, lockedPosition: spec.lockedPosition, lockedNumber: spec.lockedNumber, referenceOffset: spec.referenceOffset, referencePosition: spec.referencePosition, predictionDistance: spec.predictionDistance, ruleCount: spec.ruleCount, algorithmType: spec.algorithmType };
    const result = runMatrixAlgorithmWithHistory(body,histories.get(spec.lottery) ?? []) as any; const sets = (result.results ?? result.ruleSets ?? []) as any[]; const predictionNumbers = [...new Set((result.predictionNumbers ?? sets.flatMap((item: any) => item.predictionNumbers ?? [])).map(Number))] as number[];
    const pass = result.valid === true && result.highestStreak === spec.expectedStreak && sameNumbers(predictionNumbers,spec.expectedPredictions);
    return { name: spec.name, pass, expectedStreak: spec.expectedStreak, actualStreak: result.highestStreak ?? 0, expectedPredictions: spec.expectedPredictions, actualPredictions: predictionNumbers, valid: result.valid === true, reason: result.reason ?? null };
  });
  return { cases: syntheticCases, referenceCases, summary: { syntheticPassed: syntheticCases.filter(item => item.pass).length, syntheticTotal: syntheticCases.length, referencePassed: referenceCases.filter(item => item.pass).length, referenceTotal: referenceCases.length } };
}
