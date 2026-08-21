type Requester = {
  request<T = unknown>(path: string, init?: RequestInit): Promise<T>;
};

type WriteTransport = {
  supabaseRequest<T = unknown>(path: string, init?: RequestInit): Promise<T>;
  selectRows<T = unknown>(table: string, query: string): Promise<T[]>;
  insertRows<T = unknown>(table: string, rows: unknown[]): Promise<T[]>;
  updateRows<T = unknown>(table: string, query: string, record: unknown): Promise<T[]>;
  deleteRows<T = unknown>(table: string, query: string): Promise<T[]>;
};

export type AdminActor = { id: string; account: string; name: string; role?: string };
export type AdminAccountInput = {
  account: string;
  name: string;
  role: string;
  status: string;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
};
export type SubscriptionAction = {
  action: 'activate' | 'renew' | 'cancel' | 'adjustExpiry' | 'lifetime';
  planId?: string;
  expiresAt?: string;
};

type Row = Record<string, unknown>;
type TableDefinition = {
  path: string;
  map(row: Row): Row & { id: string };
};

export class AdminDataError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'AdminDataError';
    this.statusCode = statusCode;
  }
}

const definitions: Record<string, TableDefinition> = {
  users: {
    path: '/rest/v1/members?select=id,auth_user_id,line_user_id,registered_at,current_plan_id,plan_started_at,plan_expires_at,is_lifetime,auto_renew,status,referral_code,invitation_code,last_online_at,total_online_seconds,online_session_count,current_plan:plans!members_current_plan_id_fkey(name,price,duration_days)&order=registered_at.desc&limit=200',
    map: (row) => ({
      id: String(row.id),
      authUserId: row.auth_user_id,
      lineUserId: row.line_user_id,
      registeredAt: row.registered_at,
      currentPlanId: row.current_plan_id,
      planStartedAt: row.plan_started_at,
      planExpiresAt: row.plan_expires_at,
      isLifetime: row.is_lifetime,
      autoRenew: row.auto_renew,
      status: row.status,
      referralCode: row.referral_code,
      invitationCode: row.invitation_code,
      planName: (row.current_plan as Row | null)?.name ?? null,
      lastOnlineAt: row.last_online_at,
      averageOnlineMinutes: Number(row.online_session_count ?? 0) > 0
        ? Math.round(Number(row.total_online_seconds ?? 0) / Number(row.online_session_count) / 60)
        : 0,
    }),
  },
  subscriptions: {
    path: '/rest/v1/members?select=id,auth_user_id,line_user_id,registered_at,current_plan_id,plan_started_at,plan_expires_at,is_lifetime,auto_renew,status,referral_code,invitation_code,last_online_at,total_online_seconds,online_session_count,current_plan:plans!members_current_plan_id_fkey(name,price,duration_days)&order=plan_started_at.desc.nullslast&limit=200',
    map: (row) => {
      const plan = (row.current_plan ?? null) as Row | null;
      return {
        id: String(row.id),
        authUserId: row.auth_user_id,
        lineUserId: row.line_user_id,
        registeredAt: row.registered_at,
        currentPlanId: row.current_plan_id,
        planName: plan?.name ?? null,
        planPrice: plan?.price ?? null,
        planDurationDays: plan?.duration_days ?? null,
        planStartedAt: row.plan_started_at,
        planExpiresAt: row.plan_expires_at,
        isLifetime: row.is_lifetime,
        autoRenew: row.auto_renew,
        status: row.status,
        referralCode: row.referral_code,
        invitationCode: row.invitation_code,
        lastOnlineAt: row.last_online_at,
        averageOnlineMinutes: Number(row.online_session_count ?? 0) > 0
          ? Math.round(Number(row.total_online_seconds ?? 0) / Number(row.online_session_count) / 60)
          : 0,
      };
    },
  },
  loginRecords: {
    path: `/rest/v1/admin_login_records?select=id,admin_id,account,login_at,logout_at,online_minutes,ip,device,admin_account:admin_accounts!inner(role)&admin_account.role=neq.${encodeURIComponent('超級管理員')}&order=login_at.desc&limit=200`,
    map: (row) => ({
      id: String(row.id),
      adminId: row.admin_id,
      account: row.account,
      loginAt: row.login_at,
      logoutAt: row.logout_at,
      onlineMinutes: row.online_minutes,
      ip: row.ip,
      device: row.device,
    }),
  },
  subscriptionRecords: {
    path: '/rest/v1/payments?select=id,member_id,plan_id,amount,paid_at,status&order=paid_at.desc.nullslast&limit=200',
    map: (row) => ({
      id: String(row.id),
      memberId: row.member_id,
      planId: row.plan_id,
      amount: row.amount,
      paidAt: row.paid_at,
      status: row.status,
    }),
  },
  auditLogs: {
    path: `/rest/v1/audit_logs?select=id,operation_time,admin_id,admin,operation_type,target_table,target_id,content,before_data,after_data,ip,device,admin_account:admin_accounts!inner(role)&admin_account.role=neq.${encodeURIComponent('超級管理員')}&order=operation_time.desc&limit=200`,
    map: (row) => ({
      id: String(row.id),
      operationTime: row.operation_time,
      adminId: row.admin_id,
      admin: row.admin,
      operationType: row.operation_type,
      targetTable: row.target_table,
      targetId: row.target_id,
      content: row.content,
      beforeData: row.before_data,
      afterData: row.after_data,
      ip: row.ip,
      device: row.device,
    }),
  },
  admins: {
    path: '/rest/v1/admin_accounts?select=id,account,name,role,status,can_view,can_add,can_edit,can_delete,last_login_at,created_at&order=created_at.asc&limit=200',
    map: (row) => ({
      id: String(row.id),
      account: row.account,
      name: row.name,
      role: row.role,
      status: row.status,
      permissions: {
        view: Boolean(row.can_view),
        add: Boolean(row.can_add),
        edit: Boolean(row.can_edit),
        delete: Boolean(row.can_delete),
      },
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
    }),
  },
  activationCodes: {
    path: '/rest/v1/activation_codes?select=id,batch_id,code,duration_type,created_at,expires_at,redeemed_by_member_id,redeemed_at,status&order=created_at.desc&limit=200',
    map: (row) => ({
      id: String(row.id),
      batchId: row.batch_id,
      code: row.code,
      durationType: row.duration_type,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      redeemedByMemberId: row.redeemed_by_member_id,
      redeemedAt: row.redeemed_at,
      status: row.status,
    }),
  },
  plans: {
    path: '/rest/v1/plans?select=id,name,price,duration_days&order=duration_days.asc',
    map: (row) => ({
      id: String(row.id),
      name: row.name,
      price: row.price,
      durationDays: row.duration_days,
    }),
  },
  transferRequests: {
    path: '/rest/v1/transfer_requests?select=id,member_id,plan_id,amount,transferred_at,account_last_five,submitted_at,status,plan:plans(name),member:members(auth_user_id)&order=submitted_at.desc&limit=200',
    map: (row) => ({
      id: String(row.id),
      memberId: row.member_id,
      authUserId: (row.member as Row | null)?.auth_user_id ?? null,
      planId: row.plan_id,
      planName: (row.plan as Row | null)?.name ?? null,
      amount: row.amount,
      transferredAt: row.transferred_at,
      accountLastFive: row.account_last_five,
      submittedAt: row.submitted_at,
      status: row.status,
    }),
  },
};

export function getAdminTableDefinition(table: string): TableDefinition {
  const definition = definitions[table];
  if (!definition) throw new AdminDataError('Invalid table');
  return definition;
}

export async function listAdminTable(table: string, api: Requester) {
  const definition = getAdminTableDefinition(table);
  const rows = await api.request<Row[]>(definition.path);
  return { items: rows.map(definition.map) };
}

export async function getDashboard(api: Requester, currentDate = new Date()) {
  const [members, paymentRows] = await Promise.all([
    api.request<Row[]>('/rest/v1/members?select=plan_expires_at,current_plan:plans!members_current_plan_id_fkey(duration_days)&limit=10000'),
    api.request<Row[]>('/rest/v1/payments?select=amount,paid_at,status&status=eq.confirmed&limit=10000'),
  ]);
  const payments = paymentRows
    .filter((row) => row.status === 'confirmed' && typeof row.paid_at === 'string')
    .map((row) => ({
      amount: Number(row.amount ?? 0),
      paidAt: String(row.paid_at),
    }));
  const duration = (member: Row) => Number((member.current_plan as Row | null)?.duration_days ?? 0);
  const today = currentDate.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const quarter = Math.floor(currentDate.getUTCMonth() / 3);
  const sum = (predicate: (payment: { amount: number; paidAt: string }) => boolean) =>
    payments.filter(predicate).reduce((total, payment) => total + payment.amount, 0);
  const expiresWithinSevenDays = members.filter((member) => {
    if (typeof member.plan_expires_at !== 'string') return false;
    const expiresAt = new Date(member.plan_expires_at);
    const remaining = expiresAt.getTime() - currentDate.getTime();
    return Number.isFinite(remaining) && remaining >= 0 && remaining <= 7 * 86_400_000;
  }).length;

  return {
    totalUsers: members.length,
    monthlyPro: members.filter((member) => duration(member) === 30).length,
    quarterlyPro: members.filter((member) => duration(member) === 90).length,
    yearlyPro: members.filter((member) => duration(member) === 365).length,
    expiring: expiresWithinSevenDays,
    todayRevenue: sum((payment) => payment.paidAt.startsWith(today)),
    monthRevenue: sum((payment) => payment.paidAt.startsWith(month)),
    quarterRevenue: sum((payment) => {
      const paidAt = new Date(payment.paidAt);
      return paidAt.getUTCFullYear() === currentDate.getUTCFullYear()
        && Math.floor(paidAt.getUTCMonth() / 3) === quarter;
    }),
    yearRevenue: sum((payment) => payment.paidAt.startsWith(year)),
    cumulativeRevenue: sum(() => true),
  };
}

const adminRoles = ['超級管理員', '營運管理員', '查看人員'];
const adminStatuses = ['啟用', '停用'];
const durationTypes = ['7_days', '15_days', '30_days', '90_days', '365_days', 'lifetime'];

function validateAdminInput(input: AdminAccountInput) {
  if (!input.account.trim() || !input.name.trim()) throw new AdminDataError('管理員帳號與名稱必填');
  if (!adminRoles.includes(input.role)) throw new AdminDataError('角色不正確');
  if (!adminStatuses.includes(input.status)) throw new AdminDataError('帳號狀態不正確');
  const permissions = input.role === '超級管理員'
    ? { can_view: true, can_add: true, can_edit: true, can_delete: true }
    : input.role === '營運管理員'
      ? { can_view: true, can_add: true, can_edit: true, can_delete: false }
      : { can_view: true, can_add: false, can_edit: false, can_delete: false };
  return {
    account: input.account.trim(),
    name: input.name.trim(),
    role: input.role,
    status: input.status,
    ...permissions,
  };
}

export function createAdminData(transport: WriteTransport) {
  async function protectLastEnabledSuper(before: Row, next?: { role: string; status: string }) {
    if (before.role !== '超級管理員' || before.status !== '啟用') return;
    if (next?.role === '超級管理員' && next.status === '啟用') return;
    const enabled = await transport.selectRows<Row>(
      'admin_accounts',
      `select=id&role=eq.${encodeURIComponent('超級管理員')}&status=eq.${encodeURIComponent('啟用')}`,
    );
    const otherEnabled = enabled.some((row) => String(row.id) !== String(before.id));
    if (!otherEnabled) throw new AdminDataError('系統必須保留至少一位啟用中的超級管理員');
  }

  async function writeAudit(entry: {
    actor: AdminActor;
    operationType: string;
    targetTable: string;
    targetId?: string | null;
    content?: string | null;
    beforeData?: unknown;
    afterData?: unknown;
    ip?: string | null;
    device?: string | null;
  }) {
    if (entry.actor.role === '超級管理員') return;
    await transport.insertRows('audit_logs', [{
      admin_id: entry.actor.id,
      admin: entry.actor.name || entry.actor.account,
      operation_type: entry.operationType,
      target_table: entry.targetTable,
      target_id: entry.targetId ?? null,
      content: entry.content ?? null,
      before_data: entry.beforeData ?? null,
      after_data: entry.afterData ?? null,
      ip: entry.ip ?? null,
      device: entry.device ?? null,
    }]);
  }

  async function createAdminAccount(input: AdminAccountInput, actor: AdminActor) {
    const record = validateAdminInput(input);
    const [created] = await transport.insertRows<Row>('admin_accounts', [record]);
    if (!created) throw new AdminDataError('建立管理員失敗', 500);
    await writeAudit({
      actor,
      operationType: '新增',
      targetTable: 'admin_accounts',
      targetId: String(created.id),
      content: '新增管理員帳號',
      afterData: created,
    });
    return definitions.admins.map(created);
  }

  async function updateAdminAccount(id: string, input: AdminAccountInput, actor: AdminActor) {
    const [before] = await transport.selectRows<Row>('admin_accounts', `select=*&id=eq.${encodeURIComponent(id)}`);
    if (!before) throw new AdminDataError('Not found', 404);
    const record = validateAdminInput(input);
    await protectLastEnabledSuper(before, { role: record.role, status: record.status });
    const [updated] = await transport.updateRows<Row>('admin_accounts', `id=eq.${encodeURIComponent(id)}`, record);
    if (!updated) throw new AdminDataError('更新管理員失敗', 500);
    await writeAudit({
      actor,
      operationType: '修改',
      targetTable: 'admin_accounts',
      targetId: id,
      content: '修改管理員帳號',
      beforeData: before,
      afterData: updated,
    });
    return definitions.admins.map(updated);
  }

  async function updateOwnAdminName(name: string, actor: AdminActor) {
    const normalizedName = name.trim();
    if (!normalizedName) throw new AdminDataError('管理員名稱必填');
    const query = `id=eq.${encodeURIComponent(actor.id)}`;
    const [before] = await transport.selectRows<Row>('admin_accounts', `select=*&${query}`);
    if (!before) throw new AdminDataError('Not found', 404);
    const [updated] = await transport.updateRows<Row>('admin_accounts', query, {
      name: normalizedName,
    });
    if (!updated) throw new AdminDataError('更新管理員名稱失敗', 500);
    await writeAudit({
      actor,
      operationType: '修改',
      targetTable: 'admin_accounts',
      targetId: actor.id,
      content: '修改本人管理員名稱',
      beforeData: before,
      afterData: updated,
    });
    return definitions.admins.map(updated);
  }

  async function updateMemberStatus(id: string, status: string, actor: AdminActor) {
    if (!['active', 'disabled'].includes(status)) throw new AdminDataError('會員狀態不正確');
    return transport.supabaseRequest<Row>('rpc/admin_set_member_status', {
      method: 'POST',
      body: JSON.stringify({
        p_member_id: id,
        p_status: status,
        p_actor_id: actor.id,
        p_actor_name: actor.name || actor.account,
      }),
    });
  }

  async function updateSubscription(
    id: string,
    input: SubscriptionAction,
    actor: AdminActor,
    currentDate = new Date(),
  ) {
    if (!['activate', 'renew', 'cancel', 'adjustExpiry', 'lifetime'].includes(input.action)) {
      throw new AdminDataError('訂閱操作不正確');
    }
    const planId = String(input.planId ?? '').trim() || null;
    if ((input.action === 'activate' || input.action === 'renew') && !planId) {
      throw new AdminDataError('訂閱方案必填');
    }
    let expiresAt: string | null = null;
    if (input.action === 'adjustExpiry') {
      const expiry = new Date(String(input.expiresAt ?? ''));
      if (!Number.isFinite(expiry.getTime())) throw new AdminDataError('到期時間不正確');
      expiresAt = expiry.toISOString();
    }
    return transport.supabaseRequest<Row>('rpc/admin_update_subscription', {
      method: 'POST',
      body: JSON.stringify({
        p_member_id: id,
        p_action: input.action,
        p_plan_id: planId,
        p_expires_at: expiresAt,
        p_now: currentDate.toISOString(),
        p_actor_id: actor.id,
        p_actor_name: actor.name || actor.account,
      }),
    });
  }

  async function reviewTransferRequest(
    id: string,
    decision: string,
    actor: AdminActor,
    currentDate = new Date(),
  ) {
    if (!['confirmed', 'rejected'].includes(decision)) throw new AdminDataError('審核結果不正確');
    return transport.supabaseRequest<Row>('rpc/admin_review_transfer_request', {
      method: 'POST',
      body: JSON.stringify({
        p_transfer_id: id,
        p_decision: decision,
        p_now: currentDate.toISOString(),
        p_actor_id: actor.id,
        p_actor_name: actor.name || actor.account,
      }),
    });
  }
  async function deleteAdminAccount(id: string, actor: AdminActor) {
    if (id === actor.id) throw new AdminDataError('不得刪除自己的管理員帳號');
    const [before] = await transport.selectRows<Row>('admin_accounts', `select=*&id=eq.${encodeURIComponent(id)}`);
    if (!before) throw new AdminDataError('Not found', 404);
    await protectLastEnabledSuper(before);
    const [deleted] = await transport.deleteRows<Row>('admin_accounts', `id=eq.${encodeURIComponent(id)}`);
    if (!deleted) throw new AdminDataError('Not found', 404);
    await writeAudit({
      actor,
      operationType: '刪除',
      targetTable: 'admin_accounts',
      targetId: id,
      content: '刪除管理員帳號',
      beforeData: before,
    });
  }

  async function deleteActivationCode(id: string, actor: AdminActor) {
    return transport.supabaseRequest<{ deleted: boolean }>('rpc/admin_delete_activation_code', {
      method: 'POST',
      body: JSON.stringify({
        p_code_id: id,
        p_actor_id: actor.id,
        p_actor_name: actor.name || actor.account,
      }),
    });
  }

  async function generateActivationCodeBatch(durationType: string, actor: AdminActor) {
    if (!durationTypes.includes(durationType)) throw new AdminDataError('啟動期限不正確');
    const rows = await transport.supabaseRequest<Row[]>('rpc/generate_activation_code_batch', {
      method: 'POST',
      body: JSON.stringify({ p_duration_type: durationType }),
    });
    const batchId = rows[0]?.batch_id;
    if (rows.length !== 10 || !batchId || rows.some((row) => row.batch_id !== batchId)) {
      throw new AdminDataError('啟動碼批次建立失敗', 500);
    }
    await writeAudit({
      actor,
      operationType: '批次新增',
      targetTable: 'activation_codes',
      targetId: String(batchId),
      content: '批次建立 10 組啟動碼',
      afterData: { batchId, durationType, count: 10 },
    });
    return { batchId: String(batchId), count: 10 };
  }

  return {
    writeAudit,
    createAdminAccount,
    updateAdminAccount,
    updateOwnAdminName,
    updateMemberStatus,
    updateSubscription,
    reviewTransferRequest,
    deleteAdminAccount,
    deleteActivationCode,
    generateActivationCodeBatch,
  };
}
