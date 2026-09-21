// Feasibility benchmark only. Uses isolated PGlite tables; never production DDL.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {packValidation,compactValidation,unpackCompact} from './validation-snapshots.mjs';
const sample=JSON.parse(readFileSync(process.argv[2],'utf8'));
const db=new PGlite();
const dictionary=new Map(),scopes=new Map();
const candidates=sample.map(row=>{
 const scope=JSON.stringify([row.lottery,row.draw_period,row.analysis_version]);
 if(!scopes.has(scope))scopes.set(scope,scopes.size+1);
 return {...row,scope,packed:packValidation(row.validation,scope,dictionary)};
});
const entries=new Map([...dictionary.values()].map(e=>[e.id,e]));
const usage=new Map();for(const r of candidates)for(const ref of r.packed.refs)usage.set(ref[2],(usage.get(ref[2])||0)+1);
const stats=[];
for(const threshold of [1,2,4,8,16]){
 const table='packed_'+threshold,dict='dictionary_'+threshold;
 await db.exec(`create table ${table}(id integer primary key,kind text,scope integer,validation jsonb,refs jsonb);create table ${dict}(id integer primary key,scope integer,body jsonb);create index ${dict}_scope on ${dict}(scope);`);
 const used=new Set();await db.exec('begin');let index=0;
 for(const row of candidates){
  const packed=compactValidation(row.packed,entries,threshold,usage);
  const refs=packed.refs;
  for(const id of refs)if(id)used.add(id);
  assert.deepEqual(unpackCompact(packed,row.scope,entries),row.validation);
  await db.query(`insert into ${table} values($1,$2,$3,$4,$5)`,[++index,row.kind,scopes.get(row.scope),JSON.stringify(packed.validation),JSON.stringify(refs)]);
 }
 for(const id of used){const e=entries.get(id);await db.query(`insert into ${dict} values($1,$2,$3)`,[id,scopes.get(e.scope),JSON.stringify(e.body)]);}
 await db.exec('commit;analyze');
 stats.push({threshold,snapshots:used.size,roundtrip:'PASS',payload:(await db.query(`select kind,sum(pg_column_size(validation)+pg_column_size(refs)) bytes from ${table} group by kind union all select 'dictionary',sum(pg_column_size(body)) from ${dict}`)).rows,allocated:(await db.query(`select pg_total_relation_size('${table}') result_bytes,pg_total_relation_size('${dict}') dictionary_bytes`)).rows[0]});
}
await db.exec('create table original(id integer primary key,kind text,scope integer,validation jsonb);begin');let i=0;
for(const r of candidates)await db.query('insert into original values($1,$2,$3,$4)',[++i,r.kind,scopes.get(r.scope),JSON.stringify(r.validation)]);
await db.exec('commit;analyze');
console.log(JSON.stringify({rows:sample.length,scopeCount:scopes.size,baseline:(await db.query("select pg_total_relation_size('original') allocated_bytes,(select sum(pg_column_size(validation)) from original) payload_bytes")).rows[0],variants:stats,limitations:'Isolated PGlite, validation-only tables, no production-reader latency measurement; compact representation is independently decoded for every sampled row; production integration and full workload benchmarks are not implemented.'},null,2));
await db.close();
