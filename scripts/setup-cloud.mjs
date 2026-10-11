import {existsSync,writeFileSync,chmodSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
process.loadEnvFile('.env.local');
const adminFile='.env.cloud-admin.local';
if(!existsSync(adminFile))writeFileSync(adminFile,`TEACHER_ACCESS_CODE=${randomBytes(24).toString('base64url')}\n`,{mode:0o600});
chmodSync(adminFile,0o600);process.loadEnvFile(adminFile);
for(const name of ['ARCADE_API_KEY','ARCADE_CONTACT','ARCADE_ALLOW_GENERATION','TEACHER_ACCESS_CODE']){
 const value=process.env[name];if(!value)throw Error(`${name} is missing`);
 const result=spawnSync('npx',['--yes','vercel@latest','env','add',name,'production','--yes'],{input:value,encoding:'utf8'});
 if(result.status!==0)throw Error(`Could not configure ${name}: ${result.stderr.replaceAll(value,'[redacted]')}`);
 console.log(`Configured ${name} (value hidden)`);
}
const {initializeClass}=await import('../lib/cloud-store.mjs');
const created=await initializeClass({id:randomUUID(),name:'クラスのおそろいグッズ',stage:'collecting',theme:{title:'みんなのおそろい、それぞれの好み',brief:'みんなから集まった希望をもとに、共通のデザインを決めます。',style:'シンプルな手描き風。個人のモチーフを追加できる余白を残す。',colors:['#213F63','#EFE6D4']},students:[],category:null,base:{requestId:randomUUID(),status:'idle'},createdAt:new Date().toISOString()});
console.log(created?'Initialized a new private classroom':'Kept existing classroom');
