import fs from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const MODEL_SQL=`create role authenticated;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function private.can_access_client(cid uuid) returns boolean language sql stable as $$select cid=auth.uid()$$;
 create table growth_activities(id uuid primary key default gen_random_uuid(),client_id uuid not null,activity_date date not null check(activity_date<=(now() at time zone 'America/Toronto')::date),kind text not null check(kind in ('call','response','appointment','sale','note','blocker')),quantity integer check(quantity>=0),body text not null check(length(trim(body)) between 1 and 4000),source text not null check(source in ('manual','import')),external_ref text,created_by uuid not null,created_at timestamptz not null default now(),replaces_id uuid references growth_activities(id),unique(client_id,external_ref),unique(replaces_id),check((source='manual' and external_ref is null) or (source='import' and length(trim(external_ref)) between 1 and 200)),check(source<>'import' or external_ref is not null));
 create function private.validate_activity() returns trigger language plpgsql as $$begin
 if auth.uid() is null or not private.can_access_client(new.client_id) then raise exception 'Dossier inaccessible';end if;
 if new.replaces_id is not null and not exists(select 1 from growth_activities where id=new.replaces_id and client_id=new.client_id and created_by=auth.uid()) then raise exception 'Correction inaccessible';end if;
 new.created_by=auth.uid();new.created_at=clock_timestamp();return new;end$$;
 create trigger validate_activity before insert on growth_activities for each row execute function private.validate_activity();
 alter table growth_activities enable row level security;
 create policy growth_read on growth_activities for select to authenticated using(private.can_access_client(client_id));
 create policy growth_insert on growth_activities for insert to authenticated with check(private.can_access_client(client_id) and created_by=auth.uid());
 grant usage on schema public,auth,private to authenticated;grant select,insert on growth_activities to authenticated;`;
test('PostgreSQL local : journal append-only, isolation RLS et blocage du cron sans identité',async()=>{
 const db=new PGlite();const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 try{await db.exec(MODEL_SQL);
 const insert=client=>db.query(`insert into growth_activities(client_id,activity_date,kind,body,source,external_ref,created_by) values($1,current_date-2,'note','source metric','import','stats:fact:unique',$1)`,[client]);
 await db.exec(`set request.jwt.claim.sub='${b}'`);await insert(b);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}'`);await insert(a);
 const visible=await db.query('select client_id from growth_activities');assert.deepEqual(visible.rows.map(r=>r.client_id),[a]);
 await assert.rejects(insert(b),/Dossier inaccessible/);await assert.rejects(insert(a),/duplicate key/);
 await assert.rejects(db.exec("update growth_activities set body='overwrite'"),/permission denied/);
 await db.exec("reset role;set request.jwt.claim.sub=''");await assert.rejects(insert(a),/Dossier inaccessible/);
 assert.equal((await db.query('select count(*)::int n from growth_activities')).rows[0].n,2);
 }finally{await db.close()}
});
test('proposition serveur non appliquée : garde locale refuse compte croisé, métrique absente et origine CSV',async()=>{
 const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 try{await db.exec(MODEL_SQL);const sql=await fs.readFile('work/SYNC-24H-PROPOSITION.sql','utf8'),guard=sql.match(/addition text:=\$guard\$([\s\S]*?)\$guard\$;/)?.[1];assert.ok(guard);
  await db.exec(`create role service_role bypassrls;create table public.clients(id uuid primary key,meta_ad_account_id text,ghl_location_id text);create table public.app_admins(user_id uuid primary key);insert into clients values('${a}','account-A',null),('${b}','account-B',null);insert into app_admins values('${a}');grant usage on schema public,auth,private to service_role;grant select,insert on growth_activities to service_role;grant select on clients,app_admins to service_role;
   create or replace function private.validate_activity() returns trigger language plpgsql as $f$begin ${guard} if auth.uid() is null or not private.can_access_client(new.client_id) then raise exception 'Dossier inaccessible';end if;new.created_by=auth.uid();return new;end$f$;set role service_role;set request.jwt.claim.sub='';`);
  const fact={client_id:a,provider:'meta',account_id:'account-A',object_id:'account_daily',date:'2026-10-21',metric:'spend',value:12,currency:'CAD',timezone:'America/Toronto',channel:'paid',cohort:'activity_period'},body=(record=fact,origin='meta_api')=>'CG_SOURCE_STATS_V1\n'+JSON.stringify({type:'fact',origin,run_id:'a'.repeat(64),record});let sequence=0;
  const insert=(record,origin)=>db.query(`insert into growth_activities(client_id,activity_date,kind,body,source,external_ref,created_by) values($1,'2026-10-21','note',$2,'import',$3,$1)`,[a,body(record,origin),'stats:fact:'+String(++sequence).padStart(64,'0')+':'+'c'.repeat(64)]);
  await insert(fact);await assert.rejects(insert({...fact,account_id:'account-B'}),/hors dossier/);await assert.rejects(insert({...fact,metric:undefined}),/Fait source invalide/);await assert.rejects(insert(fact,'csv'),/Fait source invalide/);
  assert.equal((await db.query('select count(*)::int n from growth_activities')).rows[0].n,1);
  await db.exec('reset role;create function private.growth_validate() returns trigger language plpgsql as $$begin return new;end$$;');
  await assert.rejects(db.exec(sql),/Garde anti-dérive/);await db.exec('rollback');
 }finally{await db.close()}
});
