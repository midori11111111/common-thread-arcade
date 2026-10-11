import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
process.loadEnvFile('.env.local');process.loadEnvFile('.env.cloud-admin.local');
process.env.CLASS_BLOB_PATH=`verification/${randomUUID()}.json`;
const {initializeClass,readClass,mutateClass}=await import('../lib/cloud-store.mjs');
const {advanceGeneration,cloudApi}=await import('../lib/cloud-api.mjs');
const {del}=await import('@vercel/blob');
const payload=Buffer.from(JSON.stringify({expires:Date.now()+60000})).toString('base64url');const sig=createHmac('sha256',process.env.TEACHER_ACCESS_CODE).update(payload).digest('base64url');const req={headers:{cookie:`ct_teacher=${payload}.${sig}`}};
const fixture={id:'test',name:'Test',stage:'locked',theme:{brief:'shared',style:'simple',colors:['#213F63','#EFE6D4']},category:{categoryId:'test-category',selections:{size:'test'}},base:{requestId:'stable-base-request',status:'generating'},students:[{id:'student-test',access:'test-access',name:'Fixture',motif:'猫',status:'waiting',note:'small'}]};
const originalFetch=globalThis.fetch;const requests=[];let baseAttempts=0,productAttempts=0;
globalThis.fetch=async(url,options)=>{
 if(!String(url).startsWith('https://platform.arcade.ai/'))return originalFetch(url,options);
 const endpoint=String(url).split('/v1/')[1];const body=JSON.parse(options.body);requests.push({endpoint,body});let data;
 if(endpoint==='patterns/create'){baseAttempts++;if(baseAttempts===1)return Response.json({message:'still being processed'},{status:409});data={jobId:'base-job'};}
 else if(endpoint==='jobs/get')data={status:'succeeded',result:body.jobId==='base-job'?{patternId:'base-pattern'}:body.jobId.startsWith('edit-')?{patternId:'personal-'+body.jobId}:{productId:'product-'+body.jobId}};
 else if(endpoint==='patterns/get')data={imageUrl:'https://example.com/test.png'};
 else if(endpoint==='patterns/refine/edit')data={jobId:'edit-'+body.requestId};
 else if(endpoint==='products/create'){productAttempts++;if(productAttempts===1)throw new DOMException('The operation was aborted due to timeout','TimeoutError');data={jobId:'build-'+body.requestId};}
 else if(endpoint==='products/get')data={productId:body.productId,imageUrl:'https://example.com/test-product.png',unitPrice:{currency:'USD',amount:'20.00'},selectionLabel:'test'};
 else if(endpoint==='checkouts/create')data={checkoutUrl:'https://checkout.arcade.ai/fixture'};
 else throw Error('Unexpected mocked endpoint');return Response.json(data);
};
try{
 await initializeClass(fixture);
 for(let i=0;i<4;i++)await advanceGeneration(req,'base');
 let db=(await readClass()).db;assert.equal(db.base.status,'ready');assert.equal(db.stage,'personalizing');
 assert.equal(requests.filter(r=>r.endpoint==='patterns/create').length,2);assert.ok(requests.filter(r=>r.endpoint==='patterns/create').every(r=>r.body.requestId==='stable-base-request'));
 const late=await cloudApi({url:'/api/students',method:'POST',headers:{host:'test.local'},body:{roomId:'test',name:'Late participant',email:'late@example.com',motif:'stars'}},{});assert.ok(late.id&&late.access);
 await cloudApi({url:'/api/student/preference',method:'POST',headers:{host:'test.local','x-class-access':late.access},body:{id:late.id,name:'Late participant',email:'late@example.com',motif:'moon'}},{});
 assert.equal((await readClass()).db.students.find(s=>s.id===late.id).motif,'moon');
 await mutateClass(db=>{const s=db.students[0];s.status='generating';s.candidates=[0,1].map(i=>({id:'candidate-'+i,editRequestId:'edit-request-'+i,productRequestId:'product-request-'+i,status:'pending'}));});
 for(let i=0;i<6;i++)await advanceGeneration(req,'student-test');
 await mutateClass(db=>{db.students[0].selected='candidate-0';});
 for(let i=0;i<5;i++)await advanceGeneration(req,'student-test');
 db=(await readClass()).db;assert.equal(db.students[0].status,'ready');assert.equal(db.students[0].selected,'candidate-0');assert.equal(db.students[0].candidates.length,2);assert.ok(db.students[0].candidates.every(c=>c.status==='ready'&&c.product.unitPrice.amount==='20.00'));
 const participantReq={url:'/api/student/preference',method:'POST',headers:{host:'test.local','x-class-access':'test-access'},body:{id:'student-test',name:'Fixture',email:'fixture@example.com',motif:'different'}};
 await assert.rejects(()=>cloudApi(participantReq,{}),e=>e.status===409);
 assert.equal(requests.filter(r=>r.endpoint==='patterns/refine/edit').length,2);assert.ok(requests.filter(r=>r.endpoint==='patterns/refine/edit').every(r=>r.body.patternId==='base-pattern'&&r.body.instruction.includes('猫')));
 const purchase=await cloudApi({...participantReq,url:'/api/student/checkout',body:{id:'student-test'}},{});assert.equal(purchase.checkoutUrl,'https://checkout.arcade.ai/fixture');const checkout=requests.at(-1).body;assert.equal(checkout.lines[0].quantity,1);assert.equal(checkout.lines[0].productId,db.students[0].candidates[0].productId);
 const builds=requests.filter(r=>r.endpoint==='products/create');assert.equal(builds.length,3);assert.equal(builds[0].body.requestId,builds[1].body.requestId);
 const before=requests.length;await advanceGeneration(req,'student-test');assert.equal(requests.length,before);
 console.log('PASS: durable shared generation, 409 resume with the same request ID, two personal products and prices, completed-job idempotency. Arcade responses mocked; no real generation.');
}finally{globalThis.fetch=originalFetch;await del(process.env.CLASS_BLOB_PATH,{token:process.env.BLOB_READ_WRITE_TOKEN});console.log('Removed isolated verification object. Production classroom untouched.');}
