import {checkoutUrl,exampleCheckoutInput} from './checkout.mjs';
import gallery from '../public/examples/gallery.json' with {type:'json'};
import {invitation} from './invitation.mjs';
import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {readClass,mutateClass} from './cloud-store.mjs';
import {sharedOptions} from '../public/shared-preferences.js';
const err=(message,status=400)=>Object.assign(Error(message),{status});
const text=(v,label,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw err(`${label}を${max}文字以内で入力してください。`);return v.trim();};
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const adminSecret=()=>process.env.TEACHER_ACCESS_CODE||'';
function signature(value){return createHmac('sha256',adminSecret()).update(value).digest('base64url');}
export function adminSession(req){
 if(!adminSecret())return false;
 const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ct_teacher='))?.slice(11)||'';
 const [payload,sig]=cookie.split('.');if(!payload||!equal(sig,signature(payload)))return false;
 try{return JSON.parse(Buffer.from(payload,'base64url')).expires>Date.now();}catch{return false;}
}
function teacher(req){if(!adminSession(req))throw err('Teacher access required.',403);}
function member(req,db,id){const s=db.students.find(s=>s.id===id);if(!s||!equal(req.headers['x-class-access'],s.access))throw err('Student access required.',403);return s;}
function sharedPreference(value){if(value===undefined)return undefined;if(!value||!sharedOptions.vibe.includes(value.vibe)||!sharedOptions.palette.includes(value.palette))throw err('共通の雰囲気と色を選んでください。');for(const k of ['idea','avoid'])if(value[k]!==undefined&&(typeof value[k]!=='string'||value[k].length>200))throw err('共通の希望は各200文字以内で入力してください。');return {vibe:value.vibe,palette:value.palette,idea:(value.idea||'').trim(),avoid:(value.avoid||'').trim()};}
function publicStudent(s){return {id:s.id,name:s.name,email:s.email||'',motif:s.motif,note:s.note,shared:s.shared||null,status:s.status||'waiting',error:s.error||null,selected:s.selected||null,candidates:s.candidates||[],isDemo:!!s.isDemo};}
export function snapshot(db,admin=false,student){return {cloud:true,id:db.id,name:db.name,stage:db.stage,theme:db.theme,category:db.category,base:{patternId:db.base.patternId||null,imageUrl:db.base.imageUrl||null,status:db.base.status||'idle',error:db.base.error||null},students:admin?db.students.map(publicStudent):[],...(student?{student:publicStudent(student)}:{}),connection:{configured:!!process.env.ARCADE_API_KEY&&!!process.env.ARCADE_CONTACT,generationAllowed:process.env.ARCADE_ALLOW_GENERATION==='true'},busy:[...(db.base.status==='generating'?['base']:[]),...db.students.filter(s=>s.status==='generating'&&(admin||s.id===student?.id)).map(s=>s.id)]};}
function generationPermission(b){if(!process.env.ARCADE_API_KEY||!process.env.ARCADE_CONTACT)throw err('Arcade connection is not configured.',412);if(process.env.ARCADE_ALLOW_GENERATION!=='true')throw err('Live generation is locked until the owner authorizes credits or cost.',412);if(b.confirmed!==true)throw err('Confirm live Arcade generation before continuing.',412);}
async function arcade(endpoint,body){
 let response;
 try{response=await fetch(`https://platform.arcade.ai/v1/${endpoint}`,{method:'POST',headers:{Authorization:`Bearer ${process.env.ARCADE_API_KEY}`,'Content-Type':'application/json','User-Agent':`common-thread/0.2 (${process.env.ARCADE_CONTACT})`},body:JSON.stringify(body),signal:AbortSignal.timeout(65000)});}
 catch(e){
  // A timed-out creation may still succeed upstream. Resume the same idempotent request.
  if(e.name==='TimeoutError'&&body.requestId&&['patterns/create','patterns/refine/edit','products/create'].includes(endpoint))return {pending:true};
  throw e;
 }
 const data=await response.json().catch(()=>({}));
 if(response.status===409&&body.requestId&&/still being processed|still starting/i.test(data.message||data.error?.message||''))return {pending:true};
 if(!response.ok)throw err(`Arcade ${response.status}: ${String(data.message||data.error?.message||'処理を再開してください。').slice(0,250)}`,502);
 return data;
}
const productData=p=>({productId:p.productId,title:p.title,imageUrl:p.imageUrl,images:p.images,selections:p.selections,selectionLabel:p.selectionLabel,unitPrice:p.unitPrice,maker:p.maker});
// One durable generation step per request. The browser resumes stored jobs; no detached work.
export async function advanceGeneration(req,id){
 const lease=randomUUID();let work;
 await mutateClass(db=>{
  if(id==='base')teacher(req);else if(adminSession(req)){if(!db.students.some(s=>s.id===id))throw err('参加者が見つかりません。',404);}else member(req,db,id);
  const holder=id==='base'?db.base:db.students.find(s=>s.id===id);
  if(holder.status!=='generating')return;
  if(holder.lease?.expires>Date.now())return;
  holder.lease={token:lease,expires:Date.now()+90000};work={db:structuredClone(db),holder:structuredClone(holder)};
 });
 if(!work)return {pending:true};
 const {db,holder}=work;let stage;
 try{
  if(id==='base'){
   if(!holder.jobId){const j=await arcade('patterns/create',{requestId:holder.requestId,prompt:`Create a seamless repeat pattern for a matching event collection. Theme: ${db.theme.brief}. Art direction: ${db.theme.style}. Use only the shared palette ${db.theme.colors.join(', ')}. Preserve balanced negative space. No text, logos or product mockup.`.slice(0,1000),colors:db.theme.colors});if(j.jobId)holder.jobId=j.jobId;else if(!j.pending)throw err('Arcadeから生成IDを取得できませんでした。',502);}
   else if(!holder.patternId){const j=await arcade('jobs/get',{jobId:holder.jobId});if(j.status==='failed')throw err('共通柄の生成が失敗しました。',502);if(j.status==='succeeded'){if(!j.result?.patternId)throw err('共通柄のIDがありません。',502);holder.patternId=j.result.patternId;}}
   else{const p=await arcade('patterns/get',{patternId:holder.patternId});holder.imageUrl=p.imageUrl;holder.status='ready';stage='personalizing';}
  }else{
   const i=holder.candidates.findIndex(c=>c.status!=='ready');
   if(i<0)holder.status='ready';else{
    const c=holder.candidates[i];
    if(!c.editJobId){c.status='editing';const j=await arcade('patterns/refine/edit',{requestId:c.editRequestId,patternId:db.base.patternId,instruction:`Preserve this shared event pattern's palette (${db.theme.colors.join(', ')}), style, repeat rhythm, and scale. ${/^(追加なし|none|no additions?)$/i.test(holder.motif.trim())?'Retain the shared design without a personal motif.':`Add ${holder.motif}.`} ${holder.note||''}. ${i?'Expressive personal motif.':'Subtle personal motif.'} Keep a matching collection feel. No text, letters or logos.`.slice(0,1000),colors:db.theme.colors});if(j.jobId)c.editJobId=j.jobId;else if(!j.pending)throw err('個人柄の生成IDがありません。',502);}
    else if(!c.patternId){const j=await arcade('jobs/get',{jobId:c.editJobId});if(j.status==='failed')throw err('個人柄の生成が失敗しました。',502);if(j.status==='succeeded'){if(!j.result?.patternId)throw err('個人柄のIDがありません。',502);c.patternId=j.result.patternId;}}
    else if(!c.productJobId){c.status='building';const j=await arcade('products/create',{requestId:c.productRequestId,patternId:c.patternId,categoryId:db.category.categoryId,selections:db.category.selections,fit:{mode:'fill'}});if(j.jobId)c.productJobId=j.jobId;else if(!j.pending)throw err('商品の生成IDがありません。',502);}
    else if(!c.productId){const j=await arcade('jobs/get',{jobId:c.productJobId});if(j.status==='failed')throw err('商品の生成が失敗しました。',502);if(j.status==='succeeded'){if(!j.result?.productId)throw err('商品IDがありません。',502);c.productId=j.result.productId;}}
    else{c.status='pricing';c.product=productData(await arcade('products/get',{productId:c.productId,quantity:1}));c.status='ready';if(holder.candidates.every(c=>c.status==='ready'))holder.status='ready';}
   }
  }
  holder.error=null;
 }catch(e){holder.status='error';holder.error=String(e.message).replaceAll(process.env.ARCADE_API_KEY,'[redacted]').slice(0,350);}
 await mutateClass(latest=>{const target=id==='base'?latest.base:latest.students.find(s=>s.id===id);if(target?.lease?.token!==lease)return;delete holder.lease;if(id==='base')Object.assign(target,holder);else Object.assign(target,{status:holder.status,error:holder.error,candidates:holder.candidates});delete target.lease;if(stage)latest.stage=stage;});
 return {pending:holder.status==='generating',status:holder.status};
}
export async function cloudApi(req,res){
 const url=new URL(req.url,`https://${req.headers.host}`);const p=url.pathname;const b=req.body||{};
 if(req.headers.origin&&req.headers.origin!==`https://${req.headers.host}`)throw err('外部サイトからの操作はできません。',403);
 if(p==='/api/login'&&req.method==='POST'){
  if(!adminSecret()||!equal(b.password,adminSecret()))throw err('アクセスコードが違います。',403);
  const payload=Buffer.from(JSON.stringify({expires:Date.now()+43200000})).toString('base64url');
  res.setHeader('Set-Cookie',`ct_teacher=${payload}.${signature(payload)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`);return {ok:true};
 }
 let db;
 if(req.method==='GET'){db=(await readClass()).db;}
 if(req.method==='GET'){
  if(p==='/api/bootstrap')return {roomId:db.id,cloud:true,teacherKey:'',teacherAuthenticated:adminSession(req)};
  if(p==='/api/state'){if(url.searchParams.get('room')!==db.id)throw err('Class not found.',404);return snapshot(db,adminSession(req));}
  if(p==='/api/student')return snapshot(db,false,member(req,db,url.searchParams.get('id')));
  if(p==='/api/invite'){teacher(req);return invitation(url.origin,db.id);}
  if(p==='/api/categories'){teacher(req);return {items:(await arcade('categories/list',{})).items.filter(c=>c.world==='print')};}
  throw err('Route not found.',404);
 }
 if(req.method!=='POST')throw err('Method not allowed.',405);
 if(p==='/api/example/checkout')return checkoutUrl(await arcade('checkouts/create',exampleCheckoutInput(b,gallery)));
 if(p==='/api/student/checkout'){
  const work=await mutateClass(d=>{const s=member(req,d,b.id);const c=s.candidates?.find(c=>c.id===s.selected&&c.status==='ready'&&c.productId);if(!c)throw err('完成した商品を選んでください。');c.checkoutRequestId||=randomUUID();return {requestId:c.checkoutRequestId,productId:c.productId};});
  return checkoutUrl(await arcade('checkouts/create',{requestId:work.requestId+'-single',dropShip:true,lines:[{productId:work.productId,quantity:1}]}));
 }
 if(p==='/api/students'){
  const motif=text(b.motif,'個人のモチーフ',100),shared=sharedPreference(b.shared);const id=randomUUID(),access=randomUUID();
  return mutateClass(d=>{if(b.roomId!==d.id)throw err('Class not found.',404);if(d.students.length>=30)throw err('This class is limited to 30 participants.',409);d.students.push({id,access,name:`Participant ${d.students.length+1}`,motif,shared,note:typeof b.note==='string'?b.note.slice(0,250):'',status:'waiting'});return {id,access};});
 }
 if(p==='/api/student/preference'){
  const motif=text(b.motif,'モチーフ',100),shared=sharedPreference(b.shared);
  return mutateClass(d=>{const s=member(req,d,b.id);if(s.candidates?.length||s.status==='generating'||s.status==='ready')throw err('Personal preferences are locked after generation starts.',409);if(shared)s.shared=shared;Object.assign(s,{motif,note:typeof b.note==='string'?b.note.slice(0,250):''});return {student:publicStudent(s)};});
 }
 if(p==='/api/student/select')return mutateClass(d=>{const s=member(req,d,b.id);if(!s.candidates?.some(c=>c.id===b.candidateId&&c.product&&c.status==='ready'))throw err('Select a completed product.');s.selected=b.candidateId;return {student:publicStudent(s)};});
 if(p==='/api/progress')return advanceGeneration(req,b.id);
 if(p==='/api/student/generate'||p==='/api/teacher/generate'||p==='/api/base/generate'){
  generationPermission(b);const id=p==='/api/base/generate'?'base':b.id;
  await mutateClass(d=>{
   const s=id==='base'?(teacher(req),d.base):p==='/api/teacher/generate'?(teacher(req),d.students.find(x=>x.id===id)):member(req,d,id);
   if(!s)throw err('参加者が見つかりません。',404);if(s.status==='ready')throw err('すでに生成が完了しています。',409);if(s.status==='generating')throw err('This task is already running.',409);
   if(!d.category)throw err('Select a real Arcade product specification first.',412);
   if(id==='base'&&d.stage==='collecting')throw err('Confirm the shared brief first.',412);
   if(id!=='base'&&d.base.status!=='ready')throw err('Wait for your teacher to prepare the shared pattern and product.',412);
   s.status='generating';s.error=null;if(id!=='base')s.candidates||=[0,1].map(i=>({id:randomUUID(),label:i?'Expressive':'Subtle',editRequestId:randomUUID(),productRequestId:randomUUID(),status:'pending'}));
  });return {started:true};
 }
 teacher(req);
 if(p==='/api/category'){
  db=(await readClass()).db;
  if(db.base.patternId||db.base.jobId||db.base.status==='generating')throw err('Product specification is locked after generation starts.',409);
  const c=await arcade('categories/get',{categoryId:text(b.categoryId,'商品ID',128),selections:b.selections||{}});if(c.world!=='print'||!c.canManufacture)throw err('Choose a manufacturable print specification.');
  return mutateClass(d=>{if(d.base.patternId||d.base.jobId||d.base.status==='generating')throw err('Product specification is locked after generation starts.',409);d.category={categoryId:c.categoryId,name:c.name,selections:c.selections,options:c.options};return {category:d.category};});
 }
 if(p==='/api/brief'){
  const colors=b.colors;if(!Array.isArray(colors)||colors.length<1||colors.length>5||colors.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw err('共通の色を確認してください。');
  const name=text(b.name,'イベント名',80),theme={title:text(b.title,'コレクション名',100),brief:text(b.brief,'共通のテーマ',350),style:text(b.style,'画風',200),colors};
  return mutateClass(d=>{if(d.base.patternId||d.base.jobId||d.base.status==='generating')throw err('The brief is locked once generation has started.',409);d.name=name;d.theme=theme;d.stage=b.lock?'locked':'collecting';return snapshot(d,true);});
 }
 if(p==='/api/demo')return mutateClass(d=>{if(d.stage!=='collecting')throw err('Add sample preferences before locking the brief.',409);if(d.students.some(s=>s.isDemo))throw err('Sample students are already present.',409);if(d.students.length>27)throw err('Not enough room for three samples.',409);const samples=[['Alex','cats'],['Jamie','music'],['Riley','stars']].map(([name,motif])=>({id:randomUUID(),access:randomUUID(),name,motif,note:'',status:'waiting',isDemo:true}));d.students.push(...samples);return {students:samples.map(s=>({id:s.id,access:s.access}))};});
 if(p==='/api/refresh'){
  const latest=(await readClass()).db;const updates=[];
  for(const s of latest.students)for(const c of s.candidates||[])if(c.productId)updates.push({studentId:s.id,candidateId:c.id,productId:c.productId});
  const refreshed=[];for(let i=0;i<updates.length;i+=4){const batch=await Promise.all(updates.slice(i,i+4).map(async c=>({...c,product:productData(await arcade('products/get',{productId:c.productId,quantity:1}))})));refreshed.push(...batch);}
  const pattern=latest.base.patternId?await arcade('patterns/get',{patternId:latest.base.patternId}):null;
  return mutateClass(d=>{for(const u of refreshed){const c=d.students.find(s=>s.id===u.studentId)?.candidates?.find(c=>c.id===u.candidateId);if(c)c.product=u.product;}if(pattern)d.base.imageUrl=pattern.imageUrl;return snapshot(d,true);});
 }
 throw err('Route not found.',404);
}
