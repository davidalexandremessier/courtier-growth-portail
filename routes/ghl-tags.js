import {createClient} from '@supabase/supabase-js';
import {acceptOfferedSpot,applyClientTag,sprint97Offer,tagForAction} from '../server/ghl-tags.mjs';

function fail(res,status,error){return res.status(status).json({error})}
function originAllowed(req){
 const origin=req.headers?.origin;
 if(!origin)return false;
 if(process.env.APP_URL&&origin===process.env.APP_URL)return true;
 try{return new URL(origin).host===(req.headers.host||req.headers['x-forwarded-host'])}catch{return false}
}
function serviceDb(){
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_ARCHIVE_SECRET_KEY)return null;
 return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ARCHIVE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function syncWaitlist(clientId,action){
 const db=serviceDb();
 if(!db)return {saved:false};
 if(action==='expansion-oui'){
  const offered=await db.from('expansion_waitlist').select('id,client_id,status').eq('client_id',clientId).eq('status','place_offerte');
  if(offered.error)return {saved:false};
  const plan=acceptOfferedSpot(offered.data||[],clientId);
  if(!plan.ok)return {saved:false};
  const updated=await db.from('expansion_waitlist').update({status:'acceptee',updated_at:new Date().toISOString()}).in('id',plan.ids);
  return {saved:!updated.error};
 }
 const open=await db.from('expansion_waitlist').select('id').eq('client_id',clientId).in('status',['en_attente','place_offerte']);
 if(open.error)return {saved:false};
 if(!open.data?.length)return {saved:true};
 const updated=await db.from('expansion_waitlist').update({status:'retiree',updated_at:new Date().toISOString()}).in('id',open.data.map(row=>row.id));
 return {saved:!updated.error};
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return fail(res,405,'Méthode non permise.');
 if(!originAllowed(req))return fail(res,403,'Origine refusée.');
 const token=(req.headers.authorization||'').match(/^Bearer (\S+)$/)?.[1];
 if(!token)return fail(res,401,'Connexion requise.');
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_PUBLISHABLE_KEY)return fail(res,503,'Portail non configuré.');
 try{
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.auth.getUser(token);
  if(error||!data.user)return fail(res,401,'Session expirée.');
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  if(!tagForAction(body.action))return fail(res,400,'Action inconnue.');
  if(typeof body.clientId!=='string'||!body.clientId)return fail(res,400,'Dossier requis.');
  const clientRow=await db.from('clients').select('id,email,offer,name').eq('id',body.clientId).maybeSingle();
  if(clientRow.error||!clientRow.data)return fail(res,403,'Dossier inaccessible.');
  if(!sprint97Offer(clientRow.data.offer))return fail(res,403,'Réservé au Sprint 97 $.');
  let contactId=null;
  const binding=await db.from('client_call_bindings').select('ghl_contact_id').eq('client_id',body.clientId).maybeSingle();
  if(!binding.error)contactId=binding.data?.ghl_contact_id||null;
  if(!contactId){
   const service=serviceDb();
   if(service){
    const hidden=await service.from('client_call_bindings').select('ghl_contact_id').eq('client_id',body.clientId).maybeSingle();
    if(!hidden.error)contactId=hidden.data?.ghl_contact_id||null;
   }
  }
  if(body.action==='expansion-oui'){
   const waitlist=await syncWaitlist(body.clientId,body.action);
   if(!waitlist.saved)return fail(res,409,'Aucune place offerte à accepter.');
   const tagged=await applyClientTag({action:body.action,client:clientRow.data,contactId});
   return res.status(200).json({...tagged,waitlist});
  }
  const tagged=await applyClientTag({action:body.action,client:clientRow.data,contactId});
  const waitlist=body.action==='expansion-retire'?await syncWaitlist(body.clientId,body.action):null;
  return res.status(200).json({...tagged,waitlist});
 }catch(error){
  return fail(res,error.status||500,error.status?error.message:'Marquage impossible. Réessayez.');
 }
}
