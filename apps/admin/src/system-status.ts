export type SystemStatusItem = {
  id: string;
  name: string;
  description: string;
  ok: boolean;
  checkedAt: string;
  responseMs: number;
  error?: string;
  detail?: unknown;
};

export type SystemStatusResult = { checkedAt: string; items: SystemStatusItem[] };

export async function loadSystemStatus(api: { get(url: string): Promise<{ data: SystemStatusResult }> }) {
  const response = await api.get('/api/system-status');
  return response.data;
}
