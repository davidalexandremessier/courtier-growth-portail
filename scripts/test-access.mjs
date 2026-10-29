// Creates isolated temporary records, runs real RLS tests, then deletes only those records.
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
try{process.loadEnvFile('.env.local')}catch{}
const {SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:key,SUPABASE_SERVICE_ROLE_KEY:secret}=process.env;
if(!url||!key||!secret)throw Error('Configure les trois variables Supabase avant les tests d’accès.');
const service=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const users=[],clients=[],nonce=randomUUID();let checks=0;
const ok=(error)=>{if(error)throw error};
try{
 for(const suffix of ['a','b']){
  const email=`cg-rls-${nonce}-${suffix}@example.invalid`,password=randomUUID()+'aA!7';
  const {data,error}=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Temporary access test',role:'admin'}});ok(error);users.push(data.user.id);
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const login=await client.auth.signInWithPassword({email,password});ok(login.error);
  const created=await service.from('clients').insert({name:`Temporary RLS ${nonce} ${suffix}`}).select().single();ok(created.error);clients.push({id:created.data.id,api:client});
  ok((await service.from('client_memberships').insert({client_id:created.data.id,user_id:data.user.id})).error);
 }
 const [a,b]=clients;
 const deniedAdmin=await a.api.rpc('is_admin');ok(deniedAdmin.error);assert.equal(deniedAdmin.data,false);checks++;
 const own=await a.api.from('clients').select('id').eq('id',a.id);ok(own.error);assert.equal(own.data.length,1);checks++;
 const other=await a.api.from('clients').select('id').eq('id',b.id);ok(other.error);assert.equal(other.data.length,0);checks++;
 ok((await service.from('private_notes').insert({client_id:a.id,body:'Must remain private'})).error);
 const notes=await a.api.from('private_notes').select('*');ok(notes.error);assert.equal(notes.data.length,0);checks++;
 ok((await service.from('coachings').insert([{client_id:a.id,title:'Draft',meeting_at:new Date().toISOString(),published:false},{client_id:a.id,title:'Published',meeting_at:new Date().toISOString(),published:true}])).error);
 const sessions=await a.api.from('coachings').select('title').eq('client_id',a.id);ok(sessions.error);assert.deepEqual(sessions.data.map(r=>r.title),['Published']);checks++;
 const elevation=await a.api.from('app_admins').insert({user_id:users[0]});assert.ok(elevation.error);checks++;
 const task=await service.from('tasks').insert({client_id:a.id,title:'Own action',owner:'Client'}).select().single();ok(task.error);
 const change=await a.api.rpc('set_task_status',{task_id:task.data.id,new_status:'Terminé'});ok(change.error);checks++;
 const forbidden=await b.api.rpc('set_task_status',{task_id:task.data.id,new_status:'À faire'});assert.ok(forbidden.error);checks++;
 const direct=await a.api.from('tasks').update({owner:'Courtier Growth'}).eq('id',task.data.id).select();assert.ok(direct.error||direct.data.length===0);checks++;
 const cross=await a.api.from('weekly_reports').insert({client_id:b.id,period_start:'2026-10-12',period_end:'2026-10-18',leads:1,updated_by:users[0]});assert.ok(cross.error);checks++;
 const report=await a.api.from('weekly_reports').insert({client_id:a.id,period_start:'2026-10-12',period_end:'2026-10-18',leads:0,updated_by:users[0]});ok(report.error);checks++;
 const anon=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const publicRead=await anon.from('clients').select('id');assert.ok(publicRead.error||publicRead.data.length===0);checks++;
 console.log(`${checks} vérifications réelles des règles d’accès réussies.`);
}finally{
 for(const c of clients)ok((await service.from('clients').delete().eq('id',c.id)).error);
 for(const id of users)ok((await service.auth.admin.deleteUser(id)).error);
}
