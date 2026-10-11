import assert from 'node:assert/strict';
process.loadEnvFile('.env.local');process.loadEnvFile('.env.cloud-admin.local');
const {cloudApi}=await import('../lib/cloud-api.mjs');
const {del}=await import('@vercel/blob');
const created=[];
const call=(path,body,room,access)=>cloudApi({url:path,method:body?'POST':'GET',headers:{host:'test.local',...(room?{'x-event-room':room}:{}),...(access?{'x-class-access':access}:{})},body:body||{}},{});
try{
 const original=await call('/api/bootstrap');
 const [a,b]=await Promise.all([call('/api/events',{}),call('/api/events',{})]);created.push(a,b);
 assert.notEqual(a.roomId,b.roomId);
 assert.equal((await call('/api/bootstrap',null,a.roomId,a.organizerAccess)).teacherAuthenticated,true);
 assert.equal((await call('/api/bootstrap',null,a.roomId,b.organizerAccess)).teacherAuthenticated,false);
 const invite=await call('/api/invite',null,a.roomId,a.organizerAccess);
 assert.equal(new URL(invite.url).searchParams.get('room'),a.roomId);
 assert.ok(invite.qr.startsWith('data:image/png;base64,'));
 await assert.rejects(()=>call('/api/invite',null,a.roomId,b.organizerAccess),e=>e.status===403);
 const brief={name:'Isolated test event',title:'Together',brief:'Flowers',style:'Hand drawn',colors:['#213F63','#EFE6D4'],lock:true};
 await assert.rejects(()=>call('/api/brief',brief,a.roomId),e=>e.status===403);
 await call('/api/brief',brief,a.roomId,a.organizerAccess);
 const guest=await call('/api/students',{roomId:a.roomId,motif:'cats'},a.roomId);
 assert.equal((await call('/api/student?id='+guest.id,null,a.roomId,guest.access)).student.motif,'cats');
 await assert.rejects(()=>call('/api/student?id='+guest.id,null,b.roomId,guest.access),e=>e.status===403);
 const stateA=await call('/api/state?room='+a.roomId,null,a.roomId,a.organizerAccess);
 const stateB=await call('/api/state?room='+b.roomId,null,b.roomId,b.organizerAccess);
 assert.equal(stateA.students.length,1);assert.equal(stateB.students.length,0);assert.notEqual(stateA.name,stateB.name);
 assert.equal(JSON.stringify(stateA).includes(a.organizerAccess),false);
 assert.equal((await call('/api/bootstrap')).roomId,original.roomId);
 console.log('PASS: passwordless creation, QR/link, organizer authorization, event isolation, guest access, legacy demo preserved. No Arcade generation or checkout.');
}finally{for(const e of created)await del('common-thread/events/'+e.roomId+'.json',{token:process.env.BLOB_READ_WRITE_TOKEN});}
