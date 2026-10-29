import {timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {portalFeatures} from '../src/portal-features.mjs';
import {synchronizeClientStats} from '../server/stats-sync.mjs';
export const config={maxDuration:300};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!portalFeatures.backgroundStats)return res.status(503).json({error:'Synchronisation portail fermé non activée. Chemin serveur à revoir.'});
 if(req.method!=='GET')return res.status(405).json({error:'Méthode non permise.'});
 const expected=process.env.CRON_SECRET,actual=(req.headers.authorization||'').replace(/^Bearer /,'');
 if(!expected||!actual||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return res.status(401).json({error:'Accès refusé.'});
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_ARCHIVE_SECRET_KEY)return res.status(503).json({error:'Configuration serveur indisponible.'});
 try{const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ARCHIVE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),actors=await db.from('app_admins').select('user_id');
  if(actors.error||actors.data?.length!==1)return res.status(409).json({error:'Acteur administrateur existant à confirmer.'});
  const clients=await db.from('clients').select('id,offer,meta_ad_account_id,ghl_location_id').order('id');if(clients.error)throw Error();
  const eligible=clients.data.filter(c=>c.meta_ad_account_id||c.ghl_location_id);if(eligible.length>10)return res.status(409).json({error:'Plus de dix dossiers : planifier une exécution découpée avant activation.'});
  let successes=0,errors=0;for(const client of eligible){const result=await synchronizeClientStats(db,db,client,actors.data[0].user_id,{mode:'background'});successes+=result.results.filter(x=>x.state==='success').length;errors+=result.results.filter(x=>x.state==='error').length}
  return res.status(200).json({successes,errors});
 }catch{return res.status(503).json({error:'Écriture serveur non confirmée. Dernières données conservées.'})}
}
