import { useAdminDataPage } from './use-admin-data-page';

type Client = { get(path: string): Promise<{ data: unknown }> };

// Member lists keep their existing public controls and use the same server-page owner.
export function useAdminMemberPage(table: 'users' | 'subscriptions', revision: number, client: Client) {
  const page = useAdminDataPage(table, revision, client, 'member-list');
  return {
    ...page,
    keyword: page.query.keyword, status: page.query.status, plan: page.query.plan ?? 'all',
    setKeyword: (keyword: string) => page.setQuery({ keyword }),
    setStatus: (status: string) => page.setQuery({ status }),
    setPlan: (plan: string) => page.setQuery({ plan }),
    paged: { items: page.items, currentPage: page.currentPage, totalPages: page.totalPages },
    retry: () => { void page.refresh().catch(() => {}); },
  };
}
