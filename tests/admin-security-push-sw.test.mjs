import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function fixture(){
 const handlers={}, shown=[],opened=[];const self={addEventListener:(name,fn)=>handlers[name]=fn,registration:{scope:'https://admin.example/app/',showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async(url)=>opened.push(url)}};
 vm.runInNewContext(readFileSync('apps/admin/public/admin-push-sw.js','utf8'),{self,URL});
 return {handlers,shown,opened};
}
test('security payload produces sanitized grouped alert and safe admin destination',async()=>{
 const f=fixture();let done;
 f.handlers.push({data:{json:()=>({kind:'security',count:123,title:'secret',body:'secret',url:'https://evil.test'})},waitUntil:p=>done=p});await done;
 assert.equal(f.shown[0][0],'安全監控提醒');assert.match(f.shown[0][1].body,/123/);assert.ok(!JSON.stringify(f.shown).includes('secret'));
 f.handlers.notificationclick({notification:{...f.shown[0][1],close(){}},waitUntil:p=>done=p});await done;
 assert.deepEqual(f.opened,['https://admin.example/app/']);
});
test('legacy transfer push and malformed payload preserve prior behavior',async()=>{
 for(const data of [undefined,{json(){throw Error();}},{json:()=>({body:'secret',url:'https://evil.test'})}]){
 const f=fixture();let done;f.handlers.push({data,waitUntil:p=>done=p});await done;
 assert.equal(f.shown[0][0],'新轉帳申請');assert.equal(f.shown[0][1].body,'有新的轉帳申請待處理，請登入後台查看。');assert.equal(f.shown[0][1].tag,'admin-transfer-request');
 f.handlers.notificationclick({notification:{...f.shown[0][1],close(){}},waitUntil:p=>done=p});await done;assert.deepEqual(f.opened,['https://admin.example/app/#transfer-requests']);
 }
});
