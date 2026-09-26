import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
export function assertLocalAppTestDatabase(raw) {
  const url=new URL(raw);
  if (!['postgres:','postgresql:'].includes(url.protocol) || !['127.0.0.1','localhost','[::1]'].includes(url.hostname)
    || !/^\/matrix_app_test(?:_[a-f0-9]+)?$/.test(url.pathname)) throw new Error('Only an explicitly named loopback App test database is allowed');
  return url;
}
export function createPsqlClient(raw) {
  assertLocalAppTestDatabase(raw);
  // Merge at the OS pipe so PostgreSQL errors are observed before the marker,
  // rather than racing independent stdout/stderr callbacks. URL stays an argv.
  const process=spawn('bash',['-c','exec psql "$@" 2>&1','app-test-psql','-X','-qAt','--no-psqlrc',raw],{stdio:['pipe','pipe','pipe']});
  let current=null,stdout='',stderr='',tail=Promise.resolve();
  process.stdout.on('data',chunk=>{
    stdout+=chunk;
    if (!current || !stdout.includes(current.marker+'\n')) return;
    const [output,...rest]=stdout.split(current.marker+'\n'); stdout=rest.join(current.marker+'\n');
    const task=current;current=null;clearTimeout(task.timer);
    const error=output+'\n'+stderr;stderr='';
    if (/ERROR:|FATAL:/.test(error)) task.reject(new Error(error)); else task.resolve(output.split('\n').filter(line=>!/^NOTICE:|^WARNING:/.test(line)).join('\n').trim());
  });
  process.stderr.on('data',chunk=>{stderr+=chunk;});
  const failure=error=>{if(current){clearTimeout(current.timer);current.reject(error);current=null;}};
  process.on('error',failure);process.on('exit',code=>failure(new Error(`psql exited ${code}: ${stderr}`)));
  const send=sql=>{
    const request=tail.then(()=>new Promise((resolve,reject)=>{
      const marker='APP_TEST_DONE_'+randomUUID().replaceAll('-','');
      const timer=setTimeout(()=>{process.kill();reject(new Error('Postgres test command timed out'));},15000);
      current={marker,resolve,reject,timer};process.stdin.write(`${sql}\n\\echo ${marker}\n`);
    }));tail=request.catch(()=>{});return request;
  };
  const literal=value=>value===null?'NULL':typeof value==='number'?String(value):`'${(typeof value==='string'?value:JSON.stringify(value)).replaceAll("'","''")}'`;
  return {
    exec: send,
    async query(sql,params=[]) {
      const text=sql.replace(/\$(\d+)/g,(_,n)=>literal(params[Number(n)-1]));
      if (/^\s*(select|with)\b/i.test(text)) {
        const output=await send(`select coalesce(json_agg(row_to_json(q)),'[]'::json) from (${text.replace(/;\s*$/,'')}) q;`);
        return {rows:JSON.parse(output||'[]')};
      }
      await send(text+';');return {rows:[]};
    },
    async close(){await tail;process.stdin.end('\\q\n');},
  };
}
