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
it('describes provider coverage from the fields that are actually available',async()=>{
 const github={...row,provider:'github',plan:'GitHub Pro',fee:'US$4／月',billing:{...row.billing,pendingAmount:null,estimatedAmount:null,account:{...account,paymentDate:null,paymentAmount:null,paymentKind:'due',quotas:[{label:'Actions 執行分鐘',included:'3,000 分鐘',used:'2,852 分鐘',remaining:'148 分鐘',reset:'每月'}]}}};
 const railway={...row,billing:{...row.billing,billingCycle:{start:'2026-08-26T20:34:47.000Z',end:'2026-09-26T20:34:47.000Z',precision:'timestamp',source:'Railway API',verifiedAt:'2026-09-26T04:00:00Z'},nextInvoiceAt:'2026-09-26T20:34:47.000Z',estimatedAmount:'US$23.64',latestInvoiceAmount:'US$20',usageBreakdown:[{label:'Agent',quantity:null,grossAmount:'US$17.54',discountAmount:null,netAmount:null}],manualPayment:{paymentDate:'2026-08-26',amount:'US$20',source:'歷史核對',verifiedAt:'2026-09-25T00:00:00Z'},account:{...account,paymentDate:null,quotas:[{label:'Agent 支出上限',included:'US$80',used:'US$17.54',remaining:'US$62.46',reset:'每帳期'}]}}};
 const supabase={...row,provider:'supabase',plan:'Pro',fee:'US$25／月',billing:{...row.billing,latestInvoiceAmount:'US$66.51',billingCycle:{start:'2026-09-25',end:'2026-10-25',precision:'date',source:'官方帳務頁',verifiedAt:'2026-09-26T02:00:00Z'},account:{...account,paymentDate:null}}};
 const cloudflare={provider:'cloudflare',plan:null,fee:null,renewalDate:null,verifiedAt:null,billing:{latestInvoiceAmount:null,latestInvoiceStatus:null,latestPaymentDate:null,currentAmount:null,estimatedAmount:null,period:null,source:'Cloudflare API',verifiedAt:'2026-09-26T04:14:05Z',limits:[{label:'建置快取容量',value:'10,000 MB'},{label:'同時建置',value:'1 個'},{label:'每專案自訂網域',value:'100 個'},{label:'建置快取保留時間',value:'7 天'}]}};
 render(<ArchitectureOverview client={{get:async()=>({data:{items:[github,railway,supabase,cloudflare]}})}}/>);
 await screen.findByText('GitHub Pro');
 const openStatus=(name:string)=>{const card=screen.getByRole('article',{name});fireEvent.click(card.querySelector('summary')!);const status=within(card).getByRole('group',{name:`${name} 更新狀態`});fireEvent.click(status.querySelector('summary')!);return status;};
 const githubStatus=openStatus('GitHub');
 expect(githubStatus.textContent).toContain('方案費、方案額度、歷史付款紀錄');
 expect(githubStatus.textContent).toContain('方案續費日、整期預估、本次應付、實際扣款日');
 expect(githubStatus.textContent).not.toContain('剩餘方案額度');
 const railwayStatus=openStatus('Railway');
 expect(railwayStatus.textContent).toContain('方案費、支出上限、歷史付款紀錄');
 expect(railwayStatus.textContent).toContain('分項折抵、實際扣款日');
 expect(railwayStatus.textContent).not.toContain('支出上限、實際扣款日');
 const supabaseStatus=openStatus('Supabase');
 expect(supabaseStatus.textContent).toContain('自動帳務尚未接通');
 expect(supabaseStatus.textContent).toContain('帳期、費用、額度、帳單');
 const cloudflareStatus=openStatus('Cloudflare Pages');
 expect(cloudflareStatus.textContent).toContain('額度上限 4 項');
 expect(cloudflareStatus.textContent).toContain('Pages 本期用量、待繳金額、帳期、實際扣款日');
});
