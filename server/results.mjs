import {requireClientCapability} from './offer-access.mjs';
import {CallError,must} from './calls.mjs';
import {metaFailure} from './meta-error.mjs';
import {torontoClock} from '../src/reminders.mjs';
import {instant} from '../src/call-matching.mjs';
import {shiftDay} from '../src/kpi.mjs';
import {connectionRow,connectionToken} from './oauth.mjs';
export const LEAD_SOURCES=['Facebook','fb','Lead vendeur - 5 erreurs baisse prix'];
export const DISCOVERY_CALENDARS=['Appel Découverte','Rendez-vous - Plan de Match'];
export const PILOT={clientId:'',locationId:'',adAccountId:''};
export const GHL_ACCOUNTS=[]; // Private legacy mappings intentionally excluded.
export async function resolveGHLClient(db,clientId){await requireClientCapability(db,clientId,'crm_client');const c=must(await db.from('clients').select('id,name,ghl_location_id').eq('id',clientId).single());const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();if(process.env.OAUTH_STORAGE_READY==='true'){const row=await connectionRow(db,clientId,'ghl');if(row){if(row.account_id!==c.ghl_location_id)throw new CallError('Le compte CRM a changé : reconnectez le dossier.',409);const legacy=GHL_ACCOUNTS.find(a=>a.locationId===row.account_id);return {oauth:true,locationId:row.account_id,accessToken:await connectionToken(db,row),leadSources:row.settings?.leadSources?.length?row.settings.leadSources:legacy?.leadSources||[],calendarNames:row.settings?.calendarNames?.length?row.settings.calendarNames:legacy?.calendarNames||[]}}}const account=GHL_ACCOUNTS.find(a=>a.locationId===c.ghl_location_id&&(a.clientId?c.id===a.clientId:normalize(c.name)===normalize(a.name)));if(!account)throw new CallError('Aucune connexion GHL/Ava autorisée pour ce dossier et ce sous-compte.',409);return account;}
export function resultsStatus(){return {ghl:false,meta:false,pilotClientId:null}}
async function read(url,headers,options={}){
 let res;try{res=await fetch(url,{...options,headers,redirect:'error',signal:AbortSignal.timeout(15000)})}catch{throw new CallError('Lecture fournisseur indisponible. Réessayez plus tard.',502)}
 if(!res.ok){const u=new URL(url),meta=u.hostname==='graph.facebook.com',endpoint=u.pathname.endsWith('/insights')?'insights':'ad-account',status=meta?await metaFailure(res,endpoint):'HTTP '+res.status;throw new CallError('Lecture refusée par '+(meta?'Meta':'GHL')+' ('+status+'). Vérifiez les droits de lecture.',502)}
 return res.json();
}
export async function assertPilot(db,clientId){
 if(!PILOT.clientId||clientId!==PILOT.clientId)throw new CallError('Connexion pilote non configurée dans cette archive partageable.',409);
 const c=must(await db.from('clients').select('id,ghl_location_id,meta_ad_account_id').eq('id',clientId).single());
 if(c.ghl_location_id!==PILOT.locationId||c.meta_ad_account_id!==PILOT.adAccountId)throw new CallError('Les identifiants du dossier ne correspondent pas aux comptes autorisés.',409);
}
export function contactOverview(contacts,from,to){
 const unique=[...new Map(contacts.map(c=>[c.id,c])).values()];
 const days={},sources={};
 for(const c of unique){if(!c.id||!c.dateAdded||!Number.isFinite(Date.parse(c.dateAdded)))continue;const day=torontoClock(new Date(c.dateAdded)).day;if(day<from||day>to)continue;
 const source=String(c.source||'Non renseignée').slice(0,200);days[day]=(days[day]||0)+1;sources[source]=(sources[source]||0)+1;
 }
 return {count:Object.values(days).reduce((a,b)=>a+b,0),days,sources:Object.entries(sources).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count)};
}
export function discoveryDays(events,from,to,now=new Date()){
 const days={};for(let d=from;d<=to;d=shiftDay(d,1))days[d]={due:new Set(),show:new Set(),unknown:false};
 const unique=[...new Map(events.map(e=>[e.id,e])).values()];
 for(const e of unique){
  if(!e.id)throw new CallError('Rendez-vous GHL sans référence : vérification requise.',502);
  let when;try{when=instant(e.startTime,'America/Toronto')}catch{throw new CallError('Horaire GHL invalide : aucun chiffre de présence proposé.',502)}
  const day=torontoClock(new Date(when)).day;if(!days[day]||Date.parse(when)>+now)continue;
  const s=String(e.appointmentStatus||e.status||'').toLowerCase(),d=days[day];
  // Current cancelled status does not prove cancellation happened before the appointment.
  if(['cancelled','canceled','invalid'].includes(s)){d.unknown=true;continue}
  const key=e.contactId||e.id;d.due.add(key);if(s==='showed')d.show.add(key);else if(!['noshow','no_show'].includes(s))d.unknown=true;
 }
 return Object.entries(days).map(([day,d])=>({day,appointments_due:d.unknown?null:d.due.size,attended:d.unknown?null:d.show.size,review:d.unknown||day===torontoClock(now).day}));
}
export async function inspectGHL(account=GHL_ACCOUNTS[0]){
 const {locationId,tokenEnv,leadSources,calendarNames}=account;const accessToken=account.accessToken||process.env[tokenEnv];
 if(!accessToken)throw new CallError('Accès GHL prospects à autoriser.',409);
 const headers={Authorization:'Bearer '+accessToken,Version:'2021-07-28',Accept:'application/json'};
 const get=(path,params)=>{const u=new URL('https://services.leadconnectorhq.com'+path);u.search=new URLSearchParams(params);return read(u,headers)};
 const contacts=[];const pages=new Set();
 for(let page=1;page<=20;page++){
  const r=await read('https://services.leadconnectorhq.com/contacts/search',{...headers,'Content-Type':'application/json'},{method:'POST',body:JSON.stringify({locationId:locationId,page,pageLimit:500,sort:[{field:'dateAdded',direction:'desc'}]})});
  if(!Array.isArray(r.contacts))throw new CallError('Réponse contacts GHL inattendue.',502);
  for(const c of r.contacts)if(c.locationId&&c.locationId!==locationId)throw new CallError('Contact provenant d’un autre sous-compte : lecture arrêtée.',502);
  const signature=JSON.stringify(r.contacts.map(c=>c.id));if(r.contacts.length&&pages.has(signature))throw new CallError('Pagination GHL répétée : lecture arrêtée.',502);pages.add(signature);
  contacts.push(...r.contacts);
  if(r.contacts.length<500)break;
  if(page===20)throw new CallError('Plus de 10 000 contacts : réduisez la période avant de calculer. Aucun chiffre partiel utilisé.',409);
 }
 const [cal,pipes]=await Promise.all([get('/calendars/',{locationId:locationId}),get('/opportunities/pipelines',{locationId:locationId})]);
 if(!Array.isArray(cal.calendars)||!Array.isArray(pipes.pipelines))throw new CallError('Catalogues GHL incomplets.',502);
 const to=torontoClock().day,from=new Date(Date.parse(to+'T12:00:00Z')-29*86400000).toISOString().slice(0,10);
 const selected=calendarNames.map(name=>{const found=cal.calendars.filter(c=>c.name===name);if(found.length!==1)throw new CallError('Calendrier « '+name+' » absent ou ambigu : vérifiez la correspondance.',409);return found[0]});
 const events=[];
 for(const c of selected){const r=await get('/calendars/events',{locationId:locationId,calendarId:c.id,startTime:String(Date.parse(instant(from+'T00:00','America/Toronto'))),endTime:String(Date.parse(instant(shiftDay(to,1)+'T00:00','America/Toronto'))-1)});if(!Array.isArray(r.events)||r.events.length>=1000||r.nextPage||r.meta?.nextPageUrl)throw new CallError('Liste des rendez-vous incomplète : présence à vérifier.',409);if(r.events.some(e=>(e.locationId&&e.locationId!==locationId)||(e.calendarId&&e.calendarId!==c.id)))throw new CallError('Rendez-vous provenant d’un autre compte ou calendrier.',502);events.push(...r.events)}
 const qualified=contactOverview(contacts.filter(c=>leadSources.includes(c.source)),from,to),presence=discoveryDays(events,from,to);
 const configurationPending=!leadSources.length||!calendarNames.length;
 const days=configurationPending?[]:presence.map(d=>({day:d.day,leads:d.day===to?null:qualified.days[d.day]||0,appointments_due:d.review?null:d.appointments_due,attended:d.review?null:d.attended,review:d.review}));
 return {provider:'ghl',canConfigure:!!account.oauth,verifiedAt:new Date().toISOString(),locationId:locationId,from,to,contacts:contactOverview(contacts,from,to),configurationPending,qualifiedLeads:leadSources.length?qualified.count:null,leadSources,discoveryCalendars:calendarNames,days,calendars:cal.calendars.map(c=>({id:c.id,name:c.name})),pipelines:pipes.pipelines.map(p=>({id:p.id,name:p.name,stages:(p.stages||[]).map(s=>({id:s.id,name:s.name}))}))};
}
export async function inspectMeta(account={adAccountId:PILOT.adAccountId,accessToken:process.env.META_LEGACY_A_TOKEN}){
 if(!account.accessToken)throw new CallError('Accès Meta à autoriser.',409);
 const headers={Authorization:'Bearer '+account.accessToken},base='https://graph.facebook.com/v24.0/act_'+account.adAccountId;
 const metaAccount=await read(base+'?fields=id,name,currency,timezone_name',headers);
 if(metaAccount.id!=='act_'+account.adAccountId)throw new CallError('Compte publicitaire inattendu.',502);
 const to=torontoClock().day,from=new Date(Date.parse(to+'T12:00:00Z')-29*86400000).toISOString().slice(0,10);
 const u=new URL(base+'/insights');u.search=new URLSearchParams({fields:'date_start,date_stop,spend,impressions,clicks,actions',time_range:JSON.stringify({since:from,until:to}),time_increment:'1',level:'account',limit:'100'});
 const r=await read(u,headers);if(!Array.isArray(r.data)||r.paging?.next)throw new CallError('Rapport Meta incomplet. Aucun chiffre partiel utilisé.',502);
 const days=r.data.map(d=>({day:d.date_start,spend:Number(d.spend),impressions:Number(d.impressions),clicks:Number(d.clicks),actions:(d.actions||[]).map(a=>({type:a.action_type,count:Number(a.value)}))}));
 if(days.some(d=>!Number.isFinite(d.spend)||d.spend<0))throw new CallError('Dépenses Meta invalides.',502);
 return {provider:'meta',verifiedAt:new Date().toISOString(),account:{id:account.adAccountId,name:metaAccount.name,currency:metaAccount.currency,timezone:metaAccount.timezone_name},from,to,days};
}

export async function resolveMetaClient(db,clientId){if(process.env.OAUTH_STORAGE_READY==='true'){const row=await connectionRow(db,clientId,'meta');if(row){const c=must(await db.from('clients').select('meta_ad_account_id').eq('id',clientId).single());if(c.meta_ad_account_id!==row.account_id)throw new CallError('Compte publicitaire modifié : reconnectez le dossier.',409);return {adAccountId:row.account_id,accessToken:await connectionToken(db,row)}}}await assertPilot(db,clientId);return {adAccountId:PILOT.adAccountId,accessToken:process.env.META_LEGACY_A_TOKEN}}
