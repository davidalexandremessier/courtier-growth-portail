import {portalFeatures} from '../src/portal-features.mjs';
import {createClient} from '@supabase/supabase-js';
import {CallError,must} from '../server/calls.mjs';
import {persistCSV} from '../server/source-stats.mjs';
import {synchronizeClientStats} from '../server/stats-sync.mjs';
export const config={maxDuration:300};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.method!=='POST')return res.status(405).json({error:'Méthode non permise.'});
  if(!process.env.APP_URL||![new URL(process.env.APP_URL).origin,...(process.env.VERCEL_URL?['https://'+process.env.VERCEL_URL]:[])].includes(req.headers.origin))throw new CallError('Origine non autorisée.',403);
  const token=(req.headers.authorization||'').match(/^Bearer (\S+)$/)?.[1];if(!token)throw new CallError('Connexion requise.',401);
  if(!portalFeatures.sourceStatsWrites)throw new CallError('Synchronisation et import partagé non activés : vérification réelle en attente.',503);
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_PUBLISHABLE_KEY)throw new CallError('Portail non configuré.',503);
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user)throw new CallError('Session expirée.',401);
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!b||JSON.stringify(b).length>4000000||!(/^[0-9a-f-]{36}$/i).test(b.clientId))throw new CallError('Dossier ou requête invalide.');
  const accessible=await db.from('clients').select('id,name,offer,meta_ad_account_id,ghl_location_id').eq('id',b.clientId).maybeSingle();if(accessible.error||!accessible.data)throw new CallError('Dossier inaccessible.',403);
  if(b.action==='csv')return res.status(200).json(await persistCSV(db,accessible.data,b.records,auth.data.user.id));
  if(b.action!=='sync')throw new CallError('Action inconnue.');
  const role=await db.rpc('is_admin');if(role.error||role.data!==true)throw new CallError('Actualisation des sources réservée à l’agence; les chiffres partagés restent consultables.',403);
  if(!process.env.SUPABASE_ARCHIVE_SECRET_KEY)throw new CallError('Lecture automatisée à activer : accès serveur existant indisponible.',503);
  const sourceDB=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ARCHIVE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  return res.status(200).json(await synchronizeClientStats(db,sourceDB,accessible.data,auth.data.user.id));
 }catch(e){return res.status(e instanceof CallError?e.status:400).json({error:e instanceof CallError?e.message:'Synchronisation non confirmée. Dernières données conservées.'})}
}
