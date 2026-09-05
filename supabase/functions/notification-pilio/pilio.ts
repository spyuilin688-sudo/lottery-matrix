export type PilioSource = { lottery: string; lotteryCode: string; url: string; startMinute: number; endMinute: number; mainCount: number; maximum: number };
export type PilioResult = { lottery: string; lotteryCode: string; drawDate: string; numbers: string[] };
export const PILIO_SOURCES: PilioSource[] = [
  { lottery: "今彩539", lotteryCode: "539", url: "https://www.pilio.idv.tw/lto539/list.asp", startMinute: 1235, endMinute: 1240, mainCount: 5, maximum: 39 },
  { lottery: "六合彩", lotteryCode: "marksix", url: "https://www.pilio.idv.tw/ltohk/list.asp", startMinute: 1295, endMinute: 1300, mainCount: 6, maximum: 49 },
  { lottery: "大樂透", lotteryCode: "lotto649", url: "https://www.pilio.idv.tw/ltobig/list.asp", startMinute: 1255, endMinute: 1260, mainCount: 6, maximum: 49 },
];

export function taipeiDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function duePilioSources(now: Date): PilioSource[] {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const minute = Number(parts.find(part => part.type === "hour")?.value) * 60 + Number(parts.find(part => part.type === "minute")?.value);
  return PILIO_SOURCES.filter(source => minute >= source.startMinute && minute <= source.endMinute);
}

function cellText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ").replace(/\s+/g, " ").trim();
}

function drawDate(text: string): string | null {
  const full = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s|[（(]|$)/.exec(text);
  const short = /^(\d{1,2})\/(\d{1,2})\s+(\d{2})(?:\s|[（(]|$)/.exec(text);
  if (!full && !short) return null;
  const year = full ? full[1] : `20${short![3]}`;
  const month = (full ? full[2] : short![1]).padStart(2, "0");
  const day = (full ? full[3] : short![2]).padStart(2, "0");
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

function numbers(text: string, count: number, maximum: number): string[] | null {
  if (!/^[\d\s,，、-]+$/.test(text)) return null;
  const values = text.match(/\d+/g) ?? [];
  if (values.length !== count || values.some(value => value.length > 2 || Number(value) < 1 || Number(value) > maximum)) return null;
  const normalized = values.map(value => value.padStart(2, "0"));
  return new Set(normalized).size === normalized.length ? normalized : null;
}

export function parsePilioResult(html: string, source: PilioSource, targetDate: string): PilioResult | null {
  const clean = html.replace(/<!--[^]*?-->|<script\b[^]*?<\/script\s*>|<style\b[^]*?<\/style\s*>/gi, "");
  for (const row of clean.matchAll(/<tr\b[^>]*>([^]*?)<\/tr\s*>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([^]*?)<\/td\s*>/gi)].map(match => cellText(match[1]));
    const date = cells.length ? drawDate(cells[0]) : null;
    if (!date) continue;
    // The page is newest first: never reach back into an older complete draw.
    if (date !== targetDate) return null;
    const main = numbers(cells[1] ?? "", source.mainCount, source.maximum);
    if (!main) return null;
    const special = source.mainCount === 6 ? numbers(cells[2] ?? "", 1, source.maximum) : [];
    if (!special || special.some(value => main.includes(value))) return null;
    return { lottery: source.lottery, lotteryCode: source.lotteryCode, drawDate: date, numbers: [...main, ...special] };
  }
  return null;
}
