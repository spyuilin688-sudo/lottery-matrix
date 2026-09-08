import type { LotteryId } from '../Prototype';
import type { LotteryRecordSettings, NotebookNote, NotebookRecord } from './NotebookPages';

export type NotebookData = {
  notes: NotebookNote[];
  records: NotebookRecord[];
  settings: Record<LotteryId, LotteryRecordSettings>;
};
export type NotebookRead = { status: 'ready'; data: NotebookData } | { status: 'error' };

const keyFor = (userId: string) => `matrix-notebook:v1:${encodeURIComponent(userId)}`;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

/** Invalid or unreadable data is never converted into an empty, writable notebook. */
function validData(value: unknown, defaults: NotebookData['settings']): value is NotebookData {
  if (!object(value) || !Array.isArray(value.notes) || !Array.isArray(value.records) || !object(value.settings)) return false;
  const lotteries = Object.keys(defaults);
  const notesValid = value.notes.every((note) => object(note)
    && typeof note.id === 'string' && typeof note.title === 'string' && typeof note.content === 'string'
    && typeof note.updatedAt === 'string' && Number.isFinite(Date.parse(note.updatedAt)));
  const recordsValid = value.records.every((record) => object(record)
    && typeof record.id === 'string' && lotteries.includes(String(record.lottery))
    && typeof record.date === 'string' && Number.isFinite(Date.parse(record.date))
    && ['單號', '連碰', '立柱'].includes(String(record.mode))
    && strings(record.numbers) && Array.isArray(record.columns) && record.columns.every(strings) && strings(record.tags)
    && ['quantity', 'bets', 'cost', 'estimatedPrize', 'actualPrize'].every((key) => finite(record[key]))
    && ['等待開獎', '已結算', '已鎖定'].includes(String(record.status)) && typeof record.unlocked === 'boolean'
    && object(record.snapshot) && lotteries.includes(String(record.snapshot.lottery))
    && finite(record.snapshot.quantity) && typeof record.snapshot.createdDate === 'string' && typeof record.snapshot.createdTime === 'string'
    && Array.isArray(record.snapshot.plays) && record.snapshot.plays.every((play) => object(play)
      && typeof play.name === 'string' && ['bets', 'costPerBet', 'cost', 'playPrize'].every((key) => finite(play[key]))));
  const settings = value.settings;
  const settingsValid = lotteries.every((lottery) => {
    const setting = settings[lottery];
    return object(setting) && Array.isArray(setting.tags) && setting.tags.every((tag) => object(tag)
      && typeof tag.name === 'string' && ['依照碰數', '固定成本'].includes(String(tag.costMode))
      && ['defaultBets', 'costPerBet', 'fixedCost', 'prizePerBet'].every((key) => finite(tag[key])));
  });
  return notesValid && recordsValid && settingsValid;
}

export function readNotebookData(userId: string, defaults: NotebookData['settings']): NotebookRead {
  try {
    // The old unowned keys deliberately remain untouched: their owner is unknown.
    const stored = window.localStorage.getItem(keyFor(userId));
    const data: unknown = stored === null ? { notes: [], records: [], settings: defaults } : JSON.parse(stored);
    return validData(data, defaults) ? { status: 'ready', data } : { status: 'error' };
  } catch { return { status: 'error' }; }
}

export function writeNotebookData(userId: string, data: NotebookData): boolean {
  try {
    // One atomic browser write avoids partially saving notes, records and settings.
    window.localStorage.setItem(keyFor(userId), JSON.stringify(data));
    return true;
  } catch { return false; }
}
