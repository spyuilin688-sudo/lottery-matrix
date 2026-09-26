// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ArchitectureOverview } from './ArchitectureOverview';
afterEach(cleanup);
const account={paymentDate:'2026-10-02',paymentDateNote:'官方核對',paymentAmount:'US$18.60',paymentKind:'estimate',paymentNote:'非最終帳單',costs:[{label:'方案月費',value:'US$20',note:'含額度'}],quotas:[{label:'CPU',included:'100 小時',used:'20 小時',remaining:'80 小時',reset:'2026-10-01'}],verifiedAt:'2026-09-25T00:00:00Z',source:'官方帳務頁'};
const row={provider:'railway',plan:'Pro',fee:'US$20／月',renewalDate:null,verifiedAt:null,billing:{account,currentAmount:'US$23.47（折抵前用量；待出帳快照 US$18.45）',pendingAmount:'US$18.45',source:'API',verifiedAt:'2026-09-26T04:00:00Z',manualPayment:{paymentDate:'2026-08-26',amount:'US$20',source:'歷史核對',verifiedAt:'2026-09-25T00:00:00Z'}}};
it('shows each provider once and aligned payment facts without opening details',async()=>{
 const get=vi.fn(async()=>({data:{items:[row]}})); render(<StrictMode><ArchitectureOverview client={{get}}/></StrictMode>);
 await screen.findByText('Pro'); expect(screen.getAllByRole('article')).toHaveLength(4);
 expect(screen.getAllByRole('heading',{name:'Railway'})).toHaveLength(1);
 const card=screen.getByRole('article',{name:'Railway'});
 for(const text of ['2026-10-02','US$23.47','US$18.45','US$18.60']) expect(within(card.querySelector('.architecturePaymentFacts')!).getByText(text)).toBeTruthy();
 expect(within(card).getByText('本次應付').nextElementSibling?.className).toContain('architectureUnknown');
 expect(within(card).getByText('（折抵前用量）').tagName).toBe('SMALL');
 expect(card.querySelector('details')!.open).toBe(false);
 fireEvent.click(card.querySelector('summary')!);
 const sections=card.querySelectorAll<HTMLDetailsElement>('.architectureSection'); expect([...sections].every(x=>!x.open)).toBe(true);
 for(const section of sections) fireEvent.click(section.querySelector('summary')!);
 expect(within(card).getByText('100 小時')).toBeTruthy(); expect(within(card).getByText('2026-08-26')).toBeTruthy();
 expect(get.mock.calls).toEqual([['/api/architecture-overview']]);
});
it('keeps verification timestamps in sources and retains the external link',async()=>{
 render(<ArchitectureOverview client={{get:async()=>({data:{items:[row]}})}}/>); await screen.findByText('Pro');
 const card=screen.getByRole('article',{name:'Railway'}); fireEvent.click(card.querySelector('summary')!);
 const source=card.querySelector('.architectureSource')!;fireEvent.click(source.querySelector('summary')!);
 expect(source.textContent).toContain('2026/09/25 08:00');expect(source.textContent).toContain('2026/09/26 12:00');
 expect(within(source).getByText(account.paymentDateNote)).toBeTruthy();
 expect(within(source).getByText(account.paymentNote)).toBeTruthy();
 expect(within(card).getAllByText(account.paymentDateNote)).toHaveLength(1);
 expect(source.textContent).not.toContain('每日 09:20');
 const link=within(card).getByRole('link',{name:/管理訂閱/});expect(link.getAttribute('rel')).toContain('noopener');
});
it('shows read failures and retries once without retaining stale amounts',async()=>{
 const get=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({data:{items:[]}});
 render(<ArchitectureOverview client={{get}}/>);await screen.findByRole('alert');expect(screen.getAllByText('讀取失敗').length).toBeGreaterThan(0);
 fireEvent.click(screen.getByRole('button',{name:'重新載入'}));await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());expect(get).toHaveBeenCalledTimes(2);
});
it('does not update a new view with a closed view response',async()=>{
 let finish!:(v:unknown)=>void;const old=render(<ArchitectureOverview client={{get:()=>new Promise(resolve=>{finish=data=>resolve({data});})}}/>);old.unmount();
 render(<ArchitectureOverview client={{get:async()=>({data:{items:[]}})}}/>);finish({items:[row]});await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());expect(screen.queryByText('Pro')).toBeNull();
});
