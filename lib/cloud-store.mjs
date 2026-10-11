import {get,put,BlobPreconditionFailedError,BlobServiceRateLimited,BlobRequestAbortedError,BlobServiceNotAvailable} from '@vercel/blob';
const pathname=process.env.CLASS_BLOB_PATH||'common-thread/classroom.json';
const opts=()=>({access:'private',...(process.env.BLOB_READ_WRITE_TOKEN?{token:process.env.BLOB_READ_WRITE_TOKEN}:{})});
export async function readClass(){
 const result=await get(pathname,{...opts(),useCache:false});
 if(!result)throw Object.assign(Error('公開クラスの準備ができていません。'),{status:503});
 // Private CDN reads may use a weak ETag for compression; storage writes use the same strong hash.
 return {db:await new Response(result.stream).json(),etag:result.blob.etag.replace(/^W\//,'')};
}
export async function mutateClass(change){
 for(let attempt=0;attempt<15;attempt++){
  try{
   const {db,etag}=await readClass();const result=change(db);
   await put(pathname,JSON.stringify(db),{...opts(),contentType:'application/json',addRandomSuffix:false,allowOverwrite:true,ifMatch:etag});return result;
  }catch(e){
   const conflictingWrite=e.constructor?.name==='BlobError'&&/conditional request cannot succeed due to a conflicting operation/i.test(e.message||'');
   const retry=conflictingWrite||e instanceof BlobPreconditionFailedError||e instanceof BlobServiceRateLimited||e instanceof BlobRequestAbortedError||e instanceof BlobServiceNotAvailable;
   if(!retry)throw e;
   if(attempt===14)throw Object.assign(Error('回答が集中しています。少し待って再送してください。'),{status:409});
   await new Promise(r=>setTimeout(r,Math.min(3000,250*(attempt+1))+Math.random()*500));
  }
 }
}
export async function initializeClass(db){
 const existing=await get(pathname,{...opts(),useCache:false});if(existing)return false;
 await put(pathname,JSON.stringify(db),{...opts(),contentType:'application/json',addRandomSuffix:false,allowOverwrite:false});return true;
}
