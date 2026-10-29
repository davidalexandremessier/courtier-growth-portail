import {requireEnabled,recordHealth} from '../server/connection-controls.mjs';
import {authenticate,CallError} from '../server/calls.mjs';
import {resultsStatus,resolveMetaClient,resolveGHLClient,inspectGHL,inspectMeta} from '../server/results.mjs';
import {inspectClientLeadPermissions,storedMetaConnection} from '../server/meta-leads.mjs';
import {probeMetaReadAccess} from '../server/meta-access-diagnostic.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Méthode non permise.'});
  if(req.method==='POST'&&(!process.env.APP_URL||req.headers.origin!==new URL(process.env.APP_URL).origin))throw new CallError('Origine non autorisée.',403);
  const db=await authenticate(req);if(req.method==='GET')return res.status(200).json(resultsStatus());
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!b||JSON.stringify(b).length>2000)throw new CallError('Requête invalide.');
  await requireEnabled(db,b.clientId,b.provider);if(b.action==='meta-lead-capabilities'){if(b.provider!=='meta')throw new CallError('Fournisseur invalide.');return res.status(200).json(await inspectClientLeadPermissions(db,b.clientId))}if(b.action==='meta-read-diagnostic'){if(b.provider!=='meta')throw new CallError('Fournisseur invalide.');return res.status(200).json(await probeMetaReadAccess(await storedMetaConnection(db,b.clientId)))}if(b.action)throw new CallError('Action inconnue.');let result;try{if(b.provider==='ghl')result=await inspectGHL(await resolveGHLClient(db,b.clientId));else if(b.provider==='meta'){result=await inspectMeta(await resolveMetaClient(db,b.clientId));}if(!result)throw new CallError('Fournisseur inconnu.');
  await recordHealth(db,b.clientId,b.provider,true,b.provider==='ghl'?result.locationId:result.account.id);}catch(e){await recordHealth(db,b.clientId,b.provider,false);throw e}
  return res.status(200).json(result);
 }catch(e){return res.status(e instanceof CallError?e.status:400).json({error:e instanceof CallError?e.message:'Vérification impossible. Réessayez.'})}
}
