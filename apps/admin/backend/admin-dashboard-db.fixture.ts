import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

export const dashboardDb = new PGlite();
const ready = (async () => {
  await dashboardDb.exec(`create role anon; create role authenticated; create role service_role;
    create table public.plans(id text primary key, duration_days integer);
    create table public.members(id text, registered_at timestamptz, plan_expires_at timestamptz, status text, current_plan_id text);
    create table public.payments(id text, amount numeric, paid_at timestamptz, status text);
    create table public.admin_revenue_settings(id integer, reset_at timestamptz);
    grant select on all tables in schema public to service_role;`);
})();
export async function dashboardFromRows(respond: (path: string) => Promise<unknown>, now: string) {
  await ready;
  await dashboardDb.exec(readFileSync(new URL('../../../supabase/migrations/20260920112247_admin_dashboard_summary.sql', import.meta.url), 'utf8'));
  await dashboardDb.exec('truncate plans, members, payments, admin_revenue_settings');
  const asRows = (value: unknown) => Array.isArray(value) ? value : [];
  const members = asRows(await respond('/rest/v1/members?select=registered_at'));
  const payments = asRows(await respond('/rest/v1/payments?'));
  const settings = asRows(await respond('/rest/v1/admin_revenue_settings?'));
  const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
  await dashboardDb.query(`insert into plans select id,duration_days from jsonb_to_recordset($1) as x(id text,duration_days integer)`,
    [JSON.stringify(members.map((row, i) => ({ id: String(i), duration_days: row.current_plan?.duration_days ?? null })))]);
  await dashboardDb.query(`insert into members select id,registered_at,plan_expires_at,status,current_plan_id from jsonb_to_recordset($1) as x(id text,registered_at timestamptz,plan_expires_at timestamptz,status text,current_plan_id text)`,
    [JSON.stringify(members.map((row, i) => ({ id: String(i), registered_at: validDate(row.registered_at), plan_expires_at: validDate(row.plan_expires_at), status: row.status ?? null, current_plan_id: String(i) })))]);
  await dashboardDb.query(`insert into payments select id,amount,paid_at,status from jsonb_to_recordset($1) as x(id text,amount numeric,paid_at timestamptz,status text)`,
    [JSON.stringify(payments.map((row, i) => ({ id: String(i), amount: Number(row.amount ?? 0), paid_at: validDate(row.paid_at), status: row.status })))]);
  if (validDate(settings[0]?.reset_at)) await dashboardDb.query('insert into admin_revenue_settings values (1,$1)', [settings[0].reset_at]);
  const { rows } = await dashboardDb.query<{ result: unknown }>('select public.admin_dashboard_summary($1) as result', [now]);
  return rows[0].result;
}
