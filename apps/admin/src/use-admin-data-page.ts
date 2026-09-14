import { useEffect, useRef, useState } from 'react';

import { readAdminDataPage, type AdminDataPage } from './admin-table-pagination';
type Client = { get(path: string): Promise<{ data: unknown }> };
export type AdminListQuery = { page: number; keyword: string; status: string; startDate: string; endDate: string; sortBy: string; sortDirection: 'asc' | 'desc'; plan?: string };
const defaults: Record<string, string> = {
  activationCodes: 'createdAt', auditLogs: 'operationTime', admins: 'createdAt',
  subscriptionRecords: 'paidAt', transferRequests: 'submittedAt', loginRecords: 'loginAt', plans: 'name', users: 'registeredAt', subscriptions: 'planStartedAt',
};
const initialQuery = (table: string | null): AdminListQuery => ({ page: 1, keyword: '', status: 'all', startDate: '', endDate: '', sortBy: defaults[table ?? ''] ?? 'createdAt', sortDirection: 'desc', ...(table === 'subscriptions' ? { plan: 'all' } : {}) });

export function useAdminDataPage(table: string | null, revision: number, client: Client, sessionKey: string) {
  const [selection, setSelection] = useState(() => ({ table, sessionKey, query: initialQuery(table) }));
  const query = selection.table === table && selection.sessionKey === sessionKey ? selection.query : initialQuery(table);
  const queryString = new URLSearchParams({ ...query, page: String(query.page) }).toString();
  const key = `${sessionKey}:${table}:${queryString}:${revision}`;
  const getMethod = useRef(client.get);
  getMethod.current = client.get;
  const identity = useRef(key);
  identity.current = key;
  const mounted = useRef(false);
  const sequence = useRef(0);
  const [result, setResult] = useState<{ key: string; data?: AdminDataPage; error?: string } | null>(null);

  const refresh = async () => {
    if (!table || !sessionKey) return;
    if (!mounted.current || identity.current !== key || getMethod.current !== client.get) throw new Error('列表重新載入已取消');
    const request = ++sequence.current;
    const current = () => mounted.current && identity.current === key && request === sequence.current && getMethod.current === client.get;
    setResult(null);
    try {
      const { data } = await client.get(`/api/data/${table}?${queryString}`);
      const page = readAdminDataPage(data);
      if (!current()) throw new Error('列表重新載入已取消');
      setResult({ key, data: page });
    } catch (cause) {
      if (current()) setResult({ key, error: '列表載入失敗，請重新載入' });
      throw cause;
    }
  };

  useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(() => { void refresh().catch(() => {}); }, query.keyword ? 300 : 0);
    return () => {
      mounted.current = false;
      sequence.current += 1;
      window.clearTimeout(timer);
    };
  }, [client.get, key]);

  const current = result?.key === key ? result : null;
  const setQuery = (patch: Partial<AdminListQuery>) => {
    // Invalidate immediately, before the next render/effect can start a new read.
    sequence.current += 1;
    setSelection(value => ({ table, sessionKey, query: { ...(value.table === table && value.sessionKey === sessionKey ? value.query : initialQuery(table)), page: 1, ...patch } }));
  };
  return {
    query, setQuery, setPage: (page: number) => setQuery({ page }), refresh,
    items: current?.data?.items ?? [], total: current?.data?.total ?? 0,
    currentPage: current?.data?.currentPage ?? query.page, totalPages: current?.data?.totalPages ?? query.page,
    loading: Boolean(table && sessionKey) && current === null, error: current?.error ?? '',
  };
}

export type AdminDataPageController = ReturnType<typeof useAdminDataPage>;
