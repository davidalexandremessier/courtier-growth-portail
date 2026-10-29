import {readNativeZoomSummary} from './zoom-text.mjs';
import {createClient} from '@supabase/supabase-js';
import {normalizeSource,suggestMatch,CENTRAL_GHL_LOCATION} from '../src/call-matching.mjs';
export class CallError extends Error{constructor(message,status=400){super(message);this.status=status}}
export const must=({data,error})=>{if(error)throw new CallError('Enregistrement impossible. Réessayez ou vérifiez la configuration du portail.',500);return data};
export async function authenticate(req){
 const token=(req.headers.authorization||'').match(/^Bearer (\S+)$/)?.[1];if(!token)throw new CallError('Connexion requise.',401);
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_PUBLISHABLE_KEY)throw new CallError('Portail non configuré.',503);
 const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(token);if(error||!data.user)throw new CallError('Session expirée.',401);
 const {data:admin,error:roleError}=await db.rpc('is_admin');if(roleError||admin!==true)throw new CallError('Accès administrateur requis.',403);return db;
}
export function providerStatus(){return {summaries:{configured:!!process.env.OPENAI_API_KEY},ghl:{configured:!!process.env.GHL_CENTRAL_TOKEN,label:'GHL Courtier Growth',locationId:CENTRAL_GHL_LOCATION},zoom:{configured:['ZOOM_ACCOUNT_ID','ZOOM_CLIENT_ID','ZOOM_CLIENT_SECRET','ZOOM_HOST_ID'].every(k=>!!process.env[k]),label:'Zoom central'},wispr:{configured:false,label:'Wispr : import de transcription disponible',mode:'import'}}}
async function jsonFetch(url,options={}){let response;try{response=await fetch(url,{...options,signal:AbortSignal.timeout(15000),redirect:'error'})}catch{throw new CallError('Le fournisseur ne répond pas. Réessayez plus tard.',502)}if(!response.ok){let code='';try{const detail=await response.json();if(Number.isInteger(detail.code))code=', code '+detail.code;else if(['invalid_client','invalid_grant','invalid_request','unsupported_grant_type','invalid_scope'].includes(detail.error))code=', '+detail.error}catch{}const provider=new URL(url).hostname.includes('zoom.us')?'Zoom':'GHL';throw new CallError((response.status===401||response.status===403?'Autorisation fournisseur refusée : vérifiez les droits du compte.':response.status===429?'Limite du fournisseur atteinte. Réessayez plus tard.':'Lecture fournisseur impossible.')+' ('+provider+', HTTP '+response.status+code+')',502);}return response.json()}
export async function importSources(db,items,{refresh=false}={}){
 if(!Array.isArray(items)||!items.length||items.length>100)throw new CallError('Importez entre 1 et 100 éléments.');
 let normalized;try{normalized=items.map(normalizeSource)}catch(e){throw new CallError('Source à vérifier : '+e.message)}const saved=[];
 // Duplicate provider deliveries must never erase operator decisions or manual content edits.
 for(const item of normalized){const old=must(await db.from('call_sources').select('*').eq('provider',item.provider).eq('account_id',item.account_id).eq('external_id',item.external_id).eq('source_kind',item.source_kind).maybeSingle());
 if(old){if(refresh){const {transcript,summary,...metadata}=item;if(!metadata.participant_emails.length&&old.participant_emails?.length)delete metadata.participant_emails;if(!metadata.participant_name&&old.participant_name)delete metadata.participant_name;const changed=Date.parse(old.started_at)!==Date.parse(item.started_at);must(await db.from('call_sources').update({...metadata,...(!old.transcript&&transcript?{transcript}:{}),...(!old.summary&&summary?{summary}:{}),updated_at:new Date().toISOString(),...(changed?{match_status:'suggested',match_reason:'Horaire modifié par le fournisseur : vérifier le rattachement'}:{})}).eq('id',old.id));if(changed&&old.source_kind==='appointment')must(await db.from('call_sources').update({match_status:'suggested',match_reason:'Horaire du rendez-vous modifié : vérifier le rattachement'}).eq('linked_appointment_id',old.id).eq('match_status','auto'));}saved.push(old.id);continue}
 const row=must(await db.from('call_sources').upsert(item,{onConflict:'provider,account_id,external_id,source_kind',ignoreDuplicates:true}).select('id'));
 if(row.length)saved.push(row[0].id);
 else {
  // A concurrent delivery may have inserted the same provider identity after
  // our first read. Keep its ID so the caller can still prepare its draft.
  const concurrent=must(await db.from('call_sources').select('id').eq('provider',item.provider).eq('account_id',item.account_id).eq('external_id',item.external_id).eq('source_kind',item.source_kind).maybeSingle());
  if(!concurrent?.id)throw new CallError('Import concurrent non confirmé. Réessayez.',409);
  saved.push(concurrent.id);
 }
 }
 return {count:saved.length,ids:saved};
}
export async function reconcile(db){
 const sources=must(await db.from('call_sources').select('id,source_kind,account_id,client_id,linked_appointment_id,match_status,external_contact_id,participant_emails,calendar_event_id,zoom_occurrence_id,conference_url,participant_name,title,started_at,source_status').order('started_at',{ascending:false}).limit(501));
 if(sources.length>500)throw new CallError('Plus de 500 éléments : limitez les imports avant de rapprocher.');
 const bindings=must(await db.from('client_call_bindings').select('*'));const appointments=sources.filter(s=>s.source_kind==='appointment');let linked=0;
 for(const a of appointments){if(a.match_status==='manual'||a.match_status==='ignored')continue;const b=bindings.filter(b=>b.ghl_contact_id&&b.ghl_contact_id===a.external_contact_id&&a.account_id===CENTRAL_GHL_LOCATION);
 if(b.length===1){a.client_id=b[0].client_id;a.participant_emails=[...new Set([...a.participant_emails,...b[0].participant_emails])];must(await db.from('call_sources').update({client_id:a.client_id,participant_emails:a.participant_emails,match_status:'auto',match_reason:'Contact GHL central explicitement associé au dossier'}).eq('id',a.id));}}
 for(const m of sources.filter(s=>s.source_kind==='meeting'&&!['manual','auto','ignored'].includes(s.match_status))){const match=suggestMatch(m,appointments),auto=match.status==='auto';must(await db.from('call_sources').update({client_id:auto?match.client_id:null,linked_appointment_id:auto?match.appointment_id:null,match_status:match.status,match_reason:match.reason}).eq('id',m.id));if(auto)linked++}
 return {linked};
}
export async function associate(db,{sourceId,clientId,anchorId}){
 const s=must(await db.from('call_sources').select('*').eq('id',sourceId).single());const client=must(await db.from('clients').select('id').eq('id',clientId).single());
 const used=must(await db.from('coachings').select('id').eq('source_anchor_id',s.linked_appointment_id||s.id).limit(1));if(used.length)throw new CallError('Ce groupe possède déjà un coaching. Modifiez le coaching existant; l’association ne peut plus être déplacée.');
 if(anchorId){if(anchorId===s.id||s.source_kind!=='meeting')throw new CallError('Association invalide.');const a=must(await db.from('call_sources').select('*').eq('id',anchorId).single());if(a.client_id!==client.id||!['auto','manual'].includes(a.match_status)||a.linked_appointment_id)throw new CallError('Choisissez un rendez-vous ou un appel déjà validé de ce dossier.');}
 must(await db.from('call_sources').update({client_id:client.id,linked_appointment_id:anchorId||null,match_status:'manual',match_reason:'Association confirmée par l’administration'}).eq('id',s.id));return {associated:true};
}
export async function syncGHL(db,clientId){
 if(!providerStatus().ghl.configured)throw new CallError('Connexion GHL à autoriser : jeton serveur du sous-compte Courtier Growth manquant.',409);
 const b=must(await db.from('client_call_bindings').select('*').eq('client_id',clientId).single());if(!b.ghl_contact_id)throw new CallError('Associez d’abord la fiche contact du GHL Courtier Growth.');
 const headers={Authorization:'Bearer '+process.env.GHL_CENTRAL_TOKEN,Version:'2021-07-28',Accept:'application/json'};
 const contactResponse=await jsonFetch('https://services.leadconnectorhq.com/contacts/'+encodeURIComponent(b.ghl_contact_id),{headers});
 const c=contactResponse.contact;if(c?.locationId!==CENTRAL_GHL_LOCATION)throw new CallError('Cette fiche contact n’appartient pas au sous-compte Courtier Growth.');
 const response=await jsonFetch('https://services.leadconnectorhq.com/contacts/'+encodeURIComponent(b.ghl_contact_id)+'/appointments',{headers});
 if(!Array.isArray(response.events)||response.events.length>100)throw new CallError('Réponse GHL trop volumineuse ou inattendue. Aucun import effectué.');
 const items=response.events.map(e=>({provider:'ghl',account_id:CENTRAL_GHL_LOCATION,external_id:e.id,external_contact_id:c.id,title:e.title||'Coaching',participant_name:[c.firstName,c.lastName].filter(Boolean).join(' ')||c.name||'',participant_emails:c.email?[c.email]:[],started_at:e.startTime,ended_at:e.endTime,timezone:process.env.GHL_CENTRAL_TIMEZONE||'America/Toronto',calendar_event_id:e.id,conference_url:typeof e.address==='string'&&e.address.startsWith('https://')?e.address:'',source_status:e.appointmentStatus||e.status||'unknown'}));
 if(!items.length)return {count:0};const imported=await importSources(db,items,{refresh:true});await reconcile(db);return imported;
}
export async function zoomAccessToken(){
 if(!providerStatus().zoom.configured)throw new CallError('Connexion Zoom à autoriser : compte, application et hôte serveur requis.',409);
 const auth=Buffer.from(process.env.ZOOM_CLIENT_ID+':'+process.env.ZOOM_CLIENT_SECRET).toString('base64');
 const response=await jsonFetch('https://zoom.us/oauth/token',{method:'POST',headers:{Authorization:'Basic '+auth,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'account_credentials',account_id:process.env.ZOOM_ACCOUNT_ID})});
 if(!response.access_token)throw new CallError('Autorisation Zoom incomplète.',502);
 return response.access_token;
}
export async function syncZoom(db,{reconcileSources=true}={}){
 const token=await zoomAccessToken();
 const headers={Authorization:'Bearer '+token},today=new Date().toISOString().slice(0,10),from=new Date(Date.now()-14*86400000).toISOString().slice(0,10);
 const url=new URL('https://api.zoom.us/v2/users/'+encodeURIComponent(process.env.ZOOM_HOST_ID)+'/recordings');url.search=new URLSearchParams({from,to:today,page_size:'100'});
 const list=await jsonFetch(url,{headers});if(list.next_page_token)throw new CallError('Plus de 100 réunions sur 14 jours. Aucun import partiel : réduisez la période dans la configuration.');
 if(!Array.isArray(list.meetings))throw new CallError('Réponse Zoom inattendue.',502);
 const items=[],warnings=[];let archived=0,withTranscript=0,withSummary=0;
 for(const m of list.meetings){try{let transcript='',summary='';const encoded=encodeURIComponent(m.uuid);const meetingPath=(m.uuid.startsWith('/')||m.uuid.includes('//'))?encodeURIComponent(encoded):encoded;
 let participantResult={participants:[]};try{participantResult=await jsonFetch('https://api.zoom.us/v2/past_meetings/'+meetingPath+'/participants?page_size=300',{headers});if(participantResult.next_page_token){participantResult={participants:[]};warnings.push('Participants incomplets pour une réunion : rattachement manuel requis.')}}catch{warnings.push('Participants indisponibles pour une réunion : rattachement manuel requis.')}
 const participants=(participantResult.participants||[]).filter(p=>p.id!==m.host_id&&p.user_id!==m.host_id);
 const emails=[...new Set(participants.map(p=>p.user_email).filter(e=>e&&/^\S+@\S+\.\S+$/.test(e)))];
const file=m.recording_files?.find(f=>f.recording_type==='audio_transcript'&&f.status==='completed');
 if(file?.download_url){const u=new URL(file.download_url);if(u.protocol!=='https:'||!/(^|\.)zoom\.(us|com)$/.test(u.hostname)||u.username||u.password)throw new CallError('URL de transcription Zoom non autorisée.',502);
 let res;let download=u;for(let hop=0;hop<4;hop++){try{res=await fetch(download,{headers,redirect:'manual',signal:AbortSignal.timeout(15000)})}catch{throw new CallError('Téléchargement de transcription Zoom indisponible.',502)}if(![301,302,303,307,308].includes(res.status))break;const next=new URL(res.headers.get('location')||'',download);if(next.protocol!=='https:'||!/(^|\.)zoom\.(us|com)$/.test(next.hostname)||next.username||next.password)throw new CallError('Redirection de transcription hors des domaines Zoom : import manuel requis.',502);download=next;}if(!res.ok)throw new CallError('Transcription Zoom temporairement inaccessible.',502);
 if(Number(res.headers.get('content-length'))>600000)throw new CallError('Transcription trop volumineuse. Utilisez un import manuel.');
 // Bound download while reading; never buffer an arbitrary provider file.
 const reader=res.body.getReader();const decoder=new TextDecoder();let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>600000)throw new CallError('Transcription trop volumineuse.');transcript+=decoder.decode(value,{stream:true})}}finally{await reader.cancel()}transcript+=decoder.decode();}
 const old=must(await db.from('call_sources').select('summary').eq('provider','zoom').eq('account_id',process.env.ZOOM_ACCOUNT_ID).eq('external_id',m.uuid).eq('source_kind','meeting').maybeSingle());if(!old?.summary){try{summary=await readNativeZoomSummary(token,m.uuid)}catch{warnings.push('Un résumé Zoom reste indisponible; sa transcription est conservée si disponible.')}}
 items.push({provider:'zoom',account_id:process.env.ZOOM_ACCOUNT_ID,external_id:m.uuid,zoom_occurrence_id:m.uuid,participant_emails:emails,participant_name:participants.map(p=>p.name).filter(Boolean).join(', '),title:m.topic,started_at:m.start_time,ended_at:new Date(Date.parse(m.start_time)+Number(m.duration||0)*60000).toISOString(),conference_url:m.id?'https://zoom.us/j/'+m.id:'',replay_url:m.share_url||'',transcript,summary});const saved=await importSources(db,[items.pop()],{refresh:true});archived+=saved.count;if(transcript)withTranscript++;if(summary||old?.summary)withSummary++;}catch(e){warnings.push(e instanceof CallError?e.message:'Une réunion n’a pas pu être importée. Réessayez.')}}
 if(reconcileSources&&archived)await reconcile(db);if(list.meetings.length&&!archived)throw new CallError('Aucune réunion n’a pu être conservée. Réessayez ou importez les transcriptions manuellement.',502);return {count:archived,withTranscript,withSummary,warnings:[...new Set(warnings)]};
}
