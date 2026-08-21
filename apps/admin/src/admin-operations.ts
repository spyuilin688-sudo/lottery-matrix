type Row = Record<string, unknown> & { id: string };
type ApiClient = {
  put(url: string, data?: unknown): Promise<{ data: unknown }>;
};

export function filterRows(rows: Row[], keyword: string, status: string) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase('zh-TW');
  const normalizeStatus = (value: unknown) => {
    const raw = String(value ?? '');
    if (raw === '啟用') return 'active';
    if (raw === '停用' || raw === 'inactive') return 'disabled';
    return raw;
  };
  return rows.filter((row) => {
    const matchesStatus = status === 'all' || normalizeStatus(row.status) === status;
    const searchable = Object.values(row).map((value) => {
      if (value && typeof value === 'object') return JSON.stringify(value);
      return String(value ?? '');
    }).join(' ').toLocaleLowerCase('zh-TW');
    return matchesStatus && (!normalizedKeyword || searchable.includes(normalizedKeyword));
  });
}

export async function saveMemberStatus(api: ApiClient, id: string, status: 'active' | 'disabled') {
  return api.put(`/api/members/${id}/status`, { status });
}

export async function saveSubscription(
  api: ApiClient,
  id: string,
  payload: {
    action: 'activate' | 'renew' | 'cancel' | 'adjustExpiry' | 'lifetime';
    planId?: string;
    expiresAt?: string;
  },
) {
  return api.put(`/api/subscriptions/${id}`, payload);
}
