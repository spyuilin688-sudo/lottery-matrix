// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ArchitecturePaymentOverview, usePaymentDay } from './ArchitecturePaymentOverview';
import type { ArchitectureSubscription } from '../shared/architecture-overview';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const item: ArchitectureSubscription = { provider:'railway', plan:null, fee:null, renewalDate:'2026-09-27', verifiedAt:null, billing:{currentAmount:'US$23.47',pendingAmount:'US$18.45',estimatedAmount:null,period:'9/26–10/26',latestInvoiceAmount:'US$20',latestInvoiceStatus:'paid',latestPaymentDate:'2026-08-26',source:'API',verifiedAt:'2026-09-26T04:00:00Z',account:{paymentDate:'2026-09-28',paymentAmount:'US$30',paymentKind:'due',paymentDateNote:'',paymentNote:'',costs:[],quotas:[],verifiedAt:'2026-09-25T00:00:00Z',source:'核對'}}};
function TestOverview({items,loading,error}:{items:ArchitectureSubscription[];loading:boolean;error:string}) { const today=usePaymentDay(); return <section aria-label="Railway 付款總覽"><ArchitecturePaymentOverview item={items[0]} loading={loading} error={error} today={today}/></section>; }
const show = (items: ArchitectureSubscription[] = [item], loading = false, error = '') => render(<TestOverview items={items} loading={loading} error={error}/>);

it('shows payment date, remaining calendar days, current costs and confirmed due without expansion', () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-26T15:59:59Z')); show();
 const card=within(screen.getByRole('region',{name:'Railway 付款總覽'}));
 for(const text of ['2026-09-28','剩 2 天','US$23.47','US$30','時間未提供']) expect(card.getByText(text)).toBeTruthy();


 expect(document.querySelector('details')).toBeNull();
 act(()=>vi.advanceTimersByTime(1000)); expect(card.getByText('剩 1 天')).toBeTruthy();
});
it.each([['2026-09-26','今天付款（時間未提供）'],['2026-09-25','日期已過 1 天，付款狀態待確認']])('handles today and past dates without claiming unpaid debt', (paymentDate,label)=>{
 vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-26T02:00:00Z'));
 show([{...item,billing:{...item.billing!,account:{...item.billing!.account!,paymentDate}}}]);
 expect(screen.getByText(label)).toBeTruthy();
});
it('does not infer payment date or amount from renewal, period, last paid invoice, pending or estimate',()=>{
 show([{...item,billing:{...item.billing!,account:{...item.billing!.account!,paymentDate:null,paymentKind:'estimate'}}}]);
 const card=screen.getByRole('region',{name:'Railway 付款總覽'});
 expect(within(card).getByText('距離付款').nextElementSibling?.textContent).toBe('日期未取得');
 expect(within(card).getByText('本次應付').nextElementSibling?.textContent).toBe('未取得');
 expect(card.textContent).toContain('預估應付US$30');
 expect(card.textContent).toContain('待出帳US$18.45');
 expect(within(card).getByText('付款日期').nextElementSibling?.textContent).toBe('未取得');
 expect(within(card).getByText('方案續費日').nextElementSibling?.textContent).toContain('2026-09-27');
});
it.each([[true,'','讀取中…'],[false,'offline','讀取失敗']])('hides old amounts during loading/error', (loading,error,label)=>{
 show([item],loading,error);
 expect(screen.queryByText('US$23.47')).toBeNull();
 expect(screen.getAllByText(label).length).toBeGreaterThan(0);
});
it('renders missing data without inventing a zero amount',()=>{ show([]); expect(screen.queryByText(/US\$/)).toBeNull(); });

it('shows the precise cycle end in Taiwan time and changes its countdown at local midnight',()=>{
 vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-26T15:59:59Z'));
 const billingCycle={start:'2026-08-26T18:30:45Z',end:'2026-09-26T18:30:45Z',precision:'timestamp' as const,source:'Railway API',verifiedAt:'2026-09-26T04:00:00Z'};
 show([{...item,renewalDate:null,billing:{...item.billing!,billingCycle,account:{...item.billing!.account!,paymentDate:null}}}]);
 expect(screen.getByText('2026/09/27 02:30')).toBeTruthy();
 expect(screen.getByText('台灣時間')).toBeTruthy();
 expect(screen.getByText('距本期結束').nextElementSibling?.textContent).toBe('剩 1 天');
 expect(screen.getByText('付款日期').nextElementSibling?.textContent).toBe('未取得');
 act(()=>vi.advanceTimersByTime(1000));
 expect(screen.getByText('距本期結束').nextElementSibling?.textContent).toBe('今天結束');
 act(()=>vi.advanceTimersByTime(86_400_000));
 expect(screen.getByText('距本期結束').nextElementSibling?.textContent).toBe('本期已結束，待更新');
 expect(screen.queryByText(/已到期|已欠款/)).toBeNull();
});
it('keeps verified date-only cycle ends separate from payment dates and does not invent a time',()=>{
 vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-26T02:00:00Z'));
 const billingCycle={start:'2026-09-25',end:'2026-10-25',precision:'date' as const,source:'官方帳務頁',verifiedAt:'2026-09-26T02:00:00Z'};
 show([{...item,provider:'supabase',renewalDate:null,billing:{...item.billing!,billingCycle,account:{...item.billing!.account!,paymentDate:null}}}]);
 expect(screen.getByText('本期結束').nextElementSibling?.textContent).toBe('2026-10-25時間未提供');
 expect(screen.getByText('距本期結束').nextElementSibling?.textContent).toBe('剩 29 天');
 expect(screen.getByText('付款日期').nextElementSibling?.textContent).toBe('未取得');
 expect(screen.queryByText(/00:00/)).toBeNull();
});
it.each([[true,''],[false,'offline']])('hides previous cycle dates and renewal records while unavailable', (loading,error)=>{
 const billingCycle={start:'2026-09-25',end:'2026-10-25',precision:'date' as const,source:'官方帳務頁',verifiedAt:'2026-09-26T02:00:00Z'};
 show([{...item,billing:{...item.billing!,billingCycle}}],loading,error);
 expect(screen.queryByText('2026-10-25')).toBeNull();
 expect(screen.queryByText('2026-09-27')).toBeNull();
});
it('shows the API next invoice time in Taiwan separately from payment',()=>{
 show([{...item,billing:{...item.billing!,nextInvoiceAt:'2026-09-26T20:34:47.000Z',account:{...item.billing!.account!,paymentDate:null}}}]);
 expect(screen.getByText('下次出帳').nextElementSibling?.textContent).toBe('2026/09/27 04:34台灣時間；非實際扣款時間');
 expect(screen.getByText('付款日期').nextElementSibling?.textContent).toBe('未取得');
});
