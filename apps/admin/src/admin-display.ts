import type { AdminRow } from './admin-table-pagination';

const fieldLabels: Record<string, string> = {
  name: '名稱',
  lineDisplayName: 'LINE名稱',
  line_display_name: 'LINE名稱',
  account: '帳號',
  role: '角色',
  status: '狀態',
  planName: '方案',
  plan_name: '方案',
  currentPlanId: '方案',
  current_plan_id: '方案',
  planExpiresAt: '到期時間',
  plan_expires_at: '到期時間',
  amount: '金額',
  code: '啟動碼',
  durationType: '期限',
  duration_type: '期限',
  can_view: '查看權限',
  can_add: '新增權限',
  can_edit: '修改權限',
  can_delete: '刪除權限',
  autoRenew: '自動續訂',
  auto_renew: '自動續訂',
  updated_at: '更新時間',
};

const preferredKeys = [
  'name', 'lineDisplayName', 'line_display_name', 'account', 'role', 'status',
  'planName', 'plan_name', 'currentPlanId', 'current_plan_id', 'planExpiresAt', 'plan_expires_at',
  'amount', 'code', 'durationType', 'duration_type', 'autoRenew', 'auto_renew',
  'can_view', 'can_add', 'can_edit', 'can_delete', 'updated_at',
];

const technicalKeys = new Set([
  'id', 'adminId', 'admin_id', 'authUserId', 'auth_user_id', 'createdAt', 'created_at',
  'lastLoginAt', 'last_login_at', 'updatedAt', 'ip', 'device', 'userAgent', 'user_agent',
]);

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;
  const source = value.trim();
  if (!source.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(source);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function compactText(value: unknown, limit = 72): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return `${value.length} 項`;
  if (typeof value === 'object') return '已更新';
  const source = String(value).replace(/\s+/g, ' ').trim();
  return source.length > limit ? `${source.slice(0, limit - 1)}…` : source;
}

function stableValue(value: unknown): string {
  if (value === undefined) return '__undefined__';
  if (value === null) return '__null__';
  if (typeof value !== 'object') return JSON.stringify(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function usefulKeys(record: Record<string, unknown>, candidates?: readonly string[]): string[] {
  const source = candidates?.length ? [...candidates] : Object.keys(record);
  const available = source.filter(key => key in record && !technicalKeys.has(key));
  const ordered = [
    ...preferredKeys.filter(key => available.includes(key)),
    ...available.filter(key => !preferredKeys.includes(key)),
  ];
  return [...new Set(ordered)].slice(0, 4);
}

export function formatAuditSnapshot(value: unknown, keys?: readonly string[]): string {
  const record = parseRecord(value);
  if (!record) return compactText(value);
  const selected = usefulKeys(record, keys);
  if (selected.length === 0) return '無可顯示異動';
  return selected
    .map(key => `${fieldLabels[key] ?? key.replace(/_/g, ' ')}：${compactText(record[key], 42)}`)
    .join(' · ');
}

export function formatDeviceSummary(value: unknown): string {
  if (value == null || value === '') return '—';
  const record = parseRecord(value);
  if (record) {
    const direct = record.device ?? record.model ?? record.userAgent ?? record.user_agent ?? record.ua ?? record.browser ?? record.platform ?? record.os;
    if (direct !== undefined && direct !== value) return formatDeviceSummary(direct);
  }

  const ua = String(value).replace(/\s+/g, ' ').trim();
  if (!ua) return '—';
  const parts: string[] = [];

  const android = ua.match(/Android\s+([\d.]+)/i);
  const androidModel = ua.match(/Android\s+[^;\)]+;\s*([^;\)]+?)(?:\s+Build\/|;|\))/i)?.[1]?.trim();
  const ios = ua.match(/(?:CPU (?:iPhone )?OS|iPhone OS)\s+([\d_]+)/i)?.[1]?.replace(/_/g, '.');
  const mac = ua.match(/Mac OS X\s+([\d_]+)/i)?.[1]?.replace(/_/g, '.');
  const windows = /Windows NT/i.test(ua);

  if (/iPad/i.test(ua)) parts.push('iPad');
  else if (/iPhone/i.test(ua)) parts.push('iPhone');
  else if (androidModel && !/^(?:wv|Mobile|Linux)$/i.test(androidModel)) parts.push(androidModel);
  else if (windows) parts.push('Windows');
  else if (/Macintosh|Mac OS X/i.test(ua)) parts.push('Mac');
  else if (android) parts.push('Android 裝置');

  if (android) parts.push(`Android ${android[1]}`);
  else if (ios) parts.push(`iOS ${ios}`);
  else if (mac) parts.push(`macOS ${mac}`);

  const edge = ua.match(/(?:EdgA|EdgiOS|Edg)\/([\d.]+)/i);
  const samsung = ua.match(/SamsungBrowser\/([\d.]+)/i);
  const firefox = ua.match(/(?:Firefox|FxiOS)\/([\d.]+)/i);
  const chrome = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/i);
  const safari = ua.match(/Version\/([\d.]+).*Safari\//i);
  const browser = edge ? ['Edge', edge[1]] : samsung ? ['Samsung Internet', samsung[1]] : firefox ? ['Firefox', firefox[1]] : chrome ? ['Chrome', chrome[1]] : safari ? ['Safari', safari[1]] : null;
  if (browser) parts.push(`${browser[0]} ${String(browser[1]).split('.')[0]}`);

  const result = [...new Set(parts)].join(' · ');
  return result || compactText(ua, 72);
}

function changedSnapshotKeys(beforeValue: unknown, afterValue: unknown): string[] | undefined {
  const before = parseRecord(beforeValue);
  const after = parseRecord(afterValue);
  if (!before || !after) return undefined;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => !technicalKeys.has(key) && stableValue(before[key]) !== stableValue(after[key]));
  return keys.length ? usefulKeys({ ...before, ...after }, keys) : undefined;
}

function withMemberIdentityDisplay(row: AdminRow, fallbackName?: unknown): AdminRow {
  const rawName = row.memberDisplayName ?? fallbackName;
  const memberDisplayName = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : null;
  if (!memberDisplayName) return row;
  const identityDisplay = typeof row.identityDisplay === 'string' && row.identityDisplay.trim()
    ? row.identityDisplay.trim()
    : null;
  if (!identityDisplay || identityDisplay === memberDisplayName) {
    return { ...row, identityDisplay: memberDisplayName };
  }
  if (identityDisplay.startsWith(`${memberDisplayName} · `)) return row;
  return { ...row, identityDisplay: `${memberDisplayName} · ${identityDisplay}` };
}

export function formatAdminRowForDisplay(table: string | null, row: AdminRow): AdminRow {
  if (table === 'auditLogs') {
    const changedKeys = changedSnapshotKeys(row.beforeData, row.afterData);
    return {
      ...row,
      beforeData: formatAuditSnapshot(row.beforeData, changedKeys),
      afterData: formatAuditSnapshot(row.afterData, changedKeys),
      device: formatDeviceSummary(row.device),
    };
  }
  if (table === 'loginRecords') return { ...row, device: formatDeviceSummary(row.device) };
  if (table === 'subscriptions' && (row.memberDisplayName == null || row.memberDisplayName === '')) {
    return { ...row, memberDisplayName: row.lineDisplayName ?? row.line_display_name ?? null };
  }
  if (table === 'activationCodes') {
    return withMemberIdentityDisplay(row, row.redeemedByLineDisplayName);
  }
  if (table === 'subscriptionRecords' || table === 'transferRequests') {
    return withMemberIdentityDisplay(row, row.lineDisplayName ?? row.line_display_name);
  }
  return row;
}
