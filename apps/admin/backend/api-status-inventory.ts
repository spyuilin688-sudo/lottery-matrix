export type ApiLocation = 'AppDeploy' | 'Supabase' | 'Railway';
export type ApiCheckMode = 'live' | 'openapi' | 'service';

export type ApiStatusDefinition = {
  id: string;
  name: string;
  group: string;
  location: ApiLocation;
  endpoint: string;
  checkMode: ApiCheckMode;
};

const supabaseRpcDefinitions = [
  ['matrix_explore_list', 'Matrix 探索清單', 'Matrix 演算法'],
  ['matrix_explore_validation', 'Matrix 探索驗證', 'Matrix 演算法'],
  ['matrix_tianyan_list', 'Matrix 天眼清單', 'Matrix 演算法'],
  ['matrix_tianyan_validation', 'Matrix 天眼驗證', 'Matrix 演算法'],
  ['matrix_tiangong_list', 'Matrix 天工清單', 'Matrix 演算法'],
  ['matrix_tiangong_validation', 'Matrix 天工驗證', 'Matrix 演算法'],
  ['matrix_custom_status_list', '自訂觸發條件清單', 'Matrix 狀態'],
  ['matrix_custom_status_save', '儲存自訂觸發條件', 'Matrix 狀態'],
  ['matrix_custom_status_reset', '重設自訂觸發條件', 'Matrix 狀態'],
  ['member_bootstrap', '建立會員資料', '會員'],
  ['member_profile', '會員資料', '會員'],
  ['member_notification_settings_get', '通知設定', '通知'],
  ['member_notification_settings_save', '儲存通知設定', '通知'],
  ['member_transfer_request_submit', '提交轉帳申請', '付款'],
  ['member_pending_transfer_request', '待審核轉帳申請', '付款'],
  ['member_payment_history_get', '會員付款紀錄', '付款'],
  ['member_push_subscription_status', '推播訂閱狀態', '推播'],
  ['member_push_subscription_save', '儲存推播訂閱', '推播'],
  ['member_push_subscription_disable', '停用推播訂閱', '推播'],
  ['member_online_start', '開始線上工作階段', '線上狀態'],
  ['member_online_end', '結束線上工作階段', '線上狀態'],
  ['redeem_activation_code', '兌換啟動碼', '啟動碼'],
] as const;

const supabaseRpcInventory: ApiStatusDefinition[] = supabaseRpcDefinitions.map(
  ([rpc, name, group]) => ({
    id: `supabase-rpc-${rpc}`,
    name,
    group,
    location: 'Supabase',
    endpoint: `/rest/v1/rpc/${rpc}`,
    checkMode: 'openapi',
  }),
);

export const apiStatusInventory: readonly ApiStatusDefinition[] = [
  {
    id: 'admin-api',
    name: '管理者後臺 API',
    group: '系統',
    location: 'AppDeploy',
    endpoint: '/api/_healthcheck',
    checkMode: 'live',
  },
  {
    id: 'supabase-database',
    name: 'Database REST API',
    group: '系統',
    location: 'Supabase',
    endpoint: '/rest/v1/plans?select=id&limit=1',
    checkMode: 'live',
  },
  {
    id: 'supabase-auth',
    name: 'Auth API',
    group: '系統',
    location: 'Supabase',
    endpoint: '/auth/v1/settings',
    checkMode: 'live',
  },
  {
    id: 'matrix-status-function',
    name: 'Matrix 狀態 Edge Function',
    group: 'Matrix 狀態',
    location: 'Supabase',
    endpoint: '/functions/v1/matrix-status',
    checkMode: 'live',
  },
  ...supabaseRpcInventory,
  {
    id: 'railway-health',
    name: 'Worker 健康檢查',
    group: '系統',
    location: 'Railway',
    endpoint: '/health',
    checkMode: 'live',
  },
  {
    id: 'railway-jobs-status',
    name: '排程執行狀態',
    group: '排程',
    location: 'Railway',
    endpoint: '/jobs/status',
    checkMode: 'live',
  },
  {
    id: 'railway-jobs-refresh',
    name: '手動更新排程',
    group: '排程',
    location: 'Railway',
    endpoint: '/jobs/refresh',
    checkMode: 'service',
  },
  {
    id: 'railway-cards',
    name: 'Matrix 卡片資料',
    group: 'Matrix 資料',
    location: 'Railway',
    endpoint: '/api/matrix/cards/*',
    checkMode: 'service',
  },
  {
    id: 'railway-latest',
    name: 'Matrix 最新分析',
    group: 'Matrix 資料',
    location: 'Railway',
    endpoint: '/api/matrix/latest/*',
    checkMode: 'service',
  },
  {
    id: 'railway-history',
    name: 'Matrix 歷史資料',
    group: 'Matrix 資料',
    location: 'Railway',
    endpoint: '/api/matrix/history/*',
    checkMode: 'service',
  },
  {
    id: 'railway-tongxing',
    name: 'Matrix 同行運算',
    group: 'Matrix 運算',
    location: 'Railway',
    endpoint: '/api/matrix/tongxing',
    checkMode: 'service',
  },
  {
    id: 'railway-number-reference',
    name: 'Matrix 號碼參考',
    group: 'Matrix 運算',
    location: 'Railway',
    endpoint: '/api/matrix/number-reference',
    checkMode: 'service',
  },
];
