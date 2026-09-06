// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { lazy, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { FeaturePageLoadBoundary } from './FeaturePageLoadBoundary';

afterEach(() => vi.restoreAllMocks());

function FailedPage(): never {
  throw new Error('page render failed');
}

test('successful pages render without recovery markup or additional layout wrappers', () => {
  const { container } = render(
    <FeaturePageLoadBoundary onHome={() => undefined}>
      <main>功能頁面</main>
    </FeaturePageLoadBoundary>,
  );
  expect(container.firstElementChild).toBe(screen.getByRole('main'));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a completed lazy import replaces the loading state with its page', async () => {
  let complete!: (module: { default: () => React.JSX.Element }) => void;
  const Page = lazy(() => new Promise<{ default: () => React.JSX.Element }>((resolve) => { complete = resolve; }));
  render(<FeaturePageLoadBoundary onHome={() => undefined}><Page /></FeaturePageLoadBoundary>);
  expect(screen.getByRole('status')).toHaveTextContent('載入中');
  await act(async () => { complete({ default: () => <main>已載入頁面</main> }); });
  expect(screen.getByRole('main')).toHaveTextContent('已載入頁面');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('a page render failure offers user-controlled reload and home actions', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const onHome = vi.fn();
  const reloadPage = vi.fn();
  render(<FeaturePageLoadBoundary onHome={onHome} reloadPage={reloadPage}><FailedPage /></FeaturePageLoadBoundary>);
  expect(screen.getByRole('alert')).toHaveTextContent('頁面載入失敗');
  expect(reloadPage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
  expect(reloadPage).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '返回首頁' }));
  expect(onHome).toHaveBeenCalledTimes(1);
});

test('navigation to another screen clears the failed boundary', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { rerender } = render(<FeaturePageLoadBoundary resetKey="failed" onHome={() => undefined}><FailedPage /></FeaturePageLoadBoundary>);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  rerender(<FeaturePageLoadBoundary resetKey="next" onHome={() => undefined}><main>其他頁面</main></FeaturePageLoadBoundary>);
  expect(screen.getByRole('main')).toHaveTextContent('其他頁面');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('navigation preserves local state when screens share a healthy page component', () => {
  function SharedPage() {
    const [filter, setFilter] = useState('');
    return <input aria-label="篩選條件" value={filter} onChange={(event) => setFilter(event.target.value)} />;
  }
  const { rerender } = render(<FeaturePageLoadBoundary resetKey="explore" onHome={() => undefined}><SharedPage /></FeaturePageLoadBoundary>);
  fireEvent.change(screen.getByRole('textbox', { name: '篩選條件' }), { target: { value: '今彩539' } });
  rerender(<FeaturePageLoadBoundary resetKey="tianyan" onHome={() => undefined}><SharedPage /></FeaturePageLoadBoundary>);
  expect(screen.getByRole('textbox', { name: '篩選條件' })).toHaveValue('今彩539');
});
