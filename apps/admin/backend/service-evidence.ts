// Only safe metadata from existing records is returned to the admin client.
export const operationSources: Record<string, string> = {
  matrix_custom_status_save: '自訂條件更新',
  admin_matrix_permission_settings_update: '權限設定修訂',
  member_bootstrap: '會員建立',
  member_line_pwa_diagnostics_submit: 'LINE PWA 診斷提交',
  member_notification_settings_save: '通知設定更新',
  member_transfer_request_submit: '轉帳申請提交',
  member_push_subscription_save: '啟用中的推播訂閱更新',
  member_push_subscription_disable: '已停用的推播訂閱更新',
  member_online_start: '線上工作階段開始',
  member_online_end: '線上工作階段結束',
  redeem_activation_code: '啟動碼兌換',
  claim_matrix_watchdog_lease: '現存監控執行權取得',
  begin_matrix_watchdog_recovery: '現存監控復原開始',
  notification_dispatch_claim: '現存通知派送領取',
  notification_dispatch_mark_failed: '通知派送失敗記錄',
  notification_dispatch_mark_retry: '通知等待重試',
  notification_dispatch_mark_sent: '通知派送完成',
  notification_dispatch_mark_skipped: '通知派送略過',
  notification_event_enqueue_server: '伺服器通知事件建立',
};
export const protectedResultKinds: Record<string, 'tianyan' | 'tiangong'> = {
  'supabase-rpc-matrix_tianyan_list': 'tianyan',
  'supabase-rpc-matrix_tianyan_validation': 'tianyan',
  'supabase-rpc-matrix_tiangong_list': 'tiangong',
  'supabase-rpc-matrix_tiangong_validation': 'tiangong',
};
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export type OperationActivity = { state: 'recorded' | 'none' | 'not-recorded' | 'unavailable'; source?: string; observedAt?: string };
export function operationActivity(rpc: string, rows: unknown, now: Date): OperationActivity {
  const source = operationSources[rpc];
  if (!source) return { state: 'not-recorded' };
  const matches = Array.isArray(rows) ? rows.filter(row => isRecord(row) && row.rpc_name === rpc) : [];
  if (matches.length !== 1) return { state: 'unavailable', source };
  const date = matches[0].observed_at;
  if (date === null) return { state: 'none', source };
  if (typeof date !== 'string' || !Number.isFinite(Date.parse(date)) || Date.parse(date) > now.getTime() + 120_000) return { state: 'unavailable', source };
  return { state: 'recorded', source, observedAt: date };
}

export function resultDataEvidence(rows: unknown, validation: boolean) {
  const lotteries = ['今彩539', '天天樂', '六合彩', '大樂透'];
  if (!Array.isArray(rows) || rows.length !== lotteries.length) throw new Error('INVALID_DATA_EVIDENCE');
  const samples = lotteries.map(lottery => {
    const matches = rows.filter(row => isRecord(row) && row.lottery === lottery);
    const row = matches[0];
    if (matches.length !== 1 || !isRecord(row) || typeof row.list_ok !== 'boolean'
      || ![true, false, null].includes(row.validation_ok as boolean | null)
      || !Number.isInteger(row.records) || Number(row.records) < 0) throw new Error('INVALID_DATA_EVIDENCE');
    const ready = row.list_ok && typeof row.period === 'string' && Boolean(row.period)
      && typeof row.analysis_version === 'string' && Boolean(row.analysis_version);
    const skipped = validation && ready && row.records === 0 && row.validation_ok === null;
    const ok = ready && (!validation || row.validation_ok === true || skipped);
    return { lottery, ok: Boolean(ok), skipped: Boolean(skipped),
      period: typeof row.period === 'string' ? row.period : null,
      analysisVersion: typeof row.analysis_version === 'string' ? row.analysis_version : null,
      records: Number(row.records), ...(ok ? {} : { error: '正式分析資料未通過讀取檢查。' }),
    };
  });
  return { samples, ok: samples.every(row => row.ok), skipped: samples.some(row => row.skipped) };
}
