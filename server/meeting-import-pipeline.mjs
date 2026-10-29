import {meetingQueue} from './meeting-queue.mjs';
import {importSources,reconcile,CallError} from './calls.mjs';import {prepareImportedDrafts} from './meeting-drafts.mjs';
export async function importMeetingDrafts(db,items,{enabled=process.env.TEXT_ONLY_DRAFTS_READY==='true',importer=importSources,matcher=reconcile,preparer=prepareImportedDrafts,accounts={},ignoredEmails=[],queue=meetingQueue}={}){
 const role=await db.rpc('is_admin');if(role.error||role.data!==true)throw new CallError('Accès administrateur requis.',403);
 if(!enabled)throw new CallError('Import en brouillon non activé : validation SQL requise.',503);
 const imported=await importer(db,items,{refresh:true});await matcher(db);
 const reviewRequired=[],deferred=new Set();
 if(!accounts.zoom&&process.env.ZOOM_ACCOUNT_ID)accounts={...accounts,zoom:process.env.ZOOM_ACCOUNT_ID};
 if(accounts.zoom&&accounts.wispr){const groups=await queue(db,{accounts,ignoredEmails});for(const g of groups){if(g.sources.length===2&&g.existingCoachings.length&&g.sources.some(s=>imported.ids.includes(s.id))){for(const s of g.sources)if(imported.ids.includes(s.id)){deferred.add(s.id);reviewRequired.push(s.id)}continue;}if(g.sources.length===2&&g.clientId&&!g.weak&&!g.existingCoachings.length&&g.sources.some(s=>imported.ids.includes(s.id))){const r=await db.rpc('associate_meeting_group',{p_sources:g.sources.map(s=>s.id),p_client:g.clientId,p_method:'auto'});if(r.error)throw new CallError('Association concurrente à relire; sources conservées.',409)}}}
 const result=await preparer(db,imported.ids.filter(id=>!deferred.has(id)),{textOnly:true});return {imported:imported.count,...result,reviewRequired,published:0};
}
