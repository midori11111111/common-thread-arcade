import {cloudApi} from '../lib/cloud-api.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 try{res.statusCode=200;res.end(JSON.stringify(await cloudApi(req,res)));}
 catch(e){res.statusCode=e.status||500;let message=e.status?e.message:'サーバーの処理を完了できませんでした。少し待って再試行してください。';for(const key of ['ARCADE_API_KEY','BLOB_READ_WRITE_TOKEN','TEACHER_ACCESS_CODE'])if(process.env[key])message=message.replaceAll(process.env[key],'[redacted]');if(!e.status)console.error('Cloud API error',{type:e.constructor.name,message:String(e.message).replaceAll(process.env.ARCADE_API_KEY||'\0','[redacted]').replaceAll(process.env.BLOB_READ_WRITE_TOKEN||'\0','[redacted]').slice(0,200)});res.end(JSON.stringify({error:message}));}
}
