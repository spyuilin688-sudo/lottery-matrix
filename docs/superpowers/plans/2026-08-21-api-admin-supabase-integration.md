# API, Admin, and Supabase Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing `matrix-sanqwn` independent admin to Supabase operational data and the existing `app-snsxet` algorithm status API while keeping algorithm data in AppDeploy Database.

**Architecture:** The admin browser continues to use AppDeploy Auth and same-origin `api.*` calls. The admin backend authenticates the AppDeploy user, resolves that Email against Supabase `admin_accounts`, enforces stored permissions, and then uses backend-only Supabase secrets for operational CRUD; a separate read-only adapter queries `app-snsxet` status endpoints. Algorithm source and completed results remain unchanged in AppDeploy Database.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6, AppDeploy Auth/API/Secrets, Supabase PostgreSQL 17, Supabase REST/RPC, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-api-admin-supabase-integration-design.md`

## Global Constraints

- Work only on GitHub `spyuilin688-sudo/lottery-matrix`, branch `api`.
- Formal algorithm app: `app-snsxet`, snapshot `1787190617576`.
- Formal independent admin: `matrix-sanqwn`, snapshot `1787178625970`.
- Formal Supabase project: `wcimzbbapfrdotjsfyxa`.
- Do not modify PWA UI, Matrix algorithm logic, validation rules, result content, or three-day retention.
- Do not move algorithm records or completed results to Supabase.
- Do not continue AppDeploy Database as the formal operational-data source.
- Never commit or expose `SUPABASE_SERVICE_ROLE_KEY`.
- Preserve the admin's existing module names and layout.
- Do not push this work to `main`.

## File Map

- Create `apps/admin/`: GitHub-owned source mirror for `matrix-sanqwn`.
- Create `apps/admin/backend/supabase.ts`: backend-only secret loading and Supabase HTTP transport.
- Create `apps/admin/backend/admin-auth.ts`: Email lookup and permission enforcement.
- Create `apps/admin/backend/admin-data.ts`: Supabase table mapping, reads, writes, and audit records.
- Create `apps/admin/backend/algorithm-api.ts`: read-only `app-snsxet` status adapter.
- Modify `apps/admin/backend/index.ts`: preserve routes while switching data implementations.
- Modify `apps/admin/src/AdminApp.tsx`: preserve the UI and render actual Supabase/algorithm fields.
- Modify `apps/admin/tests/tests.txt`: AppDeploy E2E coverage for changed workflows.
- Create `apps/admin/backend/*.test.ts`: focused transport, authorization, mapping, and algorithm tests.
- Create in `supabase/migrations/`: the CLI-generated timestamped `secure_admin_backend_integration` migration containing indexes and function privileges needed by this integration.
- Create missing `backend/*.ts` source mirrors from `app-snsxet`: preserve deployed algorithm source in GitHub without altering it.

---

### Task 1: Mirror the Two Deployed Sources into `api`

**Files:**
- Create: `apps/admin/**`
- Create: `backend/matrix-algorithm.ts`
- Create: `backend/matrix-algorithm-cases.ts`
- Create: `backend/matrix-tools.ts`
- Create: `backend/realtime.ts`
- Create: `backend/realtime-subscribers.ts`
- Create: `backend/scraper.ts`
- Create: `cron.json`

**Interfaces:**
- Consumes: AppDeploy snapshots `matrix-sanqwn@1787178625970` and `app-snsxet@1787190617576`.
- Produces: exact GitHub source baselines for all later tasks.

- [ ] **Step 1: Record exact remote manifests**

Use AppDeploy `src_glob` on both snapshot versions and save the returned path lists before copying. Expected admin manifest contains 15 files; expected algorithm manifest contains 19 files.

- [ ] **Step 2: Copy the independent admin snapshot without edits**

Read each `matrix-sanqwn` file at version `1787178625970` and write it under `apps/admin/` with the same relative path. Do not copy generated deployment metadata.

- [ ] **Step 3: Copy missing algorithm files without edits**

Read the six missing algorithm backend modules plus `cron.json` from `app-snsxet@1787190617576` into the existing root `backend/` and root `cron.json`. Existing `backend/index.ts` and `backend/matrix-result-store.ts` must byte-match the deployed versions before proceeding.

- [ ] **Step 4: Verify source parity**

Run:

```bash
git diff --check
rg --files apps/admin backend | sort
npx tsc --noEmit -p apps/admin/tsconfig.json
```

Expected: no whitespace errors; every deployed source path is represented; admin TypeScript compiles before integration edits.

- [ ] **Step 5: Commit the source mirrors**

```bash
git add apps/admin backend cron.json
git commit -m "chore: mirror deployed API and admin sources"
```

---

### Task 2: Build the Backend-Only Supabase Transport

**Files:**
- Create: `apps/admin/backend/supabase.ts`
- Create: `apps/admin/backend/supabase.test.ts`
- Modify: `apps/admin/package.json`

**Interfaces:**
- Produces: `getSupabaseConfig(): Promise<{ url: string; serviceRoleKey: string }>`.
- Produces: `supabaseRequest<T>(path: string, init?: RequestInit): Promise<T>`.
- Produces: `selectRows<T>(table: string, query: string): Promise<T[]>`.
- Produces: `insertRows<T>(table: string, rows: unknown[]): Promise<T[]>`.
- Produces: `updateRows<T>(table: string, query: string, record: unknown): Promise<T[]>`.
- Produces: `deleteRows<T>(table: string, query: string): Promise<T[]>`.
- Consumes: AppDeploy `secrets.readSecret()` from `@appdeploy/sdk`.

- [ ] **Step 1: Add the failing transport tests**

Add `"test": "vitest run"` under `scripts` and `"vitest": "^4.1.10"` under `devDependencies` in `apps/admin/package.json`, then add:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseTransport } from './supabase';

it('keeps the service key only in request headers', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify([{ id: '1' }]), { status: 200 }));
  const transport = createSupabaseTransport(async () => ({ url: 'https://db.test', serviceRoleKey: 'secret-value' }), fetcher);
  await expect(transport.selectRows('members', 'select=id')).resolves.toEqual([{ id: '1' }]);
  expect(fetcher).toHaveBeenCalledWith('https://db.test/rest/v1/members?select=id', expect.objectContaining({
    headers: expect.objectContaining({ apikey: 'secret-value', Authorization: 'Bearer secret-value' }),
  }));
  expect(JSON.stringify(await transport.selectRows('members', 'select=id'))).not.toContain('secret-value');
});

it('maps missing secrets and upstream failures to stable codes', async () => {
  const transport = createSupabaseTransport(async () => { throw new Error('missing'); }, vi.fn());
  await expect(transport.selectRows('members', 'select=id')).rejects.toMatchObject({ code: 'SUPABASE_CONFIG_MISSING' });
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `cd apps/admin && npm test -- backend/supabase.test.ts`
Expected: FAIL because `createSupabaseTransport` does not exist.

- [ ] **Step 3: Implement the transport**

```ts
import { secrets } from '@appdeploy/sdk';

export type SupabaseConfig = { url: string; serviceRoleKey: string };
export type SupabaseFailure = Error & { code: 'SUPABASE_CONFIG_MISSING' | 'SUPABASE_UNAVAILABLE'; status: number };

const failure = (code: SupabaseFailure['code'], status: number) => Object.assign(new Error(code), { code, status });

export async function getSupabaseConfig(): Promise<SupabaseConfig> {
  const names = await secrets.listSecretNames();
  if (!names.includes('SUPABASE_URL') || !names.includes('SUPABASE_SERVICE_ROLE_KEY')) throw failure('SUPABASE_CONFIG_MISSING', 503);
  return {
    url: (await secrets.readSecret('SUPABASE_URL')).replace(/\/$/, ''),
    serviceRoleKey: await secrets.readSecret('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function createSupabaseTransport(loadConfig = getSupabaseConfig, fetcher: typeof fetch = fetch) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let config: SupabaseConfig;
    try { config = await loadConfig(); } catch { throw failure('SUPABASE_CONFIG_MISSING', 503); }
    const response = await fetcher(`${config.url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers },
    }).catch(() => { throw failure('SUPABASE_UNAVAILABLE', 503); });
    if (!response.ok) throw failure('SUPABASE_UNAVAILABLE', 503);
    return response.status === 204 ? ([] as T) : await response.json() as T;
  }
  return {
    supabaseRequest: request,
    selectRows: <T>(table: string, query: string) => request<T[]>(`${table}?${query}`),
    insertRows: <T>(table: string, rows: unknown[]) => request<T[]>(table, { method: 'POST', body: JSON.stringify(rows) }),
    updateRows: <T>(table: string, query: string, record: unknown) => request<T[]>(`${table}?${query}`, { method: 'PATCH', body: JSON.stringify(record) }),
    deleteRows: <T>(table: string, query: string) => request<T[]>(`${table}?${query}`, { method: 'DELETE' }),
  };
}

export const supabase = createSupabaseTransport();
```

- [ ] **Step 4: Run tests and compile**

Run: `cd apps/admin && npm test -- backend/supabase.test.ts && npm run build`
Expected: PASS; frontend build contains neither secret name values nor service-role values.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/package.json apps/admin/backend/supabase.ts apps/admin/backend/supabase.test.ts
git commit -m "feat: add secure Supabase backend transport"
```

---

### Task 3: Replace AppDeploy Database Authorization and Reads

**Files:**
- Create: `apps/admin/backend/admin-auth.ts`
- Create: `apps/admin/backend/admin-data.ts`
- Create: `apps/admin/backend/admin-auth.test.ts`
- Create: `apps/admin/backend/admin-data.test.ts`
- Modify: `apps/admin/backend/index.ts`
- Modify: `apps/admin/src/AdminApp.tsx`

**Interfaces:**
- Produces type: `AdminAccount = { id: string; account: string; name: string; role: '超級管理員' | '營運管理員' | '查看人員'; status: '啟用' | '停用'; can_view: boolean; can_add: boolean; can_edit: boolean; can_delete: boolean; last_login_at: string | null; created_at: string }`.
- Produces type: `AdminModule = 'users' | 'subscriptions' | 'loginRecords' | 'subscriptionRecords' | 'auditLogs' | 'activationCodes' | 'admins'`.
- Produces type: `Dashboard = { totalUsers: number; monthlyPro: number; quarterlyPro: number; yearlyPro: number; expiring: number; todayRevenue: number; monthRevenue: number; quarterRevenue: number; yearRevenue: number; cumulativeRevenue: number }`.
- Produces: `resolveAdmin(email: string): Promise<AdminAccount>`.
- Produces: `requirePermission(admin: AdminAccount, permission: 'view' | 'add' | 'edit' | 'delete'): void`.
- Produces: `createAdminAuthorization(transport): { resolveAdmin; requirePermission }` for isolated tests.
- Produces: `listAdminModule(module: AdminModule): Promise<Record<string, unknown>[]>`.
- Produces: `getDashboard(): Promise<Dashboard>`.
- Consumes: Task 2 `supabase` transport.

- [ ] **Step 1: Write failing authorization tests**

```ts
it('rejects missing and disabled admin accounts', async () => {
  const missing = createAdminAuthorization({ selectRows: async () => [] });
  await expect(missing.resolveAdmin('admin@example.com')).rejects.toMatchObject({ status: 403 });
  const disabled = createAdminAuthorization({ selectRows: async () => [{ id: '1', account: 'admin@example.com', role: '查看人員', status: '停用', can_view: true, can_add: false, can_edit: false, can_delete: false }] });
  await expect(disabled.resolveAdmin('ADMIN@example.com')).rejects.toMatchObject({ status: 403 });
});

it('uses the four stored permission columns', async () => {
  const admin = { id: '1', account: 'admin@example.com', role: '營運管理員', status: '啟用', can_view: true, can_add: false, can_edit: true, can_delete: false } as const;
  expect(() => requirePermission(admin, 'edit')).not.toThrow();
  expect(() => requirePermission(admin, 'delete')).toThrowError('ADMIN_PERMISSION_DENIED');
});
```

- [ ] **Step 2: Write failing module-mapping tests**

Assert exact mappings:

```ts
expect(moduleSources).toEqual({
  users: ['members', 'plans'],
  subscriptions: ['members', 'plans'],
  loginRecords: ['admin_login_records'],
  subscriptionRecords: ['payments', 'members', 'plans'],
  auditLogs: ['audit_logs'],
  activationCodes: ['activation_codes'],
  admins: ['admin_accounts'],
});
```

Also assert that an unlisted module rejects with `INVALID_ADMIN_TABLE` and no Supabase call.

- [ ] **Step 3: Run the tests and confirm failure**

Run: `cd apps/admin && npm test -- backend/admin-auth.test.ts backend/admin-data.test.ts`
Expected: FAIL because the authorization and mapping modules do not exist.

- [ ] **Step 4: Implement authorization and data reads**

`resolveAdmin()` must query:

```ts
const query = `select=id,account,name,role,status,can_view,can_add,can_edit,can_delete,last_login_at,created_at&account=ilike.${encodeURIComponent(email)}`;
```

It must never auto-create the first administrator. `listAdminModule()` must return camelCase view records expected by the existing UI, derived only from actual Supabase fields. When a current UI field has no database source, remove that field from the module's `labels` list rather than returning invented values.

- [ ] **Step 5: Replace route internals without changing paths**

Keep `requireAuth()` as the first protected middleware. `GET /api/bootstrap`, `GET /api/dashboard`, and `GET /api/data/:table` must call the new modules and return the current response shapes. Remove all operational `db.list/get/add/update/delete` calls from `apps/admin/backend/index.ts`.

- [ ] **Step 6: Reconcile the existing UI fields**

Update only `tableMap`, `labels`, and field accessors in `AdminApp.tsx` so the existing modules display the actual records returned by Task 3. Do not change module names, navigation, page structure, or CSS.

- [ ] **Step 7: Verify focused tests and build**

Run: `cd apps/admin && npm test -- backend/admin-auth.test.ts backend/admin-data.test.ts && npm run build`
Expected: PASS; `rg -n "\bdb\." apps/admin/backend` returns no operational-data calls.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/backend apps/admin/src/AdminApp.tsx
git commit -m "feat: read admin operations from Supabase"
```

---

### Task 4: Implement Authorized Writes, Audit Logs, and Activation Batches

**Files:**
- Modify: `apps/admin/backend/admin-data.ts`
- Modify: `apps/admin/backend/index.ts`
- Create: `apps/admin/backend/admin-writes.test.ts`

**Interfaces:**
- Consumes type: `AdminAccount` from Task 3; `actor` is `Pick<AdminAccount, 'id' | 'account' | 'name'>`.
- Produces type: `AdminAccountInput = Pick<AdminAccount, 'account' | 'name' | 'role' | 'status' | 'can_view' | 'can_add' | 'can_edit' | 'can_delete'>`.
- Produces: `createAdminAccount(input, actor): Promise<AdminAccount>`.
- Produces: `updateAdminAccount(id, input, actor): Promise<AdminAccount>`.
- Produces: `deleteAdminAccount(id, actor): Promise<void>`.
- Produces: `generateActivationCodeBatch(durationType, actor): Promise<{ batchId: string; count: 10 }>`.
- Produces: `writeAudit(entry): Promise<void>`.
- Produces: `createAdminData(transport)` for isolated tests and the production `adminData` instance.

- [ ] **Step 1: Write failing write/audit tests**

```ts
it('writes audit only after a successful mutation', async () => {
  const actor = { id: 'admin-1', account: 'admin@example.com', name: '管理員' };
  const calls: string[] = [];
  const data = createAdminData({
    insertRows: async (table) => { calls.push(`insert:${table}`); return table === 'admin_accounts' ? [{ id: 'new' }] : [{ id: 'audit' }]; },
    selectRows: async () => [], updateRows: async () => [], deleteRows: async () => [], supabaseRequest: async () => [],
  });
  await data.createAdminAccount({ account: 'new@example.com', name: '新管理員', role: '查看人員', status: '啟用', can_view: true, can_add: false, can_edit: false, can_delete: false }, actor);
  expect(calls).toEqual(['insert:admin_accounts', 'insert:audit_logs']);
});

it('creates exactly ten activation codes', async () => {
  const actor = { id: 'admin-1', account: 'admin@example.com', name: '管理員' };
  const data = createAdminData({
    supabaseRequest: async () => Array.from({ length: 10 }, (_, index) => ({ id: String(index + 1), batch_id: 'batch-1' })),
    insertRows: async () => [{ id: 'audit-1' }], selectRows: async () => [], updateRows: async () => [], deleteRows: async () => [],
  });
  const result = await data.generateActivationCodeBatch('30_days', actor);
  expect(result.count).toBe(10);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd apps/admin && npm test -- backend/admin-writes.test.ts`
Expected: FAIL because write functions do not exist.

- [ ] **Step 3: Implement table-specific writes**

Allow only the operations already present in the admin UI. Validate administrator roles against `超級管理員 | 營運管理員 | 查看人員`, status against `啟用 | 停用`, and activation durations against `7_days | 15_days | 30_days | 90_days | 365_days | lifetime`. Use Supabase column names in writes and map returned rows back to current UI names.

- [ ] **Step 4: Implement activation generation through RPC**

Call:

```ts
await supabase.supabaseRequest('rpc/generate_activation_code_batch', {
  method: 'POST',
  body: JSON.stringify({ p_duration_type: durationType }),
});
```

Reject any response that does not contain exactly 10 records and do not write a success audit when rejected.

- [ ] **Step 5: Replace mutation route internals**

Keep existing route paths and permission meanings. `POST /api/admins`, `PUT /api/admins/:id`, `DELETE /api/admins/:id`, and `POST /api/activation-codes/batch` must use the new functions. Generic `/api/data/:table` mutations must reject modules that have no existing valid Supabase write mapping.

- [ ] **Step 6: Run tests and build**

Run: `cd apps/admin && npm test -- backend/admin-writes.test.ts && npm run build`
Expected: PASS; failed writes create no audit record; successful writes create one audit record.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/backend
git commit -m "feat: write admin operations to Supabase"
```

---

### Task 5: Add the Read-Only Algorithm Status Adapter

**Files:**
- Create: `apps/admin/backend/algorithm-api.ts`
- Create: `apps/admin/backend/algorithm-api.test.ts`
- Modify: `apps/admin/backend/index.ts`
- Modify: `apps/admin/src/AdminApp.tsx`
- Modify: `apps/admin/tests/tests.txt`

**Interfaces:**
- Produces type: `AlgorithmStatus = { ok: boolean; health: unknown | null; coverage: unknown | null; audit: unknown | null; cases: unknown | null }`.
- Produces: `getAlgorithmStatus(): Promise<AlgorithmStatus>`.
- Adds: `GET /api/algorithm-status`, protected by AppDeploy Auth and `view` permission.
- Consumes: `https://app-snsxet.v2.appdeploy.ai` read-only endpoints.

- [ ] **Step 1: Write failing adapter tests**

```ts
it('reads only the four approved status endpoints', async () => {
  const paths: string[] = [];
  const status = await createAlgorithmApi(async (url) => { paths.push(new URL(String(url)).pathname); return new Response('{}', { status: 200 }); }).getAlgorithmStatus();
  expect(paths).toEqual(['/api/_healthcheck', '/api/matrix/coverage', '/api/matrix/audit', '/api/matrix/algorithm/cases']);
  expect(status.ok).toBe(true);
});

it('returns an unavailable status without blocking operational data', async () => {
  const status = await createAlgorithmApi(async () => { throw new Error('offline'); }).getAlgorithmStatus();
  expect(status).toEqual({ ok: false, health: null, coverage: null, audit: null, cases: null });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd apps/admin && npm test -- backend/algorithm-api.test.ts`
Expected: FAIL because `createAlgorithmApi` does not exist.

- [ ] **Step 3: Implement the adapter and protected route**

Use the fixed official base URL `https://app-snsxet.v2.appdeploy.ai`, accept only the four constant paths, and return `{ ok: false, health: null, coverage: null, audit: null, cases: null }` after any network or non-2xx failure. Do not call backfill, fetch, explore, TongXing, or number-reference endpoints.

- [ ] **Step 4: Render status inside the existing overview**

Load `/api/dashboard` and `/api/algorithm-status` together when `營運概覽` opens. Add the algorithm health/coverage/audit/cases result inside the existing overview content; do not add a navigation module or change CSS layout rules unrelated to the new data.

- [ ] **Step 5: Reconcile AppDeploy E2E tests**

Replace `apps/admin/tests/tests.txt` with 3–5 tests, exactly one marked `[sanity]`, covering: authorized dashboard and algorithm status; Supabase-backed record viewing; activation batch generation; permission denial; algorithm API failure with operational data still visible. Every test must include `Viewport`, `Covers`, `Description`, `Steps`, and `Expected`.

- [ ] **Step 6: Run tests and build**

Run: `cd apps/admin && npm test && npm run build`
Expected: all unit tests pass and production build completes.

- [ ] **Step 7: Commit**

```bash
git add apps/admin
git commit -m "feat: connect admin to algorithm status API"
```

---

### Task 6: Secure Supabase RPC and Required Foreign-Key Indexes

**Files:**
- Create in: `supabase/migrations/` using `supabase migration new secure_admin_backend_integration`

**Interfaces:**
- Consumes: existing `generate_activation_code_batch(text)` and current schema.
- Produces: service-role-only activation generation and indexes for `admin_login_records.admin_id` and `audit_logs.admin_id`.

- [ ] **Step 1: Generate the migration filename with the Supabase CLI**

Run:

```bash
supabase migration new secure_admin_backend_integration
```

Expected: the CLI creates the timestamped migration file; do not invent the timestamp manually.

- [ ] **Step 2: Add the exact service-role function, privilege, and index changes**

```sql
create index if not exists admin_login_records_admin_id_idx
  on public.admin_login_records (admin_id);

create index if not exists audit_logs_admin_id_idx
  on public.audit_logs (admin_id);

create or replace function public.generate_activation_code_batch(p_duration_type text)
returns setof public.activation_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_id uuid;
  v_created_at timestamptz := pg_catalog.now();
  v_inserted_count integer := 0;
  v_row_count integer;
  v_raw_code text;
  v_code text;
  v_random_bytes bytea;
begin
  if pg_catalog.coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;

  if p_duration_type is null
     or p_duration_type not in ('7_days', '15_days', '30_days', '90_days', '365_days', 'lifetime') then
    raise exception using errcode = '22023', message = 'INVALID_DURATION_TYPE';
  end if;

  insert into public.activation_code_batches (duration_type, quantity, created_at, expires_at)
  values (p_duration_type, 10, v_created_at, v_created_at + interval '1 month')
  returning id into v_batch_id;

  while v_inserted_count < 10 loop
    v_random_bytes := extensions.gen_random_bytes(16);
    select pg_catalog.string_agg(
      pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', (pg_catalog.get_byte(v_random_bytes, byte_index) % 36) + 1, 1),
      '' order by byte_index
    )
    into v_raw_code
    from pg_catalog.generate_series(0, 15) as generated(byte_index);

    v_code := pg_catalog.substr(v_raw_code, 1, 4)
      || '-' || pg_catalog.substr(v_raw_code, 5, 4)
      || '-' || pg_catalog.substr(v_raw_code, 9, 4)
      || '-' || pg_catalog.substr(v_raw_code, 13, 4);

    insert into public.activation_codes (batch_id, code, duration_type, created_at, expires_at, status)
    values (v_batch_id, v_code, p_duration_type, v_created_at, v_created_at + interval '1 month', 'unused')
    on conflict (code) do nothing;

    get diagnostics v_row_count = row_count;
    v_inserted_count := v_inserted_count + v_row_count;
  end loop;

  return query
    select activation_code.*
    from public.activation_codes as activation_code
    where activation_code.batch_id = v_batch_id
    order by activation_code.created_at, activation_code.id;
end;
$$;

revoke execute on function public.generate_activation_code_batch(text) from public, anon, authenticated;
grant execute on function public.generate_activation_code_batch(text) to service_role;
```

Do not change `redeem_activation_code(text)` because authenticated members require it. Do not disable RLS or remove existing indexes.

- [ ] **Step 3: Apply the migration through Supabase migration tooling**

Apply the complete migration to project `wcimzbbapfrdotjsfyxa` as one migration. Expected: both indexes exist and only `service_role` can call batch generation.

- [ ] **Step 4: Verify with SQL and advisors**

Run read-only checks for `pg_indexes`, `has_function_privilege('authenticated', ...) = false`, and `has_function_privilege('service_role', ...) = true`. Then run Supabase security and performance advisors. Treat the `redeem_activation_code` authenticated security-definer warning separately because that member RPC remains in scope for authenticated redemption.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "fix: secure admin backend database access"
```

---

### Task 7: Configure Secrets, Deploy, Verify, and Synchronize `api`

**Files:**
- Modify only changed `matrix-sanqwn` files through AppDeploy partial update.
- No secret values in repository files.

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` entered through AppDeploy secret-entry links.
- Produces: ready `matrix-sanqwn` deployment and remote GitHub `api` commits.

- [ ] **Step 1: Run the complete local verification**

```bash
cd apps/admin
npm ci
npm test
npm run build
cd ../..
git diff --check
git status --short
rg -n "SUPABASE_SERVICE_ROLE_KEY=.*|service_role.*eyJ" apps/admin backend supabase || true
```

Expected: tests and build pass; no secret value pattern is found; only intended committed changes exist.

- [ ] **Step 2: Configure the two backend secrets**

Create one AppDeploy secret-entry link for `SUPABASE_URL` and one for `SUPABASE_SERVICE_ROLE_KEY`, both scoped to `matrix-sanqwn`. After the user submits them, set the two secret entries on the existing app and confirm only the names are listed.

- [ ] **Step 3: Update `matrix-sanqwn` with changed files only**

Call AppDeploy update with `app_id: matrix-sanqwn`, `app_type: frontend+backend`, `model: gpt-5.6-sol`, `intent: connect independent admin to Supabase and algorithm API`, `initiator: user`, and `type: feature`. Send only changed files; reconcile `tests/tests.txt` in the same update.

- [ ] **Step 4: Poll deployment through terminal state**

Poll `get_app_status` at intervals of at least five seconds until `ready`, `failed`, or `deleted`. If E2E fails, read QA run details before changing code. Fix and redeploy no more than three times.

- [ ] **Step 5: Verify both live apps**

Verify:

- `https://app-snsxet.v2.appdeploy.ai/api/_healthcheck`
- `matrix-sanqwn` AppDeploy URL returned after ready
- Admin sign-in and bootstrap
- Supabase dashboard and each existing data module
- Admin permission denial
- Activation batch count 10
- Algorithm health, coverage, audit, and cases
- Operational data remains available when algorithm status is faulted by QA

- [ ] **Step 6: Re-run Supabase advisors and database checks**

Expected: RLS remains enabled; required indexes are present; batch generation is service-role-only; no new security warning is introduced by this integration.

- [ ] **Step 7: Push all commits to GitHub `api`**

```bash
git push origin api
```

If local HTTPS credentials are unavailable, use the connected GitHub API to create/update the exact changed files on branch `api`, preserving commit messages. Verify the remote branch contains the plan, source mirrors, tests, migration, and integration code. Do not update `main`.
