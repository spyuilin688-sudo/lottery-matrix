// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { AppDialogProvider } from '../dialog/AppDialog';
import { FirstVisitGuide } from '../onboarding/FirstVisitGuide';
import { AboutMatrixPage, ActivationCodePage, DisclaimerPage, MemberTermsPage, PrivacyPolicyPage, ServiceInfoPage } from '../features/MemberPages';
import { MatrixGuidePage } from '../features/MatrixGuidePage';

const settings = vi.hoisted(() => ({ visible: true, listeners: new Set<() => void>() }));
vi.mock('../subscription-purchase-visibility', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useSubscriptionPurchaseVisible: () => useSyncExternalStore(
    listener => { settings.listeners.add(listener); return () => { settings.listeners.delete(listener); }; },
    () => settings.visible,
  ) };
});
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth: {
  getSession: async () => ({ data: { session: null }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
} }) }));
const toggle = (visible: boolean) => act(() => { settings.visible = visible; settings.listeners.forEach(listener => listener()); });
beforeEach(() => {
  settings.visible = true;
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

test.each([
  [AboutMatrixPage, ['直覺且易於使用的開獎資料查詢，', '整合各項查詢工具', '且容易使用的查詢工具', '並透過多項查詢功能'], ['查詢與分析服務', '整合各項分析工具', '且容易使用的分析工具', '並透過多項分析功能']],
  [ServiceInfoPage, ['六、探索結果說明', '不同會員狀態可使用的功能及權限'], ['七、Matrix Pro 說明', '付費訂閱方案', '自動續訂']],
  [DisclaimerPage, ['計算及查詢工具', '查詢結果及探索結果僅供參考', '功能及查詢結果', '功能、查詢結果或第三方服務'], ['計算及分析工具', '分析結果及探索結果', '功能及分析結果', '功能、分析結果或第三方服務']],
] as const)('%s follows the switch and restores the complete original copy', (Page, present, absent) => {
  const view = render(<Page onNavigate={vi.fn()} />);
  const original = view.container.textContent;
  toggle(false);
  present.forEach(text => expect(view.container.textContent).toContain(text));
  absent.forEach(text => expect(view.container.textContent).not.toContain(text));
  toggle(true);
  expect(view.container.textContent).toBe(original);
});

test('terms hide precisely chapters 2, 3, 4, 5, 8, 10 and restore their original numbering', () => {
  const view = render(<MemberTermsPage onNavigate={vi.fn()} />);
  const original = view.container.textContent;
  toggle(false);
  expect([...view.container.querySelectorAll('.legal-info-section h2')].map(n => n.textContent)).toEqual(['一、服務範圍','六、服務內容','七、探索結果','九、個人資料']);
  expect(view.container.textContent).toContain('Matrix 查詢');
  expect(view.container.textContent).not.toMatch(/Matrix 分析|2,880|5,580|17,800|自動續訂/);
  toggle(true);
  expect(view.container.textContent).toBe(original);
});

test('privacy hides only the specified list items and restores them', () => {
  const view = render(<PrivacyPolicyPage onNavigate={vi.fn()} />);
  const original = view.container.textContent;
  toggle(false);
  const lists = view.container.querySelectorAll('.legal-info-section ul');
  expect([...lists[0].children].map(n => n.textContent)).toEqual(['登入 LINE 所提供的帳號識別資料','啟動碼使用紀錄','推薦碼使用紀錄','推薦成功人數','通知設定']);
  expect([...lists[1].children].map(n => n.textContent)).toEqual(['會員登入與帳號識別','提供使用者已選擇的功能','系統通知與服務通知']);
  toggle(true);
  expect(view.container.textContent).toBe(original);
});

test('referral and activation disclosures follow the switch without hiding rewards', async () => {
  const view = render(<AppDialogProvider><ActivationCodePage onNavigate={vi.fn()} /></AppDialogProvider>);
  await act(async () => {});
  ['推薦成功認定','推薦成功獎勵','推薦獎勵補充規則','啟動碼使用說明'].forEach(name => fireEvent.click(screen.getByRole('button', { name })));
  const original = view.container.textContent;
  toggle(false);
  expect(screen.queryByRole('button', { name: '推薦獎勵補充規則' })).not.toBeInTheDocument();
  expect(view.container.textContent).not.toContain('完成訂閱 Matrix Pro');
  expect(view.container.textContent).not.toContain('若該筆訂閱後續');
  expect(view.container.textContent).not.toContain('啟動碼以增加 Matrix Pro 訂閱天數');
  expect(screen.getByText('每個 LINE 帳號，僅能輸入一次推薦碼。')).toBeInTheDocument();
  expect(screen.getByText(/推薦成功滿 50 人/)).toBeInTheDocument();
  expect(screen.getByText('每組啟動碼只能成功使用一次。')).toBeInTheDocument();
  toggle(true);
  expect(view.container.textContent).toBe(original);
});

test('first visit dialog changes live and keeps the login action and once-only behavior', async () => {
  const navigate = vi.fn();
  render(<AppDialogProvider><FirstVisitGuide enabled onNavigate={navigate} /></AppDialogProvider>);
  expect(await screen.findByRole('heading', { name: '免費註冊會員' })).toBeInTheDocument();
  toggle(false);
  expect(screen.getByRole('heading', { name: '使用教學' })).toBeInTheDocument();
  expect(screen.getByText('點擊右下方「我的」，再點擊「LINE 登入」即可使用查詢；首頁下方的 Matrix Core 進入探索。')).toBeInTheDocument();
  expect(screen.queryByText(/天衍 2 天/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '立即登入' })).toBeInTheDocument();
  toggle(true);
  expect(screen.getByRole('heading', { name: '免費註冊會員' })).toBeInTheDocument();
  expect(screen.getByText(/天衍 2 天、天工 1 天/)).toBeInTheDocument();
  toggle(false);
  fireEvent.click(screen.getByRole('button', { name: '立即登入' }));
  await act(async () => {});
  expect(navigate).toHaveBeenCalledExactlyOnceWith('profile');
  toggle(true);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test.each([
  ['04Matrix 探索', ['結果顯示位置、號碼、查詢期、連準次數、結果及版路類型。']],
  ['06Matrix 天工', ['第一段驗證3個球位；第二段驗證前2個球位，第3個球位產生結果。', '按下「開始探索」後顯示間距期數、查詢位置、結果及版路類型。']],
  ['07Matrix 狀態', ['每條版路顯示位置、號碼、查詢期、連準次數、結果及版路類型。']],
  ['17關於 樂彩 Matrix', ['提供 Matrix 查詢、歷史資料查詢、號碼紀錄、計算工具、牌單及通知等功能。']],
] as const)('guide %s switches requested result copy and restores its complete original section', (name, expected) => {
  const view = render(<MatrixGuidePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name }));
  const preview = view.container.querySelector('.guide-preview')!;
  const original = preview.textContent;
  for (let cycle = 0; cycle < 2; cycle++) {
    toggle(false);
    expected.forEach(text => expect(preview.textContent).toContain(text));
    expect(preview.textContent).not.toMatch(/預測期|預測位置|產生預測|提供 Matrix 分析/);
    toggle(true);
    expect(preview.textContent).toBe(original);
  }
});

test('guide removes Pro category and requested blocks, keeps original IDs, and restores content', () => {
  const view = render(<MatrixGuidePage onNavigate={vi.fn()} />);
  const choose = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
  choose(/^14Matrix Pro$/);
  expect(view.container.querySelector('.guide-preview h2')).toHaveTextContent('Matrix Pro');
  toggle(false);
  expect(screen.queryByRole('button', { name: /^14Matrix Pro$/ })).not.toBeInTheDocument();
  expect(view.container.querySelector('.guide-preview h2')).toHaveTextContent('新手入門');
  const preview = () => within(view.container.querySelector('.guide-preview') as HTMLElement);
  expect(preview().queryByText('我的：查看 Matrix Pro 訂閱、推薦、系統及法律資訊。')).not.toBeInTheDocument();
  expect(preview().queryByRole('heading', { name: 'Matrix Pro' })).not.toBeInTheDocument();
  choose(/^16常見問題$/);
  expect(preview().queryByRole('heading', { name: '查看 Matrix Pro 權限' })).not.toBeInTheDocument();
  choose(/^17關於 樂彩 Matrix$/);
  expect(preview().getByText('樂彩 Matrix 提供開獎資料查詢服務，協助查閱公開資訊、整理歷史數據與使用各項查詢工具。')).toBeInTheDocument();
  toggle(true);
  expect(screen.getByRole('button', { name: /^14Matrix Pro$/ })).toBeInTheDocument();
  expect(preview().getByText(/查詢與分析服務/)).toBeInTheDocument();
  choose(/^16常見問題$/);
  expect(preview().getByRole('heading', { name: '查看 Matrix Pro 權限' })).toBeInTheDocument();
  choose(/^01新手入門$/);
  expect(preview().getByText('我的：查看 Matrix Pro 訂閱、推薦、系統及法律資訊。')).toBeInTheDocument();
  expect(preview().getByRole('heading', { name: 'Matrix Pro' })).toBeInTheDocument();
});
