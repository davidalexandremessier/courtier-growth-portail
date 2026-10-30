import {createClient} from '@supabase/supabase-js';

const EVENT_COLUMNS='client_id,contact_id,contact_name,event,property,note,occurred_at';

export function supabaseBuyerDb(){
 const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_ARCHIVE_SECRET_KEY;
 if(!url||!key) return null;
 const db=createClient(url, key, {auth:{persistSession:false, autoRefreshToken:false}});
 return {
  async clientsByLocation(locationId){
   const {data, error}=await db.from('clients').select('id,name,ghl_location_id').eq('ghl_location_id', locationId);
   if(error) throw error;
   return data||[];
  },
  async insertEvent(row){
   const {error}=await db.from('buyer_cockpit_events').insert(row);
   if(error?.code==='23505') return {stored:false};
   if(error) throw error;
   return {stored:true};
  },
  async ensureAccess(row){
   const existing=await db.from('buyer_portal_access').select('token_hash,revoked_at').eq('client_id', row.client_id).eq('contact_id', row.contact_id).maybeSingle();
   if(existing.error) throw existing.error;
   if(!existing.data){
    const inserted=await db.from('buyer_portal_access').insert(row);
    if(inserted.error && inserted.error.code!=='23505') throw inserted.error;
    return;
   }
   if(existing.data.revoked_at) return;
   if(existing.data.token_hash!==row.token_hash){
    const updated=await db.from('buyer_portal_access').update({token_hash:row.token_hash}).eq('client_id', row.client_id).eq('contact_id', row.contact_id).is('revoked_at', null);
    if(updated.error) throw updated.error;
   }
  },
  async accessByHash(hash){
   const {data, error}=await db.from('buyer_portal_access').select('client_id,contact_id,revoked_at').eq('token_hash', hash).maybeSingle();
   if(error) throw error;
   if(!data) return null;
   const client=await db.from('clients').select('name').eq('id', data.client_id).maybeSingle();
   if(client.error) throw client.error;
   return {...data, broker_name:client.data?.name||''};
  },
  async eventsFor(clientId, contactId){
   const {data, error}=await db.from('buyer_cockpit_events').select(EVENT_COLUMNS).eq('client_id', clientId).eq('contact_id', contactId).order('occurred_at', {ascending:false}).limit(100);
   if(error) throw error;
   return data||[];
  }
 };
}
