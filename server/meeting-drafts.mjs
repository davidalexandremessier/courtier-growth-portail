// Called only after import/reconciliation. Existing RPC owns persistence and RLS.
// Not activated until the complete V2 integration and database race checks pass.
export async function prepareImportedDrafts(db,sourceIds,{textOnly=false}={}){
 const role=await db.rpc('is_admin');if(role.error||role.data!==true)throw Error('Accès administrateur requis.');
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
 if(!Array.isArray(sourceIds)||sourceIds.length>100||sourceIds.some(id=>!uuid(id)))throw Error('Sources invalides.');
 const result={prepared:[],needsConfirmation:[],retry:[],privateMediaRequired:[]},anchors=new Set();
 for(const id of new Set(sourceIds)){
  const {data:s,error}=await db.from('call_sources').select('id,client_id,linked_appointment_id,match_status,transcript,summary,replay_url').eq('id',id).maybeSingle();
  if(error||!s){result.retry.push(id);continue;}
  if(!s.client_id||!['manual','auto'].includes(s.match_status)){result.needsConfirmation.push(id);continue;}
  // Do not copy provider share URLs to a client-visible record.
  if(s.replay_url&&!textOnly){result.privateMediaRequired.push(id);continue;}
  if(!String(s.transcript||'').trim()&&!String(s.summary||'').trim()){result.retry.push(id);continue;}
  const anchor=s.linked_appointment_id||s.id;if(anchors.has(anchor))continue;
  if(!uuid(anchor)){result.retry.push(id);continue;}
  const group=await db.from('call_sources').select('replay_url').eq('client_id',s.client_id).or(`id.eq.${anchor},linked_appointment_id.eq.${anchor}`);
  if(group.error||!Array.isArray(group.data)){result.retry.push(id);continue;}
  if(!textOnly&&group.data.some(row=>row.replay_url)){result.privateMediaRequired.push(id);continue;}
  const r=await db.rpc(textOnly?'prepare_call_coaching_text':'prepare_call_coaching',{source_id:id});
  if(r.error||!r.data){result.retry.push(id);continue;}
  anchors.add(anchor);result.prepared.push({sourceId:id,coachingId:r.data});
 }
 return result;
}
