import {hasCapability} from '../src/entitlements.mjs';
import {createClient} from '@supabase/supabase-js';
import {davidMessageAccess} from '../src/portal-features.mjs';
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');try{
 if(!davidMessageAccess())return res.status(410).json({error:'Messages David IA désactivés. Historique conservé.',ai_enabled:false,payments_enabled:false});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Méthode non permise.'});
 if(req.method==='POST'&&req.headers.origin!==process.env.APP_URL)return res.status(403).json({error:'Origine refusée.'});
 const token=(req.headers.authorization||'').match(/^Bearer (\S+)$/)?.[1];if(!token)return res.status(401).json({error:'Connexion requise.'});
 const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await db.auth.getUser(token);if(error||!data.user)return res.status(401).json({error:'Session expirée.'});
 const clientId=req.query?.client_id||new URL(req.url,'https://portal.invalid').searchParams.get('client_id');if(typeof clientId!=='string'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(clientId))return res.status(400).json({error:'Dossier invalide.'});
 const accessible=await db.from('clients').select('id,offer').eq('id',clientId).maybeSingle();if(accessible.error||!accessible.data)return res.status(403).json({error:'Dossier inaccessible.'});
 if(!hasCapability(accessible.data.offer,'self_guidance'))return res.status(403).json({error:'Guidage IA non inclus dans cette offre.'});
 if(req.method==='GET'){
 const [w,l]=await Promise.all([db.from('ai_wallets').select('client_id,currency,status,plan,balance_microusd,reserved_microusd,monthly_limit_microusd').eq('client_id',clientId).maybeSingle(),db.from('ai_ledger').select('id,kind,amount_microusd,note,created_at').eq('client_id',clientId).order('created_at',{ascending:false}).limit(50)]);
 if(w.error||l.error||!w.data)return res.status(503).json({error:'Votre compte de crédits est en préparation. Aucun montant n’est débité.'});
 return res.json({wallet:w.data,ledger:l.data,ai_enabled:false,payments_enabled:false});}
 const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
 if(b.action==='budget'){
 const admin=await db.from('app_admins').select('user_id').eq('user_id',data.user.id).maybeSingle();if(admin.error||!admin.data)return res.status(403).json({error:'Accès administrateur requis.'});
 if(!Number.isSafeInteger(b.limit_microusd)||b.limit_microusd<0||b.limit_microusd>1000000000)return res.status(400).json({error:'Plafond invalide.'});
 const r=await db.rpc('prepare_ai_wallet',{p_client:clientId,p_limit:b.limit_microusd,p_pause:false});if(r.error)throw Error('budget');return res.json({saved:true});}
 // Explicit infrastructure-only release: no flag or balance can accidentally enable spending.
 return res.status(409).json({error:'David IA et les recharges attendent leur activation. Aucun paiement ni appel IA n’est effectué.'});
 }catch{return res.status(400).json({error:'Opération indisponible. Réessayez sans transmettre de renseignements sensibles.'})}}
