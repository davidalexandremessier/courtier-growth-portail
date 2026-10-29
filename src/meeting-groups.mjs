// Conservative Zoom/Wispr pairing. A recurring room or a title alone is never enough.
const emails=(s,ignored)=>new Set((s.participant_emails||[]).map(x=>String(x).trim().toLowerCase()).filter(x=>x&&!ignored.has(x)));
export const WEAK='Même horaire (à confirmer)';
const norm=v=>String(v||'').normalize('NFD').replace(/[^a-zA-Z0-9 ]/g,' ').toLowerCase().replace(/\s+/g,' ').trim();
export function suggestClient(sources,clients=[]){const hits=new Set();for(const s of sources){if(s.provider!=='zoom')continue;const t=norm(s.title);for(const c of clients){const n=norm(c.name);if(n.length>=5&&(t===n||t.startsWith(n+' ')||t.endsWith(' '+n)||t.includes(' '+n+' ')))hits.add(c.id)}}return hits.size===1?[...hits][0]:null}
function evidence(a,b,ignored){
 const minutes=Math.abs(Date.parse(a.started_at)-Date.parse(b.started_at))/60000;if(!Number.isFinite(minutes)||minutes>15)return null;
 if(a.client_id&&b.client_id&&a.client_id!==b.client_id)return null;
 // Provider occurrence identifiers outrank a shared attendee or nearby time.
 if(a.zoom_occurrence_id&&b.zoom_occurrence_id&&a.zoom_occurrence_id!==b.zoom_occurrence_id)return null;
 const ae=emails(a,ignored),be=emails(b,ignored),shared=[...ae].some(e=>be.has(e));if(ae.size&&be.size&&!shared)return null;
 if(a.zoom_occurrence_id&&a.zoom_occurrence_id===b.zoom_occurrence_id)return 'Même occurrence Zoom et horaire';
 if(a.calendar_event_id&&a.calendar_event_id===b.calendar_event_id)return 'Même événement calendrier et horaire';
 if(shared&&minutes<=10)return 'Même participant hors administrateur et horaire';
 // Horaire seul : jumelage proposé, jamais attribution automatique.
 if(!(a.participant_emails||[]).length&&!(b.participant_emails||[]).length&&minutes<=5)return WEAK;
 return null;
}
export function groupMeetingSources(sources,{accounts={},ignoredEmails=[],clients:dossiers=[]}={}){
 const ignored=new Set(ignoredEmails.map(x=>String(x).trim().toLowerCase()));
 const rows=sources.filter(s=>['zoom','wispr'].includes(s.provider)&&s.source_kind==='meeting'&&s.match_status!=='ignored');
 const candidates=new Map(rows.map(s=>[s.id,[]]));
 for(const a of rows.filter(s=>s.provider==='zoom'))for(const b of rows.filter(s=>s.provider==='wispr')){
  if(!accounts.zoom||!accounts.wispr||a.account_id!==accounts.zoom||b.account_id!==accounts.wispr)continue;
  const reason=evidence(a,b,ignored);if(reason){candidates.get(a.id).push({source:b,reason});candidates.get(b.id).push({source:a,reason})}
 }
 const used=new Set(),groups=[];
 for(const a of rows){if(used.has(a.id))continue;const options=candidates.get(a.id),pair=options.length===1&&candidates.get(options[0].source.id).length===1?options[0]:null;
  const members=pair?[a,pair.source]:[a];members.forEach(s=>used.add(s.id));members.sort((a,b)=>a.provider.localeCompare(b.provider)||a.id.localeCompare(b.id));
  const clients=[...new Set(members.filter(s=>['manual','auto'].includes(s.match_status)).map(s=>s.client_id).filter(Boolean))];
  const clientId=clients.length===1?clients[0]:null;
  groups.push({id:members.map(s=>s.id).sort().join(':'),sources:members,clientId,suggestedClientId:clientId?null:suggestClient(members,dossiers),weak:pair?.reason===WEAK,status:!clientId?'À associer':pair?'Brouillon à relire':'Source complémentaire à vérifier',reason:pair?.reason||(options.length?'Correspondances multiples : vérification manuelle':'Aucune deuxième source confirmée'),published:false});
 }
 return groups;
}
export function combinedTranscript(group){return group.sources.map(s=>`SOURCE ${s.provider.toUpperCase()} — ${s.external_id}\n${s.transcript||'[Transcription indisponible]'}`).join('\n\n--- DEUX SOURCES DE LA MÊME RENCONTRE; NE PAS COMPTER LES ÉVÉNEMENTS EN DOUBLE ---\n\n')}

export function meetingEvidence(group){return group.sources.map(s=>`SOURCE ${s.provider.toUpperCase()} — ${s.external_id}\nTRANSCRIPTION ORIGINALE\n${s.transcript||'[Indisponible]'}\nRÉSUMÉ NATIF (à confronter à la transcription)\n${s.summary||'[Indisponible]'}`).join('\n\n--- SOURCES COMPLÉMENTAIRES DE LA MÊME RENCONTRE ---\n\n')}
