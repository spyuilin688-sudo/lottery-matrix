// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import * as notebook from '../features/NotebookPages';
import { FeaturePageRouter } from '../features/router';
import type { ScreenId } from '../features/navigation';

vi.mock('../permission-settings', () => ({ usePermissionSettings: () => null }));
vi.mock('../features/MatrixStatusPages', () => ({
  MatrixStatusPage: () => <p>Matrix 狀態</p>,
  MatrixCustomStatusPage: () => null,
}));
afterEach(cleanup);

test('a stale record route cannot reopen the retired betting-record form', () => {
  render(<FeaturePageRouter screen={'notes' as ScreenId} onNavigate={vi.fn()} />);
  expect(screen.queryByRole('button', { name: '儲存紀錄' })).not.toBeInTheDocument();
  expect(screen.queryByText('新增投注紀錄')).not.toBeInTheDocument();
  expect(screen.getByText('Matrix 狀態')).toBeInTheDocument();
});

test('the notebook module no longer exports the retired record implementation', () => {
  expect(notebook).not.toHaveProperty('NotesPage');
  expect(notebook.MatrixNotebookPage).toBeTypeOf('function');
});
