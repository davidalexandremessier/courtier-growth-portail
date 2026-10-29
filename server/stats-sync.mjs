import {createHash} from 'node:crypto';
import {CallError} from './calls.mjs';
import {inspectMeta,inspectGHL,resolveMetaClient,resolveGHLClient} from './results.mjs';
import {requireEnabled,recordHealth} from './connection-controls.mjs';
import {sourceRows,persistSourceFacts} from './source-stats.mjs';
import {STATS_MARKER,normalizeProviderSnapshot} from '../src/source-stats.mjs';
import {hasCapability} from '../src/entitlements.mjs';
import {torontoClock} from '../src/reminders.mjs';
const ref=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function synchronizeClientStats(userDB,sourceDB,client,userId,{now=new Date(),readMeta=inspectMeta,readGHL=inspectGHL,mode='portal_open',resolveMeta=resolveMetaClient,resolveGHL=resolveGHLClient}={}){
 const results=[];
 for(const provider of ['meta','ghl']){
  const accountId=client[provider==='meta'?'meta_ad_account_id':'ghl_location_id'];if(!accountId||provider==='ghl'&&!hasCapability(client.offer,'crm_client'))continue;
  const run=ref([client.id,provider,accountId,Math.floor(+now/1800000)]),base={client_id:client.id,activity_date:torontoClock(now).day,kind:'note',quantity:null,source:'import',created_by:userId};
  // A durable per-account 30-minute lease uses an existing unique constraint.
  // No cron impersonation and no service-role write to the activity journal.
  const pending=await userDB.from('growth_activities').insert({...base,external_ref:'stats:run:'+run,body:STATS_MARKER+JSON.stringify({type:'status',provider,account_id:accountId,phase:'pending',retrieved_at:now.toISOString(),mode})}).select('id');
  if(pending.error){if(pending.error.code==='23505'){results.push({provider,state:'cached'});continue}throw new CallError('État de synchronisation non enregistré.',503)}
  try{
   await requireEnabled(sourceDB,client.id,provider);
   if(provider==='ghl'&&process.env.OAUTH_STORAGE_READY==='true'){
    const row=await sourceDB.from('oauth_connections').select('expires_at').eq('client_id',client.id).eq('provider','ghl').maybeSingle();
    if(row.error)throw new CallError('Connexion GHL à vérifier.',503);
    // This lot does not mint or refresh a token. Existing access must be valid.
    if(row.data&&Date.parse(row.data.expires_at)<=+now+120000)throw new CallError('Accès GHL expiré : renouvellement de la connexion requis, sans ressaisie des chiffres.',409);
   }
   const snapshot=provider==='meta'?await readMeta(await resolveMeta(sourceDB,client.id)):await readGHL(await resolveGHL(sourceDB,client.id));
   const normalized=normalizeProviderSnapshot(snapshot,client);
   const stored=await persistSourceFacts(userDB,client,normalized.records,{origin:provider+'_api',userId,retrieved_at:snapshot.verifiedAt,allowCorrections:true,batchId:run});
   if(stored.conflicts)throw new CallError('Mise à jour concurrente : certains chiffres restent à vérifier.',409);
   const status={...normalized,records:undefined,type:'status',phase:'success',mode,run_id:run};
   const done=await userDB.from('growth_activities').insert({...base,external_ref:'stats:done:'+run,body:STATS_MARKER+JSON.stringify(status)}).select('id');if(done.error)throw new CallError('Statistiques reçues, confirmation à réessayer.',503);
   await recordHealth(sourceDB,client.id,provider,true,accountId);results.push({provider,state:'success',...stored});
  }catch(e){
   const message=e instanceof CallError?e.message:'Lecture fournisseur indisponible. Dernières données conservées.';
   const failed=await userDB.from('growth_activities').insert({...base,external_ref:'stats:error:'+run,body:STATS_MARKER+JSON.stringify({type:'status',provider,account_id:accountId,phase:'error',retrieved_at:new Date().toISOString(),message,mode})}).select('id');
   results.push({provider,state:'error',message,statusPersisted:!failed.error});
  }
 }
 return {mode,scheduled:mode==='background',results};
}
