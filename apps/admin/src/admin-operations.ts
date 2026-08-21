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

export function formatAdminDateTime(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}/${part('month')}/${part('day')} ${part('hour')}:${part('minute')}`;
}

export function paginateRows<T>(rows: T[], page: number, pageSize = 30) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), currentPage, totalPages };
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
