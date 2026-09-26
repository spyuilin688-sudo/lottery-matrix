import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migration=readFileSync(new URL('../supabase/migrations/20260926020425_repair_architecture_billing_outcomes.sql',import.meta.url),'utf8');
test('billing recovery migrations preserve data and enforce terminal outcomes',async t=>{
  const db=new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    for(const name of ['20260925204803_admin_architecture_subscriptions','20260925212522_admin_architecture_billing_snapshot','20260926010920_admin_architecture_daily_billing_sync'])
      await db.exec(readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
    const snapshot={source:'Verified receipt',verifiedAt:'2026-08-20T00:00:00Z',latestInvoiceAmount:'US$17.00',latestPaymentDate:'2026-08-12',latestInvoiceStatus:'paid'};
    await db.query("insert into public.admin_architecture_billing_runs(run_day,status,previous_snapshots) values(current_date-1,'completed',$1)",[JSON.stringify({railway:snapshot})]);
    await db.query("update public.admin_architecture_subscriptions set billing_snapshot=$1 where provider='railway'",[JSON.stringify({...snapshot,latestPaymentDate:null})]);
    await db.exec(migration);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260926035024_cloudflare_architecture_daily_sync.sql',import.meta.url),'utf8'));
    await t.test('restores historical payment without claiming it belongs to current invoice',async()=>{
      const value=(await db.query("select billing_snapshot from public.admin_architecture_subscriptions where provider='railway'")).rows[0].billing_snapshot;
      assert.equal(value.latestPaymentDate,null);
      assert.equal(value.manualPayment?.paymentDate,'2026-08-12');
      assert.equal(value.manualPayment?.amount,'US$17.00');
      assert.match(value.source,/人工核對付款：2026-08-12 US\$17.00/);
      await db.exec(migration);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260926035024_cloudflare_architecture_daily_sync.sql',import.meta.url),'utf8'));
      assert.deepEqual((await db.query("select billing_snapshot from public.admin_architecture_subscriptions where provider='railway'")).rows[0].billing_snapshot,value);
    });
    await t.test('interruption closes once and cannot reopen or overwrite finished runs',async()=>{
      await db.exec('begin; set local role service_role');
      try {
        const id=(await db.query('select public.claim_admin_architecture_billing_run() as id')).rows[0].id;
        assert.equal((await db.query('select public.fail_admin_architecture_billing_run($1) as changed',[id])).rows[0].changed,true);
        const record=(await db.query('select status,finished_at from public.admin_architecture_billing_runs where id=$1',[id])).rows[0];
        assert.equal(record.status,'failed');assert.ok(record.finished_at);
        assert.equal((await db.query('select public.fail_admin_architecture_billing_run($1) as changed',[id])).rows[0].changed,false);
        assert.equal((await db.query('select public.claim_admin_architecture_billing_run() as id')).rows[0].id,null);
      } finally {await db.exec('rollback');}
    });
    for(const count of [0,1,2,3]) await t.test(`database records ${['failed','partial','partial','completed'][count]} and preserves unsuccessful provider data`,async()=>{
      await db.exec('begin; set local role service_role');
      try {
        const before=(await db.query('select * from public.admin_architecture_subscriptions order by provider')).rows;
        const id=(await db.query('select public.claim_admin_architecture_billing_run() as id')).rows[0].id;
        const fresh={source:'API fixture',verifiedAt:new Date().toISOString(),currentAmount:'US$3.00'};
        const results={github:count>0?{status:'synced',snapshot:fresh}:{status:'failed'},railway:count>1?{status:'synced',snapshot:fresh}:{status:'failed'},cloudflare:count>2?{status:'synced',snapshot:fresh}:{status:'failed'}};
        assert.equal((await db.query('select public.finish_admin_architecture_billing_run($1,$2) as changed',[id,JSON.stringify(results)])).rows[0].changed,true);
        assert.equal((await db.query('select status from public.admin_architecture_billing_runs where id=$1',[id])).rows[0].status,['failed','partial','partial','completed'][count]);
        const after=(await db.query('select * from public.admin_architecture_subscriptions order by provider')).rows;
        for(const row of after){const old=before.find(x=>x.provider===row.provider);if(results[row.provider]?.status!=='synced')assert.deepEqual(row,old);assert.equal(row.plan,old.plan);assert.equal(row.verified_at,old.verified_at);}
        assert.equal((await db.query('select public.fail_admin_architecture_billing_run($1) as changed',[id])).rows[0].changed,false);
        assert.equal((await db.query('select public.finish_admin_architecture_billing_run($1,$2) as changed',[id,JSON.stringify(results)])).rows[0].changed,false);
      } finally {await db.exec('rollback');}
    });
    await db.exec(readFileSync(new URL('../supabase/migrations/20260926041111_cloudflare_entitlement_sync.sql',import.meta.url),'utf8'));
    await t.test('partial Cloudflare limits persist without declaring billing complete',async()=>{
      await db.exec('begin; set local role service_role');
      try {
        const id=(await db.query('select public.claim_admin_architecture_billing_run() as id')).rows[0].id;
        const snapshot={source:'Cloudflare API limits only',verifiedAt:new Date().toISOString(),limits:[{label:'同時建置',value:'1 個'}]};
        const results={github:{status:'failed'},railway:{status:'failed'},cloudflare:{status:'partial',snapshot}};
        assert.equal((await db.query('select public.finish_admin_architecture_billing_run($1,$2) as changed',[id,JSON.stringify(results)])).rows[0].changed,true);
        assert.equal((await db.query('select status from public.admin_architecture_billing_runs where id=$1',[id])).rows[0].status,'partial');
        assert.deepEqual((await db.query("select billing_snapshot from public.admin_architecture_subscriptions where provider='cloudflare'")).rows[0].billing_snapshot,snapshot);
      } finally {await db.exec('rollback');}
    });
    await t.test('a later invocation expires abandoned work without permitting another daily run',async()=>{
      await db.exec('begin');
      try {
        const id=(await db.query('select public.claim_admin_architecture_billing_run() as id')).rows[0].id;
        await db.query("update public.admin_architecture_billing_runs set started_at=now()-interval '11 minutes' where id=$1",[id]);
        assert.equal((await db.query('select public.claim_admin_architecture_billing_run() as id')).rows[0].id,null);
        assert.equal((await db.query('select status from public.admin_architecture_billing_runs where id=$1',[id])).rows[0].status,'failed');
      } finally {await db.exec('rollback');}
    });
    await t.test('public roles cannot close runs',async()=>{
      for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.fail_admin_architecture_billing_run(uuid)','execute') as allowed",[role])).rows[0].allowed,false);
    });
  } finally {await db.close();}
});
