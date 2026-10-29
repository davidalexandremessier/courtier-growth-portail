import {discoverWisprTools} from '../server/wispr-mcp.mjs';
import {readWisprMeetings} from '../server/wispr-import.mjs';
import {readZoomUserMeetings} from '../server/zoom-user-import.mjs';
import {importMeetingDrafts} from '../server/meeting-import-pipeline.mjs';
import {oauthSession} from '../server/meta-client-access.mjs';
import {agencyStore} from '../server/agency-oauth-store.mjs';
import {beginAdminOAuth,finishAdminOAuth,refreshAdminOAuth} from '../server/admin-oauth.mjs';
import {seal,unseal} from '../server/oauth.mjs';import {CallError} from '../server/calls.mjs';
const cookie=v=>'__Host-cg_agency='+v+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+(v?'600':'0');
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 const url=new URL(req.url,'https://portal.invalid'),provider=url.searchParams.get('callback');
 try{
 if(!['GET','POST'].includes(req.method))throw new CallError('Méthode refusée.',405);
 if(req.method==='POST'&&req.headers.origin!==new URL(process.env.APP_URL).origin)throw new CallError('Origine refusée.',403);
 if(provider){
  if(req.method!=='GET'||!['zoom','wispr'].includes(provider))throw new CallError('Retour invalide.');
  const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-cg_agency='))?.slice(17);
  const saved=unseal(raw,'agency-http');res.setHeader('Set-Cookie',cookie(''));
  const session=await oauthSession({headers:{authorization:'Bearer '+saved.token}}),store=agencyStore(session.actor);
  if(url.searchParams.has('error'))throw new CallError('Connexion annulée.',409);
  await finishAdminOAuth({actor:session.actor,provider,state:url.searchParams.get('state'),code:url.searchParams.get('code'),cookie:saved.flow,store});
  res.statusCode=303;res.setHeader('Location','/?agency_oauth='+provider);return res.end();
 }
 const session=await oauthSession(req),store=agencyStore(session.actor);
 if(req.method==='GET'){const connections=[];for(const p of ['zoom','wispr']){const r=await store.get(p);if(r)connections.push({provider:p,identity:r.identity,confirmed:r.confirmed,expiresAt:r.expires_at,revision:r.revision,importVerified:false})}return res.status(200).json({connections})}
 const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};if(!['zoom','wispr'].includes(b.provider))throw new CallError('Fournisseur inconnu.');
 if(b.action==='start'){const f=await beginAdminOAuth({actor:session.actor,provider:b.provider,store});const value=seal({token:req.headers.authorization.slice(7),flow:f.cookie},'agency-http');if(value.length>3600)throw new CallError('Session trop volumineuse. Reconnectez-vous.',409);res.setHeader('Set-Cookie',cookie(value));return res.status(200).json({url:f.url})}
 if(b.action==='import'&&b.provider==='zoom'){if(process.env.TEXT_ONLY_DRAFTS_READY!=='true')throw new CallError('Import en brouillon non activé.',503);const token=await refreshAdminOAuth({actor:session.actor,provider:'zoom',store}),row=await store.get('zoom');const batch=await readZoomUserMeetings({accessToken:token,hostId:row.identity.id,accountId:row.identity.accountId,from:b.from,to:b.to});const imported=batch.items.length?await importMeetingDrafts(session.db,batch.items,{accounts:{zoom:row.identity.accountId,wispr:((x)=>x?.confirmed?x.identity?.id:null)(await store.get('wispr'))},ignoredEmails:[row.identity.label]}):{imported:0,published:0};return res.status(200).json({...imported,sourceRetry:batch.retry,discoveryWarnings:batch.discoveryWarnings})}
 if(b.action==='import'&&b.provider==='wispr'){if(process.env.TEXT_ONLY_DRAFTS_READY!=='true'||process.env.WISPR_IMPORT_READY!=='true')throw new CallError('Import Wispr non activé.',503);const token=await refreshAdminOAuth({actor:session.actor,provider:'wispr',store}),row=await store.get('wispr'),zoom=await store.get('zoom');const batch=await readWisprMeetings({actor:session.actor,accessToken:token,accountId:row.identity.id,since:b.from,until:b.to,excludeEmails:[zoom?.identity?.label].filter(Boolean)});const imported=batch.sources.length?await importMeetingDrafts(session.db,batch.sources,{accounts:{wispr:row.identity.id,zoom:zoom?.confirmed?zoom.identity?.accountId:null},ignoredEmails:[zoom?.identity?.label].filter(Boolean)}):{imported:0,published:0};return res.status(200).json({...imported,errors:batch.errors,partial:batch.partial})}
 if(b.action==='catalogue'&&b.provider==='wispr'){const token=await refreshAdminOAuth({actor:session.actor,provider:'wispr',store});return res.status(200).json(await discoverWisprTools({actor:session.actor,confirmed:true,accessToken:token}))}
 if(b.action==='confirm'){if(!Number.isInteger(b.revision))throw new CallError('Version requise.');await store.confirm(b.provider,b.revision);return res.status(200).json({confirmed:true,importVerified:false})}
 if(b.action==='disconnect'){await store.disconnect(b.provider);return res.status(200).json({disconnectedLocally:true,providerGrantRevoked:false})}
 throw new CallError('Action inconnue.');
 }catch(e){if(provider){res.setHeader('Set-Cookie',cookie(''));res.statusCode=303;res.setHeader('Location','/?agency_error='+encodeURIComponent(e instanceof CallError?e.message:'Connexion non finalisée.'));return res.end()}return res.status(e instanceof CallError?e.status:400).json({error:e instanceof CallError?e.message:'Connexion non finalisée.'})}
}
