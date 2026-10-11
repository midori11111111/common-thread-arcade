import assert from 'node:assert/strict';
process.loadEnvFile('.env.local');process.loadEnvFile('.env.cloud-admin.local');
const base='https://common-thread-arcade.vercel.app';let cookie='';
const call=async(p,b,{admin=false,access}={})=>{const r=await fetch(base+p,{method:b?'POST':'GET',headers:{'Content-Type':'application/json',...(admin?{Cookie:cookie}:{}),...(access?{'X-Class-Access':access}:{})},...(b?{body:JSON.stringify(b)}:{})});const data=await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')};};
const boot=await call('/api/bootstrap');assert.equal(boot.status,200);assert.equal(boot.data.teacherKey,'');
const login=await call('/api/login',{password:process.env.TEACHER_ACCESS_CODE});assert.equal(login.status,200);cookie=login.cookie.split(';')[0];assert.match(login.cookie,/HttpOnly/);assert.match(login.cookie,/Secure/);
assert.equal((await call('/api/brief',{name:'forbidden'})).status,403);
assert.equal((await call('/api/teacher/generate',{id:'invalid',confirmed:true})).status,403);
assert.equal((await call('/api/base/generate',{confirmed:false},{admin:true})).status,412);
assert.equal((await call('/api/login',{password:'wrong'})).status,403);
const room=boot.data.roomId;const before=await call(`/api/state?room=${room}`,null,{admin:true});assert.equal(before.status,200);
const invite=await call('/api/invite',null,{admin:true});assert.equal(invite.status,200);assert.equal(new URL(invite.data.url).searchParams.get('room'),room);assert.match(invite.data.qr,/^data:image\/png;base64,/);assert.equal((await call('/api/invite')).status,403);
assert.equal((await call('/api/students',{roomId:room,motif:'',shared:{vibe:'シンプル',palette:'紺・白'}})).status,400);
const created=[];
try{
 const responses=await Promise.allSettled(Array.from({length:6},(_,i)=>call('/api/students',{roomId:room,motif:['猫','星','音楽','花','波','追加なし'][i],note:'検証用の架空入力'})));
 for(const result of responses){if(result.status==='fulfilled'&&result.value.status===200)created.push(result.value.data);}
 assert.equal(created.length,6,JSON.stringify(responses.map(r=>r.status==='fulfilled'?{status:r.value.status,error:r.value.data.error}:r.reason.message)));
 const teacher=await call(`/api/state?room=${room}`,null,{admin:true});assert.equal(teacher.data.students.length,before.data.students.length+6);assert.equal(teacher.data.students.some(s=>'access' in s),false);
 const publicState=await call(`/api/state?room=${room}`);assert.deepEqual(publicState.data.students,[]);
 const one=created[0];const student=await call(`/api/student?id=${one.id}`,null,{access:one.access});assert.equal(student.data.student.shared,null);assert.equal(student.data.student.email,'');assert.match(student.data.student.name,/^Participant /);assert.deepEqual(student.data.students,[]);
 assert.equal((await call(`/api/student?id=${one.id}`,null,{access:'wrong'})).status,403);
 assert.equal((await call('/api/student/select',{id:one.id,candidateId:'invented'},{access:one.access})).status,400);
 const update=await call('/api/student/preference',{id:one.id,motif:'小さな猫',note:'控えめに'},{access:one.access});assert.equal(update.status,200);
 assert.equal((await call(`/api/state?room=${room}`,null,{admin:true})).data.students.find(s=>s.id===one.id).motif,'小さな猫');
 const categories=await call('/api/categories',null,{admin:true});assert.equal(categories.status,200);assert.ok(categories.data.items.length>0);
 console.log(`PASS: teacher login, protected actions, 6 simultaneous submissions, shared persistence, student isolation, editing, invalid selection, Arcade catalog (${categories.data.items.length} categories). No paid generation or purchase executed.`);
}finally{
 const {mutateClass}=await import('../lib/cloud-store.mjs');const ids=new Set(created.map(s=>s.id));await mutateClass(db=>{db.students=db.students.filter(s=>!ids.has(s.id));});console.log('Removed only the verification inputs; real participant data preserved.');
}
