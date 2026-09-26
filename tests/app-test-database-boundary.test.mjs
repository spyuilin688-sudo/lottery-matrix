import test from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalAppTestDatabase,localPostgresEnvironment} from './helpers/app-postgres.mjs';
test('isolated runner rejects libpq URL overrides and strips PG environment overrides',()=>{
 const base='postgresql://postgres:test@127.0.0.1:5432/matrix_app_test';
 assert.equal(assertLocalAppTestDatabase(base).hostname,'127.0.0.1');
 for(const suffix of ['?host=remote.example','?hostaddr=10.0.0.1','?service=production','#fragment']) assert.throws(()=>assertLocalAppTestDatabase(base+suffix));
 assert.throws(()=>assertLocalAppTestDatabase('postgresql://remote.example/matrix_app_test'));
 assert.throws(()=>assertLocalAppTestDatabase('postgresql://localhost/production'));
 const before=process.env.PGSERVICE;process.env.PGSERVICE='production';
 try {assert.equal(localPostgresEnvironment().PGSERVICE,undefined);}finally{if(before===undefined)delete process.env.PGSERVICE;else process.env.PGSERVICE=before;}
});
