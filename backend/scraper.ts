Warning: truncated output (original token count: 32571)
Total output lines: 1040

import * as cheerio from 'cheerio';
import * as XLSX from 'xlsx';
import { db } from '@appdeploy/sdk';
import { deduplicateDrawRecords, materializeOrderFields, mergeDrawRecord, normalizeNumberList, sortDrawNumbers, type DrawRecord } from './draw-records';

type Draw = DrawRecord;
type SourceConfig = { lottery: string; url: string; count: number; table: string };
type HttpResult = { status: number; finalUrl: string; contentType: string; text: string };
type PageForm = { method: string; url: string; params: Array<[string, string]> };
type Inspection = { page: HttpResult; forms: PageForm[]; requestUrls: string[]; evidenceFound: string[]; reason: string };

const sourceMap: Record<string, SourceConfig> = {
  arclink539: { lottery: '今彩539', url: 'https://lotto.arclink.com.tw/LottoHistoryPeriod_wap.do', count: 5, table: 'draw_539' },
  taiwan539: { lottery: '今彩539', url: 'https://www.taiwanlottery.com/lotto/result/daily_cash', count: 5, table: 'draw_539' },
  sc888: { lottery: '天天樂', url: 'https://sc888.net/index.php?s=/LotteryFan/index', count: 5, table: 'draw_tiantianle' },
  nfdhk: { lottery: '六合彩', url: 'https://www.nfd.com.tw/house/year/2026.htm', count: 7, table: 'draw_marksix' },
  arclinkhk: { lottery: '六合彩', url: 'https://lotto.arclink.com.tw/LottoHistoryPeriod_wap.do?iType=5&order=1', count: 7, table: 'draw_marksix' },
  hkjc: { lottery: '六合彩', url: 'https://bet.hkjc.com/ch/marksix', count: 7, table: 'draw_marksix' },
  taiwan649: { lottery: '大樂透', url: 'https://www.taiwanlottery.com/lotto/result/lotto649', count: 7, table: 'draw_lotto649' },
};

const tableByLottery: Record<string, string> = { '今彩539': 'draw_539', '天天樂': 'draw_tiantianle', '六合彩': 'draw_marksix', '大樂透': 'draw_lotto649' };
const clean = (value: string) => value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const datePattern = /(?:20\d{2}|1\d{2})[年\/\-.](?:1[0-2]|0?[1-9])[月\/\-.](?:3[01]|[12]\d|0?[1-9])日?/;
const explicitPeriodPattern = /第\s*(\d{4,12})\s*期/;
const standalonePeriodPattern = /^(\d{5,12})$/;
const browserHeaders = { 'user-agent': 'Mozilla/5.0 (compatible; AppDeploy Lottery Data Fetcher)', accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'accept-language': 'zh-TW,zh;q=0.9,en;q=0.5' };

function detectCharset(bytes: Uint8Array, header: string | null) {
  const headerMatch = header?.match(/charset\s*=\s*([^;\s]+)/i)?.[1];
  if (headerMatch) return headerMatch.replace(/["']/g, '');
  let probe = '';
  for (const byte of bytes.slice(0, 4096)) probe += String.fromCharCode(byte);
  return probe.match(/charset\s*=\s*["']?([^"'\s/>]+)/i)?.[1] ?? 'utf-8';
}

function decode(bytes: Uint8Array, charset: string) {
  const normalized = /big5|big-5|950/i.test(charset) ? 'big5' : /utf-?8/i.test(charset) ? 'utf-8' : charset;
  try { return new TextDecoder(normalized).decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

async function requestText(url: string, init?: RequestInit, timeoutMs = 15000): Promise<HttpResult> {
  const response = await fetch(url, { ...init, headers: { ...browserHeaders, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? '';
  return { status: response.status, finalUrl: response.url || url, contentType, text: decode(bytes, detectCharset(bytes, contentType)) };
}

async function download(url: string) {
  const result = await requestText(url);
  if (result.status < 200 || result.status >= 300) throw new Error('來源回應 HTTP ' + result.status);
  if (!result.text.trim()) throw new Error('來源回傳空白內容');
  return result.text;
}

function findPeriod(cells: string[]) {
  for (const cell of cells) {
    const explicit = cell.match(explicitPeriodPattern)?.[1];
    if (explicit) return explicit;
  }
  for (const cell of cells) {
    const standalone = cell.match(standalonePeriodPattern)?.[1];
    if (standalone && Number(standalone) > 9999) return standalone;
  }
  return '';
}

function extractNumbers(cell: string, count: number) {
  const tokens = (cell.match(/(?<!\d)(?:0?[1-9]|[1-4]\d)(?!\d)/g) ?? []).filter(v => Number(v) >= 1 && Number(v) <= 49);
  return tokens.length === count ? tokens : [];
}

function parseTable(html: string, count: number): Draw | null {
  const $ = cheerio.load(html);
  let found: Draw | null = null;
  $('tr').each((_, row) => {
    if (found) return;
    const cells = $(row).find('th,td').map((__, cell) => clean($(cell).text())).get().filter(Boolean);
    if (cells.length < 2) return;
    const dateCell = cells.find(cell => datePattern.test(cell));
    const drawDate = dateCell?.match(datePattern)?.[0] ?? '';
    const period = findPeriod(cells);
    if (!drawDate || !period) return;
    for (const cell of cells) {
      if (cell === dateCell) continue;
      const numbers = extractNumbers(cell, count);
      if (numbers.length === count) { found = { period, drawDate, numbers }; return; }
    }
  });
  return found;
}

function extractSc888Numbers(cell: string) {
  const separated = cell.match(/(?<!\d)(?:0[1-9]|[12]\d|3\d)(?!\d)/g) ?? [];
  if (separated.length === 5) return separated;
  const digits = cell.replace(/\D/g, '');
  if (!/^\d{10}$/.test(digits)) return [];
  const pairs = digits.match(/\d{2}/g) ?? [];
  return pairs.length === 5 && pairs.every(value => Number(value) >= 1 && Number(value) <= 39) ? pairs : [];
}

function parseSc888All(html: string): Draw[] {
  const $ = cheerio.load(html);
  const found: Draw[] = [];
  $('tr').each((_, row) => {
    const cells = $(row).find('th,td').map((__, cell) => clean($(cell).text())).get().filter(Boolean);
    const period = findPeriod(cells);
    const dateCell = cells.find(cell => datePattern.test(cell));
    const drawDate = dateCell?.match(datePattern)?.[0] ?? '';
    const numbers = cells.map(extractSc888Numbers).find(values => values.length === 5) ?? [];
    if (period && drawDate && numbers.length === 5) found.push({ period, drawDate, numbers });
  });
  const unique = new Map(found.map(item => [item.period, item]));
  return [...unique.values()].sort((a, b) => b.drawDate.localeCompare(a.drawDate) || b.period.localeCompare(a.period));
}

function parseSc888(html: string): Draw | null { return parseSc888All(html)[0] ?? null; }

const cpZhanMarkSixBaseUrl = 'https://www.cpzhan.com/liu-he-cai/all-results?sort=seq&year=';

function parseCpZhanMarkSixYear(html: string, expectedYear: string): Draw[] {
  const $ = cheerio.load(html);
  const rows: Draw[] = [];
  $('tr').each((_, row) => {
    const cells = $(row).find('th,td').map((__, cell) => clean($(cell).text())).get().filter(Boolean);
    if (cells.length < 10 || cells[0] !== expectedYear || !/^\d{1,3}$/.test(cells[1])) return;
    const period = normalizeNfdPeriod(expectedYear, cells[1]);
    const drawDate = normalizeFantasyDate(cells[2]);
    const drawOrderNumbers = cells.slice(3, 10).map(normalizeTwoDigitNumber);
    if (!period || !drawDate || drawOrderNumbers.length !== 7 || drawOrderNumbers.some(value => !value) || new Set(drawOrderNumbers).size !== 7) return;
    const sortedNumbers = sortDrawNumbers(drawOrderNumbers);
    rows.push({ period, drawDate, numbers: sortedNumbers, sortedNumbers, drawOrderNumbers });
  });
  return [...new Map(rows.map(item => [item.period, item])).values()].sort((a, b) => b.drawDate.localeCompare(a.drawDate) || b.period.localeCompare(a.period));
}

async function backfillCpZhanMarkSix(year: string) {
  const response = await requestText(cpZhanMarkSixBaseUrl + encodeURIComponent(year), undefined, 30000);
  if (response.status < 200 || response.status >= 300) throw new Error('CP站六合彩 ' + year + ' HTTP ' + response.status);
  const sourceRows = parseCpZhanMarkSixYear(response.text, year);
  if (sourceRows.length === 0) throw new Error('CP站六合彩 ' + year + ' 未解析到期數、日期與7碼');
  const nfdOrders = await nfdDualOrderMap(year);
  const verified = sourceRows.filter(draw => {
    const nfd = nfdOrders.get(Number(draw.period.slice(-3)));
    return nfd && nfd.sortedNumbers.join(',') === draw.sortedNumbers?.join(',');
  }).map(draw => {
    const nfd = nfdOrders.get(Number(draw.period.slice(-3)))!;
    return { ...draw, numbers: nfd.sortedNumbers, sortedNumbers: nfd.sortedNumbers, drawOrderNumbers: nfd.drawOrderNumbers };
  });
  if (verified.length !== sourceRows.length) throw new Error('CP站與NFD ' + year + ' 核對不完整：CP站 ' + sourceRows.length + '、一致 ' + verified.length);
  const saved = await saveMany(sourceMap.nfdhk.table, verified, false, 6);
  return { sourceId: 'nfdhk', dateSource: 'cpzhan', numberSource: 'nfdhk', found: sourceRows.length, verified: verified.length, inserted: saved.inserted, duplicates: saved.duplicates, enriched: saved.enriched, missingVerification: 0, mismatches: 0, errors: [] as string[] };
}

const sc888MarkSixUrl = 'https://sc888.net/index.php?s=/LotterySix/index';
const sc888MarkSixDownloadUrl = 'https://sc888.net/index.php?s=/LotterySix/getDownloadXls';

function extractSc888MarkSixNumbers(value: string) {
  const separated = extractNumbers(value, 7);
  if (separated.length === 7 && new Set(normalizeNumberList(separated)).size === 7) return separated;
  const digits = value.replace(/\D/g, '');
  if (!/^\d{14}$/.test(digits)) return [];
  const pairs = digits.match(/\d{2}/g) ?? [];
  return pairs.length === 7 && pairs.every(item => Number(item) >= 1 && Number(item) <= 49) && new Set(pairs).size === 7 ? pairs : [];
}

function parseSc888MarkSixRows(rows: string[][]) {
  const found: Draw[] = [];
  for (const cells of rows) {
    const text = clean(cells.join(' '));
    const period = text.match(explicitPeriodPattern)?.[1] ?? findPeriod(cells);
    const drawDate = normalizeFantasyDate(text);
    const sizeSegment = text.match(/大小\s*([\s\S]*?)(?:台號|特三|$)/)?.[1] ?? '';
    let numbers = extractSc888MarkSixNumbers(sizeSegment);
    if (numbers.length !== 7) numbers = cells.map(extractSc888MarkSixNumbers).find(values => values.length === 7) ?? [];
    if (/^\d{6}$/.test(period) && drawDate && numbers.length === 7 && new Set(normalizeNumberList(numbers)).size === 7) {
      const sortedNumbers = sortDrawNumbers(numbers);
      found.push({ period, drawDate, numbers: sortedNumbers, sortedNumbers });
    }
  }
  return [...new Map(found.map(item => [item.period, item])).values()];
}

function parseSc888MarkSixHtml(html: string) {
  const $ = cheerio.load(html);
  const rows: string[][] = [];
  $('tr').each((_, row) => rows.push($(row).find('th,td').map((__, cell) => clean($(cell).text())).get().filter(Boolean)));
  return parseSc888MarkSixRows(rows);
}

function parseSc888MarkSixDownload(bytes: Uint8Array) {
  const workbook = XLSX.read(bytes, { type: 'array' });
  const rows: string[][] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });
    rows.push(...sheetRows.map(row => row.map(value => clean(String(value ?? ''))).filter(Boolean)));
  }
  return parseSc888MarkSixRows(rows);
}

async function fetchSc888MarkSixHistory() {
  const [downloadResponse, page] = await Promise.all([
    fetch(sc888MarkSixDownloadUrl, { headers: { ...browserHeaders, accept: 'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/html,*/*', referer: sc888MarkSixUrl }, signal: AbortSignal.timeout(30000), redirect: 'follow' }),
    requestText(sc888MarkSixUrl, undefined, 20000),
  ]);
  let rows: Draw[] = [];
  if (downloadResponse.status >= 200 && downloadResponse.status < 300) {
    const bytes = new Uint8Array(await downloadResponse.arrayBuffer());
    if (bytes.length) try { rows = parseSc888MarkSixDownload(bytes); } catch {}
  }
  if (rows.length === 0 && page.status >= 200 && page.status < 300) rows = parseSc888MarkSixHtml(page.text);
  if (rows.length === 0) throw new Error('sc888六合彩未解析到期數、日期與7碼');
  return rows;
}

async function enrichMarkSixDatesFromSc888() {
  const sourceRows = await fetchSc888MarkSixHistory();
  const existing = await listAllTableRecords(sourceMap.nfdhk.table);
  const existingByPeriod = new Map(existing.map(item => [item.period, item]));
  const updates: Array<{ id: string; record: Draw }> = [];
  let matched = 0;
  let mismatched = 0;
  for (const source of sourceRows) {
    const current = existingByPeriod.get(source.period);
    if (!current) continue;
    if (sortDrawNumbers(current.numbers).join(',') !== sortDrawNumbers(source.numbers).join(',')) { mismatched += 1; continue; }
    matched += 1;
    if (!current.drawDate) {
      const { id, ...record } = current;
      updates.push({ id, record: { ...record, drawDate: source.drawDate } });
    }
  }
  let enriched = 0;
  for (let index = 0; index < updates.length; index += 20) {
    const results = await db.update(sourceMap.nfdhk.table, updates.slice(index, index + 20));
    enriched += results.filter(Boolean).length;
  }
  return { source: 'sc888', found: sourceRows.length, matched, enriched, mismatched };
}

const fantasy5RoadUrl = 'https://www.9800.com.tw/fantasy5/rd.html'; const fantasy5DropUrl = 'https://www.lot539.com/lottery/fantasy5/drop'; const fantasy5GdfDropUrl = 'https://gdf99.com/lottery/fantasy5/drop'; const fantasy5DownloadUrl = 'https://sc888.net/index.php?s=/LotteryFan/getDownloadXls'; const fantasy5LotteryCornerUrl = 'https://lotterycorner.com/ca/fantasy-5/';
function buildFantasyOrderForm(formHtml: string, pageUrl: string, targetName: string, targetValue: string): PageForm | null { const $ = cheerio.load(formHtml); const form = $('form').first(); if (!form.length) return null; const method = ((form.attr('method') ?? 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET'); const url = resolveUrl(form.attr('action') ?? pageUrl, pageUrl); if (!url) return null; const params: Array<[string,string]> = []; form.find('input[name],select[name],textarea[name]').each((_, control) => { const element = $(control); const name = element.attr('name'); if (!name || name === targetName) return; const tag = control.tagName.toLowerCase(); const type = (element.attr('type') ?? '').toLowerCase(); if (tag === 'input' && (type === 'submit' || type === 'button' || type === 'image' || type === 'reset')) return; if (tag === 'input' && (type === 'radio' || type === 'checkbox') && element.attr('checked') === undefined) return; let value = element.val(); if (tag === 'select') value = element.find('option[selected]').first().attr('value') ?? element.find('option').first().attr('value') ?? ''; params.push([name, Array.isArray(value) ? String(value[0] ?? '') : String(value ?? element.attr('value') ?? '')]); }); params.push([targetName, targetValue]); return { method, url, params }; }
function fantasyDropOrderForm(html: string, pageUrl: string): PageForm | null { const $ = cheerio.load(html); let found: PageForm | null = null; const useInput = (input: ReturnType<typeof $>) => { if (found || !input.length) return; const name = input.attr('name'); const value = input.attr('value') ?? String(input.val() ?? ''); const formHtml = input.closest('form').toString(); if (name && formHtml) found = buildFantasyOrderForm(formHtml, pageUrl, name, value); }; $('label').each((_, label) => { if (found || !clean($(label).text()).includes('落球序')) return; const forId = $(label).attr('for'); if (forId) useInput($('#' + forId).first()); else useInput($(label).find('input').first()); }); if (!found) $('input[name]').each((_, input) => { if (found) return; const element = $(input); const nearby = clean(element.closest('label').text() + ' ' + element.parent().text() + ' ' + element.next('label').text()); if (nearby.includes('落球序')) useInput(element); }); if (!found) $('select[name]').each((_, select) => { if (found) return; const element = $(select); const option = element.find('option').filter((__, item) => clean($(item).text()).includes('落球序')).first(); if (!option.length) return; const name = element.attr('name'); const value = option.attr('value') ?? String(option.val() ?? ''); const formHtml = element.closest('form').toString(); if (name && formHtml) found = buildFantasyOrderForm(formHtml, pageUrl, name, value); }); return found; }
function parseFantasy5PeriodRows(html: string) { const $ = cheerio.load(html); const rows = new Map<string,string[]>(); $('tr').each((_, row) => { const cells = $(row).find('th,td').map((__, cell) => clean($(cell).text())).get().filter(Boolean); const period = findPeriod(cells); const numbers = cells.map(extractSc888Numbers).find(values => values.length === 5) ?? []; if (period && numbers.length === 5) rows.set(String(Number(period)), normalizeNumberList(numbers)); }); if (rows.size === 0) { $('script,style,noscript').remove(); const text = clean($.root().text()); const pattern = /\b(0?\d{5})\s+((?:(?:0?[1-9]|[123]\d)\s+){4}(?:0?[1-9]|[123]\d))/g; for (const match of text.matchAll(pattern)) { const numbers = match[2].trim().split(/\s+/).map(value => String(Number(value)).padStart(2,'0')); if (numbers.length === 5 && numbers.every(value => Number(value) >= 1 && Number(value) <= 39)) rows.set(String(Number(match[1])), numbers); } } return rows; }
function parseFantasy5LabeledDropRows(html: string) { const $ = cheerio.load(html); let dropIndex = -1; let sizeIndex = -1; $('tr').each((_, row) => { if (dropIndex >= 0) return; const headers = $(row).find('th,td').map((__, cell) => clean($(cell).text())).get(); const foundDrop = headers.findIndex(text => /落球(?:順序|序)?/.test(text)); const foundSize = headers.findIndex(text => /(?:大小|順序排序|大小順序)/.test(text)); if (foundDrop >= 0 && foundSize >= 0) { dropIndex = foundDrop; sizeIndex = foundSize; } }); const rows = new Map<string,string[]>(); if (dropIndex < 0 || sizeIndex < 0) return rows; $('tr').each((_, row) => { const cells = $(row).find('th,td').map((__, cell) => clean($(cell).text())).get(); if (cells.length <= Math.max(dropIndex,sizeIndex)) return; const period = findPeriod(cells); const drop = extractSc888Numbers(cells[dropIndex]); const size = extractSc888Numbers(cells[sizeIndex]); if (!period || drop.length !== 5 || size.length !== 5) return; const normalizedDrop = normalizeNumberList(drop); const normalizedSize = sortDrawNumbers(size); if (sortDrawNumbers(normalizedDrop).join(',') !== normalizedSize.join(',')) return; rows.set(String(Number(period)), normalizedDrop); }); return rows; }
async function readLabeledFantasy5DropUrl(url: string) { const response = await requestText(url, undefined, 10000); if (response.status < 200 || response.status >= 300) throw new Error('HTTP ' + response.status); const rows = parseFantasy5LabeledDropRows(response.text); if (rows.size === 0) throw new Error('未解析到明確標示的落球順序與大小順序資料'); return rows; }
async function fetchFantasy5DrawOrderMap() { const errors: string[] = []; for (const source of [{ name: 'gdf99', url: fantasy5GdfDropUrl }, { name: 'lot539', url: fantasy5DropUrl }]) { try { return await readLabeledFantasy5DropUrl(source.url); } catch (errorValue) { errors.push(source.name + '=' + (errorValue instanceof Error ? errorValue.message : '連線失敗')); } } try { const page = await requestText(fantasy5RoadUrl, undefined, 10000); if (page.status < 200 || page.status >= 300) throw new Error('HTTP ' + page.status); const form = fantasyDropOrderForm(page.text, page.finalUrl); if (!form) throw new Error('未找到「落球序」切換欄位'); const response = await submitForm(form); if (response.status < 200 || response.status >= 300) throw new Error('切換回應 HTTP ' + response.status); const rows = parseFantasy5PeriodRows(response.text); if (rows.size === 0) throw new Error('未解析到期數與5碼'); return rows; } catch (errorValue) { errors.push('9800=' + (errorValue instanceof Error ? errorValue.message : '連線失敗')); } throw new Error('天天樂落球來源不可用：' + errors.join('；')); }
function normalizeFantasyDate(value: string) { const match = clean(value).match(/((?:19|20)\d{2})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})/); return match ? match[1] + '-' + match[2].padStart(2,'0') + '-' + match[3].padStart(2,'0') : ''; }
function parseFantasy5Download(bytes: Uint8Array) { const workbook = XLSX.read(bytes, { type: 'array' }); const found: Draw[] = []; for (const sheetName of workbook.SheetNames) { const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' }); let periodIndex = -1, dateIndex = -1; let numberIndexes: number[] = []; for (const rawRow of rows) { const cells = rawRow.map(value => clean(String(value ?? ''))); const headerPeriod = cells.findIndex(value => /期(?:數|號|次)/.test(value)); const headerDate = cells.findIndex(value => /(?:開獎)?日期|時間/.test(value)); if (headerPeriod >= 0 && headerDate >= 0) { periodIndex = headerPeriod; dateIndex = headerDate; numberIndexes = cells.map((value,index) => /(?:球號|號碼|獎號)\s*[1-5]/.test(value) ? index : -1).filter(index => index >= 0).slice(0,5); continue; } const explicit = cells.map(value => value.match(/第\s*(\d{1,6})\s*期/)?.[1] ?? '').find(Boolean) ?? ''; const indexed = periodIndex >= 0 ? cells[periodIndex]?.match(/\d{1,6}/)?.[0] ?? '' : ''; const largeStandalone = cells.find((value,index) => index !== dateIndex && /^\d{1,6}$/.test(value) && Number(value) > 39) ?? ''; const period = String(Number(indexed || explicit || largeStandalone)); const drawDate = dateIndex >= 0 ? normalizeFantasyDate(cells[dateIndex]) : cells.map(normalizeFantasyDate).find(Boolean) ?? ''; let numbers = numberIndexes.length === 5 ? numberIndexes.map(index => cells[index]).filter(value => /^(?:0?[1-9]|[123]\d)$/.test(value)) : []; if (numbers.length !== 5) numbers = cells.map((value,index) => index === periodIndex || index === dateIndex ? [] : extractSc888Numbers(value)).find(values => values.length === 5) ?? []; if (numbers.length !== 5) { const pure = cells.map((value,index) => index === periodIndex || index === dateIndex ? '' : value).filter(value => /^(?:0?[1-9]|[123]\d)$/.test(value)); if (pure.length >= 5) numbers = pure.slice(0,5); } if (period !== '0' && drawDate && numbers.length === 5) found.push({ period, drawDate, numbers: sortDrawNumbers(numbers), sortedNumbers: sortDrawNumbers(numbers) }); } } return [...new Map(found.map(item => [String(Number(item.period)), { ...item, period: String(Number(item.period)) }])).values()].sort((a,b) => b.drawDate.localeCompare(a.drawDate) || Number(b.period) - Number(a.period)); }
const fantasy5MonthIndex: Record<string,number> = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };
function shiftLotteryCornerFantasy5Date(value: string) { const match = value.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*((?:19|20)\d{2})$/); if (!match) return ''; return new Date(Date.UTC(Number(match[3]),fantasy5MonthIndex[match[1]],Number(match[2])) + 86400000).toISOString().slice(0,10); }
function parseLotteryCornerFantasy5Year(html: string) { const $ = cheerio.load(html); const found: Omit<Draw,'period'>[] = []; $('tr').each((_,row) => { const cells = $(row).find('th,td').map((__,cell) => clean($(cell).text())).get(); if (cells.length < 2) return; const drawDate = shiftLotteryCornerFantasy5Date(cells[0]); const numbers = cells[1].match(/(?<!\d)(?:0?[1-9]|[123]\d)(?!\d)/g) ?? []; if (!drawDate || numbers.length !== 5) return; const sortedNumbers = sortDrawNumbers(numbers); found.push({ drawDate, numbers: sortedNumbers, sortedNumbers }); }); return [...new Map(found.map(item => [item.drawDate,item])).values()]; }
async function fetchLotteryCornerFantasy5Year(year: number) { const response = await requestText(fantasy5LotteryCornerUrl + year,undefined,20000); if (response.status < 200 || response.status >= 300) throw new Error('LotteryCorner ' + year + ' HTTP ' + response.status); const draws = parseLotteryCornerFantasy5Year(response.text); if (draws.length === 0) throw new Error('LotteryCorner ' + year + ' 未解析到開獎資料'); return draws; }
async function fetchFantasy5RecentDownload() { const [response,live] = await Promise.all([fetch(fantasy5DownloadUrl, { headers: { ...browserHeaders, accept: 'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/html,*/*', referer: sourceMap.sc888.url }, signal: AbortSignal.timeout(30000), redirect: 'follow' }),requestText(sourceMap.sc888.url,undefined,20000)]); if (response.status < 200 || response.status >= 300) throw new Error('天天樂最近期下載 HTTP ' + response.status); const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length === 0) throw new Error('天天樂最近期下載內容空白'); let downloaded: Draw[] = []; try { downloaded = parseFantasy5Download(bytes); } catch { downloaded = parseSc888All(decode(bytes, detectCharset(bytes, response.headers.get('content-type')))).map(item => ({ ...item, numbers: sortDrawNumbers(item.numbers), sortedNumbers: sortDrawNumbers(item.numbers) })); } const current = live.status >= 200 && live.status < 300 ? parseSc888All(live.text).map(item => ({ ...item, drawDate: normalizeFantasyDate(item.drawDate), numbers: sortDrawNumbers(item.numbers), sortedNumbers: sortDrawNumbers(item.numbers) })).filter(item => item.drawDate) : []; return [...new Map([...downloaded,...current].map(item => [String(Number(item.period)),{ ...item, period: String(Number(item.period)) }])).values()].sort((a,b) => Number(b.period)-Number(a.period)); }
async function fetchFantasy5HistoryArchive(recent: Draw[],startYear: number) { const currentYear = Number(currentTaipeiMonth().slice(0,4)); const firstYear = Math.max(1992,startYear-1); const years = Array.from({ length: currentYear-firstYear+1 },(_,index) => firstYear+index); const raw: Omit<Draw,'period'>[] = []; for (let index = 0; index < years.length; index += 8) raw.push(...(await Promise.all(years.slice(index,index+8).map(fetchLotteryCornerFantasy5Year))).flat()); const chronological = [...new Map(raw.map(item => [item.drawDate,item])).values()].sort((a,b) => a.drawDate.localeCompare(b.drawDate)); const usableRecent = recent.filter(item => /^\d+$/.test(item.period) && normalizeFantasyDate(item.drawDate)); if (usableRecent.length === 0) throw new Error('天天樂最近期資料無法作交叉驗證；未寫入資料庫'); const latestRecent = [...usableRecent].sort((a,b) => Number(b.period)-Number(a.period))[0]; const latestArchived = chronological[chronological.length-1]; if (!latestArchived || latestArchived.drawDate !== normalizeFantasyDate(latestRecent.drawDate) || latestArchived.numbers.join(',') !== sortDrawNumbers(latestRecent.numbers).join(',')) throw new Error('天天樂完整歷史最新期交叉驗證不一致；未寫入資料庫'); const firstPeriod = Number(latestRecent.period)-chronological.length+1; if (firstYear === 1992 && (chronological[0]?.drawDate !== '1992-02-05' || firstPeriod !== 81)) throw new Error('天天樂完整歷史首期或總期數不一致；未寫入資料庫'); const numbered: Draw[] = chronological.map((item,index) => ({ ...item, period: String(firstPeriod+index) })); const byPeriod = new Map(numbered.map(item => [item.period,item])); for (const recentDraw of usableRecent) { const archived = byPeriod.get(String(Number(recentDraw.period))); if (!archived) continue; if (archived.drawDate !== normalizeFantasyDate(recentDraw.drawDate) || archived.numbers.join(',') !== sortDrawNumbers(recentDraw.numbers).join(',')) throw new Error('天天樂第 ' + recentDraw.period + ' 期交叉驗證不一致；未寫入資料庫'); } return numbered; }
async function fetchFantasy5HistoryDownload() { const recent = await fetchFantasy5RecentDownload(); return recent.length >= 1000 ? recent : fetchFantasy5HistoryArchive(recent,1992); }
function mergeFantasy5Order(draw: Draw, drawOrders: Map<string,string[]>) { const sortedNumbers = sortDrawNumbers(draw.numbers); const drawOrderNumbers = drawOrders.get(String(Number(draw.period))); if (!drawOrderNumbers || drawOrderNumbers.length !== 5) return null; if (sortDrawNumbers(drawOrderNumbers).join(',') !== sortedNumbers.join(',')) return null; return { ...draw, numbers: sortedNumbers, sortedNumbers, drawOrderNumbers }; }
async function fetchSc888DualOrder(config: SourceConfig) { const [html, drawOrders] = await Promise.all([download(config.url), fetchFantasy5DrawOrderMap()]); const sorted = parseSc888(html); if (!sorted) throw new Error('天天樂順球來源無法解析最新期數與5碼'); const merged = mergeFantasy5Order(sorted, drawOrders); if (!merged) throw new Error('天天樂最新期缺少可逐期核對的落球順序；未寫入資料庫'); return merged; }

function resolveUrl(value: string, baseUrl: string) {
  try { return new URL(value, baseUrl).toString(); } catch { return ''; }
}

function looksLikeDataRequest(url: string) {
  if (/\.(?:js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|ico)(?:\?|$)/i.test(url)) return false;
  return /(api|TLCAPIWeB|Lottery|lottery|marksix|result|draw|history|LottoHistoryPeriod)/i.test(url);
}

function literalRequestUrls(text: string, baseUrl: string) {
  const values = new Set<string>();
  for (const match of text.match(/https?:\/\/[^\s"'`<>\\]+/g) ?? []) {
    const resolved = resolveUrl(match, baseUrl);
    if (resolved && looksLikeDataRequest(resolved)) values.add(resolved);
  }
  for (const match of text.matchAll(/["'`]((?:\/|\.\.\/|\.\/)[^"'`\s]{3,240})["'`]/g)) {
    const raw = match[1];
    if (!/(api|TLCAPIWeB|Lottery|lottery|marksix|result|draw|history|LottoHistoryPeriod)/i.test(raw)) continue;
    const resolved = resolveUrl(raw, baseUrl);
    if (resolved && looksLikeDataRequest(resolved)) values.add(resolved);
  }
  return [...values];
}

function parseForms(html: string, pageUrl: string) {
  const $ = cheerio.load(html);
  const forms: PageForm[] = [];
  $('form').each((_, form) => {
    const method = (($(form).attr('method') ?? 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET');
    const url = resolveUrl($(form).attr('action') ?? pageUrl, pageUrl);
    if (!url) return;
    const params: Array<[string, string]> = [];
    $(form).find('input[name],select[name],textarea[name]').each((__, control) => {
      const name = $(control).attr('name');
      if (!name) return;
      const value = $(control).val();
      params.push([name, Array.isArray(value) ? String(value[0] ?? '') : String(value ?? $(control).attr('value') ?? '')]);
    });
    forms.push({ method, url, params });
  });
  return forms;
}

async function inspectPage(pageUrl: string, evidenceTokens: string[] = []): Promise<Inspection> {
  const page = await requestText(pageUrl);
  const $ = cheerio.load(page.text);
  const forms = parseForms(page.text, page.finalUrl);
  const scriptUrls = $('script[src]').map((_, script) => resolveUrl($(script).attr('src') ?? '', page.finalUrl)).get().filter(Boolean).filter(url => !/googletagmanager|google-analytics/i.test(url)).slice(0, 10);
  const scriptBodies = await Promise.all(scriptUrls.map(async url => { try { const result = await requestText(url, undefined, 6000); return result.status >= 200 && result.status < 300 ? result.text : ''; } catch { return ''; } }));
  const combined = [page.text, ...scriptBodies].join('\n');
  const requestUrls = [...new Set([...literalRequestUrls(combined, page.finalUrl), ...forms.map(form => {
    const target = new URL(form.url);
    if (form.method === 'GET') for (const [key, value] of form.params) target.searchParams.append(key, value);
    return target.toString();
  }).filter(looksLikeDataRequest)])].slice(0, 20);
  const bodyText = clean($('body').text());
  const reason = /javascript is required|enable javascript/i.test(page.text) ? '頁面要求JavaScript執行' : bodyText.length < 20 ? 'HTML主體接近空白' : 'HTML中未同時找到完整期數、開獎日期、開獎號碼';
  return { page, forms, requestUrls, evidenceFound: evidenceTokens.filter(token => combined.includes(token)), reason };
}

async function submitForm(form: PageForm) {
  if (form.method === 'POST') {
    const body = new URLSearchParams();
    for (const [key, value] of form.params) body.append(key, value);
    return requestText(form.url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  }
  const target = new URL(form.url);
  for (const [key, value] of form.params) target.searchParams.append(key, value);
  return requestText(target.toString());
}

function diagnosticError(inspection: Inspection, extraReason?: string) {
  const requestSummary = inspection.requestUrls.length ? inspection.requestUrls.slice(0, 4).join('、') : inspection.forms.length ? inspection.forms.slice(0, 3).map(form => form.method + ' ' + form.url).join('、') : '未在回傳HTML或載入腳本中發現可直接驗證的資料Request';
  const reason = extraReason ? inspection.reason + '；' + extraReason : inspection.reason;
  return '實際連線：HTTP ' + inspection.page.status + ' ' + inspection.page.finalUrl + '；回傳格式：' + (inspection.page.contentType || '未提供Content-Type') + '；缺少欄位：期數、開獎日期、開獎號碼；原因：' + reason + '；頁面資料Request：' + requestSummary;
}

async function fetchArclink(config: SourceConfig) {
  const inspection = await inspectPage(config.url);
  const direct = parseTable(inspection.page.text, config.count);
  if (direct) return direct;
  for (const form of inspection.forms.slice(0, 6)) {
    try {
      const response = await submitForm(form);
      if (response.status < 200 || response.status >= 300) continue;
      const parsed = parseTable(response.text, config.count);
      if (parsed) return parsed;
    } catch { /* continue exact page-discovered form requests */ }
  }
  throw new Error(diagnosticError(inspection, inspection.forms.length ? '已依頁面實際form action/method/欄位重送，仍無完整三欄位' : undefined));
}

function currentTaipeiMonth() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const year = parts.find(part => part.type === 'year')?.value ?? '';
  const month = parts.find(part => part.type === 'month')?.value ?? '';
  return year + '-' + month;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function latestByPeriod(items: unknown[]) {
  return items.map(record).filter((item): item is Record<string, unknown> => item !== null).sort((a, b) => Number(b.period ?? 0) - Number(a.period ?? 0))[0] ?? null;
}

function parseTaiwanDrawItem(rawItem: unknown, count: number): Draw | null { const item = record(rawItem); if (!item || item.period === undefined || item.lotteryDate === undefined) return null; const sizeValue = valueByKeys(item, ['drawNumberSize','draw_number_size']); const appearValue = valueByKeys(item, ['drawNumberAppear','draw_number_appear']); if (!Array.isArray(sizeValue) || sizeValue.length !== count || !Array.isArray(appearValue)) return null; const sortedNumbers = sortDrawNumbers(sizeValue.map(value => String(value))); let drawOrderNumbers = normalizeNumberList(appearValue.map(value => String(value))); if (count === 7 && drawOrderNumbers.length === 6) drawOrderNumbers = [...drawOrderNumbers, sortedNumbers[6]]; if (drawOrderNumbers.length !== count || sortDrawNumbers(drawOrderNumbers).join(',') !== sortedNumbers.join(',')) return null; return { period: String(item.period), drawDate: String(item.lotteryDate), numbers: sortedNumbers, sortedNumbers, drawOrderNumbers }; }
function parseTaiwanJsonItems(value: unknown, key: 'daily539Res' | 'lotto649Res', count: number): Draw[] { const root = record(value); const content = root ? record(root.content) : null; const items = content?.[key]; if (!Array.isArray(items)) return []; const draws = items.map(item => parseTaiwanDrawItem(item, count)).filter((item): item is Draw => item !== null); const unique = new Map(draws.map(item => [item.period, item])); return [...unique.values()].sort((a,b) => Number(b.period)-Number(a.period)); }
function parseTaiwanJson(value: unknown, key: 'daily539Res' | 'lotto649Res', count: number): Draw | null { const items = parseTaiwanJsonItems(value, key, count); if (items.length > 0) return items[0]; const root = record(value); const content = root ? record(root.content) : null; const rawItems = content?.[key]; if (!Array.isArray(rawItems)) return null; const item = latestByPeriod(rawItems); return item ? parseTaiwanDrawItem(item, count) : null; }

async function fetchTaiwanOfficial(config: SourceConfig, endpoint: 'Daily539Result' | 'Lotto649Result', key: 'daily539Res' | 'lotto649Res') {
  const inspection = await inspectPage(config.url, ['api.taiwanlottery.com', 'TLCAPIWeB', endpoint]);
  const apiUrl = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/' + endpoint + '?period&month=' + currentTaipeiMonth() + '&pageSize=31';
  try {
    const response = await requestText(apiUrl, { headers: { accept: 'application/json,text/plain,*/*', referer: config.url } });
    if (response.status < 200 || response.status >= 300) throw new Error('HTTP ' + response.status);
    const parsedJson = JSON.parse(response.text) as unknown;
    const data = parseTaiwanJson(parsedJson, key, config.count);
    if (!data) throw new Error('JSON未包含完整三欄位');
    return data;
  } catch (errorValue) {
    const message = errorValue instanceof Error ? errorValue.message : '官方資料Request失敗';
    const evidence = inspection.evidenceFound.length ? '頁面/載入腳本命中：' + inspection.evidenceFound.join(',') : '頁面/載入腳本未直接顯示API字串';
    throw new Error(diagnosticError(inspection, '官方資料Request ' + apiUrl + ' 執行失敗：' + message + '；' + evidence));
  }
}

function valueByKeys(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (item[key] !== undefined && item[key] !== null && item[key] !== '') return item[key];
  return undefined;
}

function parseHkjcObject(item: Record<string, unknown>): Draw | null {
  const periodValue = valueByKeys(item, ['period', 'drawNumber', 'draw_number', 'drawNo', 'draw_no', 'id']);
  const dateValue = valueByKeys(item, ['drawDate', 'draw_date', 'lotteryDate', 'date']);
  const numberValue = valueByKeys(item, ['drawnNumbers', 'drawn_numbers', 'numbers', 'drawNumberSize']);
  const extraValue = valueByKeys(item, ['extraNumber', 'extra_number', 'specialNumber', 'special_number']);
  if (periodValue === undefined || dateValue === undefined || !Array.isArray(numberValue)) return null;
  const numbers = numberValue.map(number => String(number));
  if (numbers.length === 6 && extraValue !== undefined) numbers.push(String(extraValue));
  if (numbers.length !== 7) return null;
  return { period: String(periodValue), drawDate: String(dateValue), numbers };
}

function parseHkjcJson(value: unknown, depth = 0): Draw | null {
  if (depth > 7) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseHkjcJson(item, depth + 1);
      if (parsed) return parsed;
    }
    return null;
  }
  const item = record(value);
  if (!item) return null;
  const direct = parseHkjcObject(item);
  if (direct) return direct;
  for (const nested of Object.values(item)) {
    const parsed = parseHkjcJson(nested, depth + 1);
    if (parsed) return parsed;
  }
  return null;
}

async function fetchHkjc(config: SourceConfig) {
  const inspection = await inspectPage(config.url, ['marksix', 'result', 'draw']);
  const direct = parseTable(inspection.page.text, 7);
  if (direct) return direct;
  const candidates = inspection.requestUrls.filter(url => { try { const host = new URL(url).hostname; return /(^|\.)hkjc\.com$/i.test(host) && looksLikeDataRequest(url); } catch { return false; } }).slice(0, 12);
  const results = await Promise.all(candidates.map(async url => { try { return await requestText(url, { headers: { referer: config.url } }, 7000); } catch { return null; } }));
  for (const response of results) {
    if (!response || response.status < 200 || response.status >= 300 || !response.text.trim()) continue;
    if (/json/i.test(response.contentType) || /^[\s]*[\[{]/.test(response.text)) {
      try { const parsed = parseHkjcJson(JSON.parse(response.text) as unknown); if (parsed) return parsed; } catch { /* not JSON */ }
    }
    const table = parseTable(response.text, 7);
    if (table) return table;
  }
  throw new Error(diagnosticError(inspection, candidates.length ? '已實際呼叫頁面/載入腳本中發現的' + candidates.length + '個HKJC資料候選Request，均未取得完整三欄位' : '未發現可直接呼叫且屬於hkjc.com的資料Request'));
}

const lotto8MarkSixUrl = 'https://www.lotto-8.com/listltohk.asp';

function normalizeTwoDigitNumber(value: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 49) return '';
  return String(number).padStart(2, '0');
}

function normalizeNfdPeriod(year: string, times: string) {
  if (!/^(?:19|20)\d{2}$/.test(year) || !/^\d{1,3}$/.test(times)) return '';
  const sequence = Number(times);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) return '';
  return '0' + year.slice(-2) + String(sequence).padStart(3, '0');
}

function normalizeNfdDate(year: string, partialDate: string) {
  const match = partialDate.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return '';
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return year + '/' + String(month).padStart(2, '0') + '/' + String(day).padStart(2, '0');
}

function nfdYearUrl(year: string) {
  if (!/^20\d{2}$/.test(year)) throw new Error('NFD 年份格式無效');
  return 'https://www.nfd.com.tw/house/year/' + year + '.htm';
}

function nfdConfiguredYear(url: string) {
  return url.match(/\/year\/(20\d{2})\.htm/i)?.[1] ?? '';
}

function nfdCandidate(year: string, partialDate: string, times: string, numberValues: string[]): Draw | null {
  const period = normalizeNfdPeriod(year, times);
  const drawDate = normalizeNfdDate(year, partialDate);
  const numbers = numberValues.map(normalizeTwoDigitNumber);
  if (!period || !drawDate || numbers.length !== 7 || numbers.some(value => !value)) return null;
  return { period, drawDate, numbers };
}

function parseNfdMarkSixAll(html: string): Draw[] {
  const $ = cheerio.load(html);
  const candidates: Draw[] = [];
  $('tr').each((_, row) => {
    const cells = $(row).find('th,td').map((__, cell) => clean($(cell).text())).get().filter(Boolean);
    if (cells.length < 10) return;
    const candidate = nfdCandidate(cells[0], cells[1], cells[2], cells.slice(3, 10));
    if (candidate) candidates.push(candidate);
  });
  if (candidates.length === 0) {
    $('script,style,noscript').remove();
    const text = clean($.root().text());
    const rowPattern = /(20\d{2})\s+(\d{1,2}\/\d{1,2})\s+(\d{1,3})\s+((?:(?:0?[1-9]|[1-4]\d)\s+){6}(?:0?[1-9]|[1-4]\d))/g;
    for (const match of text.matchAll(rowPattern)) {
      const candidate = nfdCandidate(match[1], match[2], match[3], match[4].trim().split(/\s+/));
      if (candidate) candidates.push(candidate);
    }
  }
  const unique = new Map(candidates.map(item => [item.period, item]));
  return [...unique.values()].sort((a, b) => b.drawDate.localeCompare(a.drawDate) || b.period.localeCompare(a.period));
}

function parseNfdMarkSix(html: string): Draw | null {
  return parseNfdMarkSixAll(html)[0] ?? null;
}

function parseNfdMarkSixUndatedAll(html: string, expectedYear: string): Draw[] { const $ = cheerio.load(html); const candidates: Draw[] = []; $('tr').each((_, row) => { const cells = $(row).find('th,td').map((__, cell) => clean($(cell).text())).get().filter(Boolean); if (cells.length < 9 || cells[0] !== expectedYear || !/^\d{1,3}$/.test(cells[1])) return; const period = normalizeNfdPeriod(expectedYear, cells[1]); const numbers = cells.slice(2, 9).map(normalizeTwoDigitNumber); if (!period || numbers.length !== 7 || numbers.some(value => !value)) return; candidates.push({ period, drawDate: '', numbers }); }); return [...new Map(candidates.map(item => [item.period, item])).values()].sort((a, b) => b.period.localeCompare(a.period, undefined, { numeric: true })); }

function parseLotto8All(html: string) {
  const $ = cheerio.load(html);
  const rows = new Map<string, string[]>();
  $('tr').each((_, row) => {
    const text = clean($(row).text());
    const drawDate = text.match(/20\d{2}\/\d{1,2}\/\d{1,2}/)?.[0] ?? '';
    if (!drawDate) return;
    const afterDate = text.slice(text.indexOf(drawDate) + drawDate.length);
    const numbers = (afterDate.match(/(?<!\d)(?:0?[1-9]|[1-4]\d)(?!\d)/g) ?? []).slice(0, 7).map(normalizeTwoDigitNumber).filter(Boolean);
    if (numbers.length === 7) rows.set(drawDate.replace(/\/(\d)(?=\/|$)/g, '/0$1'), numbers);
  });
  return rows;
}

function parseLotto8ForDate(html: string, drawDate: string) {
  const direct = parseLotto8All(html).get(drawDate);
  if (direct) return direct;
  const $ = cheerio.load(html);
  $('script,style,noscript').remove();
  const text = clean($.root().text());
  const index = text.indexOf(drawDate);
  if (index < 0) return null;
  const segment = text.slice(index + drawDate.length, index + drawDate.length + 140);
  const numbers = (segment.match(/(?<!\d)(?:0?[1-9]|[1-4]\d)(?!\d)/g) ?? []).slice(0, 7).map(normalizeTwoDigitNumber);
  return numbers.length === 7 && numbers.every(Boolean) ? numbers : null;
}

async function nfdDualOrderMap(year: string) {
  const [generalFile, drawOrderFile] = await Promise.all([probeNfdDbFile('A841.DB', 'https://www.nfd.com.tw/lottery/V6.0/A841.db'), probeNfdDbFile('A842.DB', 'https://www.nfd.com.tw/lottery/V6.0/A842.db')]);
  const generalRows = ((generalFile as { _rows?: NfdDbRow[] })._rows ?? []).filter(row => row.year === Number(year));
  const drawOrderRows = ((drawOrderFile as { _rows?: NfdDbRow[] })._rows ?? []).filter(row => row.year === Number(year));
  if (generalRows.length === 0 || drawOrderRows.length === 0) throw new Error('NFD ' + year + ' 缺少一般順序或落球順序資料');
  const drawOrderByTimes = new Map(drawOrderRows.map(row => [row.times, row]));
  const result = new Map<number, { sortedNumbers: string[]; drawOrderNumbers: string[] }>();
  for (const row of generalRows) {
    const drawOrder = drawOrderByTimes.get(row.times);
    if (!drawOrder) continue;
    const sortedNumbers = sortDrawNumbers(row.numbers.map(String));
    const drawOrderNumbers = normalizeNumberList(drawOrder.numbers.map(String));
    if (sortDrawNumbers(drawOrderNumbers).join(',') !== sortedNumbers.join(',')) continue;
    result.set(row.times, { sortedNumbers, drawOrderNumbers });
  }
  if (result.size !== generalRows.length) throw new Error('NFD ' + year + ' 一般順序與落球順序無法逐期完整配對');
  return result;
}

async function fetchNfdMarkSix(config: SourceConfig, requestedYear?: string) {
  const year = requestedYear ?? nfdConfiguredYear(config.url);
  if (!year) throw new Error('NFD 年份無法從設定來源辨識');
  const sourceUrl = nfdYearUrl(year);
  const nfdResponse = await requestText(sourceUrl);
  if (nfdResponse.status < 200 || nfdResponse.status >= 300) throw new Error('NFD 來源回應 HTTP ' + nfdResponse.status + '；未寫入資料庫');
  const data = parseNfdMarkSix(nfdResponse.text);
  if (!data || data.numbers.length !== 7) throw new Error('NFD 無法取得完整期數、開獎日期、6個正選號碼與1個特別號；未寫入資料庫');
  const lotto8Response = await requestText(lotto8MarkSixUrl, { headers: { referer: sourceUrl } });
  if (lotto8Response.status < 200 || lotto8Response.status >= 300) throw new Error('交叉驗證失敗：lotto-8 回應 HTTP ' + lotto8Response.status + '；未寫入資料庫');
  const verification = parseLotto8ForDate(lotto8Response.text, data.drawDate);
  if (!verification) throw new Error('交叉驗證失敗：lotto-8 找不到 ' + data.drawDate + ' 的完整7個開獎號碼；未寫入資料庫');
  const nfdNumbers = data.numbers.join(',');
  const lotto8Numbers = verification.join(',');
  if (nfdNumbers !== lotto8Numbers) throw new Error('交叉驗證失敗：NFD 與 lotto-8 同日期開獎號碼不一致；NFD=' + nfdNumbers + '；lotto-8=' + lotto8Numbers + '；未寫入資料庫');
  const orderMap = await nfdDualOrderMap(year);
  const order = orderMap.get(Number(data.period.slice(-3)));
  if (!order) throw new Error('NFD ' + data.period + ' 缺少一般順序或落球順序；未寫入資料庫');
  return { ...data, numbers: order.sortedNumbers, sortedNumbers: order.sortedNumbers, drawOrderNumbers: order.drawOrderNumbers };
}

async function listAllTableRecords(table: string) {
  const items: Array<Draw & { id: string }> = [];
  let nextToken: string | undefined;
  do {
    const page = await db.list<Draw>(table, { limit: 100, ...(nextToken ? { nextToken } : {}) });
    items.push(...page.items);
    nextToken = page.nextToken;
  } while (nextToken);
  return items;
}

async function save(table: string, data: Draw) {
  const incoming = materializeOrderFields(data);
  const existing = await db.list<Draw>(table, { filter: { period: incoming.period } });
  if (existing.items.length > 0) {
    const current = existing.items[0];
    const merged = mergeDrawRecord(current, incoming);
    const { id, ...currentRecord } = current;
    if (JSON.stringify(materializeOrderFields(currentRecord)) !== JSON.stringify(merged)) await db.update(table, [{ id, record: merged }]);
    return { duplicate: true };
  }
  const [id] = await db.add(table, [incoming]);
  if (!id) throw new Error('資料庫寫入失敗');
  return { duplicate: false };
}

async function saveMany(table: string, draws: Draw[], allowMissingDate = false, parallelism = 1) {
  const existing = await listAllTableRecords(table);
  const existingByPeriod = new Map(existing.map(item => [item.period, item]));
  const unique = new Map<string, Draw>();
  for (const draw of draws) if (draw.period && (allowMissingDate || draw.drawDate) && draw.numbers.length > 0) unique.set(draw.period, materializeOrderFields(draw));
  const pending: Draw[] = [];
  const updates: Array<{ id: string; record: Draw }> = [];
  let duplicates = 0;
  for (const draw of unique.values()) {
    const current = existingByPeriod.get(draw.period);
    if (!current) { pending.push(draw); continue; }
    duplicates += 1;
    const merged = mergeDrawRecord(current, draw);
    const { id, ...currentRecord } = current;
    if (JSON.stringify(materializeOrderFields(currentRecord)) !== JSON.stringify(merged)) updates.push({ id, record: merged });
  }
  const batchWidth = Math.max(1,Math.min(8,parallelism));
  const addChunks = Array.from({ length: Math.ceil(pending.length / 20) },(_,index) => pending.slice(index*20,index*20+20));
  let inserted = 0;
  for (let index = 0; index < addChunks.length; index += batchWidth) {
    const groups = await Promise.all(addChunks.slice(index,index+batchWidth).map(chunk => db.add(table,chunk)));
    inserted += groups.flat().filter(Boolean).length;
  }
  const updateChunks = Array.from({ length: Math.ceil(updates.length / 20) },(_,index) => updates.slice(index*20,index*20+20));
  let enriched = 0;
  for (let index = 0; index < updateChunks.length; index += batchWidth) {
    const groups = await Promise.all(updateChunks.slice(index,index+batchWidth).map(chunk => db.update(table,chunk)));
    enriched += groups.flat().filter(Boolean).length;
  }
  return { inserted, duplicates, enriched, total: draws.length };
}

async function fetchTaiwanMonthItems(config: SourceConfig, endpoint: 'Daily539Result' | 'Lotto649Result', key: 'daily539Res' | 'lotto649Res', month: string) {
  const apiUrl = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/' + endpoint + '?period&month=' + month + '&pageSize=31';
  const response = await requestText(apiUrl, { headers: { accept: 'application/json,text/plain,*/*', referer: config.url } });
  if (response.status < 200 || response.status >= 300) throw new Error(month + ' HTTP ' + response.status);
  return parseTaiwanJsonItems(JSON.parse(response.text) as unknown, key, config.count);
}

function monthRangeForYear(year: string) {
  const current = currentTaipeiMonth();
  const currentYear = Number(current.slice(0, 4));
  const targetYear = Number(year);
  if (!/^20\d{2}$/.test(year) || targetYear > currentYear) throw new Error('回填年份無效');
  const count = targetYear === currentYear ? Number(current.slice(5, 7)) : 12;
  return Array.from({ length: count }, (_, index) => year + '-' + String(index + 1).padStart(2, '0'));
}

function parseNfdLotto649Year(html: string, year: string) { const $ = cheerio.load(html); const rows = new Map<number,Draw>(); $('tr').each((_,row) => { const cells = $(row).find('th,td').map((__,cell) => clean($(cell).text())).get().filter(Boolean); if (cells.length < 11 || cells[0] !== year || !/^\d{1,3}$/.test(cells[2])) return; const date = cells[1].match(/(\d{1,2})\s*\/\s*(\d{1,2})/); const issue = Number(cells[2]); const numbers = cells.slice(3,10).map(value => value.match(/(?:0?[1-9]|[1-4]\d)/)?.[0] ?? ''); if (!date || !Number.isInteger(issue) || issue < 1 || numbers.length !== 7 || numbers.some(value => !value)) return; const period = String(Number(year) - 1911).padStart(3,'0') + String(issue).padStart(6,'0'); const drawDate = year + '-' + date[1].padStart(2,'0') + '-' + date[2].padStart(2,'0'); rows.set(issue, { period, drawDate, numbers: normalizeNumberList(numbers) }); }); return rows; }
async function backfillTaiwanLegacy649(year: string) { if (!['2004','2005','2006'].includes(year)) throw new Error('大樂透舊制回填只支援2004～2006'); const base = 'https://www.nfd.com.tw/lottery/49-year/49-'; const [sortedPage,drawPage] = await Promise.all([requestText(base + year + '.htm',undefined,20000),requestText(base + 'f' + year + '.htm',undefined,20000)]); if (sortedPage.status < 200 || sortedPage.status >= 300 || drawPage.status < 200 || drawPage.status >= 300) throw new Error('NFD 大樂透 ' + year + ' 來源回應失敗'); const sorted = parseNfdLotto649Year(sortedPage.text,year); const dropped = parseNfdLotto649Year(drawPage.text,year); if (sorted.size !== 104 || dropped.size !== 104) throw new Error('NFD 大樂透 ' + year + ' 期數不完整：一般 ' + sorted.size + '、落球 ' + dropped.size); const draws: Draw[] = []; for (const [issue,item] of sorted) { const drop = dropped.get(issue); const sortedNumbers = sortDrawNumbers(item.numbers); if (!drop || sortDrawNumbers(drop.numbers).join(',') !== sortedNumbers.join(',')) throw new Error('NFD 大樂透 ' + year + ' 第' + issue + '期一般／落球號碼不一致'); draws.push({ ...item, numbers: sortedNumbers, sortedNumbers, drawOrderNumbers: normalizeNumberList(drop.numbers) }); } const saved = await saveMany(sourceMap.taiwan649.table,draws); return { sourceId: 'taiwan649', found: draws.length, inserted: saved.inserted, duplicates: saved.duplicates, enriched: saved.enriched, errors: [] as string[] }; }
async function backfillTaiwan(sourceId: 'taiwan539' | 'taiwan649', year: string) {
  const config = sourceMap[sourceId];
  if (sourceId === 'taiwan649' && ['2004','2005','2006'].includes(year)) return backfillTaiwanLegacy649(year);
  const endpoint = sourceId === 'taiwan539' ? 'Daily539Result' : 'Lotto649Result';
  const key = sourceId === 'taiwan539' ? 'daily539Res' : 'lotto649Res';
  const responses = await Promise.all(monthRangeForYear(year).map(async month => {
    try { return { month, items: await fetchTaiwanMonthItems(config, endpoint, key, month) }; }
    catch (errorValue) { return { month, items: [] as Draw[], error: errorValue instanceof Error ? errorValue.message : '月份抓取失敗' }; }
  }));
  const draws = responses.flatMap(item => item.items).filter(item => item.drawDate.startsWith(year));
  const saved = await saveMany(config.table, draws);
  return { sourceId, found: draws.length, inserted: saved.inserted, duplicates: saved.duplicates, errors: responses.filter(item => 'error' in item).map(item => ('error' in item ? item.error : '')).filter(Boolean) };
}

async function backfillSc888(year: string) { const config = sourceMap.sc888; const draws = (await fetchFantasy5RecentDownload()).filter(item => item.drawDate.startsWith(year + '-')); const saved = await saveMany(config.table,draws); return { sourceId: 'sc888', found: draws.length, inserted: saved.inserted, duplicates: saved.duplicates, enriched: saved.enriched, errors: [] as string[] }; }

async function backfillNfd(year: string) { if (year === '1997') return { sourceId: 'nfdhk', found: 0, verified: 0, inserted: 0, duplicates: 0, missingVerification: 0, mismatches: 0, skipped: true, excludedYear: '1997', errors: [] as string[] }; return backfillCpZhanMarkSix(year); }

async function backfillNfdLegacy(year: string) { const config = sourceMap.nfdhk; const numericYear = Number(year); const allowUndatedHistory = Number.isInteger(numericYear) && numericYear >= 1976 && numericYear <= 2025; if (allowUndatedHistory) { const orderMap = await nfdDualOrderMap(year); const nfdDraws: Draw[] = [...orderMap.entries()].map(([times, order]) => ({ period: normalizeNfdPeriod(year, String(times)), drawDate: '', numbers: order.sortedNumbers, sortedNumbers: order.sortedNumbers, drawOrderNumbers: order.drawOrderNumbers })).filter(item => Boolean(item.period) && item.numbers.length === 7); if (nfdDraws.length === 0) throw new Error('NFD A841.DB ' + year + ' 無法取得完整期數與7碼資料；未寫入資料庫'); const saved = await saveMany(config.table, nfdDraws, true); return { sourceId: 'nfdhk', found: nfdDraws.length, verified: nfdDraws.length, inserted: saved.inserted, duplicates: saved.duplicates, missingVerification: 0, mismatches: 0, errors: [] as string[] }; } const sourceUrl = nfdYearUrl(year); const nfdResponse = await requestText(sourceUrl); if (nfdResponse.status < 200 || nfdResponse.status >= 300) throw new Error('NFD ' + year + ' HTTP ' + nfdResponse.status); const nfdDraws = parseNfdMarkSixAll(nfdResponse.text).filter(item => item.drawDate.startsWith(year + '/')); const lotto8Response = await requestText(lotto8MarkSixUrl, { headers: { referer: sourceUrl } }); if (lotto8Response.status < 200 || lotto8Response.status >= 300) throw new Error('lotto-8 HTTP ' + lotto8Response.status); const verification = parseLotto8All(lotto8Response.text); const orderMap = await nfdDualOrderMap(year); const verified: Draw[] = []; let missingVerification = 0; let mismatches = 0; for (const draw of nfdDraws) { const compare = verification.get(draw.drawDate); if (!compare) { missingVerification += 1; continue; } if (compare.join(',') !== draw.numbers.join(',')) { mismatches += 1; continue; } const order = orderMap.get(Number(draw.period.slice(-3))); if (!order) { missingVerification += 1; continue; } verified.push({ ...draw, numbers: order.sortedNumbers, sortedNumbers: order.sortedNumbers, drawOrderNumbers: order.drawOrderNumbers }); } const saved = await saveMany(config.table, verified); return { sourceId: 'nfdhk', found: nfdDraws.length, verified: verified.length, inserted: saved.inserted, duplicates: saved.duplicates, missingVerification, mismatches, errors: [] as string[] }; }

export async function backfillYear(year: string) {
  monthRangeForYear(year);
  const tasks = await Promise.allSettled([backfillTaiwan('taiwan539', year), backfillSc888(year), backfillNfd(year), backfillTaiwan('taiwan649…2571 tokens truncated…ext);
  const scriptUrls = $('script[src]').map((_, script) => resolveUrl($(script).attr('src') ?? '', inspection.page.finalUrl)).get().filter(Boolean).filter(url => { try { return /(^|\.)brightstream\.com\.tw$/i.test(new URL(url).hostname); } catch { return false; } }).slice(0, 12);
  const scriptResponses = await Promise.all(scriptUrls.map(async url => { try { const response = await requestText(url, { headers: { referer: searchUrl } }, 8000); return { url, status: response.status, text: response.text }; } catch { return { url, status: 0, text: '' }; } }));
  const combined = [inspection.page.text, ...scriptResponses.map(item => item.text)].join('\n');
  const discoveredRequests = [...new Set([...inspection.requestUrls, ...literalRequestUrls(combined, searchUrl)])].filter(url => { try { return /(^|\.)brightstream\.com\.tw$/i.test(new URL(url).hostname); } catch { return false; } }).slice(0, 30);
  const forms = inspection.forms.filter(form => { try { const url = new URL(form.url); return /(^|\.)brightstream\.com\.tw$/i.test(url.hostname) && /(search|history)/i.test(url.pathname); } catch { return false; } }).slice(0, 8);
  const formResponses: Array<{ method: string; url: string; params: Array<[string,string]>; status: number; contentType: string; snippet: string; samples: Array<Draw & { lottery: string }>; error?: string }> = [];
  for (const form of forms) {
    try {
      const response = await submitForm(form);
      formResponses.push({ method: form.method, url: form.url, params: form.params, status: response.status, contentType: response.contentType, snippet: clean(response.text.replace(/<[^>]+>/g, ' ')).slice(0, 700), samples: inspectBrightstreamPayload(response.text, response.contentType, form.url) });
    } catch (errorValue) {
      formResponses.push({ method: form.method, url: form.url, params: form.params, status: 0, contentType: '', snippet: '', samples: [], error: errorValue instanceof Error ? errorValue.message : '表單Request失敗' });
    }
  }
  return { page: { status: inspection.page.status, finalUrl: inspection.page.finalUrl, contentType: inspection.page.contentType, reason: inspection.reason }, forms: forms.map(form => ({ method: form.method, url: form.url, params: form.params })), scriptUrls, scriptStatuses: scriptResponses.map(item => ({ url: item.url, status: item.status })), discoveredRequests, evidence: brightstreamEvidenceSnippets(combined), formResponses };
}

export async function inspectBrightstreamHistory() {
  const pageUrl = 'https://lottery.brightstream.com.tw/history';
  try {
    const inspection = await inspectPage(pageUrl, ['今彩539','大樂透','六合彩','天天樂','history','api']);
    const bodyText = clean(cheerio.load(inspection.page.text)('body').text());
    const detectedLotteries = ['今彩539','大樂透','六合彩','天天樂'].filter(name => bodyText.includes(name));
    const directSamples = inspectBrightstreamPayload(inspection.page.text, inspection.page.contentType, inspection.page.finalUrl);
    const candidates = inspection.requestUrls.filter(url => { try { return /(^|\.)brightstream\.com\.tw$/i.test(new URL(url).hostname); } catch { return false; } }).slice(0, 12);
    const requests: Array<{ url: string; status: number; contentType: string; samples: Array<Draw & { lottery: string }>; snippet: string; error?: string }> = [];
    for (const candidate of candidates) {
      try {
        const response = await requestText(candidate, { headers: { referer: pageUrl, accept: 'application/json,text/plain,text/html,*/*' } }, 10000);
        requests.push({ url: candidate, status: response.status, contentType: response.contentType, samples: inspectBrightstreamPayload(response.text, response.contentType, candidate), snippet: clean(response.text.replace(/<[^>]+>/g, ' ')).slice(0, 400) });
      } catch (errorValue) {
        requests.push({ url: candidate, status: 0, contentType: '', samples: [], snippet: '', error: errorValue instanceof Error ? errorValue.message : 'Request失敗' });
      }
    }
    const samples = [...directSamples, ...requests.flatMap(item => item.samples)];
    const uniqueSamples = [...new Map(samples.map(item => [item.lottery + '|' + item.period + '|' + item.drawDate, item])).values()].slice(0, 30);
    const markSixSamples = uniqueSamples.filter(item => item.lottery === '六合彩' && item.numbers.length === 7);
    const searchHistory = await inspectBrightstreamSearchHistory();
    return { ok: true, page: { status: inspection.page.status, finalUrl: inspection.page.finalUrl, contentType: inspection.page.contentType, reason: inspection.reason }, detectedLotteries, forms: inspection.forms.slice(0, 8).map(form => ({ method: form.method, url: form.url, params: form.params })), requestCandidates: candidates, requests, samples: uniqueSamples, markSixSamples, canSupplementMarkSix: markSixSamples.length > 0, searchHistory };
  } catch (errorValue) {
    return { ok: false, page: { status: 0, finalUrl: pageUrl, contentType: '', reason: errorValue instanceof Error ? errorValue.message : 'Brightstream連線失敗' }, detectedLotteries: [], forms: [], requestCandidates: [], requests: [], samples: [], markSixSamples: [], canSupplementMarkSix: false };
  }
}

const nfdU16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8); const nfdU32 = (bytes: Uint8Array, offset: number) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0; const nfdShortParadox = (bytes: Uint8Array, offset: number) => { const raw = (((bytes[offset] ^ 0x80) << 8) | bytes[offset + 1]) & 0xffff; return raw & 0x8000 ? raw - 0x10000 : raw; }; const nfdShortBe = (bytes: Uint8Array, offset: number) => { const raw = ((bytes[offset] << 8) | bytes[offset + 1]) & 0xffff; return raw & 0x8000 ? raw - 0x10000 : raw; }; const nfdShortLe = (bytes: Uint8Array, offset: number) => { const raw = (bytes[offset] | (bytes[offset + 1] << 8)) & 0xffff; return raw & 0x8000 ? raw - 0x10000 : raw; };
function nfdAsciiTokens(bytes: Uint8Array) { const text = [...bytes].map(value => value >= 32 && value <= 126 ? String.fromCharCode(value) : ' ').join(''); return [...new Set(text.match(/[A-Za-z][A-Za-z0-9_]{1,31}/g) ?? [])]; }
function identifyNfdDbFormat(bytes: Uint8Array) { const tokens = nfdAsciiTokens(bytes.slice(0, Math.min(bytes.length, 4096))); const expected = ['TYEAR','TIMES','N1','N2','N3','N4','N5','N6','S1']; const recordSize = bytes.length >= 4 ? nfdU16(bytes, 0) : 0; const headerSize = bytes.length >= 4 ? nfdU16(bytes, 2) : 0; const structural = bytes.length >= 18 && recordSize === 18 && headerSize >= 512 && headerSize <= bytes.length && expected.every(name => tokens.includes(name)); if (structural) return 'paradox-db'; const ascii = new TextDecoder('windows-1252').decode(bytes.slice(0, 160)); if (ascii.startsWith('SQLite format 3')) return 'sqlite'; if (ascii.includes('Standard Jet DB') || ascii.includes('Standard ACE DB')) return 'microsoft-jet-access'; return 'unknown'; }
type NfdDbRow = { year: number; times: number; numbers: number[]; rawHex: string; fileOffset: number };
function validNfdDbRow(values: number[]) { const [year, times, ...numbers] = values; return ((year >= 1900 && year <= 2200) || (year >= 1 && year <= 300)) && times >= 1 && times <= 250 && numbers.length === 7 && numbers.every(value => value >= 1 && value <= 49) && new Set(numbers).size === 7; }
function scanNfdDbRows(bytes: Uint8Array, headerSize: number, blockSize: number, fileBlocks: number, recordSize: number, expectedRecords: number) { const decoders = [{ name: 'paradox-short-big-endian-sign-flip', fn: nfdShortParadox }, { name: 'big-endian-int16', fn: nfdShortBe }, { name: 'little-endian-int16', fn: nfdShortLe }]; const sampleBlocks = Math.min(fileBlocks, 4); let selected = { decoder: decoders[0], blockHeaderBytes: 6, score: -1 }; for (const decoder of decoders) for (let blockHeaderBytes = 0; blockHeaderBytes <= 16; blockHeaderBytes++) { let score = 0; for (let block = 0; block < sampleBlocks; block++) { const blockStart = headerSize + block * blockSize + blockHeaderBytes; const blockEnd = Math.min(bytes.length, headerSize + (block + 1) * blockSize); for (let offset = blockStart; offset + recordSize <= blockEnd; offset += recordSize) { const values = Array.from({ length: 9 }, (_, index) => decoder.fn(bytes, offset + index * 2)); if (validNfdDbRow(values)) score++; } } if (score > selected.score) selected = { decoder, blockHeaderBytes, score }; } const rows: NfdDbRow[] = []; for (let block = 0; block < fileBlocks; block++) { const blockStart = headerSize + block * blockSize + selected.blockHeaderBytes; const blockEnd = Math.min(bytes.length, headerSize + (block + 1) * blockSize); for (let offset = blockStart; offset + recordSize <= blockEnd; offset += recordSize) { const values = Array.from({ length: 9 }, (_, index) => selected.decoder.fn(bytes, offset + index * 2)); if (!validNfdDbRow(values)) continue; rows.push({ year: values[0], times: values[1], numbers: values.slice(2), rawHex: [...bytes.slice(offset, offset + recordSize)].map(value => value.toString(16).padStart(2, '0')).join(' '), fileOffset: offset }); } } const unique = [...new Map(rows.map(row => [row.year + '|' + row.times, row])).values()]; return { decoder: selected.decoder.name, blockHeaderBytes: selected.blockHeaderBytes, rows: unique, delta: Math.abs(unique.length - expectedRecords) }; }
function analyzeNfdDbBytes(name: string, url: string, response: Response, bytes: Uint8Array) { const format = identifyNfdDbFormat(bytes); const recordSize = bytes.length >= 18 ? nfdU16(bytes, 0) : 0; const headerSize = bytes.length >= 18 ? nfdU16(bytes, 2) : 0; const fileType = bytes.length >= 18 ? bytes[4] : 0; const maxTableSize = bytes.length >= 18 ? bytes[5] : 0; const recordCount = bytes.length >= 18 ? nfdU32(bytes, 6) : 0; const nextBlock = bytes.length >= 18 ? nfdU16(bytes, 10) : 0; const fileBlocks = bytes.length >= 18 ? nfdU16(bytes, 12) : 0; const firstBlock = bytes.length >= 18 ? nfdU16(bytes, 14) : 0; const lastBlock = bytes.length >= 18 ? nfdU16(bytes, 16) : 0; const contentRange = response.headers.get('content-range') ?? ''; const rangeTotal = Number(contentRange.match(/\/(\d+)$/)?.[1] ?? 0); const fullFile = rangeTotal > 0 ? bytes.length === rangeTotal : response.status === 200; const blockSizeRaw = fileBlocks > 0 && bytes.length > headerSize ? (bytes.length - headerSize) / fileBlocks : 0; const blockSize = Number.isInteger(blockSizeRaw) ? blockSizeRaw : 0; const tokens = nfdAsciiTokens(bytes.slice(0, Math.min(headerSize || bytes.length, bytes.length))); const expectedFields = ['TYEAR','TIMES','N1','N2','N3','N4','N5','N6','S1']; const fieldNames = expectedFields.filter(field => tokens.includes(field)); const fieldLayout = fieldNames.length === 9 && recordSize === 18 ? expectedFields.map((field, index) => ({ name: field, recordOffset: index * 2, length: 2, type: 'paradox-short-int16' })) : []; const dateFieldNames = tokens.filter(token => /^(DATE|DRAWDATE|DRAW_DATE|DAY|MONTH|MDATE|DDATE)$/i.test(token)); const asciiText = [...bytes].map(value => value >= 32 && value <= 126 ? String.fromCharCode(value) : ' ').join(''); const dateLikeAscii = [...new Set(asciiText.match(/(?:19|20)\d{2}[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:0?[1-9]|[12]\d|3[01])/g) ?? [])].slice(0, 20); const parsed = format === 'paradox-db' && fullFile && blockSize > 0 ? scanNfdDbRows(bytes, headerSize, blockSize, fileBlocks, recordSize, recordCount) : { decoder: '', blockHeaderBytes: 0, rows: [] as NfdDbRow[], delta: recordCount }; const rows = parsed.rows; const years = rows.map(row => row.year); const times = rows.map(row => row.times); const perYear = Object.fromEntries([...new Set(years)].sort((a, b) => a - b).map(year => [String(year), rows.filter(row => row.year === year).length])); const exactSchemaWidth = fieldLayout.length === 9 && fieldLayout.reduce((sum, field) => sum + field.length, 0) === recordSize; const hasDateField = dateFieldNames.length > 0; const dateStatus = hasDateField ? 'explicit-date-field-found' : exactSchemaWidth ? 'absent-from-record-schema' : 'not-proven'; const prefix = bytes.slice(0, 64); return { name, url, finalUrl: response.url || url, status: response.status, contentType: response.headers.get('content-type') ?? '', contentLength: response.headers.get('content-length') ?? '', contentRange, totalBytes: bytes.length, fullFile, format, header: { recordSize, headerSize, fileType, maxTableSize, recordCount, nextBlock, fileBlocks, firstBlock, lastBlock, derivedBlockSize: blockSize }, fields: fieldLayout, headerTokens: tokens.slice(0, 40), dateInspection: { hasDateField, dateStatus, dateFieldNames, dateLikeAscii }, parser: { decoder: parsed.decoder, blockHeaderBytes: parsed.blockHeaderBytes, parsedRecords: rows.length, expectedRecords: recordCount, exactRecordCount: rows.length === recordCount }, coverage: { earliestYear: years.length ? Math.min(...years) : null, latestYear: years.length ? Math.max(...years) : null, earliestTimes: times.length ? Math.min(...times) : null, latestTimes: times.length ? Math.max(...times) : null, perYear }, first5: rows.slice(0, 5), last5: rows.slice(-5), hexPrefix: [...prefix].map(value => value.toString(16).padStart(2, '0')).join(' '), _rows: rows }; }
async function probeNfdDbFile(name: string, url: string) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000); try { const response = await fetch(url, { headers: { ...browserHeaders, range: 'bytes=0-262143' }, signal: controller.signal, redirect: 'follow' }); const bytes = new Uint8Array(await response.arrayBuffer()); return analyzeNfdDbBytes(name, url, response, bytes); } catch (errorValue) { return { name, url, finalUrl: url, status: 0, contentType: '', contentLength: '', contentRange: '', totalBytes: 0, fullFile: false, format: 'unavailable', header: {}, fields: [], headerTokens: [], dateInspection: { hasDateField: false, dateStatus: 'not-proven', dateFieldNames: [], dateLikeAscii: [] }, parser: { decoder: '', blockHeaderBytes: 0, parsedRecords: 0, expectedRecords: 0, exactRecordCount: false }, coverage: { earliestYear: null, latestYear: null, earliestTimes: null, latestTimes: null, perYear: {} }, first5: [], last5: [], hexPrefix: '', error: errorValue instanceof Error ? errorValue.message : 'NFD DB probe failed' }; } finally { clearTimeout(timer); } }
function compareNfdDbFiles(a: any, b: any) { const aRows = [...(a.first5 ?? []), ...(a.last5 ?? [])]; void aRows; const aParsed = a._rows as NfdDbRow[] | undefined; const bParsed = b._rows as NfdDbRow[] | undefined; if (!aParsed || !bParsed) return { available: false }; const bMap = new Map(bParsed.map(row => [row.year + '|' + row.times, row])); let matched = 0, sameSet = 0, sameOrder = 0; for (const row of aParsed) { const other = bMap.get(row.year + '|' + row.times); if (!other) continue; matched++; if ([...row.numbers].sort((x, y) => x - y).join(',') === [...other.numbers].sort((x, y) => x - y).join(',')) sameSet++; if (row.numbers.join(',') === other.numbers.join(',')) sameOrder++; } return { available: true, matchedPeriods: matched, sameSevenNumberSet: sameSet, sameExactOrder: sameOrder, onlyOrderingDifference: matched > 0 && sameSet === matched, missingFromA841: bParsed.length - matched, missingFromA842: aParsed.length - matched }; }
export async function inspectNfdDatabaseFiles() { const sources = [{ name: 'A841.DB', url: 'https://www.nfd.com.tw/lottery/V6.0/A841.db' }, { name: 'A842.DB', url: 'https://www.nfd.com.tw/lottery/V6.0/A842.db' }, { name: 'A84.DB', url: 'https://www.nfd.com.tw/lottery/V5.0/A84.db' }]; const internal: any[] = await Promise.all(sources.map(async item => { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000); try { const response = await fetch(item.url, { headers: { ...browserHeaders, range: 'bytes=0-262143' }, signal: controller.signal, redirect: 'follow' }); const bytes = new Uint8Array(await response.arrayBuffer()); return analyzeNfdDbBytes(item.name, item.url, response, bytes); } catch (errorValue) { return { name: item.name, url: item.url, finalUrl: item.url, status: 0, contentType: '', contentLength: '', contentRange: '', totalBytes: 0, fullFile: false, format: 'unavailable', header: {}, fields: [], headerTokens: [], dateInspection: { hasDateField: false, dateStatus: 'not-proven', dateFieldNames: [], dateLikeAscii: [] }, parser: { decoder: '', blockHeaderBytes: 0, parsedRecords: 0, expectedRecords: 0, exactRecordCount: false }, coverage: { earliestYear: null, latestYear: null, earliestTimes: null, latestTimes: null, perYear: {} }, first5: [], last5: [], hexPrefix: '', _rows: [], error: errorValue instanceof Error ? errorValue.message : 'NFD DB probe failed' }; } finally { clearTimeout(timer); } })); const comparison = compareNfdDbFiles(internal[0], internal[1]); const files = internal.map(({ _rows, ...item }) => item); const dateResolved = files.slice(0, 2).some(item => item.dateInspection?.hasDateField); const formalBackfillReady = Boolean(files[0]?.parser?.exactRecordCount); return { ok: true, mode: 'read-only', databaseWrites: 0, files, comparison, dateResolved, formalBackfillReady, conclusion: dateResolved ? '找到 NFD DB 原始日期欄位；1976–2025 歷史資料可依期數與7碼回填，DATE 可空白。' : 'NFD DB 逐筆紀錄 schema 未發現 DATE；依目前規則，1976–2025 歷史資料仍可依期數與7碼回填，DATE 可空白。' }; }

function nfdNativeLinks(html: string, baseUrl: string) { const $ = cheerio.load(html); return $('a[href]').map((_, link) => { const href = $(link).attr('href') ?? ''; return { text: clean($(link).text()), url: resolveUrl(href, baseUrl) }; }).get().filter(item => item.url && /(^|\.)nfd\.com\.tw$/i.test(new URL(item.url).hostname)); }
async function probeNfdNativeResource(name: string, url: string) { try { const response = await fetch(url, { headers: { ...browserHeaders, range: 'bytes=0-65535' }, signal: AbortSignal.timeout(8000), redirect: 'follow' }); const bytes = new Uint8Array(await response.arrayBuffer()); const ascii = [...bytes.slice(0, 65536)].map(value => value >= 32 && value <= 126 ? String.fromCharCode(value) : ' ').join(''); const tokens = [...new Set(ascii.match(/[A-Za-z][A-Za-z0-9_]{2,31}/g) ?? [])]; const dateTokens = tokens.filter(token => /^(DATE|DRAWDATE|DRAW_DATE|DAY|MONTH|MDATE|DDATE|CALENDAR)$/i.test(token)); const dateStrings = [...new Set(ascii.match(/(?:19|20)\d{2}[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:0?[1-9]|[12]\d|3[01])/g) ?? [])].slice(0, 20); return { name, url, status: response.status, contentType: response.headers.get('content-type') ?? '', contentRange: response.headers.get('content-range') ?? '', sampledBytes: bytes.length, dateTokens, dateStrings, asciiEvidence: tokens.filter(token => /DATE|DAY|MONTH|TIME|YEAR|DRAW|CALENDAR/i.test(token)).slice(0, 30) }; } catch (errorValue) { return { name, url, status: 0, contentType: '', contentRange: '', sampledBytes: 0, dateTokens: [], dateStrings: [], asciiEvidence: [], error: errorValue instanceof Error ? errorValue.message : 'NFD resource probe failed' }; } }
async function inspectNfdHistoricalRowMetadata(year: string) { const url = 'https://www.nfd.com.tw/house/year/' + year + '.htm'; try { const page = await requestText(url, undefined, 10000); const $ = cheerio.load(page.text); const candidates: Array<{ times: number; dates: string[]; rowHtml: string }> = []; let rowCount = 0; $('tr').each((_, row) => { const cells = $(row).find('th,td').map((__, cell) => clean($(cell).text())).get().filter(Boolean); if (cells.length !== 9 || cells[0] !== year || !/^\d{1,3}$/.test(cells[1])) return; rowCount++; const rowHtml = $(row).toString(); const fullDates = [...new Set(rowHtml.match(/(?:19|20)\d{2}[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:0?[1-9]|[12]\d|3[01])/g) ?? [])]; const attrDates = [...rowHtml.matchAll(/(?:data-date|data-day|drawdate|title)=["'][^"']*?((?:0?[1-9]|1[0-2])\s*[\/\-.]\s*(?:0?[1-9]|[12]\d|3[01]))/gi)].map(match => match[1].replace(/\s+/g, '')); const dates = [...new Set([...fullDates, ...attrDates])]; if (dates.length) candidates.push({ times: Number(cells[1]), dates, rowHtml: clean(rowHtml).slice(0, 500) }); }); const pageDateTokens = [...new Set(page.text.match(/(?:19|20)\d{2}[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:0?[1-9]|[12]\d|3[01])/g) ?? [])].slice(0, 30); return { year, url, status: page.status, rowCount, rowsWithHiddenDate: candidates.length, candidates: candidates.slice(0, 20), pageDateTokens, note: '只有與單筆 9 欄 YEAR/TIMES/N1-N6/S1 同一個 tr 內的日期才算逐筆候選；頁尾月份日期不算。' }; } catch (errorValue) { return { year, url, status: 0, rowCount: 0, rowsWithHiddenDate: 0, candidates: [], pageDateTokens: [], error: errorValue instanceof Error ? errorValue.message : 'NFD historical metadata probe failed' }; } }
export async function inspectNfdNativeDateSources() { const docUrls = ['https://www.nfd.com.tw/lottery/download/power388.htm','https://www.nfd.com.tw/lottery/download/2008888.htm']; const docs = await Promise.all(docUrls.map(async url => { try { const page = await requestText(url, undefined, 10000); const links = nfdNativeLinks(page.text, page.finalUrl); return { url, status: page.status, links: links.filter(item => /DBGuide|A841|A842|A84\.db|copy\.bat/i.test(item.url + ' ' + item.text)).slice(0, 30) }; } catch (errorValue) { return { url, status: 0, links: [], error: errorValue instanceof Error ? errorValue.message : 'NFD download page failed' }; } })); const documentedUrls = [...new Map(docs.flatMap(doc => doc.links).filter(item => /DBGuideV6\.nfd|(?:56|60)-copy\.bat/i.test(item.url)).map(item => [item.url, item])).values()]; const documentedProbes = await Promise.all(documentedUrls.map(item => probeNfdNativeResource(item.text || item.url.split('/').pop() || 'resource', item.url))); const sidecarNames = ['A841.PX','A841.MB','A841.VAL','A842.PX','A842.MB','A842.VAL']; const sidecarProbes = await Promise.all(sidecarNames.map(name => probeNfdNativeResource(name, 'https://www.nfd.com.tw/lottery/V6.0/' + name))); const historical = await Promise.all(['2020','2021','2022','2023','2024','2025'].map(inspectNfdHistoricalRowMetadata)); const successfulDateEvidence = [...documentedProbes, ...sidecarProbes].filter(item => item.status >= 200 && item.status < 300 && (item.dateTokens.length > 0 || item.dateStrings.length > 0)); const completeHiddenYears = historical.filter(item => item.rowCount > 0 && item.rowsWithHiddenDate === item.rowCount).length; const formalNativeDateSourceFound = completeHiddenYears === historical.length && historical.length === 6; return { ok: true, mode: 'read-only', databaseWrites: 0, docs, documentedProbes, sidecarProbes, historical, successfulDateEvidence, formalNativeDateSourceFound, conclusion: formalNativeDateSourceFound ? '已在 NFD 原生歷史列中找到可逐筆對應 YEAR+TIMES 的 DATE；2020–2025 歷史資料仍依目前規則允許 DATE 空白。' : successfulDateEvidence.length ? '找到 NFD 原生日期相關候選檔案／字串，但尚未證明可逐筆對應 YEAR+TIMES；2020–2025 歷史資料仍可依期數與7碼回填。' : '本輪未找到可逐筆對應 YEAR+TIMES 的 NFD 原生 DATE；依目前規則，2020–2025 歷史資料可依期數與7碼回填，DATE 可空白。' }; }

type HkHistoryCandidateRow = { drawDate: string; numbers: string[]; period?: string }; function hkCandidateNumbers(text: string, expected: number) { const values = (text.match(/\b(?:0?[1-9]|[1-4]\d)\b/g) ?? []).map(value => String(Number(value)).padStart(2, '0')); return values.length === expected && new Set(values).size === expected ? values : []; } function hkCandidateCoverage(rows: HkHistoryCandidateRow[]) { const unique = [...new Map(rows.map(row => [row.drawDate + '|' + row.numbers.join(','), row])).values()].sort((a, b) => a.drawDate.localeCompare(b.drawDate)); const perYear: Record<string, number> = {}; for (const row of unique) { const year = row.drawDate.slice(0, 4); if (/^20\d{2}$/.test(year)) perYear[year] = (perYear[year] ?? 0) + 1; } const targetYears = ['2020','2021','2022','2023','2024','2025']; return { total: unique.length, earliestDate: unique[0]?.drawDate ?? null, latestDate: unique.at(-1)?.drawDate ?? null, perYear, targetYearPresence: Object.fromEntries(targetYears.map(year => [year, (perYear[year] ?? 0) > 0])), hasAllTargetYears: targetYears.every(year => (perYear[year] ?? 0) > 0), hasPeriod: unique.some(row => Boolean(row.period)), samples: unique.slice(-5).reverse() }; } function parseLotto8History(html: string) { const $ = cheerio.load(html); const bodyHtml = $('body').html() ?? html; const withoutScripts = bodyHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' '); const separated = withoutScripts.replace(/<[^>]+>/g, ' '); const text = cheerio.load('<div>' + separated + '</div>')('div').text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); const rows: HkHistoryCandidateRow[] = []; const pattern = /\b((?:19|20)\d{2})\s+(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\s+(?:\([^)]{1,8}\)|（[^）]{1,8}）)\s+((?:0?[1-9]|[1-4]\d)(?:\s*[,，]\s*(?:0?[1-9]|[1-4]\d)){5})\s+(0?[1-9]|[1-4]\d)\s+(?:19|20)\d{2}\/(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])/g; for (const match of text.matchAll(pattern)) { const six = hkCandidateNumbers(match[4], 6); const special = String(Number(match[5])).padStart(2, '0'); if (six.length !== 6 || Number(special) < 1 || Number(special) > 49 || six.includes(special)) continue; rows.push({ drawDate: match[1] + '-' + String(Number(match[2])).padStart(2, '0') + '-' + String(Number(match[3])).padStart(2, '0'), numbers: [...six, special] }); } return rows; } function parseMetalsHistory(html: string) { const $ = cheerio.load(html); const rows: HkHistoryCandidateRow[] = []; $('tr').each((_, tr) => { const cells = $(tr).find('th,td').map((__, cell) => clean($(cell).text())).get().filter(Boolean); if (cells.length < 2) return; const date = cells[0].match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/)?.[0]; const numbers = hkCandidateNumbers(cells[1], 7); if (date && numbers.length === 7) rows.push({ drawDate: date, numbers }); }); return rows; } async function inspectBrightstreamCandidate(name: string, url: string) { try { const inspection = await inspectPage(url, ['六合彩','draw','history','date','period','draw_id','api']); const direct = inspectBrightstreamPayload(inspection.page.text, inspection.page.contentType, inspection.page.finalUrl).filter(item => item.numbers.length === 7).map(item => ({ drawDate: item.drawDate, numbers: item.numbers.map(value => String(Number(value)).padStart(2, '0')), period: item.period })); const requestUrls = inspection.requestUrls.filter(item => { try { return /(^|\.)brightstream\.com\.tw$/i.test(new URL(item).hostname); } catch { return false; } }).slice(0, 20); const requestDetails = await Promise.all(requestUrls.map(async requestUrl => { try { const response = await requestText(requestUrl, { headers: { referer: url, accept: 'application/json,text/plain,text/html,*/*' } }, 10000); const samples = inspectBrightstreamPayload(response.text, response.contentType, requestUrl).filter(item => item.numbers.length === 7).map(item => ({ drawDate: item.drawDate, numbers: item.numbers.map(value => String(Number(value)).padStart(2, '0')), period: item.period })); return { url: requestUrl, status: response.status, contentType: response.contentType, snippet: clean(response.text.replace(/<[^>]+>/g, ' ')).slice(0, 700), samples }; } catch (errorValue) { return { url: requestUrl, status: 0, contentType: '', snippet: '', samples: [] as HkHistoryCandidateRow[], error: errorValue instanceof Error ? errorValue.message : 'request failed' }; } })); const formDetails = await Promise.all(inspection.forms.slice(0, 8).map(async form => { try { const response = await submitForm(form); const samples = inspectBrightstreamPayload(response.text, response.contentType, form.url).filter(item => item.numbers.length === 7).map(item => ({ drawDate: item.drawDate, numbers: item.numbers.map(value => String(Number(value)).padStart(2, '0')), period: item.period })); return { method: form.method, url: form.url, params: form.params, status: response.status, contentType: response.contentType, snippet: clean(response.text.replace(/<[^>]+>/g, ' ')).slice(0, 700), samples }; } catch (errorValue) { return { method: form.method, url: form.url, params: form.params, status: 0, contentType: '', snippet: '', samples: [] as HkHistoryCandidateRow[], error: errorValue instanceof Error ? errorValue.message : 'form failed' }; } })); const rows = [...direct, ...requestDetails.flatMap(item => item.samples), ...formDetails.flatMap(item => item.samples)]; return { name, url, status: inspection.page.status, requestCandidates: requestUrls.length, requestDetails, forms: inspection.forms.slice(0, 8), formDetails, coverage: hkCandidateCoverage(rows), _rows: rows }; } catch (errorValue) { return { name, url, status: 0, requestCandidates: 0, requestDetails: [], forms: [], formDetails: [], coverage: hkCandidateCoverage([]), _rows: [] as HkHistoryCandidateRow[], error: errorValue instanceof Error ? errorValue.message : 'Brightstream candidate probe failed' }; } } export async function inspectBrightstreamMarkSixDeep() { const pages = [{ name: 'Brightstream 歷史開獎', url: 'https://lottery.brightstream.com.tw/history' }, { name: 'Brightstream 3000期比對', url: 'https://lottery.brightstream.com.tw/tools/draw-comparison-3000' }]; const internal = await Promise.all(pages.map(item => inspectBrightstreamCandidate(item.name, item.url))); const sources = internal.map(item => { const rows = item._rows as HkHistoryCandidateRow[]; const requestDetails = (item.requestDetails ?? []).map((req: any) => ({ url: req.url, status: req.status, contentType: req.contentType, parsedSamples: req.samples?.length ?? 0, snippet: req.snippet, error: req.error })); const formDetails = (item.formDetails ?? []).map((req: any) => ({ method: req.method, url: req.url, params: req.params, status: req.status, contentType: req.contentType, parsedSamples: req.samples?.length ?? 0, snippet: req.snippet, error: req.error })); const fields = { period: item.coverage.hasPeriod, drawDate: item.coverage.total > 0, sevenNumbers: item.coverage.total > 0 }; const completeHistoricalCandidate = rows.length > 0 && fields.period && item.coverage.hasAllTargetYears; return { name: item.name, url: item.url, status: item.status, discoveredRequestCount: item.requestCandidates, requestDetails, forms: item.forms, formDetails, coverage: item.coverage, fields, completeHistoricalCandidate, parsedRecordCount: rows.length }; }); const anyParsedRecords = sources.some(item => item.parsedRecordCount > 0); const completeHistoricalCandidate = sources.some(item => item.completeHistoricalCandidate); return { ok: true, mode: 'read-only', databaseWrites: 0, formalSourcePolicyChanged: false, sources, anyParsedRecords, completeHistoricalCandidate, verdict: completeHistoricalCandidate ? 'Brightstream 已找到具 period+drawDate+7碼 且覆蓋2020–2025的完整歷史候選；仍不得自動升格正式來源。' : anyParsedRecords ? 'Brightstream 可解析部分六合彩資料，但尚未同時滿足 period+drawDate+7碼 與2020–2025完整覆蓋，不可作為完整歷史來源。' : 'Brightstream 兩個指定頁面與其載入腳本/候選Request/form均已只讀深挖；目前沒有解析出可用六合彩 draw records，因此不可作為2020–2025歷史資料來源。' }; } async function inspectLotto8Candidate() { const base = 'https://www.lotto-8.com/listltohkbbk.asp'; const pages = Array.from({ length: 45 }, (_, index) => index + 1); const chunks: number[][] = []; for (let index = 0; index < pages.length; index += 15) chunks.push(pages.slice(index, index + 15)); const rows: HkHistoryCandidateRow[] = []; let successPages = 0; let diagnostics: any = null; for (const chunk of chunks) { const batch = await Promise.all(chunk.map(async page => { try { const response = await requestText(base + '?indexpage=' + page + '&orderby=new', undefined, 10000); const parsed = parseLotto8History(response.text); let probe: any = null; if (page === 1) { const $ = cheerio.load(response.text); const rowSamples: string[][] = []; $('tr').slice(0, 20).each((_, tr) => { const cells = $(tr).find('th,td').map((__, cell) => clean($(cell).text())).get().filter(Boolean); if (cells.length) rowSamples.push(cells.slice(0, 10)); }); const globalCellsSample = $('th,td').map((__, cell) => clean($(cell).text())).get().filter(Boolean).slice(0, 80); const bodyText = clean($('body').text()); probe = { contentType: response.contentType, finalUrl: response.finalUrl, bodyText: bodyText.slice(0, 2200), rowSamples: rowSamples.slice(0, 10), globalCellsSample, markers: { hasDateHeader: bodyText.includes('日期'), hasMarkSixHeader: /六合彩.*中獎號碼/.test(bodyText), hasNextDrawDate: bodyText.includes('下次開獎日期'), hasIndexPage: response.text.includes('indexpage'), hasYearToken: /(?:19|20)\d{2}/.test(bodyText), hasMonthDayToken: /(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])/.test(bodyText) }, parsedOnFirstPage: parsed.length }; } return { ok: response.status >= 200 && response.status < 300, rows: parsed, probe }; } catch (errorValue) { return { ok: false, rows: [] as HkHistoryCandidateRow[], probe: page === 1 ? { error: errorValue instanceof Error ? errorValue.message : 'page failed' } : null }; } })); for (const item of batch) { if (item.ok) successPages++; rows.push(...item.rows); if (item.probe) diagnostics = item.probe; } } return { name: 'lotto-8 歷史開獎', url: base, status: successPages ? 200 : 0, pagesRequested: pages.length, pagesSucceeded: successPages, diagnostics, coverage: hkCandidateCoverage(rows), _rows: rows }; } export async function inspectLotto8HistoryOnly() { const item = await inspectLotto8Candidate(); const { _rows, ...source } = item; return { ok: source.status === 200 && source.coverage.total > 0, mode: 'read-only', databaseWrites: 0, formalSourcePolicyChanged: false, dateRule: 'drawDate 僅取每筆文字序列開頭的 YEAR + MM/DD；後方完整 YYYY/MM/DD 僅作本筆結束錨點，永不作為本期日期', source }; } function hkSixKey(numbers: Array<string | number>) { return numbers.slice(0, 6).map(Number).sort((a, b) => a - b).map(value => String(value).padStart(2, '0')).join(','); } function hkSevenKey(numbers: Array<string | number>) { return numbers.map(Number).sort((a, b) => a - b).map(value => String(value).padStart(2, '0')).join(','); } function hkStrictKey(numbers: Array<string | number>) { return hkSixKey(numbers) + '|' + String(Number(numbers[6])).padStart(2, '0'); } export async function inspectNfdLotto8HistoryMap() { const years = ['2020','2021','2022','2023','2024','2025']; const [nfd, lotto8] = await Promise.all([probeNfdDbFile('A841.DB','https://www.nfd.com.tw/lottery/V6.0/A841.db'), inspectLotto8Candidate()]); const nfdRows = ((nfd as any)._rows ?? []) as NfdDbRow[]; const lottoRows = ((lotto8 as any)._rows ?? []) as HkHistoryCandidateRow[]; const perYear = years.map(yearText => { const year = Number(yearText); const nRows = nfdRows.filter(row => row.year === year); const lRows = lottoRows.filter(row => row.drawDate.startsWith(yearText + '-')); const nStrict = new Map<string, NfdDbRow[]>(); const lStrict = new Map<string, HkHistoryCandidateRow[]>(); const lSeven = new Map<string, HkHistoryCandidateRow[]>(); for (const row of nRows) { const key = hkStrictKey(row.numbers); nStrict.set(key, [...(nStrict.get(key) ?? []), row]); } for (const row of lRows) { const key = hkStrictKey(row.numbers); lStrict.set(key, [...(lStrict.get(key) ?? []), row]); const seven = hkSevenKey(row.numbers); lSeven.set(seven, [...(lSeven.get(seven) ?? []), row]); } let unique = 0, ambiguous = 0, unmatched = 0, specialMismatch = 0; const examples: Array<{ times: number; nfdNumbers: number[]; drawDate: string; lotto8Numbers: string[] }> = []; const ambiguousExamples: Array<{ times: number; nfdNumbers: number[]; candidateDates: string[] }> = []; const unmatchedExamples: Array<{ times: number; nfdNumbers: number[] }> = []; const specialMismatchExamples: Array<{ times: number; nfdNumbers: number[]; candidateDates: string[] }> = []; for (const row of nRows) { const strict = hkStrictKey(row.numbers); const sameNfdKey = nStrict.get(strict) ?? []; const candidates = lStrict.get(strict) ?? []; if (sameNfdKey.length === 1 && candidates.length === 1) { unique++; if (examples.length < 8) examples.push({ times: row.times, nfdNumbers: row.numbers, drawDate: candidates[0].drawDate, lotto8Numbers: candidates[0].numbers }); continue; } if (candidates.length > 0 || sameNfdKey.length > 1) { ambiguous++; if (ambiguousExamples.length < 5) ambiguousExamples.push({ times: row.times, nfdNumbers: row.numbers, candidateDates: candidates.map(item => item.drawDate) }); continue; } const sameSeven = lSeven.get(hkSevenKey(row.numbers)) ?? []; if (sameSeven.length > 0) { specialMismatch++; if (specialMismatchExamples.length < 5) specialMismatchExamples.push({ times: row.times, nfdNumbers: row.numbers, candidateDates: sameSeven.map(item => item.drawDate) }); } else { unmatched++; if (unmatchedExamples.length < 5) unmatchedExamples.push({ times: row.times, nfdNumbers: row.numbers }); } } const nfdKeySet = new Set(nRows.map(row => hkStrictKey(row.numbers))); const lotto8Unmatched = lRows.filter(row => !nfdKeySet.has(hkStrictKey(row.numbers))).length; return { year: yearText, nfdCount: nRows.length, lotto8Count: lRows.length, unique, ambiguous, unmatched, specialMismatch, lotto8Unmatched, matchRate: nRows.length ? Number((unique / nRows.length).toFixed(6)) : 0, examples, ambiguousExamples, unmatchedExamples, specialMismatchExamples }; }); const totals = perYear.reduce((acc, item) => ({ nfdCount: acc.nfdCount + item.nfdCount, lotto8Count: acc.lotto8Count + item.lotto8Count, unique: acc.unique + item.unique, ambiguous: acc.ambiguous + item.ambiguous, unmatched: acc.unmatched + item.unmatched, specialMismatch: acc.specialMismatch + item.specialMismatch, lotto8Unmatched: acc.lotto8Unmatched + item.lotto8Unmatched }), { nfdCount: 0, lotto8Count: 0, unique: 0, ambiguous: 0, unmatched: 0, specialMismatch: 0, lotto8Unmatched: 0 }); const uniqueComplete = totals.nfdCount > 0 && totals.unique === totals.nfdCount && totals.ambiguous === 0 && totals.unmatched === 0 && totals.specialMismatch === 0; return { ok: true, mode: 'read-only', databaseWrites: 0, formalSourcePolicyChanged: false, targetYears: years, nfd: { status: (nfd as any).status, parsedRecords: (nfd as any).parser?.parsedRecords ?? nfdRows.length }, lotto8: { status: (lotto8 as any).status, pagesSucceeded: (lotto8 as any).pagesSucceeded, pagesRequested: (lotto8 as any).pagesRequested, parsedRecords: lottoRows.length }, totals: { ...totals, matchRate: totals.nfdCount ? Number((totals.unique / totals.nfdCount).toFixed(6)) : 0 }, perYear, uniqueComplete, technicalFeasibility: uniqueComplete ? 'NFD YEAR+TIMES+6一般碼+特別號可在2020–2025逐筆唯一對應lotto-8日期' : '尚未達成逐筆唯一對應，必須依 ambiguous/unmatched/specialMismatch 缺口處理', formalBackfillAuthorized: true, conclusion: uniqueComplete ? '技術映射條件成立；2020–2025 已允許 NFD 依期數與7碼正式回填，DATE 可空白，lotto-8 不用於補 DATE。' : '技術映射仍有缺口；不影響 2020–2025 依 NFD 期數與7碼回填，DATE 可空白，lotto-8 不用於補 DATE。' }; } async function inspectMetalsCandidate() { const url = 'https://metals539.com/hk6-draw/'; try { const response = await requestText(url, undefined, 10000); const rows = parseMetalsHistory(response.text); return { name: '鋼鐵539 香港六合彩', url, status: response.status, coverage: hkCandidateCoverage(rows), _rows: rows }; } catch (errorValue) { return { name: '鋼鐵539 香港六合彩', url, status: 0, coverage: hkCandidateCoverage([]), _rows: [] as HkHistoryCandidateRow[], error: errorValue instanceof Error ? errorValue.message : 'Metals539 candidate probe failed' }; } } function compareHkCandidates(reference: HkHistoryCandidateRow[], candidate: HkHistoryCandidateRow[]) { const referenceMap = new Map(reference.map(row => [row.drawDate, row])); let overlappingDates = 0, sameSevenNumberSet = 0, sameExactOrder = 0; for (const row of candidate) { const other = referenceMap.get(row.drawDate); if (!other) continue; overlappingDates++; if ([...row.numbers].sort().join(',') === [...other.numbers].sort().join(',')) sameSevenNumberSet++; if (row.numbers.join(',') === other.numbers.join(',')) sameExactOrder++; } return { overlappingDates, sameSevenNumberSet, sameExactOrder, setAgreementRate: overlappingDates ? Number((sameSevenNumberSet / overlappingDates).toFixed(4)) : null }; } export async function inspectHkHistoryCandidates() { const [brightHistory, bright3000, lotto8, metals] = await Promise.all([inspectBrightstreamCandidate('Brightstream 歷史開獎','https://lottery.brightstream.com.tw/history'), inspectBrightstreamCandidate('Brightstream 3000期比對','https://lottery.brightstream.com.tw/tools/draw-comparison-3000'), inspectLotto8Candidate(), inspectMetalsCandidate()]); const internal: any[] = [brightHistory, bright3000, lotto8, metals]; const referenceRows = lotto8._rows as HkHistoryCandidateRow[]; const candidates = internal.map(item => ({ name: item.name, url: item.url, status: item.status, requestCandidates: item.requestCandidates, pagesRequested: item.pagesRequested, pagesSucceeded: item.pagesSucceeded, diagnostics: item.diagnostics, requestDetails: item.requestDetails, forms: item.forms, formDetails: item.formDetails, coverage: item.coverage, error: item.error, fields: { drawDate: item.coverage.total > 0, sevenNumbers: item.coverage.total > 0, period: item.coverage.hasPeriod }, standaloneFormalShape: item.coverage.total > 0 && item.coverage.hasPeriod && item.coverage.hasAllTargetYears })); const comparisons = internal.filter(item => item.name !== lotto8.name).map(item => ({ candidate: item.name, reference: lotto8.name, ...compareHkCandidates(referenceRows, item._rows as HkHistoryCandidateRow[]) })); return { ok: true, mode: 'read-only', databaseWrites: 0, formalSourcePolicyChanged: false, candidates, comparisons, conclusion: '本工具只判斷四個候選來源的欄位、2020–2025 年份覆蓋與同日期7碼一致性；不會把任何候選來源升格為正式來源，也不會用候選來源替 NFD 反推 DATE。' }; } export async function fetchSource(sourceId: string) {
  const config = sourceMap[sourceId];
  if (!config) throw new Error('未知資料來源');
  let data: Draw | null = null;
  if (sourceId === 'sc888') data = await fetchSc888DualOrder(config);
  else if (sourceId === 'taiwan539') data = await fetchTaiwanOfficial(config, 'Daily539Result', 'daily539Res');
  else if (sourceId === 'taiwan649') data = await fetchTaiwanOfficial(config, 'Lotto649Result', 'lotto649Res');
  else if (sourceId === 'nfdhk') data = await fetchNfdMarkSix(config, currentTaipeiMonth().slice(0, 4));
  else if (sourceId === 'arclink539' || sourceId === 'arclinkhk') data = await fetchArclink(config);
  else if (sourceId === 'hkjc') data = await fetchHkjc(config);
  if (!data) throw new Error('來源目前未直接提供可完整解析的期數、開獎日期、開獎號碼；未寫入資料庫');
  if (!data.period || !data.drawDate || data.numbers.length !== config.count) throw new Error('抓取資料不完整；未寫入資料庫');
  const { duplicate } = await save(config.table, data);
  const updated = !duplicate;
  let dateEnrichment: Awaited<ReturnType<typeof enrichMarkSixDatesFromSc888>> | { source: 'sc888'; found: number; matched: number; enriched: number; mismatched: number; error: string } | undefined;
  if (sourceId === 'nfdhk') try { dateEnrichment = await enrichMarkSixDatesFromSc888(); } catch (errorValue) { dateEnrichment = { source: 'sc888', found: 0, matched: 0, enriched: 0, mismatched: 0, error: errorValue instanceof Error ? errorValue.message : 'sc888六合彩日期補入失敗' }; }
  return { ok: true, lottery: config.lottery, data, duplicate, updated, dateEnrichment };
}

const activeAutoSourceIds = ['taiwan539', 'sc888', 'nfdhk', 'taiwan649'] as const;

export async function refreshActiveSources() {
  const results: Array<{ sourceId: string; ok: boolean; duplicate?: boolean; updated?: boolean; period?: string; error?: string }> = [];
  for (const sourceId of activeAutoSourceIds) {
    try {
      const result = await fetchSource(sourceId);
      results.push({ sourceId, ok: true, duplicate: result.duplicate, updated: result.updated, period: result.data.period });
    } catch (errorValue) {
      results.push({ sourceId, ok: false, error: errorValue instanceof Error ? errorValue.message : '自動更新失敗' });
    }
  }
  return results;
}

const maintenanceTable = 'crawler_maintenance';
type MaintenanceState = { sourceId: string; status: 'running' | 'complete' | 'failed'; startedAt: string; completedAt?: string; result?: unknown; error?: string };
async function maintenanceStates() { const items: Array<MaintenanceState & { id: string }> = []; let nextToken: string | undefined; do { const page = await db.list<MaintenanceState>(maintenanceTable,{ limit:100,...(nextToken?{nextToken}:{}) }); items.push(...page.items); nextToken=page.nextToken; } while(nextToken); return items; }
async function saveMaintenanceState(sourceId: string,state: MaintenanceState) { const current=(await maintenanceStates()).filter(item=>item.sourceId===sourceId).sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0]; if(current) { const [ok]=await db.update(maintenanceTable,[{id:current.id,record:state}]); if(!ok) throw new Error('完整回填狀態更新失敗'); return; } const [id]=await db.add(maintenanceTable,[state]); if(!id) throw new Error('完整回填狀態建立失敗'); }
async function deduplicateTable(table: string) { const rows=await listAllTableRecords(table); const groups=new Map<string,Array<Draw & {id:string}>>(); for(const row of rows) groups.set(row.period,[...(groups.get(row.period)??[]),row]); let removed=0; for(const group of groups.values()) { if(group.length<2) continue; const keeper=group[0]; let merged:Draw=materializeOrderFields(keeper); for(const duplicate of group.slice(1)) merged=mergeDrawRecord(merged,duplicate); const [updated]=await db.update(table,[{id:keeper.id,record:merged}]); if(!updated) throw new Error('重複期數合併失敗'); const ids=group.slice(1).map(item=>item.id); for(let index=0;index<ids.length;index+=20) { const deleted=await db.delete(table,ids.slice(index,index+20)); if(!deleted.every(Boolean)) throw new Error('重複期數刪除失敗'); removed+=deleted.length; } } return removed; }
async function backfillChunked(sourceId:'taiwan539'|'taiwan649',start:number,end:number) { const ranges=[]; for(let year=start;year<=end;year+=10) ranges.push(await backfillSourceRange(sourceId,String(year),String(Math.min(end,year+9)))); return ranges; }
async function backfillNfdComplete(endYear:number) { const historicalEnd=Math.min(2025,endYear); const [generalFile,drawOrderFile]=await Promise.all([probeNfdDbFile('A841.DB','https://www.nfd.com.tw/lottery/V6.0/A841.db'),probeNfdDbFile('A842.DB','https://www.nfd.com.tw/lottery/V6.0/A842.db')]); const generalRows=((generalFile as {_rows?:NfdDbRow[]})._rows??[]).filter(row=>row.year>=1976&&row.year<=historicalEnd&&row.year!==1997); const drawRows=((drawOrderFile as {_rows?:NfdDbRow[]})._rows??[]).filter(row=>row.year>=1976&&row.year<=historicalEnd&&row.year!==1997); const drawMap=new Map(drawRows.map(row=>[row.year+'-'+row.times,row])); const draws:Draw[]=[]; for(const row of generalRows) { const dropped=drawMap.get(row.year+'-'+row.times); if(!dropped) continue; const sortedNumbers=sortDrawNumbers(row.numbers.map(String)); const drawOrderNumbers=normalizeNumberList(dropped.numbers.map(String)); if(sortDrawNumbers(drawOrderNumbers).join(',')!==sortedNumbers.join(',')) continue; draws.push({period:normalizeNfdPeriod(String(row.year),String(row.times)),drawDate:'',numbers:sortedNumbers,sortedNumbers,drawOrderNumbers}); } if(draws.length===0) throw new Error('NFD 完整歷史資料解析為空'); const saved=await saveMany(sourceMap.nfdhk.table,draws,true,6); const current=endYear>historicalEnd?await backfillNfd(String(endYear)):null; let dateEnrichment: Awaited<ReturnType<typeof enrichMarkSixDatesFromSc888>> | { source: 'sc888'; found: number; matched: number; enriched: number; mismatched: number; error: string }; try { dateEnrichment=await enrichMarkSixDatesFromSc888(); } catch(errorValue) { dateEnrichment={source:'sc888',found:0,matched:0,enriched:0,mismatched:0,error:errorValue instanceof Error?errorValue.message:'sc888六合彩日期補入失敗'}; } return {found:draws.length,inserted:saved.inserted,duplicates:saved.duplicates,enriched:saved.enriched,current,dateEnrichment}; }
export async function completeHistoricalSource(sourceId:string) { if(!historicalSourceIds.includes(sourceId as HistoricalSourceId)) throw new Error('完整回填只允許正式來源'); const previous=(await maintenanceStates()).find(item=>item.sourceId===sourceId&&item.status==='complete'); if(previous) return {sourceId,skipped:true,previous:previous.result}; const startedAt=new Date().toISOString(); await saveMaintenanceState(sourceId,{sourceId,status:'running',startedAt}); try { const currentYear=Number(currentTaipeiMonth().slice(0,4)); let backfill:unknown; if(sourceId==='taiwan539') backfill=await backfillChunked('taiwan539',2007,currentYear); else if(sourceId==='sc888') backfill=await backfillSourceRange('sc888','1992',String(currentYear)); else if(sourceId==='nfdhk') backfill=await backfillNfdComplete(currentYear); else backfill=await backfillChunked('taiwan649',2004,currentYear); const table=sourceMap[sourceId].table; const removedDuplicates=await deduplicateTable(table); const audit=await getMatrixAudit(); const result={sourceId,backfill,removedDuplicates,audit:audit[sourceMap[sourceId].lottery]}; await saveMaintenanceState(sourceId,{sourceId,status:'complete',startedAt,completedAt:new Date().toISOString(),result}); return result; } catch(errorValue) { const message=errorValue instanceof Error?errorValue.message:'完整回填失敗'; await saveMaintenanceState(sourceId,{sourceId,status:'failed',startedAt,completedAt:new Date().toISOString(),error:message}); throw errorValue; } }
export async function getHistoricalMaintenanceStatus() { return maintenanceStates(); }

function markSixYearFromPeriod(period: string) {
  if (!/^0\d{5}$/.test(period)) return null;
  const yy = Number(period.slice(1, 3));
  const year = yy >= 76 ? 1900 + yy : 2000 + yy;
  return year >= 1976 && year <= 2075 ? year : null;
}

function markSixPeriodOrder(period: string) {
  const year = markSixYearFromPeriod(period);
  if (year === null) return null;
  const times = Number(period.slice(3));
  return Number.isInteger(times) ? year * 1000 + times : null;
}

function sortDraws(items: Draw[]) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.drawDate);
    const bTime = Date.parse(b.drawDate);
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
    const aOrder = markSixPeriodOrder(a.period);
    const bOrder = markSixPeriodOrder(b.period);
    if (aOrder !== null && bOrder !== null && aOrder !== bOrder) return bOrder - aOrder;
    return b.period.localeCompare(a.period, undefined, { numeric: true });
  });
}

export async function getMatrixHistory(lottery: string, requestedLimit: number | null = 100) {
  const table = tableByLottery[lottery];
  if (!table) throw new Error('未知彩種');
  const rows = sortDraws(deduplicateDrawRecords(await listAllTableRecords(table)));
  const selected = requestedLimit === null ? rows : rows.slice(0, Math.min(Math.max(Math.trunc(requestedLimit) || 100, 1), 5000));
  return selected.map(item => { const materialized = materializeOrderFields(item); return { period: materialized.period, drawDate: materialized.drawDate, numbers: materialized.sortedNumbers ?? materialized.numbers, sortedNumbers: materialized.sortedNumbers ?? materialized.numbers, drawOrderNumbers: materialized.drawOrderNumbers ?? null }; });
}

const nextDrawUrlByLottery: Record<string,string[]> = { '今彩539': ['https://sc888.net/index.php?s=/LotteryFtn/index',sourceMap.taiwan539.url], '天天樂': [sourceMap.sc888.url], '六合彩': ['https://sc888.net/index.php?s=/LotterySix/index',sourceMap.nfdhk.url,sourceMap.hkjc.url], '大樂透': ['https://sc888.net/index.php?s=/LotteryBlt/index',sourceMap.taiwan649.url] };
function nextDrawIsoFromText(value: string) { const epochText = value.match(/\bthisBetTime\s*=\s*["']?(\d{10,13})/i)?.[1]; if (epochText) { const milliseconds = Number(epochText) * (epochText.length === 10 ? 1000 : 1); if (Number.isFinite(milliseconds)) return new Date(milliseconds).toISOString(); } const marker = value.search(/下(?:次|期)(?:開獎|攪珠)|下回開獎|下一期/i); if (marker < 0) return null; const segment = value.slice(marker, marker + 240); const date = segment.match(/((?:20\d{2}|1\d{2})\s*[年\/.-]\s*\d{1,2}\s*[月\/.-]\s*\d{1,2})/)?.[1] ?? ''; const timeMatch = segment.match(/(上午|下午)?\s*(\d{1,2})\s*[:：]\s*(\d{2})/); if (!date || !timeMatch) return null; const parts = date.match(/(\d{3,4})\D+(\d{1,2})\D+(\d{1,2})/); if (!parts) return null; let year = Number(parts[1]); if (year < 1911) year += 1911; let hour = Number(timeMatch[2]); if (timeMatch[1] === '下午' && hour < 12) hour += 12; if (timeMatch[1] === '上午' && hour === 12) hour = 0; const month = Number(parts[2]); const day = Number(parts[3]); const minute = Number(timeMatch[3]); if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null; return String(year).padStart(4,'0') + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0') + 'T' + String(hour).padStart(2,'0') + ':' + String(minute).padStart(2,'0') + ':00+08:00'; }
async function scrapeNextDrawAt(lottery: string) { const urls = nextDrawUrlByLottery[lottery] ?? []; for (const url of urls) { try { const response = await requestText(url,undefined,15000); if (response.status < 200 || response.status >= 300) continue; const scriptedNextDrawAt = nextDrawIsoFromText(response.text); const $ = cheerio.load(response.text); $('script,style,noscript').remove(); const nextDrawAt = scriptedNextDrawAt ?? nextDrawIsoFromText(clean($.root().text())); if (nextDrawAt && Date.parse(nextDrawAt) > Date.now()) return nextDrawAt; } catch {} } return null; }
export async function getMatrixLatest(lottery: string) { const item = (await getMatrixHistory(lottery, 1))[0] ?? null; if (!item) return null; return { ...item, nextDrawAt: await scrapeNextDrawAt(lottery) }; }

export async function getMatrixCoverage() {
  const targets = [1000, 3000, 5000];
  const coverage: Record<string, { total: number; latest: string | null; earliest: string | null; thresholds: Record<string, boolean>; missing: Record<string, number> }> = {};
  for (const lottery of Object.keys(tableByLottery)) {
    const rows = sortDraws(deduplicateDrawRecords(await listAllTableRecords(tableByLottery[lottery])));
    const total = rows.length;
    coverage[lottery] = {
      total,
      latest: rows[0]?.period ?? null,
      earliest: rows.length ? rows[rows.length - 1].period : null,
      thresholds: Object.fromEntries(targets.map(target => [String(target), total >= target])),
      missing: Object.fromEntries(targets.map(target => [String(target), Math.max(0, target - total)])),
    };
  }
  return coverage;
}

export async function getMatrixAudit() {
  const targets = [1000, 3000, 5000];
  const expectedCounts: Record<string, number> = { '今彩539': 5, '天天樂': 5, '六合彩': 7, '大樂透': 7 };
  const maxNumbers: Record<string, number> = { '今彩539': 39, '天天樂': 39, '六合彩': 49, '大樂透': 49 };
  const audit: Record<string, { total: number; uniquePeriods: number; duplicatePeriodCount: number; duplicatePeriods: string[]; invalidRecords: number; latestPeriod: string | null; earliestPeriod: string | null; latestDate: string | null; earliestDate: string | null; expectedNumberCount: number; sortedOrderRecords: number; drawOrderRecords: number; missingSortedOrderRecords: number; missingDrawOrderRecords: number; perYear: Record<string, number>; thresholds: Record<string, boolean>; missing: Record<string, number> }> = {};
  for (const lottery of Object.keys(tableByLottery)) {
    const rows = sortDraws(await listAllTableRecords(tableByLottery[lottery]));
    const expectedCount = expectedCounts[lottery];
    const maxNumber = maxNumbers[lottery];
    const periodCounts = new Map<string, number>();
    const perYear: Record<string, number> = {};
    let invalidRecords = 0;
    let sortedOrderRecords = 0;
    let drawOrderRecords = 0;
    for (const row of rows) {
      periodCounts.set(row.period, (periodCounts.get(row.period) ?? 0) + 1);
      const undatedMarkSixYear = lottery === '六合彩' && !row.drawDate ? markSixYearFromPeriod(row.period) : null;
      const year = row.drawDate.match(/^(20\d{2})/)?.[1] ?? (undatedMarkSixYear !== null ? String(undatedMarkSixYear) : undefined);
      if (year) perYear[year] = (perYear[year] ?? 0) + 1;
      const materialized = materializeOrderFields(row);
      const numbersValid = Array.isArray(materialized.sortedNumbers) && materialized.sortedNumbers.length === expectedCount && materialized.sortedNumbers.every(value => { const number = Number(value); return Number.isInteger(number) && number >= 1 && number <= maxNumber; });
      if (numbersValid) sortedOrderRecords += 1;
      const drawOrderValid = Array.isArray(materialized.drawOrderNumbers) && materialized.drawOrderNumbers.length === expectedCount && materialized.drawOrderNumbers.every(value => { const number = Number(value); return Number.isInteger(number) && number >= 1 && number <= maxNumber; }) && sortDrawNumbers(materialized.drawOrderNumbers).join(',') === materialized.sortedNumbers?.join(',');
      if (drawOrderValid) drawOrderRecords += 1;
      const dateValid = Number.isFinite(Date.parse(row.drawDate)) || undatedMarkSixYear !== null;
      const periodValid = Boolean(row.period) && (lottery !== '六合彩' || /^\d{6}$/.test(row.period));
      if (!numbersValid || !dateValid || !periodValid) invalidRecords += 1;
    }
    const duplicatePeriods = [...periodCounts.entries()].filter(([, count]) => count > 1).map(([period]) => period).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const total = rows.length;
    audit[lottery] = {
      total,
      uniquePeriods: periodCounts.size,
      duplicatePeriodCount: duplicatePeriods.length,
      duplicatePeriods: duplicatePeriods.slice(0, 20),
      invalidRecords,
      latestPeriod: rows[0]?.period ?? null,
      earliestPeriod: rows.length ? rows[rows.length - 1].period : null,
      latestDate: rows[0]?.drawDate ?? null,
      earliestDate: rows.length ? rows[rows.length - 1].drawDate : null,
      expectedNumberCount: expectedCount,
      sortedOrderRecords,
      drawOrderRecords,
      missingSortedOrderRecords: Math.max(0, total - sortedOrderRecords),
      missingDrawOrderRecords: Math.max(0, total - drawOrderRecords),
      perYear: Object.fromEntries(Object.entries(perYear).sort(([a], [b]) => b.localeCompare(a))),
      thresholds: Object.fromEntries(targets.map(target => [String(target), total >= target])),
      missing: Object.fromEntries(targets.map(target => [String(target), Math.max(0, target - total)])),
    };
  }
  return audit;
}

export async function listRecords(lottery: string) {
  const table = tableByLottery[lottery];
  if (!table) throw new Error('未知彩種');
  const { items } = await db.list<Draw>(table, { limit: 50 });
  return items.map(item => materializeOrderFields(item));
}
