export const CENTRAL_GHL_LOCATION='CONFIGURE_CENTRAL_GHL_LOCATION';
const email=v=>String(v||'').trim().toLowerCase();
const clean=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function instant(v,timeZone){
 if(typeof v!=='string')throw Error('Date et heure requises.');
 if(/(?:Z|[+-]\d\d:\d\d)$/.test(v)){const d=new Date(v);if(!Number.isNaN(+d))return d.toISOString();}
 if(!timeZone||!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(v))throw Error('La date doit préciser son fuseau horaire.');
 const desired=v.replace(' ','T').slice(0,16),guess=Date.parse(desired+'Z'),found=[];
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 // Infer possible timezone offsets around the instant, including a DST transition.
 const offsets=new Set();for(const delta of [-86400000,0,86400000]){const x=guess+delta,p=Object.fromEntries(formatter.formatToParts(new Date(x)).map(p=>[p.type,p.value]));offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`)-x)}
 for(const o of offsets){const x=guess-o,p=Object.fromEntries(formatter.formatToParts(new Date(x)).map(p=>[p.type,p.value]));if(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`===desired)found.push(x)}
 if(found.length!==1)throw Error('Heure ambiguë ou inexistante au changement d’heure : fournissez le décalage UTC.');
 return new Date(found[0]+Number(v.slice(17,19)||0)*1000).toISOString();
}
export function zoomRoom(url){try{const u=new URL(url);if(u.protocol!=='https:'||!/(^|\.)zoom\.(us|com)$/.test(u.hostname))return '';return u.pathname.match(/\/(?:j|wc\/join)\/(\d+)/)?.[1]||''}catch{return ''}}
export function safeLink(v){if(!v)return '';const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password)throw Error('Le lien doit utiliser HTTPS.');for(const k of ['access_token','token','download_access_token'])if(u.searchParams.has(k))throw Error('Ne collez pas de lien contenant un jeton.');return u.href}
export function normalizeSource(v){
 if(!['ghl','zoom','wispr'].includes(v.provider))throw Error('Source invalide.');
 const kind=v.provider==='ghl'?'appointment':'meeting';
 if(!v.external_id||String(v.external_id).length>300||!v.account_id||String(v.account_id).length>200)throw Error('Compte et référence source requis.');
 const start=instant(v.started_at,v.timezone),end=v.ended_at?instant(v.ended_at,v.timezone):null;if(end&&end<start)throw Error('La fin doit suivre le début de l’appel.');
 const emails=[...new Set((v.participant_emails||[]).map(email).filter(Boolean))];if(emails.length>30||emails.some(e=>!/^\S+@\S+\.\S+$/.test(e)))throw Error('Courriel participant invalide.');
 if(String(v.transcript||'').length>600000||String(v.summary||'').length>30000)throw Error('Contenu trop long.');
 return {provider:v.provider,source_kind:kind,account_id:String(v.account_id),external_id:String(v.external_id),title:String(v.title||'Appel').slice(0,300),started_at:start,ended_at:end,participant_emails:emails,participant_name:String(v.participant_name||'').slice(0,200),external_contact_id:String(v.external_contact_id||'').slice(0,200),calendar_event_id:String(v.calendar_event_id||'').slice(0,300),zoom_occurrence_id:String(v.zoom_occurrence_id||'').slice(0,300),conference_url:safeLink(v.conference_url),replay_url:safeLink(v.replay_url),transcript:String(v.transcript||''),summary:String(v.summary||''),source_status:String(v.source_status||'unknown').slice(0,60)};
}
function nearWord(a,b){if(a===b)return true;if(Math.abs(a.length-b.length)>1)return false;for(let i=0;i<Math.max(a.length,b.length);i++)if(a.slice(0,i)+a.slice(i+1)===b||b.slice(0,i)+b.slice(i+1)===a)return true;return a.length===b.length&&[...a].filter((c,i)=>c!==b[i]).length===1;}
export function suggestMatch(meeting,appointments){
 const matches=[];for(const a of appointments){
  if(a.source_kind!=='appointment'||a.account_id!==CENTRAL_GHL_LOCATION||!a.client_id||['cancelled','canceled','invalid'].includes(a.source_status))continue;
  const minutes=Math.abs(Date.parse(a.started_at)-Date.parse(meeting.started_at))/60000;if(!Number.isFinite(minutes)||minutes>30)continue;
  if(meeting.client_id&&meeting.client_id!==a.client_id)continue;
  const ma=meeting.participant_emails||[],aa=a.participant_emails||[],emailMatch=ma.some(e=>aa.includes(e));
  const exactEvent=!!meeting.calendar_event_id&&meeting.calendar_event_id===a.calendar_event_id;
  const exactOccurrence=!!meeting.zoom_occurrence_id&&meeting.zoom_occurrence_id===a.zoom_occurrence_id;
  const sameRoom=!!zoomRoom(meeting.conference_url)&&zoomRoom(meeting.conference_url)===zoomRoom(a.conference_url);
  const name=clean(meeting.participant_name||meeting.title),an=clean(a.participant_name||a.title),words=an.split(' ').filter(w=>w.length>2),nameMatch=words.length>=2&&words.every(w=>name.split(' ').some(n=>nearWord(w,n)));
  const conflictingOccurrence=!!meeting.zoom_occurrence_id&&!!a.zoom_occurrence_id&&meeting.zoom_occurrence_id!==a.zoom_occurrence_id;
  const conflicting=conflictingOccurrence||ma.length>0&&aa.length>0&&!emailMatch;
  const strong=exactOccurrence||exactEvent||(!conflicting&&sameRoom&&minutes<=15)||emailMatch&&minutes<=15;
  if(strong||nameMatch&&minutes<=20)matches.push({appointment_id:a.id,client_id:a.client_id,strong:strong&&!conflicting,reason:conflictingOccurrence?'Occurrences Zoom différentes : vérifier':conflicting?'Identités participantes différentes : vérifier':exactOccurrence?'Même occurrence Zoom et horaire':exactEvent?'Même événement calendrier et horaire':emailMatch?'Même courriel et horaire':sameRoom?'Même lien Zoom et horaire':'Nom et horaire : validation requise'});
 }
 // Any ambiguity (even with weaker evidence) requires human review.
 if(matches.length===1)return {...matches[0],status:matches[0].strong?'auto':'suggested',candidates:matches};
 return {status:matches.length?'ambiguous':'unmatched',reason:matches.length?'Plusieurs rendez-vous possibles':'Aucune correspondance fiable',candidates:matches};
}
