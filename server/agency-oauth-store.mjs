import {createClient} from '@supabase/supabase-js';import {CallError,must} from './calls.mjs';
export function agencyStore(actor,env=process.env){
 if(actor?.admin!==true)throw new CallError('Accès administrateur requis.',403);
 if(env.AGENCY_OAUTH_STORAGE_READY!=='true'||!env.SUPABASE_ARCHIVE_SECRET_KEY)throw new CallError('Stockage OAuth administrateur non validé.',503);
 const db=createClient(env.SUPABASE_URL,env.SUPABASE_ARCHIVE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 return storeAdapter(db,actor);
}
export function storeAdapter(db,actor){
 const own=id=>{if(actor?.admin!==true||actor.id!==id)throw new CallError('Accès administrateur requis.',403)};
 return {
 async createState(x){own(x.adminId);must(await db.from('agency_oauth_states').insert({key:x.key,admin_id:x.adminId,provider:x.provider,expires_at:new Date(x.expires).toISOString()}))},
 async consumeState(x){own(x.adminId);return must(await db.rpc('consume_agency_oauth_state',{p_key:x.key,p_admin:x.adminId,p_provider:x.provider}))===true},
 async stageCredential(x){own(x.adminId);must(await db.rpc('stage_agency_oauth',{p_admin:x.adminId,p_provider:x.provider,p_ciphertext:x.ciphertext,p_identity:x.identity,p_expires:x.expiresAt}))},
 async get(provider){own(actor.id);return must(await db.from('agency_oauth_credentials').select('*').eq('admin_id',actor.id).eq('provider',provider).maybeSingle())},
 async confirm(provider,revision){own(actor.id);const rows=must(await db.from('agency_oauth_credentials').update({confirmed:true}).eq('admin_id',actor.id).eq('provider',provider).eq('revision',revision).select('revision'));if(rows.length!==1)throw new CallError('Connexion modifiée, relisez le compte.',409)},
 async lease(provider,revision,lease){own(actor.id);return must(await db.rpc('lease_agency_oauth',{p_admin:actor.id,p_provider:provider,p_revision:revision,p_lease:lease}))===true},
 async finish(provider,lease,ciphertext,expires){own(actor.id);return must(await db.rpc('finish_agency_oauth_refresh',{p_admin:actor.id,p_provider:provider,p_lease:lease,p_ciphertext:ciphertext,p_expires:expires}))===true},
 async disconnect(provider){own(actor.id);must(await db.rpc('disconnect_agency_oauth',{p_admin:actor.id,p_provider:provider}))}
 };
}
