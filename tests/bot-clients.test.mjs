import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import handler from '../routes/bot-clients.js';
import dispatch from '../api/[slug].js';

const token='test-bot-token';
const other='test-other-token';
const hash=value=>createHash('sha256').update(value).digest('hex');
const tokenHash=hash(token);
const serviceKey='test-service-key';
const clientId='00000000-0000-4000-8000-000000000001';
const columns='id,name,email,offer,status,sector,main_constraint,launch_date,work_mode,support_start,support_end,crm_url,meta_ad_account_id,ghl_location_id,created_at';
const sample={id:clientId,name:'Client Synthèse',email:'synthese@example.test',offer:'1:1',status:'Onboarding',sector:'Immobilier',main_constraint:'Priorité du mois',launch_date:'2026-11-02',work_mode:'Solo',support_start:'2026-10-01',support_end:'2027-10-01',crm_url:'https://crm.example.test/dossier',meta_ad_account_id:'act_1',ghl_location_id:'loc_1',created_at:'2026-10-01T12:00:00.000Z',internal_note:'DO-NOT-LEAK'};

function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(b){this.body=b;return this}}}
function env(extra){
 const keys=['BOT_API_KEYS','SUPABASE_URL','SUPABASE_ARCHIVE_SECRET_KEY'];
 const prev=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 for(const key of keys){if(extra[key]===undefined)delete process.env[key];else process.env[key]=extra[key]}
 return ()=>{for(const key of keys){if(prev[key]===undefined)delete process.env[key];else process.env[key]=prev[key]}};
}
function readyEnv(){return env({BOT_API_KEYS:JSON.stringify({alpha:tokenHash,beta:hash(other)}),SUPABASE_URL:'https://db.test.invalid',SUPABASE_ARCHIVE_SECRET_KEY:serviceKey})}
function installFetch(handle){
 const calls=[];
 const previous=global.fetch;
 global.fetch=async(input,init={})=>{
  const headers={};
  if(init.headers&&typeof init.headers.forEach==='function') init.headers.forEach((value,key)=>{headers[key.toLowerCase()]=value});
  const call={url:String(input),method:String(init.method||'GET').toUpperCase(),headers,body:typeof init.body==='string'?JSON.parse(init.body):null};
  calls.push(call);
  const result=await handle(call);
  return new Response(JSON.stringify(result.body??null),{status:result.status||200,headers:{'content-type':'application/json'}});
 };
 return {calls,restore(){global.fetch=previous}};
}
function noToken(calls){const blob=JSON.stringify(calls);assert.equal(blob.includes(token),false);assert.equal(blob.includes(tokenHash),false)}
function noCors(res){assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(JSON.stringify(res.headers).toLowerCase().includes('access-control-'),false)}
const req=(method,extra={})=> ({method,url:extra.url||'/api/bot-clients',headers:extra.headers||{authorization:'Bearer '+token},query:extra.query||{},body:extra.body});

test('401 sans jeton ou avec un mauvais jeton, journalisé sans matériau secret',async()=>{
 const restore=readyEnv();
 const fetchMock=installFetch(()=>({body:[]}));
 try{
  const missing=response();
  await handler(req('GET',{headers:{}}),missing);
  assert.equal(missing.statusCode,401);
  assert.deepEqual(missing.body,{error:'Accès refusé.'});
  noCors(missing);
  const wrong=response();
  await handler(req('GET',{headers:{authorization:'Bearer mauvais-jeton'}}),wrong);
  assert.equal(wrong.statusCode,401);
  assert.equal(fetchMock.calls.length,2);
  assert.deepEqual(fetchMock.calls.map(call=>call.body.action),['denied','denied']);
  assert.deepEqual(fetchMock.calls.map(call=>call.body.reason),['jeton absent','jeton refusé']);
  assert.deepEqual(fetchMock.calls.map(call=>call.body.actor),['refus','refus']);
  assert.ok(fetchMock.calls.every(call=>call.url.endsWith('/rest/v1/bot_audit_log')&&call.method==='POST'));
  assert.ok(fetchMock.calls.every(call=>call.headers.authorization==='Bearer '+serviceKey&&call.headers.apikey===serviceKey));
  noToken(fetchMock.calls);
  assert.equal(JSON.stringify(fetchMock.calls).includes('mauvais-jeton'),false);
 }finally{fetchMock.restore();restore()}
});

test('503 si BOT_API_KEYS manque ou n’est pas un objet d’empreintes',async()=>{
 const cases=[undefined,'', '[]','pas du json','{"alpha":"court"}','{"refus":"'+tokenHash+'"}'];
 for(const value of cases){
  const restore=env({BOT_API_KEYS:value,SUPABASE_URL:'https://db.test.invalid',SUPABASE_ARCHIVE_SECRET_KEY:serviceKey});
  const fetchMock=installFetch(()=>{throw new Error('pas d’appel')});
  try{
   const res=response();
   await handler(req('GET'),res);
   assert.equal(res.statusCode,503,String(value));
   assert.deepEqual(res.body,{error:'Configuration serveur indisponible.'});
   noCors(res);
   assert.equal(fetchMock.calls.length,0);
  }finally{fetchMock.restore();restore()}
 }
 const upper=tokenHash.toUpperCase();
 const restore=env({BOT_API_KEYS:JSON.stringify({alpha:upper}),SUPABASE_URL:'https://db.test.invalid',SUPABASE_ARCHIVE_SECRET_KEY:serviceKey});
 const fetchMock=installFetch(call=>call.url.includes('/clients')?{body:[sample]}:{body:[]});
 try{
  const res=response();
  await handler(req('GET'),res);
  assert.equal(res.statusCode,200);
 }finally{fetchMock.restore();restore()}
});

test('405 pour POST, PUT et DELETE ; 403 dès qu’une origine est présente',async()=>{
 const restore=readyEnv();
 const fetchMock=installFetch(()=>{throw new Error('pas d’appel')});
 try{
  for(const method of ['POST','PUT','DELETE','OPTIONS']){
   const res=response();
   await handler(req(method),res);
   assert.equal(res.statusCode,405,method);
   assert.deepEqual(res.body,{error:'Méthode non permise.'});
   noCors(res);
  }
  const origin=response();
  await handler(req('GET',{headers:{Origin:'https://evil.example',authorization:'Bearer '+token}}),origin);
  assert.equal(origin.statusCode,403);
  assert.deepEqual(origin.body,{error:'Origine refusée.'});
  noCors(origin);
  const emptyOrigin=response();
  await handler(req('PATCH',{headers:{origin:''}}),emptyOrigin);
  assert.equal(emptyOrigin.statusCode,403);
  assert.equal(fetchMock.calls.length,0);
 }finally{fetchMock.restore();restore()}
});

test('400 sur champ interdit, enum, date, url, raison et valeur sensible',async()=>{
 const restore=readyEnv();
 const fetchMock=installFetch(()=>{throw new Error('pas d’appel base')});
 const idQuery={id:clientId};
 const patch=(changes,reason='Correction de suivi',extra)=>{
  const res=response();
  return handler(req('PATCH',{query:idQuery,body:{changes,reason,...extra}}),res).then(()=>res);
 };
 try{
  for(const field of ['offer','email','name','id','meta_ad_account_id','ghl_location_id','created_at','note']){
   const res=await patch({[field]:'interdit'});
   assert.equal(res.statusCode,400,field);
   assert.equal(res.body.error,'Champ non modifiable.');
  }
  assert.equal((await patch({status:'Archivé'})).body.error,'Statut invalide.');
  assert.equal((await patch({work_mode:'Groupe'})).body.error,'Mode de fonctionnement invalide.');
  assert.equal((await patch({launch_date:'2026-02-31'})).body.error,'Date invalide.');
  assert.equal((await patch({support_start:'2026-10-02',support_end:'2026-10-01'})).body.error,'La fin de l’accompagnement précède le début.');
  assert.equal((await patch({crm_url:'http://crm.example.test'})).body.error,'Lien CRM invalide.');
  assert.equal((await patch({crm_url:'https://crm.example.test/a b'})).body.error,'Lien CRM invalide.');
  assert.equal((await patch({sector:'x'.repeat(121)})).body.error,'Secteur trop long.');
  assert.equal((await patch({main_constraint:'x'.repeat(1001)})).body.error,'Contrainte trop longue.');
  assert.equal((await patch({})).body.error,'Modification vide.');
  const missingReason=response();
  await handler(req('PATCH',{query:idQuery,body:{changes:{status:'Actif'}}}),missingReason);
  assert.equal(missingReason.body.error,'Raison requise.');
  const longReason=response();
  await handler(req('PATCH',{query:idQuery,body:{changes:{status:'Actif'},reason:'y'.repeat(501)}}),longReason);
  assert.equal(longReason.body.error,'Raison trop longue.');
  for(const value of ['voici un password','mot de passe oublié','le mdp du dossier','api key interne','préfixe sk_live','EAA'+'B'.repeat(20)]){
   const res=await patch({main_constraint:value});
   assert.equal(res.statusCode,400,value);
   assert.equal(res.body.error,'Valeur sensible refusée.');
  }
  const secretReason=await patch({status:'Actif'},'contient un token');
  assert.equal(secretReason.body.error,'Valeur sensible refusée.');
  const badId=response();
  await handler(req('GET',{query:{id:'pas-un-uuid'}}),badId);
  assert.equal(badId.statusCode,400);
  assert.equal(fetchMock.calls.length,0);
  noCors(badId);
 }finally{fetchMock.restore();restore()}
});

test('GET liste et dossier, PATCH via la fonction, sans écriture directe',async()=>{
 const restore=readyEnv();
 const stored={...sample,status:'Actif',main_constraint:'Relancer les suivis'};
 const fetchMock=installFetch(call=>{
  const url=new URL(call.url);
  if(url.pathname==='/rest/v1/clients'&&call.method==='GET'){
   assert.equal(url.searchParams.get('select'),columns);
   if(url.searchParams.get('id')) return {body:url.searchParams.get('id')==='eq.'+clientId?[sample]:[]};
   assert.equal(url.searchParams.get('order'),'name.asc');
   return {body:[sample]};
  }
  if(url.pathname==='/rest/v1/bot_audit_log'&&call.method==='POST') return {body:[]};
  if(url.pathname==='/rest/v1/rpc/bot_update_client'&&call.method==='POST') return {body:stored};
  throw new Error(call.method+' '+url.pathname);
 });
 try{
  const list=response();
  await handler(req('GET'),list);
  assert.equal(list.statusCode,200);
  assert.equal(list.body.clients.length,1);
  assert.equal(list.body.clients[0].name,'Client Synthèse');
  assert.equal(JSON.stringify(list.body).includes('DO-NOT-LEAK'),false);
  noCors(list);
  const one=response();
  await handler(req('GET',{query:{id:clientId}}),one);
  assert.equal(one.statusCode,200);
  assert.equal(one.body.client.email,'synthese@example.test');
  assert.equal(one.body.client.internal_note,undefined);
  const missing=response();
  await handler(req('GET',{query:{id:'00000000-0000-4000-8000-000000000099'}}),missing);
  assert.equal(missing.statusCode,404);
  const updated=response();
  await handler(req('PATCH',{query:{id:clientId},body:{changes:{status:'Actif',main_constraint:'Relancer les suivis',crm_url:''},reason:'  Point hebdomadaire  '}}),updated);
  assert.equal(updated.statusCode,200);
  assert.equal(updated.body.client.status,'Actif');
  assert.equal(updated.body.client.internal_note,undefined);
  const marker=response();
  await handler(req('PATCH',{query:{id:clientId},body:{changes:{main_constraint:'code EAA court'},reason:'Libellé ordinaire'}}),marker);
  assert.equal(marker.statusCode,200);
  const rpc=fetchMock.calls.find(call=>call.url.includes('/rpc/bot_update_client'));
  assert.deepEqual(rpc.body,{p_client:clientId,p_patch:{status:'Actif',main_constraint:'Relancer les suivis',crm_url:''},p_actor:'alpha',p_reason:'Point hebdomadaire'});
  assert.ok(fetchMock.calls.every(call=>!['PATCH','PUT','DELETE'].includes(call.method)));
  assert.ok(fetchMock.calls.filter(call=>call.method==='POST').every(call=>!call.url.includes('/rest/v1/clients')));
  const audits=fetchMock.calls.filter(call=>call.url.endsWith('/bot_audit_log')).map(call=>call.body);
  assert.deepEqual(audits.map(row=>row.action),['list','get','get']);
  assert.equal(audits[1].client_id,clientId);
  assert.equal(audits[2].client_id,null);
  assert.equal(audits[2].reason,'dossier introuvable');
  assert.ok(audits.every(row=>row.actor==='alpha'&&row.request_id));
  noToken(fetchMock.calls);
  const source=await fs.readFile(new URL('../routes/bot-clients.js',import.meta.url),'utf8');
  assert.match(source,/rpc\('bot_update_client'/);
  assert.match(source,/from\('clients'\)\.select\(/);
  assert.doesNotMatch(source,/from\('clients'\)\.(insert|update|delete|upsert)/);
 }finally{fetchMock.restore();restore()}
});

test('le catch-all reconnaît bot-clients et garde les autres réponses stables',async()=>{
 const restore=env({});
 try{
  const missing=response();
  await dispatch({method:'GET',url:'/api/bot-clients',headers:{},query:{slug:['bot-clients']}},missing);
  assert.equal(missing.statusCode,503);
  assert.deepEqual(missing.body,{error:'Configuration serveur indisponible.'});
  const post=response();
  await dispatch({method:'POST',url:'/api/bot-clients',headers:{},query:{slug:['bot-clients']}},post);
  assert.equal(post.statusCode,405);
  const unknown=response();
  await dispatch({method:'GET',url:'/api/inconnu',headers:{},query:{slug:['inconnu']}},unknown);
  assert.equal(unknown.statusCode,404);
 }finally{restore()}
});

test('SQL bot_client_access : admins lisent, service_role seul met à jour, champs hors liste refusés',async()=>{
 const db=new PGlite();
 const id='00000000-0000-4000-8000-000000000001';
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema private;
  create function private.is_admin() returns boolean language sql stable as $$ select current_setting('test.admin',true)='yes' $$;
  grant usage on schema private to authenticated;grant execute on function private.is_admin() to authenticated;
  create table public.clients (
   id uuid primary key,name text not null,email text not null default '',offer text,
   status text not null default 'Onboarding' check (status in ('Onboarding','Actif','En pause','Terminé')),
   sector text not null default '',main_constraint text not null default '',launch_date date,
   work_mode text not null default 'Solo' check (work_mode in ('Solo','Équipe')),
   support_start date,support_end date,crm_url text not null default '' check (crm_url='' or crm_url ~ '^https://[^[:space:]]+$'),
   meta_ad_account_id text,ghl_location_id text,created_at timestamptz not null default now(),
   constraint support_dates_order check (support_start is null or support_end is null or support_end>=support_start));`);
 await db.query("insert into clients(id,name,email,status) values($1,'Synthèse','synthese@example.test','Onboarding')",[id]);
 await db.exec(await fs.readFile(new URL('../migrations/20261029_bot_client_access.sql',import.meta.url),'utf8'));
 await db.exec('set role service_role');
 const updated=await db.query("select public.bot_update_client($1,$2::jsonb,'alpha','Point hebdomadaire') as row",[id,JSON.stringify({status:'Actif',sector:'Courtage'})]);
 const row=updated.rows[0].row;
 assert.equal(row.status,'Actif');
 assert.equal(row.email,'synthese@example.test');
 await assert.rejects(db.query("select public.bot_update_client($1,'{\"email\":\"autre@example.test\"}'::jsonb,'alpha','non')",[id]),/field not allowed/);
 await assert.rejects(db.query("select public.bot_update_client($1,'{}'::jsonb,'alpha','vide')",[id]),/empty patch/);
 await assert.rejects(db.query("select public.bot_update_client($1,'{\"crm_url\":\"http://mauvais.example\"}'::jsonb,'alpha','lien')",[id]),/check constraint|crm_https/);
 await db.exec('reset role');
 const kept=(await db.query('select email,status from clients where id=$1',[id])).rows[0];
 assert.equal(kept.email,'synthese@example.test');
 assert.equal(kept.status,'Actif');
 await db.exec('set role authenticated');
 await db.exec("select set_config('test.admin','no',false)");
 assert.equal((await db.query('select * from bot_audit_log')).rows.length,0);
 await assert.rejects(db.query("select public.bot_update_client($1,'{\"status\":\"En pause\"}'::jsonb,'alpha','non')",[id]),/permission denied/);
 await db.exec("select set_config('test.admin','yes',false)");
 const audit=(await db.query('select actor,action,changes,reason from bot_audit_log')).rows[0];
 const changes=typeof audit.changes==='string'?JSON.parse(audit.changes):audit.changes;
 assert.equal(audit.actor,'alpha');
 assert.equal(audit.action,'update');
 assert.equal(audit.reason,'Point hebdomadaire');
 assert.equal(changes.before.status,'Onboarding');
 assert.equal(changes.after.status,'Actif');
 assert.equal(changes.before.email,undefined);
 await db.exec('reset role;set role anon');
 await assert.rejects(db.query('select * from bot_audit_log'),/permission denied/);
 await db.exec('reset role;set role service_role');
 await db.query("insert into bot_audit_log(actor,action,reason,request_id) values('refus','denied','jeton refusé','req-1')");
 await db.close();
});
