// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { AppDialogProvider } from '../dialog/AppDialog';
import { FirstVisitGuide } from '../onboarding/FirstVisitGuide';
import { AboutMatrixPage, ActivationCodePage, DisclaimerPage, MemberTermsPage, PrivacyPolicyPage, ProPlansPage, RefundPolicyPage, ServiceInfoPage } from '../features/MemberPages';
import { MatrixGuidePage } from '../features/MatrixGuidePage';

const settings = vi.hoisted(() => ({ visible: true, free: false, listeners: new Set<() => void>() }));
vi.mock('../subscription-purchase-visibility', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useSubscriptionPurchaseVisible: () => useSyncExternalStore(
    listener => { settings.listeners.add(listener); return () => { settings.listeners.delete(listener); }; },
    () => settings.visible,
  ) };
});
vi.mock('../permission-settings', async () => {
  const { useSyncExternalStore } = await import('react');
  const paidSettings = {
    subscriptionPurchaseVisible: true,
    registeredMemberFreeAccess: false,
    revision: 1,
    updatedAt: '2026-09-21T00:00:00.000Z',
  };
  const freeSettings = { ...paidSettings, registeredMemberFreeAccess: true };
  return { usePermissionSettings: () => useSyncExternalStore(
    listener => { settings.listeners.add(listener); return () => { settings.listeners.delete(listener); }; },
    () => settings.free ? freeSettings : paidSettings,
  ) };
});
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth: {
  getSession: async () => ({ data: { session: null }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
} }) }));
const toggle = (visible: boolean) => act(() => { settings.visible = visible; settings.listeners.forEach(listener => listener()); });
beforeEach(() => {
  settings.visible = true;
  settings.free = false;
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

test('registered-member free mode explains actual temporary access without promising full status', async () => {
  settings.free = true;
  const navigate = vi.fn();
  const firstVisit = render(<AppDialogProvider><FirstVisitGuide enabled onNavigate={navigate} /></AppDialogProvider>);
  expect(await screen.findByText(/登入後目前可免費使用 Matrix 探索十三期與完整範圍/)).toBeInTheDocument();
  expect(screen.getByText(/Matrix 狀態進階資訊仍依訂閱權限開放/)).toBeInTheDocument();
  firstVisit.unmount();
  localStorage.clear();

  const guide = render(<MatrixGuidePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '04Matrix 探索' }));
  expect(guide.container.querySelector('.guide-preview')).toHaveTextContent('有效會員目前可免費使用十三期與完整範圍');
  fireEvent.click(screen.getByRole('button', { name: /^16Matrix Pro$/ }));
  expect(guide.container.querySelector('.guide-preview')).toHaveTextContent('Matrix 狀態進階資訊仍依訂閱權限開放');
  guide.unmount();

  const plans = render(<AppDialogProvider><ProPlansPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await act(async () => {});
  expect(plans.container).not.toHaveTextContent('目前免費開放期間');
  expect(plans.container).not.toHaveTextContent('Matrix 狀態進階資訊仍依訂閱權限開放');
  expect(plans.container.querySelectorAll('.plan-card')).toHaveLength(5);
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
  expect([...lists[0].children].map(n => n.textContent)).toEqual(['登入服務所提供的帳號識別資料','啟動碼使用紀錄','推薦碼使用紀錄','推薦成功人數','通知設定']);
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
  expect(screen.getByText('每個 LINE 或 Google 帳號，僅能輸入一次推薦碼。')).toBeInTheDocument();
  expect([...view.container.querySelectorAll('.referral-rewards dt')].map(row => row.textContent)).toContain('推薦成功滿 50 人');
  expect(screen.getByText('每組啟動碼只能成功使用一次。')).toBeInTheDocument();
  toggle(true);
  expect(view.container.textContent).toBe(original);
});

test('referral rewards retain all four thresholds and explain reversals once', async () => {
  const view = render(<AppDialogProvider><ActivationCodePage onNavigate={vi.fn()} /></AppDialogProvider>);
  await act(async () => {});
  for (const name of ['推薦成功認定', '推薦成功獎勵', '推薦獎勵補充規則']) {
    const toggle = screen.getByRole('button', { name });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
  const rewards = document.getElementById('referral-rule-推薦成功獎勵')!;
  expect([...rewards.querySelectorAll('dl > div')].map(row => [
    row.querySelector('dt')?.textContent,
    [...row.querySelectorAll('dd > span')].map(part => part.textContent),
  ])).toEqual([
    ['推薦成功滿 10 人', ['Matrix 探索 七期', '每週一、二、四、五開放']],
    ['推薦成功滿 15 人', ['Matrix 探索 七期', '永久開放']],
    ['推薦成功滿 30 人', ['Matrix 探索 完整範圍', '每週二、五開放']],
    ['推薦成功滿 50 人', ['Matrix 探索 完整範圍', '永久開放']],
  ]);
  expect(rewards).toHaveTextContent('永久開放仍須維持對應的推薦成功人數門檻。');
  const recognition = document.getElementById('referral-rule-推薦成功認定')!;
  expect(recognition).toHaveTextContent('每個 LINE 或 Google 帳號，僅能輸入一次推薦碼。');
  expect(recognition).toHaveTextContent('完成訂閱 Matrix Pro 月方案、季方案或年方案任一方案');
  expect(view.container.textContent?.match(/退款、刷退或交易取消/g)).toHaveLength(1);
  const supplement = document.getElementById('referral-rule-推薦獎勵補充規則')!;
  for (const text of ['推薦成功將失效', '推薦成功人數同步扣除', '資格與獎勵依最新推薦成功人數重新計算', '低於對應門檻', '對應獎勵同步取消', '推薦獎勵不需本人訂閱 Matrix Pro。']) {
    expect(supplement).toHaveTextContent(text);
  }
  fireEvent.click(screen.getByRole('button', { name: '推薦成功獎勵' }));
  expect(document.getElementById('referral-rule-推薦成功獎勵')).toBeNull();
});

test('first visit dialog changes live and keeps free usage and once-only behavior', async () => {
  const navigate = vi.fn();
  render(<AppDialogProvider><FirstVisitGuide enabled onNavigate={navigate} /></AppDialogProvider>);
  expect(await screen.findByRole('heading', { name: '真正的「版路分析」工具' })).toBeInTheDocument();
  toggle(false);
  expect(screen.getByRole('heading', { name: '使用教學' })).toBeInTheDocument();
  expect(screen.getByText('Matrix 探索二期、天衡三期基本查詢可直接使用；新註冊 LINE 會員可於註冊後 48 小時內使用 Matrix 探索、天衡、天樞十三期及完整範圍。')).toBeInTheDocument();
  expect(screen.getByText(/新註冊 LINE 會員可於註冊後 48 小時內使用 Matrix 探索、天衡、天樞十三期及完整範圍/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '開始使用' })).toBeInTheDocument();
  toggle(true);
  expect(screen.getByRole('heading', { name: '真正的「版路分析」工具' })).toBeInTheDocument();
  expect(screen.getByText(/點擊下方「我的」，選擇使用 LINE 或 Google 登入。/)).toBeInTheDocument();
  expect(screen.getByText(/點擊首頁下方的 Matrix Core，即可開始探索各種類型的版路。/)).toBeInTheDocument();
  expect(screen.queryByText(/天衍 2 天、天工 1 天/)).not.toBeInTheDocument();
  toggle(false);
  fireEvent.click(screen.getByRole('button', { name: '開始使用' }));
  await act(async () => {});
  expect(navigate).not.toHaveBeenCalled();
  toggle(true);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test.each([
  ['04Matrix 探索', ['結果顯示位置、號碼、結果期、連準次數、結果及版路類型。']],
  ['08Matrix 天工', ['第一段要求 C、B、A 三組使用相同完整規則成立；第二段使用 C、B 驗證相同完整規則，再由 A 產生下一期結果。', '結果顯示間距、位移走向、結果位置、結果及版路類型。']],
  ['09Matrix 狀態', ['每條版路顯示位置、號碼、結果期、連準次數、結果及版路類型。']],
  ['19關於 樂彩 Matrix', ['提供 Matrix 查詢、歷史資料查詢、號碼紀錄、計算工具、牌單及通知等功能。']],
] as const)('guide %s keeps approved result copy while preserving the other visibility-controlled text', (name, expected) => {
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
  choose(/^16Matrix Pro$/);
  expect(view.container.querySelector('.guide-preview h2')).toHaveTextContent('Matrix Pro');
  toggle(false);
  expect(screen.queryByRole('button', { name: /^16Matrix Pro$/ })).not.toBeInTheDocument();
  expect(view.container.querySelector('.guide-preview h2')).toHaveTextContent('新手入門');
  const preview = () => within(view.container.querySelector('.guide-preview') as HTMLElement);
  expect(preview().queryByText('我的：查看 Matrix Pro 訂閱、推薦、系統及法律資訊。')).not.toBeInTheDocument();
  expect(preview().queryByRole('heading', { name: 'Matrix Pro' })).not.toBeInTheDocument();
  choose(/^18常見問題$/);
  expect(preview().queryByRole('heading', { name: '查看 Matrix Pro 權限' })).not.toBeInTheDocument();
  choose(/^19關於 樂彩 Matrix$/);
  expect(preview().getByText('樂彩 Matrix 提供開獎資料查詢服務，協助查閱公開資訊、整理歷史數據與使用各項查詢工具。')).toBeInTheDocument();
  toggle(true);
  expect(screen.getByRole('button', { name: /^16Matrix Pro$/ })).toBeInTheDocument();
  expect(preview().getByText(/查詢與分析服務/)).toBeInTheDocument();
  choose(/^18常見問題$/);
  expect(preview().getByRole('heading', { name: '查看 Matrix Pro 權限' })).toBeInTheDocument();
  choose(/^01新手入門$/);
  expect(preview().getByText('我的：查看 Matrix Pro 訂閱、推薦、系統及法律資訊。')).toBeInTheDocument();
  expect(preview().getByRole('heading', { name: 'Matrix Pro' })).toBeInTheDocument();
});


test.each([true, false])('天衡指南與服務說明在購買顯示 %s 下提供完整功能資訊', visible => {
  settings.visible = visible;
  const guide = render(<MatrixGuidePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '05Matrix 天衡' }));
  const preview = guide.container.querySelector('.guide-preview')!;
  for (const text of ['同一期兩個球位', '三期、十三期', '準5+ (鎖定1碼)、準6+ (鎖定2碼)', '進階天衡設定', '結果期', '版路結果', '三期基本查詢可直接使用', '十三期與完整範圍依目前帳號權限開放']) {
    expect(preview.textContent).toContain(text);
  }
  expect(preview.textContent).not.toMatch(/預測|查詢期/);
  guide.unmount();
  const service = render(<ServiceInfoPage onNavigate={vi.fn()} />);
  expect([...service.container.querySelectorAll('.legal-info-subfunctions > li')].map(node => node.textContent)).toEqual(['Matrix 探索', 'Matrix 天衡', 'Matrix 天樞', 'Matrix 天衍', 'Matrix 天工']);
  expect(service.container.textContent).toContain('Matrix 天衡以同一期的兩個球位與對應號碼共同作為條件');
  expect(service.container.textContent).toContain('開始天衡');
});

test.each([true, false])('天樞指南在購買顯示 %s 下保留三球位及查詢說明', visible => {
  settings.visible = visible;
  const guide = render(<MatrixGuidePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '06Matrix 天樞' }));
  const preview = guide.container.querySelector('.guide-preview')!;
  for (const text of ['同一期三個球位', '三期、十三期', '準5+ (鎖定1碼)、準6+ (鎖定2碼)', '進階天樞設定', '開始天樞', '三個條件球位', '依目前帳號權限開放']) {
    expect(preview.textContent).toContain(text);
  }
});

test('三種方案與指南的共同權限一致，輪播複本不重複列出探索權限', async () => {
  const requested = ['Matrix 探索 - 十三期、完整範圍', 'Matrix 天衡 - 十三期、完整範圍', 'Matrix 天樞 - 十三期、完整範圍'];
  const plans = render(<AppDialogProvider><ProPlansPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await act(async () => {});
  const cards = plans.container.querySelectorAll('.plan-card');
  expect(cards).toHaveLength(5);
  for (const card of cards) {
    const items = [...card.querySelectorAll('li')].map(item => item.textContent);
    requested.forEach(text => expect(items.filter(item => item === text)).toHaveLength(1));
    expect(items).not.toContain('Matrix 探索 - 十三期');
    expect(items).not.toContain('Matrix 探索 - 完整範圍');
    expect(items.includes('Matrix 天衍 - 使用權限')).toBe(card.getAttribute('data-plan-index') !== '0');
    expect(items.includes('Matrix 天工 - 使用權限')).toBe(card.getAttribute('data-plan-index') === '2');
  }
  plans.unmount();
  const guide = render(<MatrixGuidePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '16Matrix Pro' }));
  requested.forEach(text => expect(guide.container.querySelector('.guide-preview')?.textContent).toContain(text));
});

test.each([ServiceInfoPage, MemberTermsPage, RefundPolicyPage])('%s 說明綠界付款與自動續訂尚未開放', Page => {
  const view = render(<Page onNavigate={vi.fn()} />);
  expect(view.container.textContent).toContain('Matrix Pro 訂閱付款將採用綠界金流；綠界付款與自動續訂尚未開放。');
  expect(view.container.textContent).not.toContain('使用者可自行選擇是否開啟自動續訂。');
});
