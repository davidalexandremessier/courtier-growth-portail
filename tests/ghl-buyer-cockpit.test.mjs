import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {PGlite} from '@electric-sql/pglite';
import dispatch from '../api/[slug].js';
import {assertServerlessBudget} from '../scripts/serverless-budget.mjs';
import {handleBuyerWebhook, resetBuyerRateLimit, hashBuyerToken, signBuyerToken, eventIdentity, validateBuyerEvent, LOCATION_LIMIT, MAX_BODY} from '../server/ghl-buyer-webhook.mjs';
import {buyerActivity, dossierBuyersHtml, publicBuyerHtml, v2BuyersHtml} from '../src/buyer-cockpit.mjs';
import {deepLinkPages, dossierSidebarGroups, clientSectionFor, primaryDestination} from '../src/portal-navigation.mjs';
import {pageAllowed} from '../src/entitlements.mjs';

const token='webhook-token-test-value';
const secret='portal-secret-test-value';
const clientA='10000000-0000-4000-8000-000000000001';
const clientB='10000000-0000-4000-8000-000000000002';
const userA='20000000-0000-4000-8000-000000000001';
const userB='20000000-0000-4000-8000-000000000002';
const adminId='20000000-0000-4000-8000-000000000003';

function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(b){this.body=b;return this}}}
function env(extra){
 const keys=['GHL_BUYER_WEBHOOK_TOKEN','GHL_BUYER_PORTAL_SECRET','APP_URL','SUPABASE_URL','SUPABASE_ARCHIVE_SECRET_KEY'];
 const prev=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const values={GHL_BUYER_WEBHOOK_TOKEN:token,GHL_BUYER_PORTAL_SECRET:secret,APP_URL:'https://portail.example.test',...extra};
 for(const key of keys){if(values[key]===undefined)delete process.env[key];else process.env[key]=values[key]}
 return ()=>{for(const key of keys){if(prev[key]===undefined)delete process.env[key];else process.env[key]=prev[key]}};
}
function memory(clients){
 const state={clients,events:[],access:[],calls:[]};
 return {state,
  async clientsByLocation(id){state.calls.push('lookup');return state.clients.filter(c=>c.ghl_location_id===id)},
  async insertEvent(row){state.calls.push('insert');if(state.events.some(event=>eventIdentity(event)===eventIdentity(row)))return {stored:false};state.events.push({...row});return {stored:true}},
  async ensureAccess(row){state.calls.push('access');const found=state.access.find(item=>item.client_id===row.client_id&&item.contact_id===row.contact_id);if(!found){state.access.push({...row,revoked_at:null});return}if(found.revoked_at)return;found.token_hash=row.token_hash},
  async accessByHash(hash){const row=state.access.find(item=>item.token_hash===hash);if(!row)return null;return {...row,broker_name:state.clients.find(client=>client.id===row.client_id)?.name||''}},
  async eventsFor(){return state.events}
 };
}
const coup=(extra={})=>({event:'coup_de_coeur',location_id:'loc-a',contact_id:'contact-a',occurred_at:'2026-10-30T18:42:00Z',contact_name:'Alex Martin',contact_email:'alex@example.com',note:'Lumineux',property:{centris_id:'24589001',address:'123 rue des Érables',price:489000,url:'https://www.centris.ca/fr/x/24589001'},...extra});
let clock=1_000_000;
async function post(db,body,headers={'x-cg-webhook-token':token},now){
 const res=response();
 await handleBuyerWebhook({method:'POST',url:'/api/ghl-webhook/buyer-cockpit',headers,body},res,{db,now:()=>now??(clock+=61_000)});
 return res;
}
function silence(){
 const names=['log','info','warn','error','debug'];
 const prev=Object.fromEntries(names.map(name=>[name,console[name]]));
 const lines=[];
 for(const name of names) console[name]=(...args)=>{lines.push(args.map(String).join(' '))};
 return {lines,restore(){for(const name of names) console[name]=prev[name]}};
}

test('auth : 401 sans jeton ou avec un mauvais jeton, 503 si la config manque, jeton jamais journalisé',async()=>{
 resetBuyerRateLimit();
 const restore=env();
 const logs=silence();
 const db=memory([{id:clientA,name:'Camille',ghl_location_id:'loc-a'}]);
 try{
  const missing=await post(db,coup(),{});
  assert.equal(missing.statusCode,401);
  assert.deepEqual(missing.body,{error:'Jeton webhook refusé.'});
  assert.equal(JSON.stringify(missing.body).includes(token),false);
  const wrong=await post(db,coup(),{'x-cg-webhook-token':'autre-jeton-beaucoup-plus-long'});
  assert.equal(wrong.statusCode,401);
  const short=await post(db,coup(),{'x-cg-webhook-token':'court'});
  assert.equal(short.statusCode,401);
  assert.equal(db.state.calls.length,0);
  assert.equal(logs.lines.join('\n').includes(token),false);
  assert.equal(logs.lines.join('\n').includes(secret),false);
 }finally{logs.restore();restore()}
 for(const extra of [{GHL_BUYER_WEBHOOK_TOKEN:undefined},{GHL_BUYER_WEBHOOK_TOKEN:'court'},{GHL_BUYER_PORTAL_SECRET:undefined},{APP_URL:undefined},{APP_URL:'http://mauvais.example'}]){
  const back=env(extra);
  try{
   const res=await post(memory([]),coup());
   assert.equal(res.statusCode,503);
   assert.deepEqual(res.body,{error:'Configuration serveur indisponible.'});
  }finally{back()}
 }
});

test('validation : 400 avec la liste des champs, rien n’est écrit',async()=>{
 resetBuyerRateLimit();
 const restore=env();
 const db=memory([{id:clientA,name:'Camille',ghl_location_id:'loc-a'}]);
 try{
  const empty=await post(db,{});
  assert.equal(empty.statusCode,400);
  assert.deepEqual(empty.body.fields,['event','location_id','contact_id','occurred_at']);
  const price=await post(db,coup({property:{centris_id:'24589001',price:'489000'}}));
  assert.equal(price.statusCode,400);
  assert.deepEqual(price.body.fields,['property.price']);
  const missingBien=await post(db,coup({property:{address:'sans référence'}}));
  assert.equal(missingBien.statusCode,400);
  assert.deepEqual(missingBien.body.fields,['property.centris_id','property.url']);
  const bad=await post(db,'{');
  assert.equal(bad.statusCode,400);
  assert.deepEqual(bad.body,{error:'JSON invalide.',fields:['body']});
  const huge=await post(db,'x'.repeat(MAX_BODY+1));
  assert.equal(huge.statusCode,400);
  assert.equal(huge.body.fields[0],'body');
  assert.equal(validateBuyerEvent({event:'portal_link',location_id:'loc-a',contact_id:'c',occurred_at:'2026-10-30T18:42:00-04:00'}).value.occurred_at,'2026-10-30T22:42:00.000Z');
  assert.equal(db.state.events.length,0);
  assert.equal(db.state.access.length,0);
 }finally{restore()}
});

test('emplacement inconnu ou ambigu : rien n’est stocké',async()=>{
 resetBuyerRateLimit();
 const restore=env();
 const db=memory([{id:clientA,name:'Camille',ghl_location_id:'loc-a'},{id:clientB,name:'Autre',ghl_location_id:'loc-b'}]);
 try{
  const unknown=await post(db,coup({location_id:'loc-inconnue'}));
  assert.equal(unknown.statusCode,404);
  assert.match(unknown.body.error,/Sous-compte GHL inconnu/);
  assert.deepEqual(db.state.calls,['lookup']);
  const ambiguous=memory([{id:clientA,name:'Un',ghl_location_id:'loc-a'},{id:clientB,name:'Deux',ghl_location_id:'loc-a'}]);
  const conflict=await post(ambiguous,coup());
  assert.equal(conflict.statusCode,409);
  assert.equal(ambiguous.state.events.length,0);
  assert.equal(ambiguous.state.access.length,0);
 }finally{restore()}
});

test('idempotence et lien stable, y compris après révocation',async()=>{
 resetBuyerRateLimit();
 const restore=env();
 const db=memory([{id:clientA,name:'Camille Courtier',ghl_location_id:'loc-a'}]);
 try{
  const first=await post(db,coup());
  assert.equal(first.statusCode,200);
  assert.equal(first.body.ok,true);
  const again=await post(db,coup({note:'une autre note qui ne doit pas dupliquer'}));
  assert.equal(again.statusCode,200);
  assert.equal(again.body.portal_url,first.body.portal_url);
  assert.equal(db.state.events.length,1);
  assert.equal(db.state.events[0].note,'Lumineux');
  assert.equal(db.state.access.length,1);
  assert.equal(db.state.access[0].token_hash,hashBuyerToken(signBuyerToken(clientA,'contact-a')));
  assert.equal(db.state.access[0].token_hash.includes(token),false);
  const other=await post(db,coup({property:{centris_id:'999',address:'Autre rue',price:1,url:'https://www.centris.ca/fr/y/999'}}));
  assert.equal(other.body.portal_url,first.body.portal_url);
  assert.equal(db.state.events.length,2);
  const shifted=await post(db,coup({occurred_at:'2026-10-30T14:42:00-04:00',note:'même instant'}));
  assert.equal(db.state.events.length,2);
  assert.equal(shifted.body.portal_url,first.body.portal_url);
  db.state.access[0].revoked_at='2026-10-30T20:00:00.000Z';
  const after=await post(db,coup());
  assert.equal(after.body.portal_url,first.body.portal_url);
  assert.equal(db.state.access[0].revoked_at,'2026-10-30T20:00:00.000Z');
  const url=new URL(first.body.portal_url);
  assert.equal(url.origin,'https://portail.example.test');
  assert.equal(url.searchParams.get('acheteur'),signBuyerToken(clientA,'contact-a'));
 }finally{restore()}
});

test('limite légère par sous-compte',async()=>{
 resetBuyerRateLimit();
 const restore=env();
 const db=memory([{id:clientA,name:'Camille',ghl_location_id:'loc-a'}]);
 const now=()=>5_000_000;
 try{
  for(let i=0;i<LOCATION_LIMIT;i++){
   const res=await post(db,coup({contact_id:'c'+i}),{'x-cg-webhook-token':token},now());
   assert.equal(res.statusCode,200,String(i));
  }
  const blocked=await post(db,coup({contact_id:'apres'}),{'x-cg-webhook-token':token},now());
  assert.equal(blocked.statusCode,429);
  assert.equal(blocked.headers['Retry-After'],'60');
  assert.equal(db.state.events.length,LOCATION_LIMIT);
 }finally{restore()}
});

test('isolation acheteur : A ne voit ni B ni le courtier voisin',async()=>{
 resetBuyerRateLimit();
 const restore=env();
 const db=memory([{id:clientA,name:'Camille Courtier',ghl_location_id:'loc-a'},{id:clientB,name:'Courtier Voisin',ghl_location_id:'loc-b'}]);
 try{
  await post(db,coup());
  await post(db,coup({contact_id:'contact-b',contact_name:'Sam Roy',contact_email:'sam@example.com',note:'Note de Sam',property:{centris_id:'888',address:'9 rue de Sam',price:10,url:'https://www.centris.ca/fr/sam'}}));
  await post(db,coup({location_id:'loc-b',contact_id:'contact-c',contact_name:'Joe Voisin',note:'Secret voisin',property:{centris_id:'777',address:'1 rue du Voisin',price:20,url:'https://www.centris.ca/fr/voisin'}}));
  await post(db,{event:'portal_link',location_id:'loc-a',contact_id:'contact-a',occurred_at:'2026-10-29T12:00:00Z',note:'ne pas montrer ce lien interne'});
  const portal=new URL((await post(db,coup())).body.portal_url);
  const seen=response();
  await handleBuyerWebhook({method:'GET',url:'/api/ghl-webhook/buyer-cockpit?token='+portal.searchParams.get('acheteur'),headers:{},query:{token:portal.searchParams.get('acheteur')}},seen,{db,now:()=>9_000_000});
  assert.equal(seen.statusCode,200);
  assert.equal(seen.body.broker_name,'Camille Courtier');
  assert.equal(seen.body.contact_name,'Alex Martin');
  assert.equal(seen.body.coups_de_coeur.length,1);
  assert.equal(seen.body.coups_de_coeur[0].property.centris_id,'24589001');
  const blob=JSON.stringify(seen.body);
  for(const secretText of ['Sam Roy','sam@example.com','Note de Sam','9 rue de Sam','Joe Voisin','Secret voisin','1 rue du Voisin','Courtier Voisin','contact-b','contact-c',token,secret]) assert.equal(blob.includes(secretText),false,secretText);
  const html=publicBuyerHtml({brokerName:seen.body.broker_name,contactName:seen.body.contact_name,coups:seen.body.coups_de_coeur});
  const dom=new JSDOM(html).window.document;
  assert.match(dom.body.textContent,/Vos coups de cœur/);
  assert.match(dom.body.textContent,/123 rue des Érables/);
  assert.equal(dom.querySelector('form,button,[contenteditable]'),null);
  assert.equal(html.includes('<script'),false);
  db.state.access[0].revoked_at='2026-10-31T00:00:00.000Z';
  const revoked=response();
  await handleBuyerWebhook({method:'GET',url:'/api/ghl-webhook/buyer-cockpit?token='+portal.searchParams.get('acheteur'),headers:{},query:{token:portal.searchParams.get('acheteur')}},revoked,{db,now:()=>9_100_000});
  assert.equal(revoked.statusCode,404);
  const absent=response();
  await handleBuyerWebhook({method:'GET',url:'/api/ghl-webhook/buyer-cockpit',headers:{}},absent,{db,now:()=>9_200_000});
  assert.equal(absent.statusCode,401);
 }finally{restore()}
});

test('portée courtier : le dossier A ne contient pas le dossier B, l’admin voit les deux',()=>{
 const events=[
  {client_id:clientA,contact_id:'a',contact_name:'Alex Martin',event:'coup_de_coeur',property:{address:'123 rue des Érables',centris_id:'1'},note:'note A',occurred_at:'2026-10-28T18:00:00.000Z'},
  {client_id:clientA,contact_id:'a2',contact_name:'Sam Roy',event:'portal_link',occurred_at:'2026-10-30T18:00:00.000Z'},
  {client_id:clientB,contact_id:'b',contact_name:'Joe Voisin',event:'coup_de_coeur',property:{address:'1 rue du Voisin'},note:'secret B',occurred_at:'2026-10-29T18:00:00.000Z'}
 ];
 const clients=[{id:clientA,name:'Camille'},{id:clientB,name:'Voisin'}];
 const broker=buyerActivity(events,{admin:false,clientId:clientA,clients});
 assert.deepEqual(broker.map(buyer=>buyer.contactId),['a2','a']);
 assert.equal(broker.some(buyer=>buyer.coups.some(coup=>String(coup.property?.address).includes('Voisin'))),false);
 const html=dossierBuyersHtml(broker,{admin:false})+v2BuyersHtml(broker,{admin:false});
 assert.equal(html.includes('Joe Voisin'),false);
 assert.equal(html.includes('1 rue du Voisin'),false);
 assert.match(html,/Alex Martin/);
 assert.equal(html.includes('<script'),false);
 const hostile=buyerActivity([{...events[0],contact_name:'<img src=x onerror=alert(1)>'}],{clientId:clientA,clients});
 assert.equal(dossierBuyersHtml(hostile).includes('<img'),false);
 const admin=buyerActivity(events,{admin:true,clientId:clientA,clients});
 assert.equal(admin.length,3);
 assert.match(v2BuyersHtml(admin,{admin:true}),/Révoquer le lien/);
 assert.equal(v2BuyersHtml(broker,{admin:false}).includes('Révoquer'),false);
});

test('navigation : ?page=acheteurs est dans le menu du dossier',()=>{
 for(const offer of ['Campagne 97 $','Groupe','1:1']){
  const items=dossierSidebarGroups(offer).flatMap(([,rows])=>rows);
  assert.equal(items.filter(([id])=>id==='acheteurs').length,1);
  assert.equal(pageAllowed(offer,'acheteurs'),true);
 }
 assert.equal(clientSectionFor('acheteurs'),'acheteurs');
 assert.equal(deepLinkPages.includes('acheteurs'),true);
 assert.equal(primaryDestination('acheteurs',false,'1:1'),'dashboard');
});

test('une seule fonction, le chemin imbriqué est délégué, les autres restent 404',async()=>{
 const files=await assertServerlessBudget();
 assert.deepEqual(files,['api/[slug].js']);
 const restore=env({GHL_BUYER_WEBHOOK_TOKEN:undefined});
 try{
  const hit=response();
  await dispatch({method:'POST',url:'/api/ghl-webhook/buyer-cockpit',headers:{},query:{slug:['ghl-webhook','buyer-cockpit']},body:{}},hit);
  assert.equal(hit.statusCode,503);
  const other=response();
  await dispatch({method:'POST',url:'/api/ghl-webhook/autre',headers:{},query:{slug:['ghl-webhook','autre']}},other);
  assert.equal(other.statusCode,404);
  const nested=response();
  await dispatch({method:'GET',url:'/api/calls/extra',headers:{},query:{slug:['calls','extra']}},nested);
  assert.equal(nested.statusCode,404);
 }finally{restore()}
});

test('PostgreSQL local : idempotence, RLS, admin et isolation des dossiers',async()=>{
 const sql=await fs.readFile(new URL('../migrations/20261030_buyer_cockpit.sql',import.meta.url),'utf8');
 const db=new PGlite();
 try{
  await db.exec(`create schema if not exists private; create schema if not exists auth;
   create role anon; create role authenticated; create role service_role;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function private.is_admin() returns boolean language sql stable as $$ select current_setting('test.admin',true)='yes' $$;
   create table public.clients(id uuid primary key, name text, ghl_location_id text);
   create table public.client_memberships(client_id uuid, user_id uuid);
   create function private.can_access_client(cid uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.client_memberships where client_id=cid and user_id=auth.uid()) $$;`);
  await db.exec(sql);
  await db.exec(`insert into clients values('${clientA}','Camille','loc-a'),('${clientB}','Voisin','loc-b');
   insert into client_memberships values('${clientA}','${userA}'),('${clientB}','${userB}');
   insert into buyer_cockpit_events(client_id,ghl_location_id,contact_id,contact_name,event,property,note,occurred_at)
   values ('${clientA}','loc-a','contact-a','Alex','coup_de_coeur','{"centris_id":"24589001","address":"123 rue des Érables"}','note A','2026-10-30T18:42:00Z'),
          ('${clientB}','loc-b','contact-b','Joe','coup_de_coeur','{"address":"1 rue du Voisin"}','secret B','2026-10-29T18:42:00Z');
   insert into buyer_portal_access(client_id,contact_id,token_hash) values('${clientA}','contact-a','${'ab'.repeat(32)}');`);
  await assert.rejects(db.exec(`insert into buyer_cockpit_events(client_id,ghl_location_id,contact_id,event,property,occurred_at) values('${clientA}','loc-a','contact-a','coup_de_coeur','{"centris_id":"24589001","url":"https://www.centris.ca/autre"}','2026-10-30T14:42:00-04:00')`),/unique|duplicate/i);
  await db.exec(`insert into buyer_cockpit_events(client_id,ghl_location_id,contact_id,event,property,occurred_at) values('${clientA}','loc-a','contact-a','coup_de_coeur','{"url":"https://www.centris.ca/sans-centris"}','2026-10-30T18:42:00Z')`);
  await assert.rejects(db.exec(`insert into clients(id,name,ghl_location_id) values('30000000-0000-4000-8000-000000000003','Doublon','loc-a')`),/unique|duplicate/i);
  await db.exec(`grant usage on schema public,auth,private to authenticated, anon; grant execute on all functions in schema auth, private to authenticated, anon;`);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${userA}',false); select set_config('test.admin','no',false);`);
  const own=await db.query('select contact_name from buyer_cockpit_events');
  assert.deepEqual(own.rows.map(row=>row.contact_name).filter(Boolean).sort(),['Alex']);
  assert.equal(own.rows.some(row=>row.contact_name==='Joe'),false);
  await assert.rejects(db.exec(`insert into buyer_cockpit_events(client_id,ghl_location_id,contact_id,event,occurred_at) values('${clientA}','loc-a','x','portal_link','2026-10-01T00:00:00Z')`),/permission|row-level/i);
  assert.equal((await db.query('select * from buyer_portal_access')).rows.length,0);
  await db.exec(`select set_config('request.jwt.claim.sub','${userB}',false);`);
  const other=await db.query('select contact_name from buyer_cockpit_events');
  assert.deepEqual(other.rows.map(row=>row.contact_name),['Joe']);
  await db.exec(`select set_config('request.jwt.claim.sub','${adminId}',false); select set_config('test.admin','yes',false);`);
  assert.equal((await db.query('select * from buyer_cockpit_events')).rows.length,3);
  await db.exec(`update buyer_portal_access set revoked_at='2026-10-31T00:00:00Z' where contact_id='contact-a'`);
  assert.equal((await db.query('select revoked_at from buyer_portal_access')).rows[0].revoked_at!=null,true);
  await db.exec('reset role');
  await assert.rejects(db.exec(`set role anon; select * from buyer_cockpit_events`),/permission/i);
 }finally{await db.close()}
});
