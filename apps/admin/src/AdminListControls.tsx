import type { ReactNode } from 'react';
import type { AdminDataPageController } from './use-admin-data-page';

type Option = readonly [string, string];

export function AdminListControls({ page, showError = true }: {
  page: AdminDataPageController;
  name: string;
  statuses?: readonly Option[];
  sorts: readonly Option[];
  showError?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  if (!showError || !page.error) return null;

  return (
    <p role="alert">
      {page.error}{' '}
      <button type="button" onClick={() => { void page.refresh().catch(() => {}); }}>
        重新載入列表
      </button>
    </p>
  );
}
