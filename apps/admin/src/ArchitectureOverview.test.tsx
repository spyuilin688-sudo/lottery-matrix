// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ArchitectureOverview } from './ArchitectureOverview';

afterEach(cleanup);
const billing = { latestInvoiceAmount: 'US$37.12', latestInvoiceStatus: 'paid', latestPaymentDate: '2024-02-01', currentAmount: 'US$13.47', estimatedAmount: 'US$14.08', period: '2/1－3/1', source: 'Railway 工作區帳務頁；歷史付款人工核對 2024-02-15', verifiedAt: '2026-09-26T00:00:00Z' };
const row = { provider: 'railway', plan: 'Pro', fee: 'US$20／月', renewalDate: '2026-10-01', verifiedAt: '2026-09-25T20:00:00Z', billing };
const account = { paymentDate: '2026-10-02', paymentDateNote: '官方帳務頁顯示', paymentAmount: 'US$10.50', paymentKind: 'estimate', paymentNote: '折抵後預估，尚未結帳', costs: [{ label: '固定費用', value: 'US$20／月', note: '含用量額度' }], quotas: [{ label: 'CPU', included: '100 小時', used: '20 小時', remaining: '80 小時', reset: '2026-10-01' }], verifiedAt: '2026-09-25T10:00:00Z', source: '官方 Billing 頁人工核對' };

it('distinguishes GitHub usage access from unavailable payment data and exposes the Pages blocker', async () => {
  const source='帳戶 API 可讀；Pages API 拒絕讀取（403），尚未取得 Pages 專屬帳務。';
  render(<ArchitectureOverview client={{ get: async () => ({data:{items:[{...row,provider:'github',plan:'GitHub Pro'},{...row,provider:'cloudflare',plan:null,fee:null,billing:{...billing,currentAmount:null,estimatedAmount:null,source}}]}}) }} />);
  await screen.findByText('GitHub Pro');
  const github=screen.getByRole('article',{name:'GitHub',exact:true});
  expect(within(github.querySelector('summary')!).getByText('用量資料已取得')).toBeTruthy();
  expect(within(github.querySelector('summary')!).getAllByText('尚未確認')).toHaveLength(2);
  const cloudflare=screen.getByRole('article',{name:'Cloudflare Pages',exact:true});
  expect(within(cloudflare.querySelector('summary')!).getByText('Pages 帳務未取得')).toBeTruthy();
  fireEvent.click(cloudflare.querySelector('summary')!);
  expect(within(cloudflare).getAllByText(source).length).toBeGreaterThan(0);
});

it('keeps all four provider summaries collapsed and opens details without another request under StrictMode', async () => {
  const get = vi.fn(async () => ({ data: { items: [{ ...row, billing: { ...billing, account } }] } }));
  render(<StrictMode><ArchitectureOverview client={{ get }} /></StrictMode>);
  const railway = screen.getByRole('article', { name: 'Railway' });
  await waitFor(() => expect(within(railway).getByText('Pro')).toBeTruthy());
  expect(screen.getAllByRole('article')).toHaveLength(4);
  const disclosures = [...document.querySelectorAll<HTMLDetailsElement>('.architectureDisclosure')];
  expect(disclosures).toHaveLength(4);
  expect(disclosures.every(details => !details.open)).toBe(true);
  const summary = railway.querySelector('summary')!;
  expect(within(summary).getByText('2026-10-02')).toBeTruthy();
  expect(within(summary).getByText('US$10.50')).toBeTruthy();
  expect(within(summary).getByText('方案費用 US$20／月')).toBeTruthy();
  expect(within(summary).getByText(/人工核對/)).toBeTruthy();
  expect(within(summary).getByText('預估應繳')).toBeTruthy();
  fireEvent.click(summary);
  expect(disclosures[0].open).toBe(true);
  expect(within(railway).getByText('包含額度／上限')).toBeTruthy();
  expect(within(railway).getByText('100 小時')).toBeTruthy();
  expect(within(railway).getByText('20 小時')).toBeTruthy();
  expect(within(railway).getByText('80 小時')).toBeTruthy();
  expect(within(railway).getByText(/人工核對：/)).toBeTruthy();
  expect(within(railway).getByText(/帳務資料更新：/)).toBeTruthy();
  expect(within(railway).getByText(billing.source)).toBeTruthy();
  expect(get.mock.calls).toEqual([['/api/architecture-overview']]);
  for (const article of screen.getAllByRole('article')) {
    const details = article.querySelector('details')!;
    if (!details.open) fireEvent.click(details.querySelector('summary')!);
  }
  for (const link of screen.getAllByRole('link', { name: /管理訂閱/ })) {
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('href')).toMatch(/^https:\/\//);
  }
});

it('does not infer next payment from renewal date, last invoice or a usage period', async () => {
  render(<ArchitectureOverview client={{ get: async () => ({ data: { items: [row] } }) }} />);
  const railway = screen.getByRole('article', { name: 'Railway' });
  await waitFor(() => expect(within(railway).getByText('Pro')).toBeTruthy());
  const summary = railway.querySelector('summary')!;
  expect(within(summary).getAllByText('尚未確認')).toHaveLength(2);
  expect(summary.textContent).not.toMatch(/2026-10-01|2024-02-01|37.12|已付款|2\/1/);
  fireEvent.click(summary);
  expect(within(railway).getByText('US$37.12（已付款）')).toBeTruthy();
  expect(within(railway).getByText('上次付款日期')).toBeTruthy();
  expect(within(railway).getByText('2024-02-01')).toBeTruthy();
  expect(within(railway).getByText('本期累計')).toBeTruthy();
  expect(within(railway).getByText('US$13.47')).toBeTruthy();
  expect(within(railway).getByText('平台預估')).toBeTruthy();
  expect(within(railway).getByText('US$14.08')).toBeTruthy();
  expect(within(railway).getByText(/尚未取得已核對的額度明細/)).toBeTruthy();
});

it.each([['pending', '待出帳'], ['unknown', '本次應繳']])('keeps %s amounts distinguishable from confirmed due amounts', async (paymentKind, label) => {
  render(<ArchitectureOverview client={{ get: async () => ({ data: { items: [{ ...row, billing: { ...billing, account: { ...account, paymentKind } } }] } }) }} />);
  await screen.findByText('Pro');
  const summary = screen.getByRole('article', { name: 'Railway' }).querySelector('summary')!;
  expect(within(summary).getByText(label)).toBeTruthy();
  if (paymentKind === 'unknown') expect(within(summary).queryByText('US$10.50')).toBeNull();
});

it('distinguishes a failed read from missing data and supports a single explicit retry', async () => {
  const get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { items: [] } });
  render(<ArchitectureOverview client={{ get }} />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(get).toHaveBeenCalledTimes(2);
  expect(screen.getAllByRole('article')).toHaveLength(4);
  expect([...document.querySelectorAll('article > details > summary')].every(summary => summary.textContent?.includes('尚未確認'))).toBe(true);
});

it('does not use a response from a closed view in the new administrator view', async () => {
  let finish!: (value: unknown) => void;
  const oldClient = { get: vi.fn(() => new Promise<{ data: unknown }>(resolve => { finish = value => resolve({ data: value }); })) };
  const oldView = render(<ArchitectureOverview client={oldClient} />);
  oldView.unmount();
  render(<ArchitectureOverview client={{ get: async () => ({ data: { items: [] } }) }} />);
  finish({ items: [{ provider: 'railway', plan: 'Old plan', fee: null, renewalDate: null, verifiedAt: null }] });
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(screen.queryByText('Old plan')).toBeNull();
});


it('shows automatically retrieved Cloudflare limits without claiming known usage or payment',async()=>{
 render(<ArchitectureOverview client={{get:async()=>({data:{items:[{...row,provider:'cloudflare',plan:null,fee:null,billing:{source:'Cloudflare API',verifiedAt:'2026-09-26T00:00:00Z',limits:[{label:'建置快取容量',value:'10,000 MB'}]}}]}})}}/>);
 await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());
 const card=screen.getByRole('article',{name:'Cloudflare Pages',exact:true});
 fireEvent.click(card.querySelector('summary')!);
 expect(within(card).getByText('10,000 MB')).toBeTruthy();
 expect(within(card).getByText(/上限自動更新：/)).toBeTruthy();
 expect(within(card).queryByText(/人工核對：/)).toBeNull();
 expect(within(card).getByText('每月建置已用量、剩餘額度與重置時間尚未取得。')).toBeTruthy();
 expect(within(card.querySelector('summary')!).getAllByText('尚未確認')).toHaveLength(3);
});
