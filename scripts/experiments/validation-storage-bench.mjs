import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {packValidation,unpackValidation} from './validation-snapshots.mjs';
const sample=JSON.parse(readFileSync(process.argv[2],'utf8'));
const db=new PGlite();
await db.exec(`create table original(kind text,scope text,item_id text,validation jsonb);create table packed(kind text,scope text,item_id text,validation jsonb,refs jsonb);create table dictionary(id bigint primary key,scope text,body jsonb);create index dictionary_scope on dictionary(scope);`);
const dict=new Map();let originalJson=0,packedJson=0;
await db.exec('begin');
for(const row of sample){
 const scope=JSON.stringify([row.lottery,row.draw_period,row.analysis_version]);
 const packed=packValidation(row.validation,scope,dict);
 assert.deepEqual(unpackValidation(packed,scope,new Map([...dict.values()].map(e=>[e.id,e]))),row.validation);
 originalJson+=Buffer.byteLength(JSON.stringify(row.validation));packedJson+=Buffer.byteLength(JSON.stringify(packed));
 await db.query('insert into original values($1,$2,$3,$4)',[row.kind,scope,row.item_id,JSON.stringify(row.validation)]);
 await db.query('insert into packed values($1,$2,$3,$4,$5)',[row.kind,scope,row.item_id,JSON.stringify(packed.validation),JSON.stringify(packed.refs)]);
}
for(const entry of dict.values())await db.query('insert into dictionary values($1,$2,$3)',[entry.id,entry.scope,JSON.stringify(entry.body)]);
await db.exec('commit;analyze');
console.log(JSON.stringify({rows:sample.length,snapshots:dict.size,roundtrip:'PASS',originalJson,packedJson,dictionaryJson:[...dict.values()].reduce((s,e)=>s+Buffer.byteLength(JSON.stringify(e)),0),payload:(await db.query(`select 'original' representation,kind,sum(pg_column_size(validation)) bytes from original group by kind union all select 'packed',kind,sum(pg_column_size(validation)+pg_column_size(refs)) from packed group by kind union all select 'dictionary','all',sum(pg_column_size(body)) from dictionary`)).rows,relations:(await db.query(`select c.relname,pg_total_relation_size(c.oid) bytes from pg_class c where c.relname in ('original','packed','dictionary')`)).rows},null,2));
await db.close();
