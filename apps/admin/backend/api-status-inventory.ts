export type ApiLocation = 'AppDeploy' | 'Supabase' | 'GitHub' | 'Railway';
export type ApiCheckEvidence = 'live' | 'registered' | 'options' | 'inherited' | 'reported';
export type ApiCheckMode = 'live' | 'openapi' | 'service';

export type ApiStatusDefinition = {
  id: string;
  name: string;
  group: string;
  location: ApiLocation;
  endpoint: string;
  checkMode: ApiCheckMode;
  description: string;
};

const supabaseRpcDefinitions = [
  ['matrix_explore_list', 'Matrix 探索清單', 'Matrix 演算法', '取得 Matrix 探索清單。'],
  ['matrix_explore_validation', 'Matrix 探索驗證', 'Matrix 演算法', '取得探索結果的驗證資料。'],
  ['matrix_tianyan_list', 'Matrix 天衍清單', 'Matrix 演算法', '取得 Matrix 天衍分析清單。'],
  ['matrix_tianyan_validation', 'Matrix 天衍驗證', 'Matrix 演算法', '取得 Matrix 天衍分析驗證資料。'],
  ['matrix_tiangong_list', 'Matrix 天工清單', 'Matrix 演算法', '取得 Matrix 天工分析清單。'],
  ['matrix_tiangong_validation', 'Matrix 天工驗證', 'Matrix 演算法', '取得 Matrix 天工分析驗證資料。'],
  ['matrix_custom_status_list', '自訂觸發條件清單', 'Matrix 狀態', '取得會員自訂觸發條件。'],
  ['matrix_custom_status_save', '儲存自訂觸發條件', 'Matrix 狀態', '儲存會員自訂觸發條件。'],
  ['matrix_custom_status_reset', '重設自訂觸發條件', 'Matrix 狀態', '重設會員自訂觸發條件。'],
  ['member_bootstrap', '建立會員資料', '會員', '建立或補齊會員資料。'],
  ['member_referral_summary', '會員推薦摘要', '會員', '取得會員推薦紀錄摘要。'],
  ['member_referral_submit', '提交會員推薦碼', '會員', '提交會員推薦碼。'],
  ['member_line_pwa_diagnostics_submit', '提交 LINE PWA 診斷', '會員', '提交會員 LINE PWA 診斷資料。'],
  ['record_matrix_visit', '記錄 Matrix 瀏覽', '系統', '記錄 Matrix 瀏覽人數。'],
  ['member_profile', '會員資料', '會員', '取得會員資料。'],
  ['member_notification_settings_get', '通知設定', '通知', '取得會員通知設定。'],
  ['member_notification_settings_save', '儲存通知設定', '通知', '儲存會員通知設定。'],
  ['member_transfer_request_submit', '提交轉帳申請', '付款', '提交會員轉帳申請。'],
  ['member_pending_transfer_request', '待審核轉帳申請', '付款', '取得會員待審核轉帳申請。'],
  ['member_payment_history_get', '會員付款紀錄', '付款', '取得會員付款紀錄。'],
  ['member_push_subscription_status', '推播訂閱狀態', '推播', '取得會員推播訂閱狀態。'],
  ['member_push_subscription_save', '儲存推播訂閱', '推播', '儲存會員推播訂閱資料。'],
  ['member_push_subscription_disable', '停用推播訂閱', '推播', '停用會員推播訂閱。'],
  ['member_online_start', '開始線上工作階段', '線上狀態', '記錄會員開始上線。'],
  ['member_online_end', '結束線上工作階段', '線上狀態', '記錄會員結束上線。'],
  ['redeem_activation_code', '兌換啟動碼', '啟動碼', '兌換會員啟動碼。'],
  ['claim_matrix_watchdog_lease', '取得 Watchdog 租約', 'Watchdog', '確認跨主機 Watchdog 租約取得 API 已登錄。'],
  ['release_matrix_watchdog_lease', '釋放 Watchdog 租約', 'Watchdog', '確認跨主機 Watchdog 租約釋放 API 已登錄。'],
  ['begin_matrix_watchdog_recovery', '開始 Watchdog 復原', 'Watchdog', '確認 Watchdog 復原開始 API 已登錄。'],
  ['renew_matrix_watchdog_recovery', '續期 Watchdog 復原', 'Watchdog', '確認 Watchdog 復原續期 API 已登錄。'],
  ['finish_matrix_watchdog_recovery', '完成 Watchdog 復原', 'Watchdog', '確認 Watchdog 復原完成 API 已登錄。'],
  ['notification_dispatch_claim', '取得通知派送工作', '通知伺服器', '確認通知派送工作取得 API 已登錄。'],
  ['notification_dispatch_mark_failed', '標記通知派送失敗', '通知伺服器', '確認通知派送失敗 API 已登錄。'],
  ['notification_dispatch_mark_retry', '標記通知派送重試', '通知伺服器', '確認通知派送重試 API 已登錄。'],
  ['notification_dispatch_mark_sent', '標記通知派送完成', '通知伺服器', '確認通知派送完成 API 已登錄。'],
  ['notification_dispatch_mark_skipped', '標記通知派送略過', '通知伺服器', '確認通知派送略過 API 已登錄。'],
  ['notification_event_enqueue_server', '建立通知伺服器事件', '通知伺服器', '確認通知伺服器事件建立 API 已登錄。'],
] as const;

const supabaseRpcInventory: ApiStatusDefinition[] = supabaseRpcDefinitions.map(
  ([rpc, name, group, description]) => ({
    id: `supabase-rpc-${rpc}`,
    name,
    group,
    location: 'Supabase',
    endpoint: `/rest/v1/rpc/${rpc}`,
    checkMode: 'openapi',
    description,
  }),
);

export const apiStatusInventory: readonly ApiStatusDefinition[] = [
  { id: 'admin-api', name: '管理者後臺 API', group: '系統', location: 'AppDeploy', endpoint: '/api/_healthcheck', checkMode: 'live', description: '確認管理者後臺 API 可正常回應。' },
  { id: 'appdeploy-watchdog-heartbeat', name: 'AppDeploy 獨立監控心跳', group: 'Watchdog', location: 'AppDeploy', endpoint: '/internal/matrix-watchdog-status', checkMode: 'service', description: '確認每 10 分鐘執行的 AppDeploy 獨立監控持續運作。' },
  { id: 'supabase-database', name: 'Supabase Database REST API', group: '系統', location: 'Supabase', endpoint: '/rest/v1/plans?select=id&limit=1', checkMode: 'live', description: '確認 Supabase 資料庫 REST API 可正常讀取。' },
  { id: 'supabase-auth', name: 'Supabase Auth API', group: '系統', location: 'Supabase', endpoint: '/auth/v1/settings', checkMode: 'live', description: '確認 Supabase Auth 服務可正常回應。' },
  { id: 'matrix-status-function', name: 'Matrix 狀態 Edge Function', group: 'Matrix 狀態', location: 'Supabase', endpoint: '/functions/v1/matrix-status', checkMode: 'live', description: '提供 Matrix 狀態相關處理。' },
  { id: 'notification-ingest-function', name: '通知事件接收 Edge Function', group: '通知', location: 'Supabase', endpoint: '/functions/v1/notification-ingest', checkMode: 'live', description: '接收並建立通知事件。' },
  { id: 'notification-dispatch-function', name: '通知派送 Edge Function', group: '通知', location: 'Supabase', endpoint: '/functions/v1/notification-dispatch', checkMode: 'live', description: '派送待處理通知事件。' },
  { id: 'notification-pilio-function', name: 'Pilio 通知 Edge Function', group: '通知', location: 'Supabase', endpoint: '/functions/v1/notification-pilio', checkMode: 'live', description: '處理 Pilio 通知事件。' },
  { id: 'send-test-push-function', name: '測試推播 Edge Function', group: '通知', location: 'Supabase', endpoint: '/functions/v1/send-test-push', checkMode: 'live', description: '提供管理後台會員測試推播。' },
  { id: 'line-logout-function', name: 'LINE 登出 Edge Function', group: '會員', location: 'Supabase', endpoint: '/functions/v1/line-logout', checkMode: 'live', description: '處理 LINE 登出流程。' },
  ...supabaseRpcInventory,
  { id: 'github-fantasy5-workflow', name: '天天樂 GitHub Actions 爬蟲', group: '排程', location: 'GitHub', endpoint: '/repos/spyuilin688-sudo/lottery-matrix/actions/workflows/fantasy5-crawler.yml', checkMode: 'live', description: '唯讀確認天天樂爬蟲 workflow 與最近一次執行狀態。' },
  { id: 'railway-health', name: 'Railway Worker 健康檢查', group: '系統', location: 'Railway', endpoint: '/health', checkMode: 'live', description: '確認 Railway Worker 服務可正常回應。' },
  { id: 'railway-jobs-status', name: 'Railway 排程狀態 API', group: '排程', location: 'Railway', endpoint: '/jobs/status', checkMode: 'live', description: '取得四個彩種排程執行狀態。' },
  { id: 'railway-jobs-refresh', name: 'Railway 手動更新 API', group: '排程', location: 'Railway', endpoint: '/jobs/refresh', checkMode: 'service', description: '手動觸發指定彩種資料更新。' },
  { id: 'railway-jobs-recover', name: 'Railway Watchdog 復原 API', group: 'Watchdog', location: 'Railway', endpoint: '/jobs/recover', checkMode: 'service', description: '由 Watchdog 觸發指定彩種資料或分析復原。' },
  { id: 'railway-cards', name: 'Matrix 卡片資料 API', group: 'Matrix 資料', location: 'Railway', endpoint: '/api/matrix/cards/*', checkMode: 'service', description: '取得 Matrix 卡片資料。' },
  { id: 'railway-latest', name: 'Matrix 最新分析 API', group: 'Matrix 資料', location: 'Railway', endpoint: '/api/matrix/latest/*', checkMode: 'service', description: '取得最新一期 Matrix 分析資料。' },
  { id: 'railway-history', name: 'Matrix 歷史資料 API', group: 'Matrix 資料', location: 'Railway', endpoint: '/api/matrix/history/*', checkMode: 'service', description: '取得 Matrix 歷史分析資料。' },
  { id: 'railway-tongxing', name: 'Matrix 同星運算 API', group: 'Matrix 運算', location: 'Railway', endpoint: '/api/matrix/tongxing', checkMode: 'service', description: '執行 Matrix 同星運算。' },
  { id: 'railway-number-reference', name: '號碼對照單 API', group: 'Matrix 運算', location: 'Railway', endpoint: '/api/matrix/number-reference', checkMode: 'service', description: '取得號碼對照單資料。' },
];
