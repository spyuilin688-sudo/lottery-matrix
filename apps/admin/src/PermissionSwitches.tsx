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
  const requestVersion = useRef(0);

  const read = async (showLoading: boolean) => {
    const version = ++requestVersion.current;
    if (showLoading) setLoading(true);
    setError('');
    try {
      const response = await client.get('/api/permission-settings');
      const next = settingsFrom(response.data);
      if (!next) throw new Error('INVALID_PERMISSION_SETTINGS');
      if (version === requestVersion.current) setSettings(next);
      return next;
    } catch {
      if (version === requestVersion.current) {
        if (showLoading) setSettings(null);
        setError('權限設定載入失敗，請重新載入');
      }
      return null;
    } finally {
      if (version === requestVersion.current && showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void read(true);
    return () => { requestVersion.current += 1; };
  }, []);

  const change = async (definition: typeof definitions[number]) => {
    if (!canEdit || !settings || saving) return;
    const nextValue = !settings[definition.key];
    const action = nextValue ? '開啟' : '關閉';
    const confirmed = await confirm({
      title: `確認${action}${definition.label}`,
      message: `將${action}${definition.consequence}。`,
      confirmLabel: `確認${action}`,
    });
    if (!confirmed || !settings || saving) return;

    const expectedRevision = settings.revision;
    setSaving(definition.key);
    setError('');
    setNotice('');
    try {
      const response = await client.put(`/api/permission-settings/${definition.key}`, {
        value: nextValue,
        expectedRevision,
      });
      const updated = settingsFrom(response.data);
      if (!updated) throw new Error('INVALID_PERMISSION_SETTINGS');
      setSettings(updated);
      setNotice(`${definition.label}已${nextValue ? '開啟' : '關閉'}`);
    } catch (cause) {
      const conflict = cause instanceof Error && cause.message.includes('SETTINGS_CONFLICT');
      const refreshed = await read(false);
      setError(conflict
        ? '設定已由其他管理員更新，已重新載入目前狀態，請再確認一次'
        : refreshed
          ? '權限設定儲存失敗，已重新載入目前狀態，請再試一次'
          : '權限設定儲存結果無法確認，請重新載入');
    } finally {
      setSaving(null);
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
      )}
    </section>
  );
}
