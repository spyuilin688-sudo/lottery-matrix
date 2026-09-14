import { useEffect, useRef, useState } from 'react';
import type { CrawlerRefreshResult } from './system-status';

const targets = {
  今彩539: 'cron-matrix-539-refresh-v2',
  天天樂: 'cron-matrix-fantasy5-refresh-v2',
  六合彩: 'cron-matrix-marksix-refresh-v2',
  大樂透: 'cron-matrix-649-refresh-v2',
} as const;
type Lottery = keyof typeof targets;
type Action = 'refresh' | 'recover';
type Confirmation = { title: string; message: string; confirmLabel: string };
type Result = { refresh?: CrawlerRefreshResult; recovery?: { lottery: string; status: string } };

export function RailwayOperations({ client, canEdit, confirm, disabled = false, onBusyChange }: {
  client: { post(url: string): Promise<{ data: Result }> };
  canEdit: boolean;
  confirm: (request: Confirmation) => Promise<boolean>;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [lottery, setLottery] = useState<Lottery>('今彩539');
  const [pending, setPending] = useState<Action | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const locked = useRef(false);
  const editAllowed = useRef(canEdit);
  editAllowed.current = canEdit;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = async (action: Action) => {
    if (!canEdit || disabled || locked.current) return;
    locked.current = true;
    onBusyChange?.(true);
    setPending(action);
    setNotice('');
    setError('');
    const label = action === 'refresh' ? '手動更新' : '復原';
    try {
      if (!await confirm({
        title: `確認${label}${lottery}`,
        message: action === 'refresh'
          ? `將更新${lottery}的最新開獎資料。`
          : `將交由 Railway 復原${lottery}的資料或分析；已有工作執行中時不重複啟動。`,
        confirmLabel: `確認${label}`,
      }) || !mounted.current || !editAllowed.current) return;
      const { data } = await client.post(`/api/system-status/${targets[lottery]}/${action}`);
      let message: string;
      if (action === 'refresh' && data.refresh?.lottery === lottery && data.refresh.period) {
        message = `${lottery} 已手動更新至 ${data.refresh.period} 期`;
      } else if (action === 'recover' && data.recovery?.lottery === lottery && ['accepted', 'already-running'].includes(data.recovery.status)) {
        message = data.recovery.status === 'accepted'
          ? `${lottery} 已受理復原，尚未完成；請重新檢查執行狀態。`
          : `${lottery} 已有復原工作執行中，本次未重複啟動。`;
      } else {
        throw new Error('未取得有效操作結果，請重新檢查執行狀態。');
      }
      if (mounted.current) setNotice(message);
    } catch (cause) {
      if (mounted.current) setError(`${cause instanceof Error ? cause.message : `${label}未取得回應`}；請先重新檢查執行狀態，再決定是否重試。`);
    } finally {
      locked.current = false;
      if (mounted.current) { onBusyChange?.(false); setPending(null); }
    }
  };
  return (
    <section className='railwayOperations' aria-labelledby='railway-operations-title'>
      <div className='railwayOperationHeader'>
        <div><h3 id='railway-operations-title'>Railway 操作</h3><p>針對單一彩種更新資料或復原分析工作。</p></div>
        <div className='railwayOperationControls'>
          <label htmlFor='railway-operation-lottery'>操作彩種</label>
          <select id='railway-operation-lottery' value={lottery} disabled={disabled || Boolean(pending) || !canEdit} onChange={event => setLottery(event.target.value as Lottery)}>
            {Object.keys(targets).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      </div>
      <div className='railwayOperationRows'>
        <div className='railwayOperationRow'>
          <div><b>更新開獎資料</b><p id='railway-refresh-help'>最新期數未同步時使用；重新取得所選彩種的開獎資料，成功後顯示回傳期數。</p></div>
          <button type='button' className='compactButton' disabled={disabled || Boolean(pending) || !canEdit} aria-describedby='railway-refresh-help' aria-busy={pending === 'refresh'} onClick={() => run('refresh')}>手動更新</button>
        </div>
        <div className='railwayOperationRow'>
          <div><b>復原資料與分析</b><p id='railway-recover-help'>資料缺漏或分析中斷時使用；依目前狀態補抓資料或續做分析。天天樂僅復原分析。</p></div>
          <button type='button' className='compactButton' disabled={disabled || Boolean(pending) || !canEdit} aria-describedby='railway-recover-help' aria-busy={pending === 'recover'} onClick={() => run('recover')}>復原</button>
        </div>
      </div>
      <p className='railwayOperationHint'>復原為背景工作，「已受理」不代表完成；請稍後按上方「重新檢查」查看狀態。已有工作執行時不重複啟動；未取得回應時，先檢查再決定是否重試。</p>
      {!canEdit && <p className='statusScope'>目前帳號沒有編輯權限</p>}
      <div className='railwayOperationFeedback' aria-live='polite'>
        {pending && <p>正在處理{lottery}{pending === 'refresh' ? '手動更新' : '復原'}…</p>}
        {notice && <p role='status'>{notice}</p>}
        {error && <p className='statusErrorText' role='alert'>{error}</p>}
      </div>
    </section>
  );
}
