// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppDialogProvider } from '../dialog/AppDialog';
import { FIRST_VISIT_GUIDE_SEEN_KEY, FirstVisitGuide } from './FirstVisitGuide';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

function GuideHarness() {
  const [screenName, setScreen] = useState('home');
  return <>
    <FirstVisitGuide enabled={screenName === 'home'} onNavigate={setScreen} />
    <button onClick={() => setScreen('profile')}>我的</button>
    <button onClick={() => setScreen('home')}>首頁</button>
    <output aria-label="目前頁面">{screenName}</output>
  </>;
}

describe('首次開啟授權條款', () => {
  it('逐段顯示指定原文，只有同意按鈕', async () => {
    render(<AppDialogProvider><GuideHarness /></AppDialogProvider>);
    const dialog = await screen.findByRole('dialog', { name: '【使用者授權條款與免責聲明】' });
    const paragraphs = dialog.querySelectorAll('.first-visit-consent-paragraph');
    expect([...paragraphs].map(paragraph => paragraph.textContent)).toEqual([
      '歡迎使用 Matrix 數據分析系統。',
      '本系統是一款專為數字愛好者設計的「歷史規律統計與機率推演工具」。本系統所呈現之所有數據、歷史走勢及運算結果，均基於公開之歷史大數據進行邏輯排列，僅供統計學術研究與數字規律探討參考，不代表任何形式的預測、不保證中獎，亦不提供任何明牌或獲利承諾。',
      '本系統未與任何官方或民間彩券發行機構、博弈平台有所關聯，亦不提供任何線上投注、賭博或代購服務。',
      '進入系統前，請確認您已閱讀並同意本系統之《隱私權政策》，並承諾將本工具用於合法之數據研究用途。',
    ]);
    expect(screen.getByRole('button', { name: '同意條款並進入系統' })).toBeInTheDocument();
    expect(dialog.querySelectorAll('button')).toHaveLength(1);
    expect(localStorage.getItem(FIRST_VISIT_GUIDE_SEEN_KEY)).toBeNull();
  });

  it('Escape 與點擊卡片外不能視為同意，按同意後才記錄並進入首頁', async () => {
    render(<AppDialogProvider><GuideHarness /></AppDialogProvider>);
    const dialog = await screen.findByRole('dialog', { name: '【使用者授權條款與免責聲明】' });
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.pointerDown(document.querySelector('.app-dialog-overlay')!);
    expect(dialog).toBeInTheDocument();
    expect(localStorage.getItem(FIRST_VISIT_GUIDE_SEEN_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '同意條款並進入系統' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(localStorage.getItem(FIRST_VISIT_GUIDE_SEEN_KEY)).toBe('1');
    expect(screen.getByRole('status', { name: '目前頁面' })).toHaveTextContent('home');
  });

  it('同意後重新載入不重複，舊版已讀紀錄仍顯示新版條款', async () => {
    localStorage.setItem('matrix-first-visit-guide-seen', '1');
    const first = render(<StrictMode><AppDialogProvider><GuideHarness /></AppDialogProvider></StrictMode>);
    expect(await screen.findByRole('dialog', { name: '【使用者授權條款與免責聲明】' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '同意條款並進入系統' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    first.unmount();
    render(<AppDialogProvider><GuideHarness /></AppDialogProvider>);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['/explore-result-preview', '/?code=line-callback'])('其他路徑 %s 不顯示條款', async path => {
    window.history.replaceState({}, '', path);
    render(<AppDialogProvider><GuideHarness /></AppDialogProvider>);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(FIRST_VISIT_GUIDE_SEEN_KEY)).toBeNull();
  });
});
