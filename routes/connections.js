import {hasCapability} from '../src/entitlements.mjs';
import {authenticate,CallError,must,providerStatus} from '../server/calls.mjs';
import {connectionProviders,controlRow,connectionState} from '../server/connection-controls.mjs';
import {hasPilotMetaToken} from '../server/meta-token.mjs';
import {GHL_ACCOUNTS,PILOT} from '../server/results.mjs';
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');try{
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Méthode non permise.'});
 if(req.method==='POST'&&req.headers.origin!==process.env.APP_URL)throw new CallError('Origine non autorisée.',403);
 const db=await authenticate(req),b=typeof req.body==='string'?JSON.parse(req.body):req.body||{},cid=req.method==='GET'?new URL(req.url,'https://portal.invalid').searchParams.get('clientId'):b.clientId;
 if(typeof cid!=='string'||!(/^[0-9a-f-]{36}$/i).test(cid))throw new CallError('Dossier invalide.');
 const c=must(await db.from('clients').select('id,name,offer,ghl_location_id,meta_ad_account_id').eq('id',cid).single());
 if(req.method==='POST'){if(b.provider==='ghl'&&!hasCapability(c.offer,'crm_client'))throw new CallError('Aucun CRM client inclus dans le Sprint 97 $.',403);if(!connectionProviders.includes(b.provider)||typeof b.enabled!=='boolean')throw new CallError('Connexion invalide.');await controlRow(db,cid,b.provider);must(await db.from('connection_controls').upsert({client_id:cid,provider:b.provider,enabled:b.enabled},{onConflict:'client_id,provider',defaultToNull:false}));return res.status(200).json({saved:true})}
 const controls=must(await db.from('connection_controls').select('*').eq('client_id',cid)),oauth=must(await db.from('oauth_connections').select('provider,account_id,account_name,expires_at').eq('client_id',cid)),p=providerStatus(),binding=must(await db.from('client_call_bindings').select('ghl_contact_id').eq('client_id',cid).maybeSingle());
 const normal=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
 const legacy=GHL_ACCOUNTS.find(a=>a.locationId===c.ghl_location_id&&(a.clientId?a.clientId===cid:normal(a.name)===normal(c.name)));
 const configured={ghl:!!(oauth.find(r=>r.provider==='ghl'&&r.account_id===c.ghl_location_id)||(legacy&&process.env[legacy.tokenEnv])),meta:!!(oauth.find(r=>r.provider==='meta'&&r.account_id===c.meta_ad_account_id)||(cid===PILOT.clientId&&c.meta_ad_account_id===PILOT.adAccountId&&hasPilotMetaToken())),coaching:!!(p.ghl.configured&&binding?.ghl_contact_id),zoom:!!p.zoom.configured};
 return res.status(200).json({clientId:cid,connections:connectionProviders.map(provider=>{let row=controls.find(r=>r.provider===provider);const ref={ghl:c.ghl_location_id,meta:c.meta_ad_account_id,coaching:binding?.ghl_contact_id,zoom:process.env.ZOOM_HOST_ID}[provider];if(row?.health==='ok'&&row.account_ref!==ref)row={...row,health:null,checked_at:null};if(provider==='ghl'&&!hasCapability(c.offer,'crm_client'))return {provider,configured:false,enabled:false,state:'not_included',label:'Non inclus · aucun CRM client'};return {provider,...(provider==='zoom'?{automatic:!!(process.env.SUPABASE_ARCHIVE_SECRET_KEY&&process.env.CRON_SECRET)}:{}),configured:configured[provider],enabled:row?.enabled!==false,checkedAt:row?.checked_at||null,...connectionState(configured[provider],row,Date.now(),provider)}})});
 }catch(e){return res.status(e instanceof CallError?e.status:400).json({error:e instanceof CallError?e.message:'État des connexions indisponible. Réessayez.'})}}
