import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scanCode} from '../scripts/matrix-optimizer-code.mjs';
test('security findings inspect handlers but do not declare verify_jwt false a vulnerability',()=>{
 const result=scanCode({'supabase/config.toml':'[functions.example]\nverify_jwt = false\n','supabase/functions/example/handler.ts':'if (!authorizeInternal(token)) return forbidden();'});
 const finding=result.candidates.find(c=>c.category==='security');
 assert.equal(finding.state,'insufficient-evidence');assert.ok(finding.evidence.some(e=>e.includes('handler.ts')));
});
test('repeated blocks and unreferenced CSS are only review candidates',()=>{
 const block=Array.from({length:12},(_,i)=>`const value${i} = await expensiveOperation(${i}, context.member, context.lottery);`).join('\n');
 const r=scanCode({'a.ts':block,'b.ts':block,'a.css':'.unused {color:red;}'});
 assert.ok(r.candidates.some(c=>c.observation==='重複程式區塊'));
 assert.ok(r.candidates.some(c=>c.subject==='a.css:unused'));
 assert.ok(r.candidates.every(c=>c.state==='insufficient-evidence'));
});

test('optimizer push runs only for architecture and optimizer source changes',()=>{
 const workflow=readFileSync('.github/workflows/matrix-optimizer.yml','utf8');
 const pathsIndex=workflow.indexOf('    paths:');
 assert.ok(pathsIndex > workflow.indexOf('    branches: [main]'));
 for(const path of [
  'backend/**',
  'services/matrix-api/**',
  'supabase/**',
  'apps/admin/backend/**',
  'scripts/matrix-optimizer-code.mjs',
  'tests/matrix-optimizer-code.test.mjs',
  '.github/workflows/matrix-optimizer.yml',
 ]){
  assert.ok(workflow.includes(`      - '${path}'`), `missing optimizer trigger path: ${path}`);
 }
 assert.equal(workflow.includes("      - 'src/**'"),false);
 assert.match(workflow,/workflow_dispatch:/);
});
