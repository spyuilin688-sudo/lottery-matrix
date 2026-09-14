import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../migrations/20260914143243_raw_card_requires_completed_analysis.sql', import.meta.url), 'utf8');
const token = '00000000-0000-0000-0000-000000000001';
const digest = 'a'.repeat(64);

test('raw publication requires matching completed current raw analysis; sorted publication remains immediate', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table lottery_draws (lottery text,period text,draw_date date,result_status text,draw_order_numbers jsonb);
      create table matrix_analysis_runs (lottery text,draw_period text,analysis_version text,status text,completed_at timestamptz);
      create table matrix_card_publications (lottery text,manifest jsonb,published_at timestamptz,last_error text,
        lease_token uuid,lease_until timestamptz,eligible_at timestamptz,desired_digest text,desired_period text);`);
    await db.exec(migration);
    for (const [lottery, code, numbers] of [
      ['今彩539','539',[1,2,3,4,5]], ['六合彩','marksix',[1,2,3,4,5,6,49]],
      ['大樂透','lotto649',[1,2,3,4,5,6,49]], ['天天樂','fantasy5',[1,2,3,4,5]],
    ]) {
      await db.query(`insert into lottery_draws values($1,'100','2026-09-14','confirmed',$2::jsonb)`, [lottery, JSON.stringify(numbers)]);
      await db.query(`insert into matrix_card_publications(lottery,lease_token,lease_until,eligible_at,desired_digest,desired_period)
        values($1,$2::uuid,now()+interval '1 hour',now()-interval '1 second',$3,'100')`, [lottery,token,digest]);
      const cards = Object.fromEntries(['sorted','draw'].map(order => [order, {
        url: `https://project.supabase.co/storage/v1/object/public/matrix-card-png/${code}/100/${digest}/${order}.png`,
        mimeType:'image/png',width:2276,height:3438,sha256:'b'.repeat(64),inputDigest:digest,
      }]));
      const manifest = {lottery,period:'100',generation:digest,cards};
      const publish = async value => (await db.query('select public.publish_matrix_card($1,$2::uuid,$3,$4::jsonb) ok',
        [lottery,token,digest,JSON.stringify(value)])).rows[0].ok;
      assert.equal(await publish({...manifest,cards:{sorted:cards.sorted}}),true,`${lottery}: immediate sorted`);
      for (const [name,period,version,status,completed] of [
        ['absent',null,null,null,null],['running','100','100:matrix-python-v14-draw','running',null],
        ['failed','100','100:matrix-python-v14-draw','failed',null],
        ['sorted only','100','100:matrix-python-v14-sorted','complete','2026-09-14'],
        ['old period','099','099:matrix-python-v14-draw','complete','2026-09-14'],
        ['old version','100','100:matrix-python-v13','complete','2026-09-14'],
        ['missing completion timestamp','100','100:matrix-python-v14-draw','complete',null],
      ]) {
        await db.query('delete from matrix_analysis_runs where lottery=$1',[lottery]);
        if(period) await db.query('insert into matrix_analysis_runs values($1,$2,$3,$4,$5::timestamptz)',[lottery,period,version,status,completed]);
        assert.equal(await publish(manifest),false,`${lottery}: ${name}`);
      }
      await db.query('delete from matrix_analysis_runs where lottery=$1',[lottery]);
      await db.query(`insert into matrix_analysis_runs values($1,'100','100:matrix-python-v14-draw','complete',now())`,[lottery]);
      assert.equal(await publish(manifest),lottery!=='天天樂',`${lottery}: completed raw`);
    }
    for(const role of ['anon','authenticated']) {
      assert.equal((await db.query(`select has_function_privilege($1,'public.publish_matrix_card(text,uuid,text,jsonb)','EXECUTE') allowed`,[role])).rows[0].allowed,false);
    }
  } finally { await db.close(); }
});
