import {createClient} from '@supabase/supabase-js';
import {validPushSubscription} from '../src/notifications.mjs';
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');try{
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Méthode non permise.'});
 if(req.method==='POST'&&req.headers.origin!==process.env.APP_URL)return res.status(403).json({error:'Origine refusée.'});
 const token=(req.headers.authorization||'').match(/^Bearer (\S+)$/)?.[1];if(!token)return res.status(401).json({error:'Connexion requise.'});
 const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}}),{data,error}=await db.auth.getUser(token);if(error||!data.user)return res.status(401).json({error:'Session expirée.'});
 if(req.method==='GET')return res.json({publicKey:process.env.WEB_PUSH_PUBLIC_KEY||null,ready:!!(process.env.WEB_PUSH_PUBLIC_KEY&&process.env.WEB_PUSH_PRIVATE_KEY&&process.env.NOTIFICATION_WORKER_SECRET)});
 const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
 if(b.action==='subscribe'){if(!validPushSubscription(b.subscription))return res.status(400).json({error:'Cet abonnement téléphone est invalide.'});const s=b.subscription;const {error}=await db.from('push_subscriptions').upsert({user_id:data.user.id,endpoint:s.endpoint,p256dh:s.keys.p256dh,auth:s.keys.auth},{onConflict:'endpoint'});if(error)throw error;return res.json({saved:true})}
 if(b.action==='unsubscribe'){if(typeof b.endpoint!=='string')return res.status(400).json({error:'Appareil invalide.'});const {error}=await db.from('push_subscriptions').delete().eq('user_id',data.user.id).eq('endpoint',b.endpoint);if(error)throw error;return res.json({saved:true})}
 return res.status(400).json({error:'Action inconnue.'});
 }catch{return res.status(400).json({error:'Notifications indisponibles. Réessayez.'})}}
