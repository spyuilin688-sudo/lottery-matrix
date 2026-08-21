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

export type AdminActor = { id: string; account: string; name: string };
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
    path: '/rest/v1/members?select=id,auth_user_id,line_user_id,registered_at,current_plan_id,plan_started_at,plan_expires_at,is_lifetime,status,referral_code,invitation_code&order=registered_at.desc&limit=200',
    map: (row) => ({
      id: String(row.id),
      authUserId: row.auth_user_id,
      lineUserId: row.line_user_id,
      registeredAt: row.registered_at,
      currentPlanId: row.current_plan_id,
      planStartedAt: row.plan_started_at,
      planExpiresAt: row.plan_expires_at,
      isLifetime: row.is_lifetime,
      status: row.status,
      referralCode: row.referral_code,
      invitationCode: row.invitation_code,
    }),
  },
  subscriptions: {
    path: '/rest/v1/members?select=id,auth_user_id,current_plan_id,plan_started_at,plan_expires_at,is_lifetime,status,current_plan:plans!members_current_plan_id_fkey(name,price,duration_days)&order=plan_started_at.desc.nullslast&limit=200',
    map: (row) => {
      const plan = (row.current_plan ?? null) as Row | null;
      return {
        id: String(row.id),
        authUserId: row.auth_user_id,
        currentPlanId: row.current_plan_id,
        planName: plan?.name ?? null,
        planPrice: plan?.price ?? null,
        planDurationDays: plan?.duration_days ?? null,
        planStartedAt: row.plan_started_at,
        planExpiresAt: row.plan_expires_at,
        isLifetime: row.is_lifetime,
        status: row.status,
      };
    },
  },
  loginRecords: {
    path: '/rest/v1/admin_login_records?select=id,admin_id,account,login_at,logout_at,online_minutes,ip,device&order=login_at.desc&limit=200',
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
    path: '/rest/v1/audit_logs?select=id,operation_time,admin_id,admin,operation_type,target_table,target_id,content,before_data,after_data,ip,device&order=operation_time.desc&limit=200',
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
  return {
    account: input.account.trim(),
    name: input.name.trim(),
    role: input.role,
    status: input.status,
    can_view: input.role === '超級管理員' ? true : Boolean(input.can_view),
    can_add: input.role === '超級管理員' ? true : Boolean(input.can_add),
    can_edit: input.role === '超級管理員' ? true : Boolean(input.can_edit),
    can_delete: input.role === '超級管理員' ? true : Boolean(input.can_delete),
  };
}

export function createAdminData(transport: WriteTransport) {
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

  async function deleteAdminAccount(id: string, actor: AdminActor) {
    const [deleted] = await transport.deleteRows<Row>('admin_accounts', `id=eq.${encodeURIComponent(id)}`);
    if (!deleted) throw new AdminDataError('Not found', 404);
    await writeAudit({
      actor,
      operationType: '刪除',
      targetTable: 'admin_accounts',
      targetId: id,
      content: '刪除管理員帳號',
      beforeData: deleted,
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
    deleteAdminAccount,
    generateActivationCodeBatch,
  };
}
