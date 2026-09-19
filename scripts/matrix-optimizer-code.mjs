#!/usr/bin/env node
/** Read-only candidate scan. Text matches are leads, never proof of dead code or vulnerabilities. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export function scanCode(files) {
 const candidates=[];
 const add=(subject,observation,evidence)=>candidates.push({category:'code',subject,observation,evidence,state:'insufficient-evidence'});
 const groups=new Map();const sql=new Map();const all=Object.values(files).join('\n');
 for(const [file,source] of Object.entries(files)) {
  if(/(?:test|spec)\.[cm]?[jt]sx?$/.test(file))continue;
  const lines=source.split('\n');
  // Exact substantial blocks only; no identifier renaming or semantic equivalence claims.
  for(let i=0;i+12<=lines.length;i+=6){
   const block=lines.slice(i,i+12).map(l=>l.trim()).join('\n');
   if(block.length<400||!/[a-zA-Z]/.test(block))continue;
   const key=createHash('sha256').update(block).digest('hex');
   const found=groups.get(key)??[];found.push(`${file}:${i+1}`);groups.set(key,found);
  }
  for(const m of source.matchAll(/(?:SELECT|select)\s+[^;`]{60,1500}(?:;|`)/g)){
   const query=m[0].replace(/\s+/g,' ').trim();const key=createHash('sha256').update(query).digest('hex');
   const refs=sql.get(key)??[];refs.push(file);sql.set(key,refs);
  }
  for(const m of source.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g)){
   const name=m[1];const count=(all.match(new RegExp(`\\b${name}\\b`,'g'))??[]).length;
   if(count===1)add(`${file}:${name}`,'匯出項目缺少靜態引用',['仍需排除動態載入、框架入口與外部使用']);
  }
  if(/catch\s*(?:\([^)]*\))?\s*{\s*}/.test(source))add(file,'空白錯誤處理',['檢查是否遺漏失敗回饋或刻意忽略']);
  if(lines.length>800)add(file,'大型模組候選',[`lines=${lines.length}`,'需審查函式邊界與職責，不能只按行數拆分']);
  const masked=source.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,m=>m.replace(/[^\n]/g,' '));
  for(const m of masked.matchAll(/(?:function\s+(\w+)\s*\([^)]*\)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*{/g)){
   let depth=1,end=m.index+m[0].length;
   while(end<masked.length&&depth){if(masked[end]==='{')depth++;if(masked[end]==='}')depth--;end++;}
   const size=source.slice(m.index,end).split('\n').length;
   if(size>100)add(`${file}:${m[1]??m[2]}`,'大型函式候選',[`lines=${size}`,'需依呼叫關係確認拆分邊界']);
  }
  for(const m of source.matchAll(/['"]((?:GET|POST|PUT|PATCH|DELETE) \/[^'"\s]+)['"]/g)){
   const endpoint=m[1].split(' ')[1];
   if(all.split(endpoint).length===2)add(`${file}:${m[1]}`,'endpoint 缺少靜態呼叫',['需排除外部客戶端、排程與動態路徑']);
  }
  if(/\.(?:ts|tsx|py)$/.test(file)&&!/(?:^|\/)(?:tests?|fixtures?)(?:\/|$)/.test(file)){
   const basename=file.split('/').at(-1).replace(/\.(?:ts|tsx|py)$/,'');
   if(!Object.keys(files).some(p=>/(?:test|spec)/.test(p)&&p.includes(basename)))add(file,'未找到同名測試',['僅為覆蓋缺口線索，需檢查整合測試與 scoped CI 依賴圖']);
  }

  if(file.endsWith('.css')){
   const selectors=new Set();for(const m of source.matchAll(/([^{}]+)\{/g)){
    const selector=m[1].trim();if(selectors.has(selector))add(file,'重複 selector',[selector.slice(0,180),'可能是媒體查詢或合法 cascade']);selectors.add(selector);
    for(const c of selector.matchAll(/\.([a-zA-Z][\w-]*)/g))if(!Object.entries(files).some(([p,s])=>!p.endsWith('.css')&&s.includes(c[1])))add(`${file}:${c[1]}`,'selector 缺少靜態引用',['需排除動態 class 與第三方標記']);
   }
  }
 }
 for(const refs of groups.values())if(new Set(refs.map(r=>r.split(':')[0])).size>1)add(refs[0],'重複程式區塊',refs.slice(0,6));
 for(const refs of sql.values())if(new Set(refs).size>1)add(refs[0],'重複 SQL 候選',[...new Set(refs)].slice(0,6));
 const config=files['supabase/config.toml']??'';
 for(const m of config.matchAll(/\[functions\.([^\]]+)\]([^[]*)/g)){
  if(!/verify_jwt\s*=\s*false/.test(m[2]))continue;
  const handlers=Object.entries(files).filter(([p])=>p.startsWith(`supabase/functions/${m[1]}/`)&&p.endsWith('.ts'));
  const hints=handlers.filter(([,s])=>/authorizeInternal|requireMember|requireAdmin|compare_digest|authorization|[Tt]oken/.test(s)).map(([p])=>p);
  candidates.push({category:'security',subject:`Edge Function ${m[1]}`,observation:'JWT 平台驗證停用；已掃描 handler 驗證線索',evidence:[...hints.slice(0,4),hints.length?'存在自訂驗證線索，仍需逐路徑確認':'沒有找到靜態驗證線索，需追蹤匯入與路由'],state:'insufficient-evidence'});
 }
 return {candidates,coverage:['exact-code-blocks','sql-text','export-references','css-selectors','error-handling','edge-auth-hints'],limitations:['非語意死碼或演算法等價證明','測試覆蓋缺口需搭配既有 scoped CI 與實際 coverage','動態 endpoint 與呼叫路徑需人工審查']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(p=>/\.(?:[cm]?[jt]sx?|py|css|sql|toml)$/.test(p));
 const files=Object.fromEntries(tracked.map(p=>[p,readFileSync(p,'utf8')]));
 const result={checkedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),...scanCode(files)};
 const output=process.argv[2];if(output)writeFileSync(output,JSON.stringify(result,null,2)+'\n');else console.log(JSON.stringify(result));
}
