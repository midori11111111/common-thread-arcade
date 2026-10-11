import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('shared class workflow, authorization, generation lock and durable state',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'common-thread-test-'));let child;
 async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',CLASS_DATA_DIR:dir,ARCADE_API_KEY:'',ARCADE_CONTACT:'',ARCADE_ALLOW_GENERATION:'false'},stdio:['ignore','pipe','pipe']});return await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Server startup timed out')),5000);child.stdout.on('data',b=>{output+=b;const m=output.match(/http:\/\/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);resolve(m[0]);}});child.once('error',reject);});}
 async function stop(){await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});}
 try{
  let url=await start();
  const call=async(p,b,access)=>{const r=await fetch(url+p,{method:b?'POST':'GET',headers:{'Content-Type':'application/json',...(access?{'X-Class-Access':access}:{})},...(b?{body:JSON.stringify(b)}:{})});return {status:r.status,data:await r.json()};};
  const {data:boot}=await call('/api/bootstrap');const statePath=`/api/state?room=${boot.roomId}`;
  const initial=await call(statePath);assert.equal(initial.data.students.length,0);assert.equal(initial.data.connection.hasKey,false);assert.equal(JSON.stringify(initial.data).includes(boot.teacherKey),false);
  const wrong=await call('/api/brief',{name:'x'});assert.equal(wrong.status,403);
  const bad=await call('/api/students',{roomId:boot.roomId,motif:''});assert.equal(bad.status,400);
  const joined=await call('/api/students',{roomId:boot.roomId,motif:'猫と星',note:'控えめな柄',shared:{vibe:'シンプル',palette:'紺・白',idea:'宇宙カフェ',avoid:'大きな文字'}});assert.equal(joined.status,201);
  const {id,access}=joined.data;
  const invite=await call('/api/invite',null,boot.teacherKey);assert.equal(invite.status,200);assert.equal(new URL(invite.data.url).searchParams.get('room'),boot.roomId);assert.match(invite.data.qr,/^data:image\/png;base64,/);assert.equal((await call('/api/invite')).status,403);
  const joinBody={roomId:boot.roomId,motif:'',shared:{vibe:'シンプル',palette:'紺・白'}};
  assert.equal((await call('/api/students',joinBody)).status,400);
  assert.equal((await call('/api/students',{...joinBody,email:'invalid'})).status,400);

  const shared=await call(statePath);assert.equal(shared.data.students[0].motif,'猫と星');assert.equal('access' in shared.data.students[0],false);assert.deepEqual(shared.data.students[0].shared,{vibe:'シンプル',palette:'紺・白',idea:'宇宙カフェ',avoid:'大きな文字'});
  assert.equal((await call('/api/student/preference',{id,name:'日本語の生徒',email:'participant@example.com',motif:'猫',shared:{vibe:'不正',palette:'紺・白'}},access)).status,400);
  assert.equal((await call(`/api/student?id=${id}`,null,access)).data.student.motif,'猫と星');
  assert.equal((await call(`/api/student?id=${id}`,null,'wrong')).status,403);
  assert.equal((await call(`/api/student?id=${id}`,null,access)).data.student.name,'Participant 1');assert.equal((await call(`/api/student?id=${id}`,null,access)).data.student.email,'');
  assert.equal((await call('/api/student/preference',{id,name:'日本語の生徒',email:'participant@example.com',motif:'花と猫'},'wrong')).status,403);
  assert.equal((await call('/api/student/preference',{id,name:'日本語の生徒',email:'participant@example.com',motif:'猫と星',note:'変更後'},access)).status,200);
  const brief={name:'Test class',title:'Together',brief:'Botanical shared pattern',style:'Hand-drawn',colors:['#213F63','#EFE6D4'],lock:true};
  assert.equal((await call('/api/brief',brief,boot.teacherKey)).status,200);
  assert.equal((await call('/api/students',{roomId:boot.roomId,motif:'music'})).status,201);
  assert.equal((await call('/api/student/preference',{id,name:'日本語の生徒',email:'participant@example.com',motif:'猫と星'},access)).status,200);
  assert.equal((await call('/api/base/generate',{confirmed:true},boot.teacherKey)).status,412);
  assert.equal((await call('/api/teacher/generate',{id,confirmed:true},'wrong')).status,403);
  assert.equal((await call('/api/teacher/generate',{id,confirmed:true},boot.teacherKey)).status,412);
  assert.equal((await call('/api/student/generate',{id,confirmed:true},access)).status,412);
  assert.equal((await call('/api/student/select',{id,candidateId:'invented'},access)).status,400);
  assert.equal((await call('/api/brief',{...brief,lock:false},boot.teacherKey)).status,200);
  assert.equal((await call('/api/demo',{},boot.teacherKey)).status,201);
  assert.equal((await call('/api/demo',{},boot.teacherKey)).status,409);
  const malformed=await fetch(url+'/api/students',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(malformed.status,400);
  const foreign=await fetch(url+statePath,{headers:{Origin:'https://foreign.example'}});assert.equal(foreign.status,403);
  const file=await fetch(url+'/.env.local');assert.equal(file.status,404);
  await stop();url=await start();const restored=await call(statePath);assert.equal(restored.data.students.length,5);assert.equal(restored.data.name,'Test class');assert.equal(restored.data.students[0].motif,'猫と星');assert.equal(restored.data.students[0].shared.idea,'宇宙カフェ');
 }finally{if(child&&child.exitCode===null)await stop();rmSync(dir,{recursive:true,force:true});}
});
