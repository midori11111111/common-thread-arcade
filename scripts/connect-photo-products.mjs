import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
process.loadEnvFile('.env.local');
const stateFile='.data/photo-product-set.json';
const original=JSON.parse(fs.readFileSync('.data/photo-product-proof.json'));
const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):{celebration:{patternId:original.patternId,productId:original.productId}};
const save=()=>{const latest=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):{};fs.writeFileSync(stateFile,JSON.stringify({...state,...latest,...(id?{[id]:state[id]}:{})},null,2),{mode:0o600});};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function api(endpoint,body){for(let n=0;n<15;n++){let r;try{r=await fetch('https://platform.arcade.ai/v1/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+process.env.ARCADE_API_KEY,'Content-Type':'application/json','User-Agent':`common-thread/0.5 (${process.env.ARCADE_CONTACT})`},body:JSON.stringify(body),signal:AbortSignal.timeout(65000)});}catch{await wait(3000);continue;}const d=await r.json();if(r.ok)return d;if(r.status===429||r.status===409){await wait(10000);continue;}throw Error(`Arcade ${r.status}: ${d.message||'failed'}`);}throw Error('Resume existing job');}
const id=process.argv[2];
if(id){
 if(!['playful','botanical'].includes(id))throw Error('Unknown design');
 if(!state[id]){const list=await api('patterns/list',{limit:24});const p=process.env.UPLOADED_IMAGE_ID?list.items.find(x=>JSON.stringify(x).includes(process.env.UPLOADED_IMAGE_ID)):list.items[0];if(!p?.patternId||Object.values(state).some(s=>s.patternId===p.patternId))throw Error('Upload a new composite before registering it');state[id]={patternId:p.patternId,requestId:randomUUID()};save();console.log(id+': uploaded pattern registered '+p.patternId);}
 const s=state[id];
 if(!s.productId){if(!s.jobId){const local=JSON.parse(fs.readFileSync('.data/class.json'));const category=await api('categories/get',{categoryId:local.category.categoryId,selections:local.category.selections});if(!category.canManufacture)throw Error('Unavailable specification');const j=await api('products/create',{requestId:s.requestId,patternId:s.patternId,categoryId:category.categoryId,selections:category.selections,fit:{mode:'fill'}});s.jobId=j.jobId;save();console.log(id+': product build started');}
 for(let i=0;i<120;i++){const j=await api('jobs/get',{jobId:s.jobId});if(j.status==='failed')throw Error(j.error?.message||'Build failed');if(j.status==='succeeded'){s.productId=j.result.productId;save();break;}await wait(3000);}if(!s.productId)throw Error('Resume running job');}
 console.log(id+': product ready');
}
if(process.argv.includes('--publish-data')){
 const gallery=JSON.parse(fs.readFileSync('public/examples/gallery.json'));
 for(const item of gallery.items){const s=state[item.id];if(!s?.productId)throw Error(item.id+' is not ready');const product=await api('products/get',{productId:s.productId,quantity:1});item.patternId=s.patternId;item.product={productId:product.productId,title:product.title,unitPrice:product.unitPrice,selections:product.selections,selectionLabel:product.selectionLabel};item.includesPhoto=true;item.productImage=`/examples/${item.id}-photo-product.jpg`;const image=Buffer.from(await (await fetch(product.imageUrl)).arrayBuffer());await sharp(image).resize(1000,1000,{fit:'contain',background:'#f8f7f4'}).jpeg({quality:92}).toFile('public'+item.productImage);}
 fs.writeFileSync('public/examples/gallery.json',JSON.stringify(gallery,null,2));console.log('All 3 photo products connected');
}
