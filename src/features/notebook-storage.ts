import type { NotebookNote } from './NotebookPages';

export type NotebookData = { notes: NotebookNote[] };
export type NotebookRead = { status: 'ready'; data: NotebookData } | { status: 'error' };

const keyFor = (userId: string, version = 2) => `matrix-notebook:v${version}:${encodeURIComponent(userId)}`;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Only owned notes are adopted; unreadable notes never become a writable empty notebook. */
function validData(value: unknown): value is NotebookData {
  return object(value) && Array.isArray(value.notes) && value.notes.every((note) => object(note)
    && typeof note.id === 'string' && typeof note.title === 'string' && typeof note.content === 'string'
    && typeof note.updatedAt === 'string' && Number.isFinite(Date.parse(note.updatedAt)));
}

export function readNotebookData(userId: string): NotebookRead {
  try {
    // Read the same owner's prior snapshot only until a notes-only snapshot exists.
    // Old snapshots and unowned keys remain untouched.
    const stored = window.localStorage.getItem(keyFor(userId)) ?? window.localStorage.getItem(keyFor(userId, 1));
    const data: unknown = stored === null ? { notes: [] } : JSON.parse(stored);
    return validData(data) ? { status: 'ready', data: { notes: data.notes } } : { status: 'error' };
  } catch { return { status: 'error' }; }
}

export function writeNotebookData(userId: string, data: NotebookData): boolean {
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify({ notes: data.notes }));
    return true;
  } catch { return false; }
}
