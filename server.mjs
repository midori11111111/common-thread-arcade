import {checkoutUrl,exampleCheckoutInput} from './lib/checkout.mjs';
import gallery from './public/examples/gallery.json' with {type:'json'};
import {invitation} from './lib/invitation.mjs';
import http from 'node:http';
import {sharedOptions} from './public/shared-preferences.js';
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID,timingSafeEqual} from 'node:crypto';

const root=path.dirname(fileURLToPath(import.meta.url));
if(existsSync(path.join(root,'.env.local'))) process.loadEnvFile(path.join(root,'.env.local'));
const dataDir=process.env.CLASS_DATA_DIR||path.join(root,'.data');
mkdirSync(dataDir,{recursive:true,mode:0o700});
const dbFile=path.join(dataDir,'class.json');
const fresh=()=>({id:randomUUID(),teacherKey:randomUUID(),name:'Class of 2026',stage:'collecting',theme:{title:'One class. Many personalities.',brief:'A botanical collection with a shared visual identity.',style:'Delicate hand-drawn motifs, balanced spacing, understated and playful.',colors:['#213F63','#EFE6D4']},students:[],category:null,base:{requestId:randomUUID()},createdAt:new Date().toISOString()});
const db=existsSync(dbFile)?JSON.parse(readFileSync(dbFile,'utf8')):fresh();
const save=()=>{writeFileSync(dbFile+'.tmp',JSON.stringify(db,null,2),{mode:0o600});renameSync(dbFile+'.tmp',dbFile);};
save();
const busy=new Set();
const key=process.env.ARCADE_API_KEY||'';
const contact=process.env.ARCADE_CONTACT||'';
const liveAllowed=process.env.ARCADE_ALLOW_GENERATION==='true';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
class Problem extends Error {constructor(message,status=400){super(message);this.status=status;}}
const requireText=(value,name,max=400)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new Problem(`${name} is required (max ${max} characters).`);return value.trim();};
const secretEqual=(a,b)=>typeof a==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function teacher(req){if(!secretEqual(req.headers['x-class-access'],db.teacherKey))throw new Problem('Teacher access required.',403);}
function member(req,id){const s=db.students.find(x=>x.id===id);if(!s||!secretEqual(req.headers['x-class-access'],s.access))throw new Problem('Student access required.',403);return s;}
function generationPermission(body){if(!key)throw new Problem('Connect an Arcade API key on the server first.',412);if(!contact)throw new Problem('Set ARCADE_CONTACT for API client identification.',412);if(!liveAllowed)throw new Problem('Live generation is locked until the owner authorizes credits or cost.',412);if(body.confirmed!==true)throw new Problem('Confirm live Arcade generation before continuing.',412);}
function clean(value){return String(value||'Request failed.').replaceAll(key||'\u0000','[redacted]').slice(0,350);}
async function arcade(endpoint,body){
 if(!key||!contact)throw new Problem('Arcade connection is not configured.',412);
 const startedAt=Date.now();
 for(let attempt=0;attempt<4;attempt++){
  let res;
  try{res=await fetch(`https://platform.arcade.ai/v1/${endpoint}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','User-Agent':`common-thread/0.1 (${contact})`},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});}catch{if(attempt===3)throw new Problem('Arcade request timed out. Retry safely to resume.',502);await delay(1500*(attempt+1));continue;}
  const text=await res.text();let data;try{data=JSON.parse(text);}catch{data={};}
  if(res.ok)return data;
  const stillStarting=res.status===409&&body.requestId&&/still being processed|still starting/i.test(data.message||data.error?.message||'');
  if(stillStarting&&Date.now()-startedAt<120000){await delay(5000);attempt--;continue;}
  if((res.status===429||res.status>=500)&&attempt<3){const retry=Number(res.headers.get('retry-after'));await delay(Number.isFinite(retry)&&retry>0?Math.min(retry,60)*1000:2000*(attempt+1));continue;}
  throw new Problem(`Arcade ${res.status}: ${clean(data.message||data.error?.message||'The request was rejected.')}`,502);
 }
}
async function poll(jobId){const until=Date.now()+300000;while(Date.now()<until){const j=await arcade('jobs/get',{jobId});if(j.status==='failed')throw new Problem(clean(j.error?.message||'Generation failed.'),502);if(j.status==='succeeded'){if(!j.result)throw new Problem('Arcade finished without a usable result.',502);return j.result;}await delay(3000);}throw new Problem('Still processing at Arcade. Use Resume; no new request will be created.',504);}
async function job(holder,field,endpoint,body,resultField){
 if(holder[resultField])return;
 if(!holder[field]){const j=await arcade(endpoint,body);if(!j.jobId)throw new Problem('Arcade did not return a job ID.',502);holder[field]=j.jobId;save();}
 const result=await poll(holder[field]);if(!result[resultField])throw new Problem('Arcade returned no product or pattern ID.',502);holder[resultField]=result[resultField];save();
}
function sharedPreference(value){
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||!sharedOptions.vibe.includes(value.vibe)||!sharedOptions.palette.includes(value.palette))throw new Problem('共通の雰囲気と色を選んでください。');
 for(const k of ['idea','avoid'])if(value[k]!==undefined&&(typeof value[k]!=='string'||value[k].length>200))throw new Problem('共通の希望は各200文字以内で入力してください。');
 return {vibe:value.vibe,palette:value.palette,idea:(value.idea||'').trim(),avoid:(value.avoid||'').trim()};
}
function publicStudent(s){return {id:s.id,name:s.name,email:s.email||'',motif:s.motif,note:s.note,status:s.status||'waiting',error:s.error||null,selected:s.selected??null,candidates:s.candidates||[],shared:s.shared||null,isDemo:!!s.isDemo};}
function snapshot(){return {id:db.id,name:db.name,stage:db.stage,theme:db.theme,category:db.category,base:{patternId:db.base.patternId||null,imageUrl:db.base.imageUrl||null,status:db.base.status||'idle',error:db.base.error||null},students:db.students.map(publicStudent),connection:{configured:!!key&&!!contact,hasKey:!!key,hasContact:!!contact,generationAllowed:liveAllowed},busy:[...busy]};}
function lockTask(label,fn,onError){if(busy.has(label))throw new Problem('This task is already running.',409);busy.add(label);void fn().catch(e=>onError(clean(e.message))).finally(()=>{busy.delete(label);save();});}
async function createBase(){
 db.base.status='generating';db.base.error=null;save();
 const prompt=`Create a seamless repeat pattern for a matching event collection. Theme: ${db.theme.brief}. Art direction: ${db.theme.style}. Use only the shared palette ${db.theme.colors.join(', ')}. Keep a recognizable visual identity, balanced negative space and consistent motif scale. No text, letters, logos or product mockup.`;
 await job(db.base,'jobId','patterns/create',{requestId:db.base.requestId,prompt:prompt.slice(0,1000),colors:db.theme.colors},'patternId');
 const p=await arcade('patterns/get',{patternId:db.base.patternId});db.base.imageUrl=p.imageUrl;db.base.status='ready';db.stage='personalizing';save();
}
async function generateStudent(s){
 s.status='generating';s.error=null;s.candidates ||= [0,1].map(i=>({id:randomUUID(),label:i?'Expressive':'Subtle',editRequestId:randomUUID(),productRequestId:randomUUID(),status:'pending'}));save();
 for(const [i,c] of s.candidates.entries()){
  c.status='editing';save();
  const instruction=`Personalize this shared event pattern. Preserve its palette (${db.theme.colors.join(', ')}), art style, repeat rhythm and motif scale. ${/^(追加なし|none|no additions?)$/i.test(s.motif.trim())?'Do not add a personal motif. Retain the shared pattern.':`Add ${s.motif}.`} ${s.note||''}. ${i?'Make the personal motif more prominent, with an expressive composition.':'Weave the personal motif subtly among the existing motifs.'} Keep a matching collection feel. No names, text, letters or logos.`;
  await job(c,'editJobId','patterns/refine/edit',{requestId:c.editRequestId,patternId:db.base.patternId,instruction:instruction.slice(0,1000),colors:db.theme.colors},'patternId');
  c.status='building';save();
  await job(c,'productJobId','products/create',{requestId:c.productRequestId,patternId:c.patternId,categoryId:db.category.categoryId,selections:db.category.selections,fit:{mode:'fill'}},'productId');
  c.status='pricing';save();const product=await arcade('products/get',{productId:c.productId,quantity:1});
  c.product={productId:product.productId,title:product.title,imageUrl:product.imageUrl,images:product.images,selections:product.selections,selectionLabel:product.selectionLabel,unitPrice:product.unitPrice,maker:product.maker};c.status='ready';save();
 }
 s.status='ready';save();
}
async function body(req){let raw='';for await(const b of req){raw+=b;if(Buffer.byteLength(raw)>24000)throw new Problem('Request too large.',413);}try{return raw?JSON.parse(raw):{};}catch{throw new Problem('Invalid JSON.');}}
function send(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
 try{
  const host=req.headers.host||'';if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))throw new Problem('Local access only.',403);
  if(req.headers.origin&&!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.origin))throw new Problem('Local origin required.',403);
  const url=new URL(req.url,'http://localhost');const p=url.pathname;
  if(p.startsWith('/api/')){
   if(req.method==='GET'){
    if(p==='/api/bootstrap'){send(res,{roomId:db.id,teacherKey:db.teacherKey});return;} // Loopback-only prototype, not public authentication.
    if(p==='/api/state'){if(url.searchParams.get('room')!==db.id)throw new Problem('Class not found.',404);send(res,snapshot());return;}
    if(p==='/api/student'){const s=member(req,url.searchParams.get('id'));send(res,{...snapshot(),students:[],student:publicStudent(s)});return;}
    if(p==='/api/invite'){teacher(req);send(res,await invitation(`http://${host}`,db.id));return;}
    if(p==='/api/categories'){teacher(req);const result=await arcade('categories/list',{});send(res,{items:result.items.filter(c=>c.world==='print')});return;}
    throw new Problem('Route not found.',404);
   }
   if(req.method!=='POST')throw new Problem('Method not allowed.',405);
   const b=await body(req);
   if(p==='/api/example/checkout'){send(res,checkoutUrl(await arcade('checkouts/create',exampleCheckoutInput(b,gallery))));return;}
   if(p==='/api/student/checkout'){const s=member(req,b.id);const c=s.candidates?.find(c=>c.id===s.selected&&c.status==='ready'&&c.productId);if(!c)throw new Problem('完成した商品を選んでください。');c.checkoutRequestId||=randomUUID();save();const result=checkoutUrl(await arcade('checkouts/create',{requestId:c.checkoutRequestId+'-single',dropShip:true,lines:[{productId:c.productId,quantity:1}]}));send(res,result);return;}
   if(p==='/api/students'){
    if(b.roomId!==db.id)throw new Problem('Class not found.',404);
    if(db.students.length>=30)throw new Problem('This class is limited to 30 participants.',409);
    const s={id:randomUUID(),access:randomUUID(),name:`Participant ${db.students.length+1}`,motif:requireText(b.motif,'Motif',100),note:typeof b.note==='string'?b.note.trim().slice(0,250):'',shared:sharedPreference(b.shared),status:'waiting'};db.students.push(s);save();send(res,{id:s.id,access:s.access},201);return;
   }
   if(p==='/api/student/preference'){const s=member(req,b.id);if(s.candidates?.length||s.status==='generating'||s.status==='ready')throw new Problem('Personal preferences are locked after generation starts.',409);const motif=requireText(b.motif,'Motif',100);const shared=sharedPreference(b.shared);s.motif=motif;if(shared)s.shared=shared;s.note=typeof b.note==='string'?b.note.trim().slice(0,250):'';save();send(res,{student:publicStudent(s)});return;}
   if(p==='/api/student/select'){const s=member(req,b.id);const c=s.candidates?.find(c=>c.id===b.candidateId&&c.product&&c.status==='ready');if(!c)throw new Problem('Select a completed product.');s.selected=c.id;save();send(res,{student:publicStudent(s)});return;}
   if(p==='/api/student/generate'){const s=member(req,b.id);generationPermission(b);if(!db.base.patternId||!db.category)throw new Problem('Wait for your teacher to prepare the shared pattern and product.',412);if(s.status==='ready')throw new Problem('Your candidates are already complete.',409);lockTask(s.id,()=>generateStudent(s),error=>{s.status='error';s.error=error;});send(res,{started:true},202);return;}
   teacher(req);
   if(p==='/api/teacher/generate'){
    generationPermission(b);const s=db.students.find(x=>x.id===b.id);if(!s)throw new Problem('参加者が見つかりません。',404);
    if(!db.base.patternId||!db.category)throw new Problem('Wait for your teacher to prepare the shared pattern and product.',412);
    if(s.status==='ready')throw new Problem('Your candidates are already complete.',409);
    lockTask(s.id,()=>generateStudent(s),error=>{s.status='error';s.error=error;});send(res,{started:true},202);return;
   }
   if(p==='/api/category'){if(db.base.patternId||busy.size)throw new Problem('Product specification is locked after generation starts.',409);const cat=await arcade('categories/get',{categoryId:requireText(b.categoryId,'Category ID',128),selections:b.selections||{}});if(cat.world!=='print'||!cat.canManufacture)throw new Problem('Choose a manufacturable print specification.');db.category={categoryId:cat.categoryId,name:cat.name,selections:cat.selections,options:cat.options};save();send(res,{category:db.category});return;}
   if(p==='/api/brief'){
    if(db.base.patternId||busy.size||db.base.jobId)throw new Problem('The brief is locked once generation has started.',409);
    const colors=b.colors;if(!Array.isArray(colors)||colors.length<1||colors.length>5||colors.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw new Problem('Choose one to five hex colors.');
    db.name=requireText(b.name,'Class name',80);db.theme={title:requireText(b.title,'Collection title',100),brief:requireText(b.brief,'Shared theme',350),style:requireText(b.style,'Art direction',200),colors};db.stage=b.lock?'locked':'collecting';save();send(res,snapshot());return;
   }
   if(p==='/api/base/generate'){generationPermission(b);if(!db.category)throw new Problem('Select a real Arcade product specification first.',412);if(db.base.status==='ready')throw new Problem('The shared pattern is already ready.',409);if(db.stage==='collecting')throw new Problem('Confirm the shared brief first.',412);lockTask('base',createBase,error=>{db.base.status='error';db.base.error=error;});send(res,{started:true},202);return;}
   if(p==='/api/demo'){
    if(db.stage!=='collecting')throw new Problem('Add sample preferences before locking the brief.',409);if(db.students.some(s=>s.isDemo))throw new Problem('Sample students are already present.',409);
    if(db.students.length>27)throw new Problem('Not enough room for three samples.',409);
    const samples=[['Alex','cats','Small, understated motifs'],['Jamie','music notes and instruments','Playful but not too busy'],['Riley','stars and constellations','A calm, minimal composition']].map(([name,motif,note])=>({id:randomUUID(),access:randomUUID(),name,motif,note,isDemo:true,status:'waiting'}));db.students.push(...samples);save();send(res,{students:samples.map(s=>({id:s.id,access:s.access}))},201);return;
   }
   if(p==='/api/refresh'){for(const s of db.students){for(const c of s.candidates||[]){if(c.productId){const pr=await arcade('products/get',{productId:c.productId,quantity:1});c.product={productId:pr.productId,title:pr.title,imageUrl:pr.imageUrl,images:pr.images,selections:pr.selections,selectionLabel:pr.selectionLabel,unitPrice:pr.unitPrice,maker:pr.maker};}}}if(db.base.patternId){const pat=await arcade('patterns/get',{patternId:db.base.patternId});db.base.imageUrl=pat.imageUrl;}save();send(res,snapshot());return;}
   throw new Problem('Route not found.',404);
  }
  if(req.method!=='GET')throw new Problem('Method not allowed.',405);
  const assets={'/examples.js':'examples.js','/examples/gallery.json':'examples/gallery.json',...Object.fromEntries(gallery.items.flatMap(x=>[x.photo,x.pattern,x.productImage]).map(x=>[x,x.slice(1)])),'/examples.css':'examples.css','/examples':'examples.html','/examples/class-photo.jpg':'examples/class-photo.jpg','/examples/arcade-decoration.jpg':'examples/arcade-decoration.jpg','/examples/photo-with-arcade-design.jpg':'examples/photo-with-arcade-design.jpg','/':'index.html','/teacher':'index.html','/student':'index.html','/app.js':'app.js','/styles.css':'styles.css','/demo-students.js':'demo-students.js','/shared-preferences.js':'shared-preferences.js'};const file=assets[p];if(!file)throw new Problem('Page not found.',404);
  const type=file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.json')?'application/json':'text/html';
  res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});res.end(readFileSync(path.join(root,'public',file)));
 }catch(e){send(res,{error:clean(e.message)},e.status||500);}
});
server.listen(Number(process.env.PORT||4317),'127.0.0.1',()=>console.log(`Common Thread: http://127.0.0.1:${server.address().port}\nTeacher: /teacher\nStudent: /student\nArcade: ${key&&contact?'configured':'not connected'}; live generation: ${liveAllowed?'authorized in configuration':'locked'}`));
