/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import { architectureProviders, readArchitectureSubscriptions, type ArchitectureSubscription } from '../shared/architecture-overview';
import { formatAdminDateTime } from './admin-operations';
import './architecture-overview.css';

type Client = { get(path: string): Promise<{ data: unknown }> };

export function ArchitectureOverview({ client }: { client: Client }) {
  const [items, setItems] = useState<ArchitectureSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const request = useRef<{ client: Client; attempt: number; promise: Promise<ArchitectureSubscription[]> } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    if (!request.current || request.current.client !== client || request.current.attempt !== attempt) {
      request.current = { client, attempt, promise: client.get('/api/architecture-overview').then(({ data }) => {
        if (!data || typeof data !== 'object' || !('items' in data)) throw new Error('資料格式不符');
        return readArchitectureSubscriptions(data.items);
      }) };
    }
    void request.current.promise.then(result => {
      if (active) setItems(result);
    }, () => {
      if (active) { setItems([]); setError('無法讀取訂閱資料，請重新載入。'); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, attempt]);

  return (
    <div className="architectureOverview" aria-label="平台訂閱總覽" aria-busy={loading}>
      <p className="architectureNote">顯示最近確認的訂閱資料，不會自動同步平台帳單。方案與續費請至各平台管理。</p>
      {loading && <div className="loading" role="status">讀取訂閱資料中…</div>}
      {error && <div className="architectureError"><p className="error" role="alert">{error}</p><button type="button" className="compactButton" disabled={loading} onClick={() => setAttempt(value => value + 1)}>重新載入</button></div>}
      <div className="architectureGrid">
        {architectureProviders.map(provider => {
          const item = items.find(value => value.provider === provider.id);
          const missing = loading ? '讀取中…' : '尚未取得';
          return (
            <article className="panel architectureProvider" key={provider.id} aria-labelledby={`architecture-${provider.id}`}>
              <h2 id={`architecture-${provider.id}`}>{provider.name}</h2>
              <dl className="architectureFacts">
                <div><dt>訂閱方案</dt><dd>{item?.plan ?? missing}</dd></div>
                <div><dt>方案費用</dt><dd>{item?.fee ?? missing}</dd></div>
                <div><dt>續費日期</dt><dd>{item?.renewalDate ? <time dateTime={item.renewalDate}>{item.renewalDate}</time> : missing}</dd></div>
              </dl>
              <p className="architectureVerified">資料確認：{item?.verifiedAt ? <time dateTime={item.verifiedAt}>{formatAdminDateTime(item.verifiedAt)}</time> : '尚未確認'}</p>
              <a className="compactButton architectureLink" href={provider.url} target="_blank" rel="noopener noreferrer" aria-label={`${provider.name} 管理訂閱（另開分頁）`}>管理訂閱 <span aria-hidden="true">↗</span></a>
            </article>
          );
        })}
      </div>
    </div>
  );
}
