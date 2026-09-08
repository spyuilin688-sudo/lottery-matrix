// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixCustomStatusPage } from '../FeaturePages';
const api = vi.hoisted(() => ({ fetchMatrixStatus: vi.fn(), listCustomStatusSettings: vi.fn(), saveCustomStatusSetting: vi.fn(), resetCustomStatusSetting: vi.fn() }));
vi.mock('../matrix-status-api', () => api);
beforeEach(() => {
 cleanup(); api.listCustomStatusSettings.mockReset().mockResolvedValue({items:[],entitlements:{canCustomizeStatus:true,canUseCompositeCustomRoad:false}});
 api.saveCustomStatusSetting.mockReset().mockImplementation(async(config)=>({item:config}));
 api.resetCustomStatusSetting.mockReset().mockResolvedValue({});
});
async function openPage(){render(<MatrixCustomStatusPage onNavigate={vi.fn()}/>);await screen.findByText('使用預設條件');}
const group=(kind='一碼',n=1)=>screen.getByRole('article',{name:kind+'條件 條件群組 '+n});
const expand=(kind='一碼',n=1)=>{
 const article=group(kind,n),panel=article.querySelector('details');
 if(panel&&!panel.open)fireEvent.click(panel.querySelector('summary')!);
 return article;
};
const row=(kind='一碼',n=1,r=1)=>within(expand(kind,n)).getByRole('group',{name:'條件 '+r});
const field=(name:string,kind='一碼',n=1,r=1)=>within(row(kind,n,r)).getByLabelText(name);

test('群組預設收合並保留摘要，展開編輯後再次收合不丟失輸入',async()=>{
 await openPage();
 const panel=group().querySelector('details');
 expect(panel).not.toBeNull();expect(panel!.open).toBe(false);
 expect(panel!.querySelector('summary')!.textContent).toContain('準5進6～準6進7');
 expect(panel!.querySelector('summary')!.textContent).toContain('同碼 2～4');
 fireEvent.change(field('最少'),{target:{value:'3'}});
 fireEvent.click(panel!.querySelector('summary')!);expect(panel!.open).toBe(false);
 expect(panel!.querySelector('summary')!.textContent).toContain('同碼 3～4');
 expect(field('最少')).toHaveProperty('value','3');
 fireEvent.click(screen.getByRole('button',{name:'儲存設定'}));
 await waitFor(()=>expect(api.saveCustomStatusSetting).toHaveBeenCalledTimes(1));
 expect(api.saveCustomStatusSetting.mock.calls[0][0].oneCodeGroups[0].rows[0].sameCodeMin).toBe(3);
});

test('新增群組直接展開，刪除群組不切換其他群組的收合狀態',async()=>{
 await openPage();fireEvent.click(screen.getByRole('button',{name:'新增一碼條件群組'}));
 expect(group('一碼',2).querySelector('details')).toHaveProperty('open',true);
 expect(group().querySelector('details')).toHaveProperty('open',false);
 fireEvent.click(within(group('一碼',2)).getByRole('button',{name:'一碼條件 刪除條件群組 2'}));
 expect(group().querySelector('details')).toHaveProperty('open',false);
});

test('收合的錯誤欄位在儲存時自動展開並取得焦點',async()=>{
 await openPage();const minimum=field('最少');
 fireEvent.change(minimum,{target:{value:'5'}});
 const panel=group().querySelector('details')!;
 expect(panel).not.toBeNull();fireEvent.click(panel.querySelector('summary')!);
 expect(panel.open).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'儲存設定'}));
 await screen.findByRole('alert');
 expect(panel.open).toBe(true);expect(document.activeElement).toBe(minimum);
 expect(api.saveCustomStatusSetting).not.toHaveBeenCalled();
});

test('上方保留四狀態與彩種，下方以可編輯的一碼兩碼模板呈現',async()=>{
 await openPage();
 expect(screen.getByTestId('lottery-switcher').classList.contains('lottery-switcher--home-style')).toBe(true);
 expect(within(screen.getByRole('tablist',{name:'選擇狀態'})).getAllByRole('tab')).toHaveLength(4);
 const summary=screen.getByRole('region',{name:'探索條件'});
 expect(summary.textContent).toBe('探索期數：十三期|探索範圍：完整範圍');
 expect(within(summary).queryByRole('heading')).toBeNull();
 expect(screen.getByTestId('lottery-switcher').nextElementSibling).toBe(summary);
 expect(summary.nextElementSibling).toBe(screen.getByRole('tablist',{name:'選擇狀態'}));
 const mode=screen.getByText('使用預設條件');
 expect(mode.getAttribute('role')).toBe('status');
 expect(mode.parentElement?.contains(screen.getByRole('heading',{name:'一碼條件'}))).toBe(true);
 expect(field('連準起點')).toHaveProperty('value','5');expect(field('連準終點')).toHaveProperty('value','6');
 expect(field('最少')).toHaveProperty('value','2');expect(field('最多')).toHaveProperty('value','4');
 expect(within(row()).getByRole('checkbox',{name:'加減'})).toHaveProperty('checked',true);
 expect(within(row()).getByRole('checkbox',{name:'合值'})).toHaveProperty('checked',true);
 expect(screen.getByRole('region',{name:'兩碼條件'})).toBeTruthy();
});
test('四狀態精確提供2、6、10、4張模板共22張',async()=>{
 await openPage();
 for(const [name,count] of [['啟動',2],['聚合',6],['共振',10],['臨界',4]] as const){
 fireEvent.click(screen.getByRole('tab',{name:new RegExp(name)}));
 expect(screen.getAllByRole('article',{name:/條件群組/})).toHaveLength(count);expect(screen.getByText('使用預設條件')).toBeTruthy();
 }
});
test('編輯模板轉已自訂，提交範圍、複選版路及另一類型完整資料',async()=>{
 await openPage();fireEvent.change(field('最少'),{target:{value:'3'}});fireEvent.change(field('最多'),{target:{value:''}});
 fireEvent.click(within(row()).getByRole('checkbox',{name:'合值'}));fireEvent.click(within(row()).getByRole('checkbox',{name:'拖牌'}));
 fireEvent.change(field('版路關係'),{target:{value:'all'}});expect(screen.getByText('已自訂')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'儲存設定'}));
 await waitFor(()=>expect(api.saveCustomStatusSetting).toHaveBeenCalledTimes(1));
 const config=api.saveCustomStatusSetting.mock.calls[0][0];
 expect(config).toMatchObject({schemaVersion:2,lottery:'今彩539',status:'ACTIVE',explorePeriods:13,exploreRange:'完整範圍'});
 expect(config.oneCodeGroups[0].rows[0]).toMatchObject({consecutiveMin:5,consecutiveMax:6,roadTypes:['加減','拖牌'],roadRelation:'all',sameCodeMin:3,sameCodeMax:null});
 expect(config.twoCodeGroups[0].rows[0]).toMatchObject({consecutiveMin:7,consecutiveMax:9,sameCodeMin:3,sameCodeMax:5});
});
test('複合AND留在同卡，新增群組為OR',async()=>{
 await openPage();fireEvent.click(screen.getByRole('tab',{name:/聚合/}));
 expect(within(expand('兩碼',2)).getAllByRole('group',{name:/^條件 /})).toHaveLength(2);
 expect(within(group('兩碼',2)).getByText('＋ 同時符合')).toBeTruthy();
 expect(field('最多','兩碼',2,2)).toHaveProperty('value','1');
 fireEvent.click(screen.getByRole('button',{name:'新增兩碼條件群組'}));expect(group('兩碼',4)).toBeTruthy();
 expect(within(screen.getByRole('region',{name:'兩碼條件'})).getAllByText('或')).toHaveLength(3);
});
test('範圍倒置阻止儲存且保留輸入與欄位錯誤',async()=>{
 await openPage();fireEvent.change(field('最少'),{target:{value:'5'}});fireEvent.click(screen.getByRole('button',{name:'儲存設定'}));
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','同碼條數的最少不可大於最多');
 expect(field('最少')).toHaveProperty('value','5');expect(api.saveCustomStatusSetting).not.toHaveBeenCalled();
 expect(screen.getAllByRole('spinbutton').some(el=>el.getAttribute('aria-invalid')==='true')).toBe(true);
});
test('單一連準摘要只顯示一次',async()=>{
 await openPage();fireEvent.change(field('連準終點'),{target:{value:'5'}});
 expect(within(row()).getByText('準5進6',{selector:'output'})).toBeTruthy();
});
test('舊資料最低數量無損轉為最多不限',async()=>{
 api.listCustomStatusSettings.mockResolvedValueOnce({items:[{config:{lottery:'今彩539',status:'ACTIVE',explorePeriods:13,exploreRange:'完整範圍',oneCodeGroups:[{id:'legacy',rows:[{consecutive:'準6進7',roadType:'合值',numberOrder:'依號碼由小到大排序',sameCodeQuantity:3}]}],twoCodeGroups:[]},evaluation:{}}],entitlements:{canCustomizeStatus:true,canUseCompositeCustomRoad:false}});
 render(<MatrixCustomStatusPage onNavigate={vi.fn()}/>);await screen.findByText('已自訂');
 expect(field('連準起點')).toHaveProperty('value','6');expect(field('連準終點')).toHaveProperty('value','6');
 expect(field('最少')).toHaveProperty('value','3');expect(field('最多')).toHaveProperty('value','');
});
test('儲存失敗保留輸入，等待期間禁止重複提交',async()=>{
 let rejectSave:((e:Error)=>void)|undefined;api.saveCustomStatusSetting.mockImplementationOnce(()=>new Promise((_r,reject)=>{rejectSave=reject;}));
 await openPage();fireEvent.change(field('最少'),{target:{value:'3'}});
 fireEvent.click(screen.getByRole('button',{name:'儲存設定'}));fireEvent.click(screen.getByRole('button',{name:'儲存設定'}));
 expect(api.saveCustomStatusSetting).toHaveBeenCalledTimes(1);await act(async()=>rejectSave?.(new Error('offline')));
 expect(field('最少')).toHaveProperty('value','3');expect(screen.getByRole('button',{name:'儲存設定'})).toHaveProperty('disabled',false);
});
test('延遲儲存不覆蓋切換後狀態的編輯',async()=>{
 let finish:(()=>void)|undefined;api.saveCustomStatusSetting.mockImplementationOnce(config=>new Promise(resolve=>{finish=()=>resolve({item:config});}));
 await openPage();fireEvent.change(field('最少'),{target:{value:'3'}});fireEvent.click(screen.getByRole('button',{name:'儲存設定'}));
 fireEvent.click(screen.getByRole('tab',{name:/聚合/}));fireEvent.change(field('最少'),{target:{value:'6'}});
 await act(async()=>finish?.());expect(field('最少')).toHaveProperty('value','6');expect(screen.getByText('已自訂')).toBeTruthy();
});
test('重置僅影響目前彩種狀態，恢復預設模板',async()=>{
 await openPage();fireEvent.change(field('最少'),{target:{value:'3'}});fireEvent.click(screen.getByRole('tab',{name:/聚合/}));
 fireEvent.change(field('最少'),{target:{value:'6'}});fireEvent.click(screen.getByRole('button',{name:'重置設定'}));
 await waitFor(()=>expect(api.resetCustomStatusSetting).toHaveBeenCalledWith('今彩539','FOCUS'));
 expect(await screen.findByText('使用預設條件')).toBeTruthy();expect(field('最少')).toHaveProperty('value','5');
 fireEvent.click(screen.getByRole('tab',{name:/啟動/}));expect(field('最少')).toHaveProperty('value','3');
});
test('讀取失敗不假裝使用預設',async()=>{
 api.listCustomStatusSettings.mockRejectedValueOnce(new Error('offline'));
 render(<MatrixCustomStatusPage onNavigate={vi.fn()}/>);
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','自訂設定讀取失敗');
 expect(screen.queryByText('使用預設條件')).toBeNull();expect(screen.queryByRole('article',{name:/條件群組/})).toBeNull();
});

test('降級後可取消既有複合版路，但不可新增未授權複合版路',async()=>{
 api.listCustomStatusSettings.mockResolvedValueOnce({items:[{config:{
  schemaVersion:2,lottery:'今彩539',status:'ACTIVE',explorePeriods:13,exploreRange:'完整範圍',
  oneCodeGroups:[{id:'mixed',rows:[{consecutiveMin:5,consecutiveMax:6,roadTypes:['加減','複合'],
   roadRelation:'any',numberOrder:'依號碼由小到大排序',sameCodeMin:1,sameCodeMax:null}]}],twoCodeGroups:[]
 },evaluation:{}}],entitlements:{canCustomizeStatus:true,canUseCompositeCustomRoad:false}});
 render(<MatrixCustomStatusPage onNavigate={vi.fn()}/>);await screen.findByText('已自訂');
 const composite=within(row()).getByRole('checkbox',{name:'複合'});
 expect(composite).toHaveProperty('disabled',false);
 fireEvent.click(composite);
 expect(composite).toHaveProperty('checked',false);expect(composite).toHaveProperty('disabled',true);
 fireEvent.click(screen.getByRole('button',{name:'儲存設定'}));
 await waitFor(()=>expect(api.saveCustomStatusSetting).toHaveBeenCalledTimes(1));
 expect(api.saveCustomStatusSetting.mock.calls[0][0].oneCodeGroups[0].rows[0].roadTypes).toEqual(['加減']);
});

test('未登入時提供登入入口，不顯示可編輯條件', async () => {
 api.listCustomStatusSettings.mockRejectedValueOnce(Object.assign(new Error('AUTH_REQUIRED'), {code:'AUTH_REQUIRED'}));
 const navigate=vi.fn(); render(<MatrixCustomStatusPage onNavigate={navigate}/>);
 fireEvent.click(await screen.findByRole('button',{name:'前往登入'}));
 expect(navigate).toHaveBeenCalledWith('profile');
 expect(screen.queryByRole('article',{name:/條件群組/})).toBeNull();
});
test('不符合方案權限時提供方案入口，不顯示可編輯條件', async () => {
 api.listCustomStatusSettings.mockResolvedValueOnce({items:[],entitlements:{canCustomizeStatus:false,canUseCompositeCustomRoad:false}});
 const navigate=vi.fn(); render(<MatrixCustomStatusPage onNavigate={navigate}/>);
 fireEvent.click(await screen.findByRole('button',{name:'查看 Matrix Pro 方案'}));
 expect(navigate).toHaveBeenCalledWith('pro-plans');
 expect(screen.queryByRole('button',{name:'儲存設定'})).toBeNull();
});
test('讀取失敗可重試並恢复原本可用條件', async () => {
 api.listCustomStatusSettings.mockRejectedValueOnce(new Error('offline'));
 render(<MatrixCustomStatusPage onNavigate={vi.fn()}/>);
 fireEvent.click(await screen.findByRole('button',{name:'重新載入自訂設定'}));
 expect(await screen.findByText('使用預設條件')).toBeTruthy();
});
