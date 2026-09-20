export type ManualRefreshTask = {
  lottery: '今彩539' | '天天樂' | '六合彩' | '大樂透';
  requestId: string;
  status: 'accepted' | 'running' | 'complete' | 'failed';
  period: string | null;
  drawDate: string | null;
  error: 'SOURCE_NOT_READY' | 'REFRESH_FAILED' | 'REFRESH_INTERRUPTED' | null;
};
export const isRefreshRequestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function parseManualRefresh(value: unknown, lottery: string, requestId?: string): ManualRefreshTask | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const task = value as Record<string, unknown>;
  if (task.lottery !== lottery || !['今彩539', '天天樂', '六合彩', '大樂透'].includes(lottery)
    || !isRefreshRequestId(task.requestId) || (requestId !== undefined && task.requestId !== requestId)
    || !['accepted', 'running', 'complete', 'failed'].includes(String(task.status))) return null;
  if (task.drawDate !== null && typeof task.drawDate !== 'string') return null;
  if (task.status === 'complete') {
    if (typeof task.period !== 'string' || !task.period.trim() || task.error !== null) return null;
  } else if (task.period !== null || task.drawDate !== null) return null;
  if (task.status === 'failed') {
    if (!['SOURCE_NOT_READY', 'REFRESH_FAILED', 'REFRESH_INTERRUPTED'].includes(String(task.error))) return null;
  } else if (task.error !== null) return null;
  return { lottery: lottery as ManualRefreshTask['lottery'], requestId: task.requestId,
    status: task.status as ManualRefreshTask['status'], period: task.period as string | null,
    drawDate: task.drawDate as string | null, error: task.error as ManualRefreshTask['error'] };
}
