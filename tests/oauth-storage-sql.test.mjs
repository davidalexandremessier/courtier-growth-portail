import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',C='00000000-0000-0000-0000-000000000003';
test('agency store SQL: no client access, state consumed once, refresh lease and reconnect invalidate old writer',async()=>{
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await db.exec(await fs.readFile(new URL('../review/agency-oauth-storage.proposal.sql',import.meta.url),'utf8'));
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from agency_oauth_credentials'),/permission denied/);await assert.rejects(db.query("select consume_agency_oauth_state('s',$1,'zoom')",[A]),/permission denied/);
 await db.exec('reset role;set role service_role');await db.query("insert into agency_oauth_states values('s',$1,'zoom',now()+interval '10 min')",[A]);
 assert.equal((await db.query("select consume_agency_oauth_state('s',$1,'zoom') ok",[B])).rows[0].ok,false);
 assert.equal((await db.query("select consume_agency_oauth_state('s',$1,'zoom') ok",[A])).rows[0].ok,true);assert.equal((await db.query("select consume_agency_oauth_state('s',$1,'zoom') ok",[A])).rows[0].ok,false);
 await db.query("select stage_agency_oauth($1,'zoom','encrypted','{}',now()+interval '1 hour')",[A]);await db.query("update agency_oauth_credentials set confirmed=true where admin_id=$1",[A]);
 assert.equal((await db.query("select lease_agency_oauth($1,'zoom',1,'lease-a') ok",[A])).rows[0].ok,true);assert.equal((await db.query("select lease_agency_oauth($1,'zoom',1,'lease-b') ok",[A])).rows[0].ok,false);
 await db.query("select stage_agency_oauth($1,'zoom','new encrypted','{}',now()+interval '1 hour')",[A]);assert.equal((await db.query("select finish_agency_oauth_refresh($1,'zoom','lease-a','stale',now()+interval '1 hour') ok",[A])).rows[0].ok,false);
 const row=(await db.query('select * from agency_oauth_credentials')).rows[0];assert.equal(row.ciphertext,'new encrypted');assert.equal(row.confirmed,false);assert.equal(row.revision,2);await db.close();
});
test('Meta SQL: only own Solo/Responsable, no direct credentials, atomic confirmation and replay rejection',async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table clients(id uuid primary key,work_mode text,meta_ad_account_id text);create table client_memberships(client_id uuid,user_id uuid);create table team_members(client_id uuid,user_id uuid,team_role text);
 create function private.can_write_shared_daily(cid uuid) returns boolean language sql as $$ select exists(select 1 from public.client_memberships m join public.clients c on c.id=m.client_id where m.client_id=cid and m.user_id=auth.uid() and (c.work_mode='Solo' or exists(select 1 from public.team_members t where t.client_id=cid and t.user_id=auth.uid() and t.team_role='Responsable'))) $$;
 create table oauth_pending(id uuid primary key,client_id uuid,created_by uuid,provider text,expires_at timestamptz);create table oauth_connections(client_id uuid,provider text,account_id text,account_name text,ciphertext text,expires_at timestamptz,revision int default 1,updated_at timestamptz,lease text,lease_until timestamptz,primary key(client_id,provider));
 grant usage on schema auth,private to authenticated;grant select on clients,client_memberships,team_members to authenticated;grant all on all tables in schema public to service_role;`);
 await db.exec(await fs.readFile(new URL('../review/meta-client-access.proposal.sql',import.meta.url),'utf8'));
 await db.query("insert into clients values($1,'Solo',null),($2,'Équipe',null)",[A,B]);await db.query('insert into client_memberships values($1,$1),($2,$2),($2,$3)',[A,B,C]);await db.query("insert into team_members values($1,$1,'Responsable'),($1,$2,'Courtier')",[B,C]);
 await db.exec(`set role authenticated;set test.uid='${A}'`);assert.equal((await db.query('select can_connect_meta($1) ok',[A])).rows[0].ok,true);assert.equal((await db.query('select can_connect_meta($1) ok',[B])).rows[0].ok,false);await assert.rejects(db.query('select ciphertext from oauth_connections'),/permission denied/);
 await db.exec(`set test.uid='${C}'`);assert.equal((await db.query('select can_connect_meta($1) ok',[B])).rows[0].ok,false);
 await db.exec(`set test.uid='${B}'`);assert.equal((await db.query('select can_connect_meta($1) ok',[B])).rows[0].ok,true);
 await db.exec('reset role;set role service_role');await db.query("insert into oauth_pending values($1,$1,$1,'meta',now()+interval '10 min')",[A]);
 const q="select confirm_client_meta($1,$2,'account','Synthetic','encrypted',now()+interval '1 hour',0)";
 await assert.rejects(db.query(q,[B,A]),/expired/);await db.query(q,[A,A]);await assert.rejects(db.query(q,[A,A]),/expired/);assert.equal((await db.query('select meta_ad_account_id from clients where id=$1',[B])).rows[0].meta_ad_account_id,null);await db.close();
});
