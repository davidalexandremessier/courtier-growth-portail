import {createHash} from 'node:crypto';
import {CallError,must} from './calls.mjs';
import {STATS_MARKER,sourceActivity,storedSourceFacts,factIdentity} from '../src/source-stats.mjs';
import {importFields,validateStatsImport} from '../src/stats-import.mjs';
import {torontoClock} from '../src/reminders.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
export async function sourceRows(db,clientId){const rows=[];for(let offset=0;;offset+=1000){const chunk=must(await db.from('growth_activities').select('*').eq('client_id',clientId).like('external_ref','stats:%').order('id').range(offset,offset+999));rows.push(...chunk);if(chunk.length<1000)return rows}}
export function sourceFactPayload(record,{origin,retrieved_at,previous=null,userId,batchId}){
 const body=STATS_MARKER+JSON.stringify({type:'fact',origin,retrieved_at,run_id:batchId,record});if(body.length>4000)throw new CallError('Ligne source trop volumineuse.');
 return {client_id:record.client_id,activity_date:record.date,kind:'note',quantity:null,source:'import',external_ref:'stats:fact:'+digest(factIdentity(record))+':'+digest(JSON.stringify([record.value,previous?.id||null])),body,replaces_id:previous?.id||null,created_by:userId};
}
export async function persistSourceFacts(db,client,records,{origin,userId,retrieved_at=new Date().toISOString(),allowCorrections=false,batchId}={}){
 if(!['csv','meta_api','ghl_api'].includes(origin)||!userId)throw new CallError('Provenance ou auteur invalide.');
 if(records.length>10000)throw new CallError('Trop de lignes.');
 let saved=0,duplicates=0,conflicts=0;
 // Refresh before each atomic chunk. UNIQUE(client_id,external_ref) and
 // UNIQUE(replaces_id) reject races; no existing row is ever overwritten.
 for(let offset=0;offset<records.length;offset+=100){
  const rows=await sourceRows(db,client.id),facts=storedSourceFacts(rows,client.id),existing=new Map(facts.map(r=>[factIdentity(r),r])),completed=new Set(rows.map(r=>sourceActivity(r.body)).filter(v=>v?.type==='status'&&v.phase==='success').map(v=>v.run_id)),payload=[];
  for(const record of records.slice(offset,offset+100)){
   if(record.client_id!==client.id||record.account_id!==client[record.provider==='meta'?'meta_ad_account_id':'ghl_location_id'])throw new CallError('Dossier ou compte source différent.',403);
   const key=factIdentity(record),old=existing.get(key);if(old?.value===record.value&&(!allowCorrections||old.origin===origin&&(!old.run_id||completed.has(old.run_id)||old.run_id===batchId))){duplicates++;continue}if(old&&!allowCorrections){conflicts++;continue}
   const previous=old?rows.find(x=>x.id===old.activity_id):null;payload.push(sourceFactPayload(record,{origin,userId,retrieved_at,previous,batchId}));existing.set(key,record);
  }
  if(!payload.length)continue;const inserted=await db.from('growth_activities').insert(payload).select('id');
  if(inserted.error){if(inserted.error.code!=='23505')throw new CallError('Enregistrement des statistiques non confirmé.',503);const latest=storedSourceFacts(await sourceRows(db,client.id),client.id);for(const p of payload){const r=sourceActivity(p.body).record,found=latest.find(x=>factIdentity(x)===factIdentity(r));if(found?.value===r.value)duplicates++;else conflicts++}}else saved+=(inserted.data||[]).length;
 }
 return {saved,duplicates,conflicts,persisted:true};
}
export async function persistCSV(db,client,records,userId){
 const admin=await db.rpc('is_admin');if(admin.error||admin.data!==true)throw new CallError('Accès administrateur requis.',403);
 if(!Array.isArray(records)||!records.length||records.length>10000)throw new CallError('Lignes CSV invalides.');
 const accepted=[];for(const record of records){const parsed={headers:importFields,rows:[importFields.map(k=>String(record[k]??''))]},r=validateStatsImport(parsed,Object.fromEntries(importFields.map(k=>[k,k])),{clientId:client.id,provider:record.provider,accountId:client[record.provider==='meta'?'meta_ad_account_id':'ghl_location_id'],currency:record.currency,timezone:record.timezone,today:torontoClock().day});if(r.rejected.length)throw new CallError('Ligne CSV refusée : '+r.rejected[0].reason);accepted.push(...r.accepted)}
 return persistSourceFacts(db,client,accepted,{origin:'csv',userId});
}
