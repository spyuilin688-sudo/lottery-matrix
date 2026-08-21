import { getMatrixHistory } from './scraper';

type Lottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';
type NumberOrder = '依號碼由小到大排序' | '依實際開獎順序排序';
type Draw = { period: string; drawDate: string; numbers: string[]; sortedNumbers?: string[]; drawOrderNumbers?: string[] | null };

const lotteries: Lottery[] = ['今彩539', '天天樂', '六合彩', '大樂透'];
const numberOrders: NumberOrder[] = ['依號碼由小到大排序', '依實際開獎順序排序'];
const historyRanges = [1000, 3000, 5000] as const;

function objectValue(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('查詢條件格式錯誤');
  return input as Record<string, unknown>;
}

function parseLottery(value: unknown): Lottery {
  if (typeof value !== 'string' || !lotteries.includes(value as Lottery)) throw new Error('未知彩種');
  return value as Lottery;
}

function parseNumberOrder(value: unknown): NumberOrder {
  if (typeof value !== 'string' || !numberOrders.includes(value as NumberOrder)) throw new Error('未知號碼順序');
  return value as NumberOrder;
}

function normalizeInputNumber(value: unknown) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,2}$/.test(text)) throw new Error('請輸入有效號碼');
  const number = Number(text);
  if (!Number.isInteger(number) || number < 1 || number > 49) throw new Error('請輸入有效號碼');
  return String(number).padStart(2, '0');
}

function parseNumbers(value: unknown, minimum: number, maximum: number) {
  if (!Array.isArray(value)) throw new Error(minimum > 0 ? `請輸入至少 ${minimum} 個號碼。` : '探索號碼格式錯誤');
  if (value.length < minimum) throw new Error(`請輸入至少 ${minimum} 個號碼。`);
  if (value.length > maximum) throw new Error(`最多只能輸入 ${maximum} 個號碼。`);
  const numbers = value.map(normalizeInputNumber);
  if (new Set(numbers).size !== numbers.length) throw new Error('探索號碼不可重複');
  return numbers;
}

function parseFutureOffset(value: unknown) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 30) throw new Error('驗證期數請設定 1 至 30 期。');
  return number;
}

function parseHistoryRange(value: unknown) {
  const number = Number(value);
  if (!historyRanges.includes(number as (typeof historyRanges)[number])) throw new Error('歷史範圍僅支援1000、3000、5000期');
  return number as 1000 | 3000 | 5000;
}

function normalizeNumbers(values: Array<string | number> | undefined | null) {
  return Array.isArray(values) ? values.map(value => String(Number(value)).padStart(2, '0')) : [];
}

function orderedNumbers(draw: Draw, order: NumberOrder) {
  const sorted = normalizeNumbers(draw.sortedNumbers?.length ? draw.sortedNumbers : draw.numbers);
  const actual = normalizeNumbers(draw.drawOrderNumbers?.length ? draw.drawOrderNumbers : draw.numbers);
  return order === '依實際開獎順序排序' ? actual : sorted;
}

function projectDraw(draw: Draw, order: NumberOrder) {
  const numbers = orderedNumbers(draw, order);
  return {
    period: draw.period,
    issue: draw.period,
    drawDate: draw.drawDate,
    date: draw.drawDate,
    numbers,
    specialNumber: numbers.length === 7 ? numbers[6] : undefined,
  };
}

export async function runTongXing(input: unknown) {
  const body = objectValue(input);
  const lottery = parseLottery(body.lottery);
  const numberOrder = parseNumberOrder(body.numberOrder);
  const numbers = parseNumbers(body.numbers ?? [], 0, 3);
  const futureOffset = parseFutureOffset(body.futureOffset);
  const groups: Array<{ lockedEntry: ReturnType<typeof projectDraw>; predictedEntry: ReturnType<typeof projectDraw> }> = [];
  if (!numbers.length) return { lottery, numberOrder, numbers, futureOffset, groups };
  const history = await getMatrixHistory(lottery, null) as Draw[];

  for (let lockedIndex = futureOffset; lockedIndex < history.length; lockedIndex += 1) {
    const lockedEntry = history[lockedIndex];
    const lockedNumbers = orderedNumbers(lockedEntry, numberOrder);
    if (!numbers.every(number => lockedNumbers.includes(number))) continue;
    const predictedEntry = history[lockedIndex - futureOffset];
    if (!predictedEntry) continue;
    groups.push({ lockedEntry: projectDraw(lockedEntry, numberOrder), predictedEntry: projectDraw(predictedEntry, numberOrder) });
  }

  return { lottery, numberOrder, numbers, futureOffset, groups };
}

export async function runNumberReference(input: unknown) {
  const body = objectValue(input);
  const lottery = parseLottery(body.lottery);
  const numberOrder = parseNumberOrder(body.numberOrder);
  const historyRange = parseHistoryRange(body.historyRange);
  const numbers = parseNumbers(body.numbers ?? [], 0, 3);
  const history = await getMatrixHistory(lottery, historyRange) as Draw[];
  const items = [...history].reverse().map(draw => {
    const displayedNumbers = orderedNumbers(draw, numberOrder);
    return {
      ...projectDraw(draw, numberOrder),
      matchSlots: displayedNumbers.map(number => {
        const index = numbers.indexOf(number);
        return index >= 0 ? index + 1 : 0;
      }),
    };
  });

  return { lottery, numberOrder, historyRange, numbers, items };
}
