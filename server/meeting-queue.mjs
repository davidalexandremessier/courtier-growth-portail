import {groupMeetingSources} from '../src/meeting-groups.mjs';import {CallError,must} from './calls.mjs';
export async function meetingQueue(db,{accounts={},ignoredEmails=[]}={}){
 if(must(await db.rpc('is_admin'))!==true)throw new CallError('Accès administrateur requis.',403);
 const rows=must(await db.from('call_sources').select('id,provider,account_id,external_id,source_kind,started_at,title,client_id,match_status,participant_emails,calendar_event_id,zoom_occurrence_id,conference_url,transcript,summary,linked_appointment_id').in('provider',['zoom','wispr']).order('started_at',{ascending:false}).limit(501));
 if(rows.length>500)throw new CallError('Plus de 500 sources : filtre de période requis avant rapprochement.',409);
 const clients=must(await db.from('clients').select('id,name'));if(!accounts.zoom&&process.env.ZOOM_ACCOUNT_ID)accounts={...accounts,zoom:process.env.ZOOM_ACCOUNT_ID};
 const coachings=must(await db.from('coachings').select('id,source_anchor_id,published').not('source_anchor_id','is',null));
 return groupMeetingSources(rows,{accounts,ignoredEmails,clients}).map(g=>({...g,reason:g.suggestedClientId?g.reason+' · client suggéré : '+(clients.find(c=>c.id===g.suggestedClientId)?.name||'')+' (d’après le titre Zoom, à confirmer)':g.reason,existingCoachings:coachings.filter(c=>g.sources.some(s=>c.source_anchor_id===(s.linked_appointment_id||s.id)))}));
}
