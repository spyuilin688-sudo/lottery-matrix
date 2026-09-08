// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Prototype from '../Prototype';
import { AppDialogProvider } from '../dialog/AppDialog';
import { MobileDeviceProvider } from '../mobile/Device';
import { KeyboardProvider } from '../mobile/Keyboard';
import type { ScreenId } from '../features/navigation';
import { FirstVisitGuide } from './FirstVisitGuide';

vi.mock('../useLatestLotteryDraw', () => ({ useLatestLotteryDraw: () => ({ data: null }) }));
vi.mock('../matrix-status-api', () => ({ fetchMatrixStatus: async () => { throw new Error('offline status'); } }));

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  disconnect() {}
  unobserve() {}
});

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Test network unavailable')));
});

afterEach(() => vi.restoreAllMocks());

function mountHomepage() {
  return render(
    <AppDialogProvider>
      <MobileDeviceProvider>
        <KeyboardProvider><Prototype /></KeyboardProvider>
      </MobileDeviceProvider>
    </AppDialogProvider>,
  );
}

function GuideHarness({ initialScreen = 'home' }: { initialScreen?: ScreenId }) {
  const [currentScreen, setScreen] = useState<ScreenId>(initialScreen);
  return <>
    <FirstVisitGuide enabled={currentScreen === 'home'} onNavigate={setScreen} />
    <button onClick={() => setScreen('profile')}>我的</button>
    <button onClick={() => setScreen('home')}>首頁</button>
    <output aria-label="目前頁面">{currentScreen}</output>
  </>;
}

describe('首次進站引導', () => {
  it('首次首頁說明免費 LINE 註冊及探索入口，按免費註冊後進入既有會員頁', async () => {
    mountHomepage();

    const guide = await screen.findByRole('dialog', { name: '免費註冊會員' });
    expect(guide).toHaveTextContent('「我的」');
    expect(guide).toHaveTextContent('「LINE 登入」');
    expect(guide).toHaveTextContent('天衍 2 天');
    expect(guide).toHaveTextContent('天工 1 天');
    expect(guide).toHaveTextContent('Matrix Core');
    expect(guide).toHaveTextContent('探索');

    fireEvent.click(screen.getByRole('button', { name: '免費註冊' }));

    expect(await screen.findByRole('heading', { name: '會員相關' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'LINE 登入' })).toBeInTheDocument();
  });

  it('知道了僅關閉視窗，首頁 Matrix Core 仍可進入探索', async () => {
    mountHomepage();
    fireEvent.click(await screen.findByRole('button', { name: '知道了' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('lottery-screen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Matrix Core' }));
    expect(await screen.findByRole('heading', { name: '探索設定' })).toBeInTheDocument();
  });

  it('關閉後返回首頁及重新載入都不再出現引導', async () => {
    const first = render(<AppDialogProvider><GuideHarness /></AppDialogProvider>);
    fireEvent.click(await screen.findByRole('button', { name: '知道了' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '我的' }));
    fireEvent.click(screen.getByRole('button', { name: '首頁' }));
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    first.unmount();

    render(<AppDialogProvider><GuideHarness /></AppDialogProvider>);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape 關閉後仍在首頁且恢復原焦點', async () => {
    render(<AppDialogProvider><GuideHarness /></AppDialogProvider>);
    const trigger = screen.getByRole('button', { name: '我的' });
    trigger.focus();
    await screen.findByRole('dialog', { name: '免費註冊會員' });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status', { name: '目前頁面' })).toHaveTextContent('home');
    expect(document.activeElement).toBe(trigger);
  });

  it.each([
    ['知道了', 'home'],
    ['免費註冊', 'profile'],
  ])('StrictMode 下按 %s 一次即完成動作且沒有第二個引導', async (label, expectedScreen) => {
    render(<StrictMode><AppDialogProvider><GuideHarness /></AppDialogProvider></StrictMode>);
    fireEvent.click(await screen.findByRole('button', { name: label }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status', { name: '目前頁面' })).toHaveTextContent(expectedScreen);
    fireEvent.click(screen.getByRole('button', { name: '首頁' }));
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('其他功能頁不顯示或消耗首訪引導，回首頁才顯示', async () => {
    render(<AppDialogProvider><GuideHarness initialScreen="profile" /></AppDialogProvider>);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '首頁' }));
    expect(await screen.findByRole('dialog', { name: '免費註冊會員' })).toBeInTheDocument();
  });

  it.each(['/?code=line-callback', '/#access_token=line-callback', '/explore-result-preview'])('不在登入回傳或其他網站路徑 %s 開啟引導', async (path) => {
    window.history.replaceState({}, '', path);
    render(<AppDialogProvider><GuideHarness /></AppDialogProvider>);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
  });

  it('瀏覽器儲存無法使用時仍能關閉，當次回首頁不會重複顯示', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Unavailable', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Unavailable', 'SecurityError'); });
    render(<AppDialogProvider><GuideHarness /></AppDialogProvider>);
    fireEvent.click(await screen.findByRole('button', { name: '知道了' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '我的' }));
    fireEvent.click(screen.getByRole('button', { name: '首頁' }));
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
