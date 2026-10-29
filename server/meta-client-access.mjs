import {createClient} from '@supabase/supabase-js';
import {CallError,must} from './calls.mjs';
export async function oauthSession(req){
 const token=(req.headers.authorization||'').match(/^Bearer (\S+)$/)?.[1];if(!token)throw new CallError('Connexion requise.',401);
 const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(token);if(error||!data?.user)throw new CallError('Session expirée.',401);
 const admin=must(await db.rpc('is_admin'))===true;return {db,actor:{id:data.user.id,admin}};
}
export async function requireOAuthScope(session,cid,provider){
 if(session.actor.admin)return;
 if(provider!=='meta'||process.env.META_CLIENT_OAUTH_READY!=='true')throw new CallError('Connexion client Meta non activée.',403);
 if(must(await session.db.rpc('can_connect_meta',{cid}))!==true)throw new CallError('Connexion réservée au responsable de ce dossier.',403);
}
export function oauthStorage(session){
 if(session.actor.admin)return session.db;
 if(!process.env.SUPABASE_ARCHIVE_SECRET_KEY)throw new CallError('Stockage OAuth serveur indisponible.',503);
 return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ARCHIVE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function publicConnections(rows,admin){return rows.filter(r=>admin||r.provider==='meta').map(({provider,account_id,account_name,expires_at,updated_at})=>({provider,account_id,account_name,expires_at,updated_at}));}
