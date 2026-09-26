// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ArchitecturePaymentOverview } from './ArchitecturePaymentOverview';
import type { ArchitectureSubscription } from '../shared/architecture-overview';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const item: ArchitectureSubscription = { provider:'railway', plan:null, fee:null, renewalDate:'2026-09-27', verifiedAt:null, billing:{currentAmount:'US$23.47',pendingAmount:'US$18.45',estimatedAmount:null,period:'9/26–10/26',latestInvoiceAmount:'US$20',latestInvoiceStatus:'paid',latestPaymentDate:'2026-08-26',source:'API',verifiedAt:'2026-09-26T04:00:00Z',account:{paymentDate:'2026-09-28',paymentAmount:'US$30',paymentKind:'due',paymentDateNote:'',paymentNote:'',costs:[],quotas:[],verifiedAt:'2026-09-25T00:00:00Z',source:'核對'}}};
const show = (items: ArchitectureSubscription[] = [item], loading = false, error = '') => render(<ArchitecturePaymentOverview items={items} loading={loading} error={error}/>);

it('shows payment date, remaining calendar days, current costs and confirmed due without expansion', () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-26T15:59:59Z')); show();
 const card=within(screen.getByRole('region',{name:'Railway 付款總覽'}));
 for(const text of ['2026-09-28','剩 2 天','US$23.47','US$30','時間未提供']) expect(card.getByText(text)).toBeTruthy();
 expect(card.getByText(/費用資料時間/).textContent).toContain('2026/09/26 12:00');
 expect(card.getByText(/付款資料原核對/).textContent).toContain('2026/09/25 08:00');
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
 expect(within(card).getByText('日期未取得')).toBeTruthy();
 expect(within(card).getByText('本次應付金額').nextElementSibling?.textContent).toBe('未取得');
 expect(card.textContent).toContain('預估應付（原核對）：US$30');
 expect(card.textContent).toContain('待出帳：US$18.45');
 expect(card.textContent).not.toContain('2026-09-27');
});
it.each([[true,'','讀取中…'],[false,'offline','讀取失敗']])('hides old amounts during loading/error', (loading,error,label)=>{
 show([item],loading,error);
 expect(screen.queryByText('US$23.47')).toBeNull();
 expect(screen.getAllByText(label).length).toBeGreaterThan(0);
});
it('keeps all four platforms visible when no billing data exists',()=>{
 show([]); expect(screen.getAllByRole('heading',{level:3}).map(x=>x.textContent)).toEqual(['Railway','Supabase','GitHub','Cloudflare Pages']);
 expect(screen.queryByText(/US\$/)).toBeNull();
});
