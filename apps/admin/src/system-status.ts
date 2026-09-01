export type SystemStatusItem = {
  id: string;
  name: string;
  description: string;
  ok: boolean;
  checkedAt: string;
  responseMs: number;
  retryable?: boolean;
  error?: string;
  detail?: unknown;
};

export type SystemStatusResult = { checkedAt: string; items: SystemStatusItem[] };
export type CrawlerRefreshResult = {
  lottery: string;
  period: string;
  drawDate: string | null;
};

const crawlerStatusIds = new Set([
  'cron-matrix-539-refresh-v2',
  'cron-matrix-fantasy5-refresh-v2',
  'cron-matrix-marksix-refresh-v2',
  'cron-matrix-649-refresh-v2',
]);

export async function loadSystemStatus(api: { get(url: string): Promise<{ data: SystemStatusResult }> }) {
  const response = await api.get('/api/system-status');
  return response.data;
}

export async function retrySystemStatus(
  api: { post(url: string): Promise<{ data: { item: SystemStatusItem } }> },
  id: string,
) {
  const response = await api.post(`/api/system-status/${id}/retry`);
  return response.data.item;
}

export async function refreshCrawlerSystemStatus(
  api: { post(url: string): Promise<{ data: { refresh: CrawlerRefreshResult } }> },
  id: string,
) {
  const response = await api.post(`/api/system-status/${id}/refresh`);
  return response.data.refresh;
}

export function canRefreshCrawler(item: SystemStatusItem, canEdit: boolean) {
  if (!canEdit || item.ok || !crawlerStatusIds.has(item.id)) return false;
  if (item.detail === null) return true;
  if (
    !item.detail
    || typeof item.detail !== 'object'
    || Array.isArray(item.detail)
  ) {
    return false;
  }
  return (item.detail as Record<string, unknown>).status === 'failed';
}
