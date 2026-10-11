import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
process.loadEnvFile('.env.local');
const prior=JSON.parse(readFileSync('.data/photo-example-job.json'));
const file='.data/photo-gallery-jobs.json';
const styles=[{id:'playful',name:'猫と星',description:'好きなモチーフを、写真のまわりに。',colors:['#224B3D','#F7F2E7','#923849'],patternId:prior.patternId},{id:'botanical',name:'草花',description:'落ち着いた緑と、小さな草花。',colors:['#395F50','#F4EEDF','#B9AA86'],prompt:'Airy elegant watercolor botanical pattern of tiny wildflowers, olive leaves, delicate stems and soft ivory petals on warm cream. Use reference only for green and cream color atmosphere. A sophisticated wedding keepsake companion design. No people, faces, photograph, letters, text or product mockup.'},{id:'celebration',name:'紙吹雪',description:'明るい色で、お祝いらしく。',colors:['#D98872','#F6E8C9','#5A7983'],prompt:'Joyful refined illustrated pattern of small confetti dots, ribbon bows, tiny stars and hand-drawn wavy lines. Warm terracotta, soft cream and muted blue. Airy balanced spacing, keepsake for a celebration. Reference for celebratory group mood only. No people, faces, photographs, letters, text or product mockup.'}];
const jobs=existsSync(file)?JSON.parse(readFileSync(file)):styles.map(s=>({...s,patternRequestId:randomUUID(),productRequestId:randomUUID()}));
const save=()=>writeFileSync(file,JSON.stringify(jobs,null,2),{mode:0o600});save();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function api(endpoint,body){for(let i=0;i<30;i++){const r=await fetch('https://platform.arcade.ai/v1/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+process.env.ARCADE_API_KEY,'Content-Type':'application/json','User-Agent':`common-thread/0.4 (${process.env.ARCADE_CONTACT})`},body:JSON.stringify(body),signal:AbortSignal.timeout(65000)});const d=await r.json();if(r.ok)return d;if(r.status===409&&/still being processed|still starting/i.test(d.message||d.error?.message||'')){await wait(4000);continue;}throw Error(`Arcade ${r.status}: ${d.message||'request failed'}`);}throw Error('Resume script to continue existing job');}
async function poll(id){for(let i=0;i<120;i++){const j=await api('jobs/get',{jobId:id});if(j.status==='failed')throw Error(j.error?.message||'Generation failed');if(j.status==='succeeded')return j.result;await wait(3000);}throw Error('Job still processing; resume script');}
const category=JSON.parse(readFileSync('.data/class.json')).category;
// Refresh the actual manufacturable specification instead of assuming availability.
const spec=await api('categories/get',{categoryId:category.categoryId,selections:category.selections});if(!spec.canManufacture)throw Error('Selected scarf is unavailable');
await Promise.all(jobs.map(async s=>{
 if(!s.patternId){if(!s.jobId){s.jobId=(await api('patterns/create',{requestId:s.patternRequestId,referenceIds:[prior.referenceId],prompt:s.prompt,colors:s.colors})).jobId;save();console.log(s.id+': generation started');}s.patternId=(await poll(s.jobId)).patternId;save();}
 const p=await api('patterns/get',{patternId:s.patternId});const bytes=Buffer.from(await (await fetch(p.imageUrl)).arrayBuffer());
 await sharp(bytes).resize(1000,1000,{fit:'cover'}).jpeg({quality:90}).toFile(`public/examples/${s.id}-pattern.jpg`);
 const photo=await sharp(readFileSync('public/examples/class-photo.jpg')).resize(1600,1067).toBuffer();
 const frame=await sharp(bytes).resize(2000,1600,{fit:'cover'}).toBuffer();
 const title=Buffer.from(`<svg width="2000" height="1600"><rect x="175" y="175" width="1650" height="1117" fill="white"/><rect x="520" y="1350" width="960" height="145" fill="${s.colors[1]}"/><text x="1000" y="1438" text-anchor="middle" font-family="Arial" font-size="54" fill="${s.colors[0]}" letter-spacing="5">OUR MEMORIES · 2026</text></svg>`);
 await sharp(frame).composite([{input:title},{input:photo,left:200,top:200}]).jpeg({quality:90}).toFile(`public/examples/${s.id}-photo.jpg`);
 if(!s.productId){if(!s.productJobId){s.productJobId=(await api('products/create',{requestId:s.productRequestId,patternId:s.patternId,categoryId:spec.categoryId,selections:spec.selections,fit:{mode:'fill'}})).jobId;save();}s.productId=(await poll(s.productJobId)).productId;save();}
 const product=await api('products/get',{productId:s.productId,quantity:1});
 const image=Buffer.from(await (await fetch(product.imageUrl)).arrayBuffer());await sharp(image).resize(1000,1000,{fit:'contain',background:'#f8f7f4'}).jpeg({quality:90}).toFile(`public/examples/${s.id}-product.jpg`);
 s.product={productId:product.productId,title:product.title,unitPrice:product.unitPrice,selectionLabel:product.selectionLabel,selections:product.selections};save();console.log(s.id+': actual product ready');
}));
writeFileSync('public/examples/gallery.json',JSON.stringify({items:jobs.map(({id,name,description,patternId,product})=>({id,name,description,patternId,photo:`/examples/${id}-photo.jpg`,pattern:`/examples/${id}-pattern.jpg`,productImage:`/examples/${id}-product.jpg`,product})),source:'https://www.pexels.com/photo/high-school-students-group-photo-outdoors-32292152/',license:'https://www.pexels.com/license/'},null,2));
console.log('Gallery ready');
