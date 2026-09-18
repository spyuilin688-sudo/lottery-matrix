import { formatAdminDateTime } from './admin-operations';
import { useEffect, useRef, useState } from 'react';
import './permission-switches.css';

type PermissionSettingKey =
  | 'subscriptionPurchaseVisible'
  | 'registeredMemberFreeAccess';

type MatrixPermissionSettings = {
  subscriptionPurchaseVisible: boolean;
  registeredMemberFreeAccess: boolean;
  revision: number;
  updatedAt: string;
};

type Client = {
  get(path: string): Promise<{ data: unknown }>;
  put(path: string, body: unknown): Promise<{ data: unknown }>;
};

type Confirmation = (request: {
  title: string;
  message: string;
  confirmLabel: string;
}) => Promise<boolean>;

const definitions: Array<{
  key: PermissionSettingKey;
  label: string;
  description: string;
  consequence: string;
}> = [
  {
    key: 'subscriptionPurchaseVisible',
    label: '顯示訂閱購買',
    description: '控制訂閱購買入口、付款紀錄、退款規範與相關購買內容。',
    consequence: '所有會員的訂閱購買入口及相關內容',
  },
  {
    key: 'registeredMemberFreeAccess',
    label: '註冊會員免費使用',
    description: '讓所有有效註冊會員使用天衍、天工、探索七期／十三期／完整範圍。',
    consequence: '所有有效註冊會員的 Matrix 免費使用權限',
  },
];

const permissionRefreshIntervalMs = 60 * 60 * 1000;

function checkedTimeLabel(value: string) {
  return formatAdminDateTime(value);
}

function settingsFrom(value: unknown): MatrixPermissionSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.subscriptionPurchaseVisible !== 'boolean'
    || typeof record.registeredMemberFreeAccess !== 'boolean'
    || !Number.isInteger(record.revision)
    || Number(record.revision) < 0
    || typeof record.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(record.updatedAt))
  ) return null;
  return {
    subscriptionPurchaseVisible: record.subscriptionPurchaseVisible,
    registeredMemberFreeAccess: record.registeredMemberFreeAccess,
    revision: Number(record.revision),
    updatedAt: record.updatedAt,
  };
}

export function PermissionSwitches({
  client,
  canEdit,
  confirm,
}: {
  client: Client;
  canEdit: boolean;
  confirm: Confirmation;
}) {
  const [settings, setSettings] = useState<MatrixPermissionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<PermissionSettingKey | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  const identity = useRef({ client, canEdit });
  identity.current = { client, canEdit };
  const savingRef = useRef(false);

  const read = async (showLoading: boolean) => {
    if (!showLoading && savingRef.current) return null;
    const version = ++requestVersion.current;
    const current = () => mounted.current && identity.current.client === client && version === requestVersion.current;
    if (showLoading) setLoading(true);
    setError('');
    try {
      const response = await client.get('/api/permission-settings');
      const next = settingsFrom(response.data);
      if (!next) throw new Error('INVALID_PERMISSION_SETTINGS');
      if (current()) {
        setSettings(next);
        setCheckedAt(new Date().toISOString());
      }
      return next;
    } catch {
      if (current()) {
        if (showLoading) setSettings(null);
        setError('權限設定載入失敗，請重新載入');
      }
      return null;
    } finally {
      if (current() && showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    savingRef.current = false;
    setSaving(null);
    void read(true);
    const interval = window.setInterval(() => { void read(false); }, permissionRefreshIntervalMs);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      requestVersion.current += 1;
    };
  }, [client]);

  const change = async (definition: typeof definitions[number]) => {
    if (!canEdit || !settings || savingRef.current) return;
    const current = () => mounted.current && identity.current.client === client && identity.current.canEdit;
    const nextValue = !settings[definition.key];
    const action = nextValue ? '開啟' : '關閉';
    const expectedRevision = settings.revision;
    savingRef.current = true;
    setSaving(definition.key);
    setError('');
    setNotice('');
    try {
      const confirmed = await confirm({
        title: `確認${action}${definition.label}`,
        message: `將${action}${definition.consequence}。`,
        confirmLabel: `確認${action}`,
      });
      if (!confirmed || !current()) return;
      requestVersion.current += 1;
      const response = await client.put(`/api/permission-settings/${definition.key}`, {
        value: nextValue, expectedRevision,
      });
      if (!current()) return;
      const updated = settingsFrom(response.data);
      if (!updated) throw new Error('INVALID_PERMISSION_SETTINGS');
      setSettings(updated);
      setCheckedAt(new Date().toISOString());
      setNotice(`${definition.label}已${nextValue ? '開啟' : '關閉'}`);
    } catch (cause) {
      if (!current()) return;
      const conflict = cause instanceof Error && cause.message.includes('SETTINGS_CONFLICT');
      savingRef.current = false;
      const refreshed = await read(false);
      if (!current()) return;
      setError(conflict
        ? '設定已由其他管理員更新，已重新載入目前狀態，請再確認一次'
        : refreshed
          ? '權限設定儲存失敗，已重新載入目前狀態，請再試一次'
          : '權限設定儲存結果無法確認，請重新載入');
    } finally {
      if (mounted.current && identity.current.client === client) { savingRef.current = false; setSaving(null); }
    }
  };

  return (
    <section className="permissionSwitches" aria-labelledby="permission-switches-title">
      <header className="permissionSwitchesHeader">
        <div>
          <h2 id="permission-switches-title">權限切換</h2>
          <p>兩個設定彼此獨立，儲存後由前台依最新版本套用。</p>
        </div>
        {!canEdit && <span className="permissionReadOnly">僅超級管理員可修改</span>}
      </header>

      {loading && !settings && <div className="permissionSwitchLoading" role="status">權限設定讀取中…</div>}
      {error && <div className="error permissionSwitchFeedback" role="alert">{error}</div>}
      {notice && <div className="permissionSwitchNotice" role="status">{notice}</div>}
      {!loading && !settings && (
        <button className="compactButton permissionSwitchRetry" onClick={() => void read(true)}>
          重新載入
        </button>
      )}

      {settings && (
        <>
          <div className="permissionCurrentState" role="status" aria-live="polite">
            <div><strong>目前 PWA 狀態</strong><span>訂閱購買：{settings.subscriptionPurchaseVisible ? '開啟' : '關閉'}</span><span>會員免費使用：{settings.registeredMemberFreeAccess ? '開啟' : '關閉'}</span></div>
            <small>上次檢查：{checkedAt ? checkedTimeLabel(checkedAt) : '確認中'} · 每小時自動檢查</small>
          </div>
          <div className="permissionSwitchRows">
            {definitions.map((definition) => {
            const checked = settings[definition.key];
            const descriptionId = `permission-${definition.key}-description`;
            return (
              <article className="permissionSwitchRow" key={definition.key}>
                <div className="permissionSwitchCopy">
                  <h3>{definition.label}</h3>
                  <p id={descriptionId}>{definition.description}</p>
                </div>
                <label className="permissionSwitchControl">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={definition.label}
                    aria-describedby={descriptionId}
                    checked={checked}
                    disabled={!canEdit || Boolean(saving)}
                    onChange={() => void change(definition)}
                  />
                  <span className="permissionSwitchTrack" aria-hidden="true">
                    <span />
                  </span>
                  <b>{saving === definition.key ? '儲存中…' : checked ? '開啟' : '關閉'}</b>
                </label>
              </article>
            );
            })}
          </div>
        </>
      )}
    </section>
  );
}
