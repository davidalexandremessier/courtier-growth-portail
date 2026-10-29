import {importKey,sourceMetrics} from './stats-import.mjs';
import {activeActivities} from './production.mjs';
export const STATS_MARKER='CG_SOURCE_STATS_V1\n';
export function sourceActivity(body){try{if(!String(body||'').startsWith(STATS_MARKER))return null;const value=JSON.parse(body.slice(STATS_MARKER.length));return ['fact','status'].includes(value.type)?value:null}catch{return null}}
export function storedSourceFacts(activities,clientId){
 const rows=activeActivities(activities.filter(a=>a.client_id===clientId)).sort((a,b)=>Date.parse(a.created_at||0)-Date.parse(b.created_at||0));const facts=new Map();
 for(const a of rows){const v=sourceActivity(a.body);if(v?.type==='fact'&&v.record?.client_id===clientId)facts.set(importKey(v.record),{...v.record,origin:v.origin,retrieved_at:v.retrieved_at,run_id:v.run_id,activity_id:a.id})}
 return [...facts.values()];
}
export function storedSourceStatus(activities,clientId,provider,accountId){return activeActivities(activities.filter(a=>a.client_id===clientId)).map(a=>({value:sourceActivity(a.body),created_at:a.created_at})).filter(x=>x.value?.type==='status'&&x.value.provider===provider&&x.value.account_id===accountId).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).map(x=>x.value)}
export function factIdentity(record){return importKey(record)}
export function normalizeProviderSnapshot(snapshot,client){
 const provider=snapshot.provider,meta=provider==='meta';if(!sourceMetrics[provider])throw Error('Source inconnue.');
 const account=meta?snapshot.account?.id:snapshot.locationId,expected=meta?client.meta_ad_account_id:client.ghl_location_id;
 if(!account||account!==expected)throw Error('Compte fournisseur différent du dossier.');
 const currency=meta?snapshot.account.currency:'CAD',timezone=meta?snapshot.account.timezone:'America/Toronto';
 if(!['CAD','USD'].includes(currency)||!timezone)throw Error('Devise ou fuseau source non pris en charge.');
 const records=[];
 for(const day of snapshot.days||[]){const leadActions=meta?(day.actions||[]).filter(a=>a.type==='lead'):[];if(leadActions.length>1)throw Error('Action lead Meta répétée : correspondance à vérifier.');const values=meta?{spend:day.spend,impressions:day.impressions,clicks:day.clicks,meta_leads:leadActions[0]?.count}:{ghl_leads:day.leads,appointments_due:day.appointments_due,attended:day.attended};
  for(const [metric,value] of Object.entries(values)){if(value==null)continue;if(!Number.isFinite(value)||value<0||metric!=='spend'&&!Number.isInteger(value))throw Error('Métrique fournisseur invalide.');
   records.push({client_id:client.id,provider,account_id:account,object_id:meta?'account_daily':'configured_sources_and_calendars_daily',date:day.day,metric,value,currency,timezone,channel:meta?'paid':'configured_ghl_sources',cohort:'activity_period'});
  }
 }
 // Only the exact declared Meta action "lead" is used, never a sum of actions.
 // GHL does not infer responses, bookings, pitches or sales from current stages.
 return {records,account_id:account,currency,timezone,provider,from:snapshot.from,to:snapshot.to,retrieved_at:snapshot.verifiedAt};
}
export function sourceView(activities,client,provider,now=Date.now()){
 const accountId=client[provider==='meta'?'meta_ad_account_id':'ghl_location_id'];
 const statuses=storedSourceStatus(activities,client.id,provider,accountId),success=statuses.find(s=>s.phase==='success'),latest=statuses[0];
 const completed=new Set(statuses.filter(s=>s.phase==='success').map(s=>s.run_id).filter(Boolean));
 const visible=activities.filter(a=>{const v=sourceActivity(a.body);return v?.type!=='fact'||v.origin==='csv'||completed.has(v.run_id)});
 const records=storedSourceFacts(visible,client.id).filter(r=>r.provider===provider&&r.account_id===accountId);
 const stale=!success||!Number.isFinite(Date.parse(success.retrieved_at))||now-Date.parse(success.retrieved_at)>86400000;
 return {provider,accountId,records,success,latest,stale,state:latest?.phase==='error'?'error':latest?.phase==='pending'?'pending':stale?'stale':'ready'};
}
