import { useEffect, useRef, useState } from 'react';

import { formatAdminRowForDisplay } from './admin-display';
import { readAdminDataPage, type AdminDataPage } from './admin-table-pagination';
type Client = { get(path: string, config?: { signal?: AbortSignal }): Promise<{ data: unknown }> };
export type AdminListQuery = { page: number; keyword: string; status: string; startDate: string; endDate: string; sortBy: string; sortDirection: 'asc' | 'desc'; plan?: string };
const defaults: Record<string, string> = {
  activationCodes: 'createdAt', privateActivationCodes: 'createdAt', auditLogs: 'operationTime', admins: 'createdAt',
  subscriptionRecords: 'paidAt', transferRequests: 'submittedAt', loginRecords: 'loginAt', plans: 'name', users: 'registeredAt', subscriptions: 'planStartedAt',
};
const initialQuery = (table: string | null): AdminListQuery => ({ page: 1, keyword: '', status: 'all', startDate: '', endDate: '', sortBy: defaults[table ?? ''] ?? 'createdAt', sortDirection: 'desc', ...(table === 'subscriptions' ? { plan: 'all' } : {}) });

export function useAdminDataPage(table: string | null, revision: number, client: Client, sessionKey: string, enabled = true) {
  const [selection, setSelection] = useState(() => ({ table, sessionKey, query: initialQuery(table), debounce: false }));
  const query = selection.table === table && selection.sessionKey === sessionKey ? selection.query : initialQuery(table);
  const queryString = new URLSearchParams({ ...query, page: String(query.page) }).toString();
  const key = `${sessionKey}:${table}:${queryString}:${revision}`;
  const getMethod = useRef(client.get);
  getMethod.current = client.get;
  const identity = useRef(key);
  identity.current = key;
  const mounted = useRef(false);
  const sequence = useRef(0);
  const activeRead = useRef<AbortController | null>(null);
  const previousSelection = useRef(selection);
  const [result, setResult] = useState<{ key: string; data?: AdminDataPage; error?: string } | null>(null);

  const refresh = async () => {
    if (!table || !sessionKey || !enabled) return;
    if (!mounted.current || identity.current !== key || getMethod.current !== client.get) throw new Error('列表重新載入已取消');
    activeRead.current?.abort();
    const controller = new AbortController();
    activeRead.current = controller;
    const request = ++sequence.current;
    const current = () => mounted.current && identity.current === key && request === sequence.current && getMethod.current === client.get;
    setResult(null);
    try {
      const { data } = await client.get(`/api/data/${table}?${queryString}`, { signal: controller.signal });
      const page = readAdminDataPage(data);
      if (!current()) throw new Error('列表重新載入已取消');
      setResult({ key, data: page });
    } catch (cause) {
      if (current() && !controller.signal.aborted) setResult({ key, error: '列表載入失敗，請重新載入' });
      throw cause;
    } finally {
      if (activeRead.current === controller) activeRead.current = null;
    }
  };

  useEffect(() => {
    mounted.current = true;
    const delay = previousSelection.current !== selection && selection.table === table && selection.sessionKey === sessionKey && selection.debounce ? 300 : 0;
    previousSelection.current = selection;
    const timer = enabled ? window.setTimeout(() => { void refresh().catch(() => {}); }, delay) : null;
    return () => {
      mounted.current = false;
      activeRead.current?.abort();
      sequence.current += 1;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [client.get, key, enabled]);

  const current = result?.key === key ? result : null;
  const setQuery = (patch: Partial<AdminListQuery>) => {
    const nextQuery = { ...query, page: 1, ...patch };
    if (JSON.stringify(nextQuery) === JSON.stringify(query)) return;
    activeRead.current?.abort();
    // Invalidate immediately, before the next render/effect can start a new read.
    sequence.current += 1;
    setSelection(value => ({ table, sessionKey, debounce: Object.keys(patch).every(field => field === 'keyword') && Boolean(patch.keyword) && patch.keyword !== value.query.keyword, query: { ...(value.table === table && value.sessionKey === sessionKey ? value.query : initialQuery(table)), page: 1, ...patch } }));
  };
  return {
    query, setQuery, setPage: (page: number) => setQuery({ page }), refresh,
    items: (current?.data?.items ?? []).map(row => formatAdminRowForDisplay(table, row)), total: current?.data?.total ?? 0,
    currentPage: current?.data?.currentPage ?? query.page, totalPages: current?.data?.totalPages ?? query.page,
    loading: Boolean(table && sessionKey && enabled) && current === null, error: current?.error ?? '',
  };
}

export type AdminDataPageController = ReturnType<typeof useAdminDataPage>;
