import {meetingQueue} from '../server/meeting-queue.mjs';
import {agencyStore} from '../server/agency-oauth-store.mjs';
import {importMeetingDrafts} from '../server/meeting-import-pipeline.mjs';
import {requireEnabled,recordHealth} from '../server/connection-controls.mjs';
import {summarizeRecord,getZoomSummary} from '../server/summaries.mjs';
import {authenticate,providerStatus,importSources,reconcile,associate,syncGHL,syncZoom,CallError,must} from '../server/calls.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Méthode non permise.'});
 if(req.method==='POST'&&(!process.env.APP_URL||req.headers.origin!==new URL(process.env.APP_URL).origin))throw new CallError('Origine non autorisée.',403);
 const db=await authenticate(req);
 if(req.method==='GET'){if(new URL(req.url,'https://portal.invalid').searchParams.get('view')==='drafts'){const {data:{user}}=await db.auth.getUser();const accounts={};if(process.env.AGENCY_OAUTH_STORAGE_READY==='true'){const store=agencyStore({id:user.id,admin:true});for(const p of ['zoom','wispr']){const row=await store.get(p);if(row?.confirmed)accounts[p]=p==='zoom'?row.identity?.accountId:row.identity?.id}}return res.status(200).json({groups:await meetingQueue(db,{accounts,ignoredEmails:[user.email].filter(Boolean)})})}return res.status(200).json({providers:providerStatus()})}
 const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
 if(!body||JSON.stringify(body).length>220000)throw new CallError('Requête trop volumineuse.');
 const tracked={'sync-ghl':'coaching','sync-zoom':'zoom'}[body.action];if(tracked)await requireEnabled(db,body.clientId,tracked);
 let result;try{
 switch(body.action){
 case'zoom-summary':result=await getZoomSummary(db,body);break;
 case'summarize':result=await summarizeRecord(db,body);break;
 case'associate-group':{if(process.env.TEXT_ONLY_DRAFTS_READY!=='true')throw new CallError('Association de brouillons non activée.',503);const anchor=must(await db.rpc('associate_meeting_group',{p_sources:body.sourceIds,p_client:body.clientId}));result={coachingId:must(await db.rpc('prepare_call_coaching_text',{source_id:anchor}))};break;}
 case'import-drafts':result=await importMeetingDrafts(db,body.items);break;
 case'import':result=await importSources(db,body.items);await reconcile(db);break;
 case'reconcile':result=await reconcile(db);break;
 case'associate':result=await associate(db,body);break;
 case'prepare':result={coachingId:must(await db.rpc('prepare_call_coaching',{source_id:body.sourceId}))};break;
 case'sync-ghl':result=await syncGHL(db,body.clientId);break;
 case'sync-zoom':result=await syncZoom(db);break;
 default:throw new CallError('Action inconnue.');
 }
 if(tracked)await recordHealth(db,body.clientId,tracked,true);
 }catch(e){if(tracked)await recordHealth(db,body.clientId,tracked,false);throw e}
 return res.status(200).json(result);
 }catch(e){return res.status(e instanceof CallError?e.status:400).json({error:e instanceof CallError?e.message:'Opération impossible. Vérifiez les champs et réessayez.'})}
}
