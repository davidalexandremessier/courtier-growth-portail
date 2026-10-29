import {CallError} from './calls.mjs';
import {metaDiagnostic} from './meta-error.mjs';

const graph='https://graph.facebook.com/v24.0/';
const permissions=['ads_read','leads_retrieval','pages_show_list'];
const statuses=new Set(['granted','declined','expired']);

// Independent, read-only probes: a refusal on one edge must not hide the other.
// Return only allowlisted fields; never return provider messages, account data or tokens.
export async function probeMetaReadAccess({adAccountId,accessToken,fetcher=fetch}){
 if(typeof adAccountId!=='string'||!/^\d{1,40}$/.test(adAccountId)||typeof accessToken!=='string'||!accessToken)throw new CallError('Connexion Meta du dossier invalide.',409);
 async function probe(path,endpoint,validate){
  const url=new URL(path,graph);
  let response;try{response=await fetcher(url,{method:'GET',headers:{Authorization:'Bearer '+accessToken},redirect:'error',signal:AbortSignal.timeout(15000)})}catch{return {state:'unavailable',endpoint}}
  if(!response.ok){
   const {httpStatus,code,subcode,category,missingPermission,version}=await metaDiagnostic(response,endpoint);
   return {state:'rejected',diagnostic:{httpStatus,code,subcode,category,missingPermission,endpoint,version}};
  }
  try{return validate(await response.json())}catch{return {state:'invalid_response',endpoint}}
 }
 const rights=await probe('me/permissions','me/permissions',body=>{
  if(!Array.isArray(body?.data)||body.paging?.next||body.data.some(p=>typeof p?.permission!=='string'||!statuses.has(p.status)))throw Error('invalid');
  return {state:'ok',endpoint:'me/permissions',permissions:Object.fromEntries(permissions.map(name=>[name,body.data.find(p=>p.permission===name)?.status||'not_returned']))};
 });
 const account=await probe('act_'+adAccountId+'?fields=id','ad-account',body=>{
  if(body?.id!=='act_'+adAccountId)throw Error('invalid');
  return {state:'ok',endpoint:'ad-account'};
 });
 return {provider:'meta',checked_at:new Date().toISOString(),read_only:true,permissions:rights,account};
}
