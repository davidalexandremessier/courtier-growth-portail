// Admin OAuth contracts. No persistent store is provisioned by this module.
// Caller must authenticate the session and supply an atomic, admin-only store.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {seal,unseal} from './oauth.mjs';
import {CallError} from './calls.mjs';
export const ADMIN_SCOPES={zoom:['user:read:user','cloud_recording:read:list_user_recordings','cloud_recording:read:meeting_transcript','meeting:read:list_past_participants','meeting:read:summary'],wispr:['openid','offline_access']};
// Optional scope is accepted only after explicit configuration approval.
export const adminScopes=(provider,env=process.env)=>provider==='zoom'&&env.ZOOM_SUMMARY_DISCOVERY_READY==='true'?[...ADMIN_SCOPES.zoom,'meeting:read:list_summaries']:ADMIN_SCOPES[provider];
const endpoints={zoom:{authorize:'https://zoom.us/oauth/authorize',token:'https://zoom.us/oauth/token'},wispr:{authorize:'https://mcp-auth.wisprflow.com/oauth2/authorize',token:'https://mcp-auth.wisprflow.com/oauth2/token'}};
function assertAdmin(actor){if(actor?.admin!==true||!actor.id)throw new CallError('Connexion réservée à l’administrateur.',403)}
function config(provider,env){if(!endpoints[provider])throw new CallError('Fournisseur inconnu.');const prefix=provider==='zoom'?'ZOOM_USER':'WISPR';let clientId=env[prefix+'_OAUTH_CLIENT_ID'];const secret=provider==='zoom'?env[prefix+'_OAUTH_CLIENT_SECRET']:null;let origin;try{origin=new URL(env.APP_URL);if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash)throw Error()}catch{throw new CallError('Adresse du portail à configurer.',503)}
 if(provider==='wispr')clientId=origin.origin+'/api/wispr-client-metadata';
 if(!clientId||(provider==='zoom'&&!secret))throw new CallError('Application OAuth administrateur non configurée.',503);
 return {clientId,secret,redirect:origin.origin+'/api/agency-oauth?callback='+provider};}
const ctx=(actor,provider)=>'agency-oauth:'+actor.id+':'+provider;
const digest=s=>createHash('sha256').update(s).digest('hex');
export async function beginAdminOAuth({actor,provider,store,env=process.env,now=Date.now()}){
 assertAdmin(actor);const c=config(provider,env);if(!store?.createState||!store?.consumeState)throw new CallError('Stockage OAuth administrateur non validé.',503);
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url'),expires=now+600000;
 await store.createState({key:digest(state),adminId:actor.id,provider,expires});
 const cookie=seal({state,verifier,expires,provider,adminId:actor.id},ctx(actor,provider));
 const u=new URL(endpoints[provider].authorize);u.search=new URLSearchParams({response_type:'code',client_id:c.clientId,redirect_uri:c.redirect,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',...(provider==='wispr'?{scope:ADMIN_SCOPES.wispr.join(' '),resource:'https://api.wisprflow.ai/connect/mcp'}:{})});
 return {url:u.href,cookie,expires};
}
export async function finishAdminOAuth({actor,provider,state,code,cookie,store,env=process.env,now=Date.now(),fetcher=fetch}){
 assertAdmin(actor);const c=config(provider,env),f=unseal(cookie,ctx(actor,provider));
 if(typeof state!=='string'||!/^[\w-]{43}$/.test(state)||typeof f.state!=='string'||f.state.length!==43||!timingSafeEqual(Buffer.from(state),Buffer.from(f.state))||f.expires<=now||f.adminId!==actor.id||f.provider!==provider||typeof code!=='string'||!code||code.length>4000)throw new CallError('Autorisation invalide ou expirée.',409);
 if(!store?.consumeState||!store?.stageCredential)throw new CallError('Stockage OAuth administrateur non validé.',503);
 // Atomic compare-and-consume BEFORE exchange: replay and simultaneous callbacks fail closed.
 if(!await store.consumeState({key:digest(state),adminId:actor.id,provider,now}))throw new CallError('Autorisation déjà utilisée ou expirée.',409);
 const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:c.redirect,code_verifier:f.verifier});
 const headers={'Content-Type':'application/x-www-form-urlencoded'};
 if(c.secret)headers.Authorization='Basic '+Buffer.from(c.clientId+':'+c.secret).toString('base64');else body.set('client_id',c.clientId);
 if(provider==='wispr')body.set('resource','https://api.wisprflow.ai/connect/mcp');
 let token;try{const r=await fetcher(endpoints[provider].token,{method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();token=await r.json()}catch{throw new CallError('Échange OAuth refusé. Recommencez la connexion.',502)}
 const scopes=String(token.scope||'').split(/\s+/).filter(Boolean),allowed=adminScopes(provider,env);
 const strict=provider!=='wispr';if(!token.access_token||(strict&&!token.refresh_token)||!Number.isFinite(Number(token.expires_in))||Number(token.expires_in)<=0||(strict&&(allowed.some(s=>!scopes.includes(s))||scopes.some(s=>!allowed.includes(s)))))throw new CallError('Droits ou durée OAuth différents du contrat attendu.',409);
 const identity=await readAdminIdentity(provider,token.access_token,fetcher);
 await store.stageCredential({adminId:actor.id,provider,identity,ciphertext:seal(token,'agency-credential:'+actor.id+':'+provider),expiresAt:new Date(now+Number(token.expires_in)*1000).toISOString()});
 return {provider,authorizationReceived:true,confirmationRequired:true,importVerified:false};
}
export async function refreshAdminOAuth({actor,provider,store,env=process.env,now=Date.now(),fetcher=fetch}){
 assertAdmin(actor);const c=config(provider,env),row=await store.get(provider);if(!row?.confirmed)throw new CallError('Confirmez le compte avant import.',409);
 const context='agency-credential:'+actor.id+':'+provider,old=unseal(row.ciphertext,context);
 if(Date.parse(row.expires_at)>now+120000)return old.access_token;
 const lease=randomBytes(24).toString('hex');if(!await store.lease(provider,row.revision,lease))throw new CallError('Renouvellement en cours.',409);
 if(!old.refresh_token)throw new CallError('Autorisation expirée. Reconnectez le compte.',409);
 const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:old.refresh_token}),headers={'Content-Type':'application/x-www-form-urlencoded'};
 if(c.secret)headers.Authorization='Basic '+Buffer.from(c.clientId+':'+c.secret).toString('base64');else body.set('client_id',c.clientId);
 if(provider==='wispr')body.set('resource','https://api.wisprflow.ai/connect/mcp');
 let token;try{const r=await fetcher(endpoints[provider].token,{method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();token=await r.json()}catch{throw new CallError('Renouvellement non confirmé. Reconnectez le compte.',409)}
 const scopes=String(token.scope||'').split(/\s+/);const strict=provider!=='wispr';if(!token.access_token||(strict&&!token.refresh_token)||!Number.isFinite(Number(token.expires_in))||Number(token.expires_in)<=0||(strict&&(adminScopes(provider,env).some(s=>!scopes.includes(s))||scopes.some(s=>!adminScopes(provider,env).includes(s)))))throw new CallError('Renouvellement invalide, reconnectez le compte.',409);
 if(!token.refresh_token)token.refresh_token=old.refresh_token;
 const identity=await readAdminIdentity(provider,token.access_token,fetcher);if(identity.id!==row.identity?.id||identity.accountId!==row.identity?.accountId)throw new CallError('Le compte fournisseur a changé. Reconnectez-le.',409);
 if(!await store.finish(provider,lease,seal(token,context),new Date(now+Number(token.expires_in)*1000).toISOString()))throw new CallError('Connexion modifiée pendant le renouvellement.',409);
 return token.access_token;
}

export async function readAdminIdentity(provider,accessToken,fetcher=fetch){
 const url=provider==='zoom'?'https://api.zoom.us/v2/users/me':provider==='wispr'?'https://mcp-auth.wisprflow.com/oauth2/userinfo':null;if(!url)throw new CallError('Fournisseur inconnu.');
 let v;try{const r=await fetcher(url,{headers:{Authorization:'Bearer '+accessToken},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();v=await r.json()}catch{throw new CallError('Identité du compte non confirmée.',502)}
 const id=provider==='zoom'?v.id:v.sub;if(typeof id!=='string'||!id||id.length>255)throw new CallError('Identité du compte absente.',502);
 if(provider==='zoom'&&(typeof v.account_id!=='string'||!v.account_id))throw new CallError('Compte Zoom non confirmé.',502);
 return {id,...(provider==='zoom'?{accountId:v.account_id}:{}),label:provider==='zoom'?String(v.email||id).slice(0,255):id};
}
