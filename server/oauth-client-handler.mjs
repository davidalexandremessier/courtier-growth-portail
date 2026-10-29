import {oauthSession,requireOAuthScope,oauthStorage,publicConnections} from '../server/meta-client-access.mjs';
import {requireClientCapability} from '../server/offer-access.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {CallError,must} from '../server/calls.mjs';
import {oauthStatus,startFlow,readFlow,cookieHeader,exchangeCode,availableAccounts,locationToken,seal,unseal,connectionRow,encryptCredential} from '../server/oauth.mjs';
import {inspectGHL,resolveGHLClient} from '../server/results.mjs';
const jsonBody=req=>typeof req.body==='string'?JSON.parse(req.body):req.body||{};
const validId=id=>typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id);
const pendingContext=(id,cid,p)=>['pending',id,cid,p].join(':');
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 const url=new URL(req.url,'https://portal.invalid'),callback=url.searchParams.get('callback')==='crm'?'ghl':url.searchParams.get('callback');
 try{
  if(callback){
   if(req.method!=='GET'||!['ghl','meta'].includes(callback))throw new CallError('Retour fournisseur invalide.');
   const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-cg_oauth='))?.slice(16);
   const flow=readFlow(cookie,url.searchParams.get('state'),callback);res.setHeader('Set-Cookie',cookieHeader('',0));
   const session=await oauthSession({headers:{authorization:'Bearer '+flow.token}});await requireOAuthScope(session,flow.clientId,callback);const db=oauthStorage(session);if(callback==='ghl')await requireClientCapability(db,flow.clientId,'crm_client');must(await db.from('clients').select('id').eq('id',flow.clientId).single());
   if(!session.actor.admin&&!must(await db.rpc('consume_client_meta_state',{p_key:createHash('sha256').update(url.searchParams.get('state')).digest('hex'),p_user:session.actor.id,p_client:flow.clientId})))throw new CallError('Autorisation déjà utilisée ou expirée.',409);
   if(url.searchParams.has('error'))throw new CallError('Connexion annulée chez le fournisseur.',409);
   const token=await exchangeCode(callback,url.searchParams.get('code')),available=await availableAccounts(callback,token),accounts=flow.accountHint?available.filter(a=>a.id===flow.accountHint):available;if(!accounts.length){console.warn('oauth_account_mismatch',{provider:callback,type:token.userType,locationId:token.locationId||null,approvedCount:Array.isArray(token.approvedLocations)?token.approvedLocations.length:null,availableIds:available.map(a=>a.id),expected:flow.accountHint});throw new CallError('Le compte autorisé ne correspond pas au dossier ou n’est pas accessible. Reconnectez-vous au bon sous-compte.',409);}
   const user=session.actor;
   const id=randomUUID(),expires_at=new Date(Date.now()+600000).toISOString();
   must(await db.from('oauth_pending').insert({id,client_id:flow.clientId,provider:callback,created_by:user.id,expires_at,ciphertext:seal({token,accounts,revision:flow.revision,tokenExpiresAt:new Date(Date.now()+Number(token.expires_in)*1000).toISOString()},pendingContext(id,flow.clientId,callback))}));
   res.statusCode=303;res.setHeader('Location','/?oauth_pending='+id);return res.end();
  }
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Méthode non permise.'});
  if(req.method==='POST'&&(!process.env.APP_URL||req.headers.origin!==new URL(process.env.APP_URL).origin))throw new CallError('Origine non autorisée.',403);
  const session=await oauthSession(req);const db=oauthStorage(session);
  if(req.method==='GET'){const cid=url.searchParams.get('clientId');if(!validId(cid))throw new CallError('Dossier invalide.');await requireOAuthScope(session,cid,'meta');must(await db.from('clients').select('id').eq('id',cid).single());const rows=process.env.OAUTH_STORAGE_READY==='true'?must(await db.from('oauth_connections').select('provider,account_id,account_name,expires_at,updated_at').eq('client_id',cid)):[];return res.status(200).json({providers:session.actor.admin?oauthStatus():{meta:oauthStatus().meta},connections:publicConnections(rows,session.actor.admin)})}
  const b=jsonBody(req);if(JSON.stringify(b).length>10000)throw new CallError('Requête trop grande.');
  if(b.action==='start'){
   if(!validId(b.clientId))throw new CallError('Dossier invalide.');await requireOAuthScope(session,b.clientId,b.provider);if(b.provider==='ghl')await requireClientCapability(db,b.clientId,'crm_client');const client=must(await db.from('clients').select('id,ghl_location_id,meta_ad_account_id').eq('id',b.clientId).single());if(!oauthStatus()[b.provider]?.ready)throw new CallError('Application fournisseur à activer : configuration développeur requise.',409);const row=await connectionRow(db,b.clientId,b.provider);const flow=startFlow(b.provider,b.clientId,req.headers.authorization.slice(7),row?.revision||0,b.provider==='ghl'?client.ghl_location_id:client.meta_ad_account_id);if(!session.actor.admin)must(await db.from('meta_oauth_states').insert({key:createHash('sha256').update(new URL(flow.url).searchParams.get('state')).digest('hex'),user_id:session.actor.id,client_id:b.clientId,expires_at:new Date(Date.now()+600000).toISOString()}));res.setHeader('Set-Cookie',cookieHeader(flow.cookie));return res.status(200).json({url:flow.url});
  }
  if(b.action==='criteria'){
   if(!session.actor.admin)throw new CallError('Accès administrateur requis.',403);
   if(!validId(b.clientId))throw new CallError('Dossier invalide.');const row=await connectionRow(db,b.clientId,'ghl');if(!row)throw new CallError('Connectez ce dossier par OAuth avant de configurer ses sources.',409);
   const account=await resolveGHLClient(db,b.clientId),catalog=await inspectGHL({...account,leadSources:[],calendarNames:[]});
   for(const [key,allowed] of [['leadSources',catalog.contacts.sources.map(s=>s.name).filter(n=>n!=='Non renseignée')],['calendarNames',catalog.calendars.map(c=>c.name)]]){if(!Array.isArray(b[key])||!b[key].length||b[key].length>100||new Set(b[key]).size!==b[key].length||b[key].some(s=>typeof s!=='string'||!allowed.includes(s)))throw new CallError('Choisissez des sources et calendriers présents dans ce compte.',409)}
   if(b.calendarNames.some(name=>catalog.calendars.filter(c=>c.name===name).length!==1))throw new CallError('Nom de calendrier ambigu : renommez-le dans le CRM avant de l’associer.',409);
   const updated=must(await db.from('oauth_connections').update({settings:{leadSources:b.leadSources,calendarNames:b.calendarNames},revision:row.revision+1,updated_at:new Date().toISOString()}).eq('client_id',b.clientId).eq('provider','ghl').eq('revision',row.revision).select('client_id').single());return res.status(200).json({configured:!!updated});
  }
  if(!['preview','confirm'].includes(b.action)||!validId(b.pendingId))throw new CallError('Opération invalide.');
  const pending=must(await db.from('oauth_pending').select('*').eq('id',b.pendingId).single());if(Date.parse(pending.expires_at)<Date.now())throw new CallError('Sélection expirée. Recommencez la connexion.',409);
  if(pending.provider==='ghl')await requireClientCapability(db,pending.client_id,'crm_client');await requireOAuthScope(session,pending.client_id,pending.provider);const user=session.actor;if(pending.created_by!==user?.id)throw new CallError('Cette autorisation appartient à une autre session.',403);
  const p=unseal(pending.ciphertext,pendingContext(pending.id,pending.client_id,pending.provider));const client=must(await db.from('clients').select('id,name,ghl_location_id,meta_ad_account_id').eq('id',pending.client_id).single());
  if(b.action==='preview')return res.status(200).json({pendingId:pending.id,provider:pending.provider,client:{id:client.id,name:client.name},accounts:p.accounts,currentAccountId:pending.provider==='ghl'?client.ghl_location_id:client.meta_ad_account_id});
  const account=p.accounts.find(a=>a.id===b.accountId);if(!account)throw new CallError('Choisissez un compte de la liste autorisée.',409);
  let token=p.token;if(pending.provider==='ghl')token=await locationToken(token,account.id);
  const row={client_id:pending.client_id,provider:pending.provider,account_id:account.id};
  must(await db.rpc(session.actor.admin?'confirm_oauth_connection':'confirm_client_meta',{...(!session.actor.admin?{p_actor:session.actor.id}:{}),p_pending_id:pending.id,p_account_id:account.id,p_account_name:account.name,p_ciphertext:encryptCredential(row,token),p_expires_at:new Date(Math.min(Date.parse(p.tokenExpiresAt),Date.now()+Number(token.expires_in)*1000)).toISOString(),p_expected_revision:p.revision}));
  return res.status(200).json({connected:true,clientId:client.id,provider:pending.provider,accountId:account.id});
 }catch(e){
  if(callback){res.setHeader('Set-Cookie',cookieHeader('',0));res.statusCode=303;res.setHeader('Location','/?oauth_error='+encodeURIComponent(e instanceof CallError?e.message:'Connexion non finalisée. Recommencez depuis le dossier.'));return res.end()}
  return res.status(e instanceof CallError?e.status:400).json({error:e instanceof CallError?e.message:'Connexion non finalisée. Réessayez.'});
 }
}
