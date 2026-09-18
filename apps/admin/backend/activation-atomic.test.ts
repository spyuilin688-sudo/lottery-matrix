import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const actor = '00000000-0000-4000-8000-000000000001';
const request = '00000000-0000-4000-8000-000000000010';
const db = new PGlite();
const migration = readFileSync(new URL('../../../supabase/migrations/20260910105312_admin_atomic_activation_batch.sql', import.meta.url),'utf8');
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema extensions;
    create function extensions.gen_random_bytes(integer) returns bytea language sql as $$ select decode(replace(gen_random_uuid()::text,'-',''),'hex'); $$;
    create table public.admin_accounts(id uuid primary key, account text, name text, role text, status text, can_add boolean);
    create table public.activation_code_batches(id uuid primary key default gen_random_uuid(),duration_type text,quantity integer,created_at timestamptz,expires_at timestamptz);
    create table public.activation_codes(id uuid primary key default gen_random_uuid(),batch_id uuid references activation_code_batches,code text unique,duration_type text,created_at timestamptz,expires_at timestamptz,status text);
    create table public.audit_logs(admin_id uuid references admin_accounts,admin text,operation_type text,target_table text,target_id text,content text,after_data jsonb);
    insert into admin_accounts values ('${actor}','owner','Owner','超級管理員','啟用',true);
    select set_config('request.jwt.claims','{"role":"service_role"}',false);`);
  await db.exec(migration);
},20_000);
afterAll(()=>db.close());
const call = (req=request,duration='7_days',quantity=3) => db.query<{result:{batchId:string,count:number}}>('select public.admin_generate_activation_code_batch($1,$2,$3,$4) as result',[duration,quantity,actor,req]);
describe('atomic activation generation', () => {
  it('recovers the same committed batch after response loss with exactly one audit', async () => {
    const first=await call();const second=await call();
    expect(second.rows).toEqual(first.rows);
    expect(first.rows[0].result.count).toBe(3);
    expect((await db.query('select count(*)::int as n from activation_codes')).rows).toEqual([{n:3}]);
    expect((await db.query('select count(*)::int as n from audit_logs')).rows).toEqual([{n:1}]);
  });
  it('rejects changed parameters for a committed request', async () => {
    await expect(call(request,'15_days')).rejects.toMatchObject({message:'ACTIVATION_REQUEST_CONFLICT'});
  });
  it('rolls back codes and batch if audit fails then permits the same retry', async () => {
    await db.exec("alter table audit_logs add constraint audit_failure check (content <> '批次建立 1 組啟動碼')");
    const req='00000000-0000-4000-8000-000000000011';
    await expect(call(req,'15_days',1)).rejects.toThrow('audit_failure');
    expect((await db.query('select count(*)::int as n from activation_code_batches')).rows).toEqual([{n:1}]);
    await db.exec('alter table audit_logs drop constraint audit_failure');
    expect((await call(req,'15_days',1)).rows[0].result.count).toBe(1);
  });
  it('preserves operator duration and permission restrictions', async () => {
    await db.exec(`update admin_accounts set role='營運管理員' where id='${actor}'`);
    await expect(call(crypto.randomUUID(),'30_days',1)).rejects.toMatchObject({code:'42501'});
    expect((await call(crypto.randomUUID(),'7_days',1)).rows[0].result.count).toBe(1);
    await db.exec(`update admin_accounts set can_add=false where id='${actor}'`);
    await expect(call(crypto.randomUUID(),'7_days',1)).rejects.toMatchObject({code:'42501'});
  });
  it('rejects callers outside the service role and revokes public execution', async () => {
    await db.exec(`select set_config('request.jwt.claims','{"role":"authenticated"}',false)`);
    await expect(call()).rejects.toMatchObject({code:'42501'});
    expect((await db.query("select has_function_privilege('anon','public.admin_generate_activation_code_batch(text,integer,uuid,uuid)','execute') as allowed")).rows).toEqual([{allowed:false}]);
  });
});
