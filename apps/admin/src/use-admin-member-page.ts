import { useEffect, useState } from 'react';

type Row = Record<string, unknown> & { id: string };
type Page = { items: Row[]; total: number; currentPage: number; totalPages: number };
type Client = { get(path: string): Promise<{ data: Page }> };

export function useAdminMemberPage(table: 'users' | 'subscriptions', revision: number, client: Client) {
  const [query, setQuery] = useState({ page: 1, keyword: '', status: 'all', plan: 'all' });
  const [attempt, setAttempt] = useState(0);
  const queryString = new URLSearchParams({
    page: String(query.page),
    keyword: query.keyword,
    status: query.status,
    ...(table === 'subscriptions' ? { plan: query.plan } : {}),
  }).toString();
  const key = `${table}:${queryString}:${revision}:${attempt}`;
  const [result, setResult] = useState<{ key: string; data?: Page; error?: string } | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      client.get(`/api/data/${table}?${queryString}`).then(({ data }) => {
        if (!Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0
            || !Number.isSafeInteger(data.currentPage) || data.currentPage < 1
            || !Number.isSafeInteger(data.totalPages) || data.totalPages < 1) throw new Error('Invalid member page');
        if (active) setResult({ key, data });
      }).catch(() => { if (active) setResult({ key, error: '列表載入失敗，請重新載入' }); });
    }, query.keyword ? 200 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [client, table, queryString, key, query.keyword]);

  const current = result?.key === key ? result : null;
  return {
    keyword: query.keyword,
    status: query.status,
    plan: query.plan,
    setKeyword: (keyword: string) => setQuery(value => ({ ...value, keyword, page: 1 })),
    setStatus: (status: string) => setQuery(value => ({ ...value, status, page: 1 })),
    setPlan: (plan: string) => setQuery(value => ({ ...value, plan, page: 1 })),
    setPage: (page: number) => setQuery(value => ({ ...value, page })),
    paged: current?.data ?? { items: [], currentPage: query.page, totalPages: query.page },
    total: current?.data?.total ?? 0,
    loading: current === null,
    error: current?.error ?? '',
    retry: () => setAttempt(value => value + 1),
  };
}
