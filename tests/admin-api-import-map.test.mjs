import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
const root=new URL('../',import.meta.url).pathname;
const configPath='supabase/functions/admin-api/deno.json';
const config=JSON.parse(readFileSync(new URL('../supabase/functions/admin-api/deno.json',import.meta.url),'utf8'));
test('every relative admin-api dependency resolves with the deployed Deno import map',()=>{
 const pending=['supabase/functions/admin-api/index.ts'];const seen=new Set();const missing=[];
 while(pending.length){
  const file=pending.pop();if(seen.has(file))continue;seen.add(file);
  const source=readFileSync(path.join(root,file),'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)(['"])([^'"\n]+)\1/g)){
   const ref=match[2];let target;
   if(ref.startsWith('.')){
    target=path.posix.normalize(path.posix.join(path.posix.dirname(file),ref));
    const key=path.posix.relative(path.posix.dirname(configPath),target);
    if(config.imports[key])target=path.posix.normalize(path.posix.join(path.posix.dirname(configPath),config.imports[key]));
   }else if(config.imports[ref])target=path.posix.normalize(path.posix.join(path.posix.dirname(configPath),config.imports[ref]));
   if(!target)continue;
   if(!existsSync(path.join(root,target))){missing.push(`${file}: ${ref}`);continue;}
   if(target.endsWith('.ts'))pending.push(target);
  }
 }
 assert.deepEqual(missing,[]);assert.ok(seen.size>25);
});
