import {CallError} from './calls.mjs';
import {zoomSummaryText} from './zoom-text.mjs';
const encoded=id=>id.startsWith('/')||id.includes('//')?encodeURIComponent(encodeURIComponent(id)):encodeURIComponent(id);
export async function readZoomUserMeetings({accessToken,hostId,accountId,from,to,discoverSummaries=process.env.ZOOM_SUMMARY_DISCOVERY_READY==='true',fetcher=fetch}){
 if(!hostId||!accountId||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||to<from||Date.parse(to)-Date.parse(from)>31*86400000)throw new CallError('Période Zoom invalide (31 jours maximum).');
 const headers={Authorization:'Bearer '+accessToken};
 const get=async url=>{const r=await fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new CallError('Lecture Zoom refusée ou indisponible.',502);return r.json()};
 async function list(path,key,params){const rows=[],seen=new Set();let cursor='';
  for(let page=0;page<5;page++){const u=new URL('https://api.zoom.us/v2/'+path);u.search=new URLSearchParams({...params,page_size:'100',...(cursor?{next_page_token:cursor}:{})});const r=await get(u.href);
   if(!Array.isArray(r[key]))throw new CallError('Liste Zoom invalide.',502);rows.push(...r[key]);if(rows.length>100)throw new CallError('Plus de 100 rencontres : réduisez la période.');
   if(!r.next_page_token)return rows;if(seen.has(r.next_page_token))throw new CallError('Pagination Zoom répétée.',502);seen.add(r.next_page_token);cursor=r.next_page_token;
  }throw new CallError('Liste Zoom incomplète.',502);
 }
 const discoveryWarnings=[],meetingsById=new Map();
 const discoveries=await Promise.allSettled([list('users/me/recordings','meetings',{from,to}),...(discoverSummaries?[list('users/me/meeting_summaries','summaries',{from:from+'T00:00:00Z',to:to+'T23:59:59Z',time_filter_field:'summary_start_time'})]:[])]);
 if(discoveries.every(r=>r.status==='rejected'))throw discoveries[0].reason;
 for(const [index,result] of discoveries.entries()){
  if(result.status==='rejected'){discoveryWarnings.push({source:index?'summaries':'recordings',reason:'Liste indisponible ou incomplète; vérifiez les droits et réessayez. Import partiel.'});continue;}
  for(const raw of result.value){const m=index?{uuid:raw.meeting_uuid,host_id:raw.meeting_host_id,id:raw.meeting_id,topic:raw.meeting_topic,start_time:raw.meeting_start_time,end_time:raw.meeting_end_time}:raw;
   if(m.host_id!==hostId||typeof m.uuid!=='string'||!m.uuid)continue;
   if(!meetingsById.has(m.uuid))meetingsById.set(m.uuid,m);
  }
 }
 const meetings=[...meetingsById.values()];if(meetings.length>100)throw new CallError('Plus de 100 rencontres : réduisez la période.');
 const items=[],retry=[];
 for(const m of meetings){try{
  if(m.host_id!==hostId||typeof m.uuid!=='string'||!m.uuid)throw Error('host');
  const path=encoded(m.uuid);let transcript='',summary='';
  try{const t=await get('https://api.zoom.us/v2/meetings/'+path+'/transcript');
  if(t.host_id!==hostId||t.can_download!==true||!t.download_url)throw Error('not ready');
  const u=new URL(t.download_url);if(u.protocol!=='https:'||!/(^|\.)zoom\.(us|com)$/.test(u.hostname)||u.username||u.password)throw Error('domain');
  const r=await fetcher(u.href,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok||Number(r.headers.get('content-length'))>600000)throw Error('download');
  const reader=r.body.getReader(),decoder=new TextDecoder();let size=0;try{for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>600000)throw Error('size');transcript+=decoder.decode(x.value,{stream:true})}transcript+=decoder.decode()}finally{await reader.cancel()}
  if(!transcript.trim())throw Error('empty');}catch{transcript=''}
  try{const data=await get('https://api.zoom.us/v2/meetings/'+path+'/meeting_summary');if(data.meeting_uuid!==m.uuid)throw Error('summary occurrence');if(data.host_id&&data.host_id!==hostId)throw Error('summary host');summary=zoomSummaryText(data)}catch{summary=''}
  if(!transcript&&!summary)throw Error('no content');
  let emails=[];
  try{const p=await get('https://api.zoom.us/v2/past_meetings/'+path+'/participants?page_size=300');if(!p.next_page_token)emails=[...new Set((p.participants||[]).filter(x=>x.id!==hostId&&x.user_id!==hostId).map(x=>x.user_email).filter(x=>typeof x==='string'&&/^\S+@\S+\.\S+$/.test(x)))]}catch{}
  items.push({provider:'zoom',account_id:accountId,external_id:m.uuid,zoom_occurrence_id:m.uuid,participant_emails:emails,participant_name:'',title:m.topic||'Rencontre Zoom',started_at:m.start_time,ended_at:m.end_time||new Date(Date.parse(m.start_time)+Number(m.duration||0)*60000).toISOString(),transcript,summary,replay_url:'',conference_url:m.id?'https://zoom.us/j/'+m.id:''});
 }catch{retry.push({externalId:typeof m.uuid==='string'?m.uuid:null,reason:'Aucune transcription ni résumé disponible, ou identité non confirmée; réessayer ou importer manuellement.'})}}
 return {items,retry,discoveryWarnings};
}
