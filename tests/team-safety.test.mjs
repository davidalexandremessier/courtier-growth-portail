import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {personSummary,validatePersonDay} from '../src/team.mjs';
import {summarizeDaily} from '../src/kpi.mjs';
import {dossierSidebarGroups} from '../src/portal-navigation.mjs';

test('menu direct : offres respectées, icône et libellé, aucun doublon ou lien AI David',()=>{
 for(const offer of ['Campagne 97 $','Groupe','1:1']){
  const items=dossierSidebarGroups(offer).flatMap(([,items])=>items);
  assert.equal(items.length,new Set(items.map(([id])=>id)).size);
  assert.ok(items.every(([id,icon,label])=>id&&icon&&label));
  assert.equal(items.some(([id])=>['david','connections','notes','calls'].includes(id)),false);
  assert.equal(items.some(([id])=>id==='production'),offer==='1:1');
  assert.equal(items.some(([id])=>id==='leads97'),offer==='Campagne 97 $');
  assert.equal(items.some(([id])=>id==='team'),offer==='1:1');
 }
});

test('équipe : zéros, inconnus et contributions séparées du journal commun',()=>{
 const reports=[{member_id:'one',report_date:'2026-10-20',responses:2,attended:0,appointments_due:0},{member_id:'one',report_date:'2026-10-20',responses:3,attended:0,appointments_due:0},{member_id:'two',report_date:'2026-10-20',responses:100}];
 const s=personSummary(reports,'one','2026-10-22',7);assert.equal(s.totals.responses,3);assert.equal(s.days,1);assert.equal(s.totals.signatures,null);assert.equal(s.totals.attended,0);assert.equal(s.showRate,null);
 const common=[{report_date:'2026-10-20',leads:5,responses:1}];const before=summarizeDaily(common,'2026-10-22',7);personSummary(reports,'two','2026-10-22',7);assert.equal(summarizeDaily(common,'2026-10-22',7).totals.responses,before.totals.responses);
 assert.throws(()=>validatePersonDay({report_date:'2026-10-23',responses:1},'2026-10-22'),/journée/);
 assert.throws(()=>validatePersonDay({report_date:'2026-10-20',responses:1.5},'2026-10-22'),/entiers/);
 assert.throws(()=>validatePersonDay({report_date:'2026-10-20',attended:2,appointments_due:1},'2026-10-22'),/dépasser/);
});

test('équipe PostgreSQL local : politiques inspectées, droits personnels et isolation des dossiers',async()=>{
 const live=JSON.parse(await fs.readFile(new URL('./fixtures/team-server-definitions.json',import.meta.url),'utf8'));
 const db=new PGlite();const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',C='00000000-0000-0000-0000-000000000003';
 const U='10000000-0000-0000-0000-000000000001',V='10000000-0000-0000-0000-000000000002',W='10000000-0000-0000-0000-000000000003';
 const M='20000000-0000-0000-0000-000000000001',N='20000000-0000-0000-0000-000000000002',O='20000000-0000-0000-0000-000000000003';
 try{
  await db.exec(`create schema private; create schema auth; create role authenticated; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;create function private.is_admin() returns boolean language sql stable as $$ select current_setting('test.admin',true)='yes' $$;
   create table clients(id uuid primary key,work_mode text,offer text);create table client_memberships(client_id uuid,user_id uuid,unique(client_id,user_id));create table profiles(id uuid,email text);
   create function private.can_access_client(cid uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.client_memberships where client_id=cid and user_id=auth.uid()) $$;
   create function private.offer_capability(cid uuid,cap text) returns boolean language sql stable security definer as $$ select exists(select 1 from public.clients where id=cid and offer='1:1') $$;
   create table team_members(id uuid primary key,client_id uuid,user_id uuid,name text,team_role text,unique(client_id,id),unique(client_id,user_id));
   create table team_daily_reports(id uuid primary key default gen_random_uuid(),client_id uuid,member_id uuid,report_date date,responses integer,updated_by uuid,unique(client_id,member_id,report_date),foreign key(client_id,member_id) references team_members(client_id,id));
   create table daily_reports(id uuid primary key default gen_random_uuid(),client_id uuid,report_date date,leads integer,updated_by uuid,unique(client_id,report_date));`);
  for(const f of live.functions)await db.exec(f.definition);
  await db.exec(`create trigger keep_identity before update on team_daily_reports for each row execute function private.keep_team_report_identity();
   insert into clients values('${A}','Équipe','1:1'),('${B}','Équipe','1:1'),('${C}','Équipe','Groupe');
   insert into client_memberships values('${A}','${U}'),('${A}','${V}'),('${B}','${W}'),('${C}','${U}');
   insert into team_members values('${M}','${A}','${U}','Membre fictif','Membre'),('${N}','${A}','${V}','Responsable fictif','Responsable'),('${O}','${B}','${W}','Autre dossier fictif','Membre');
   grant usage on schema public,private,auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;grant execute on all functions in schema private,auth to authenticated;`);
  for(const table of ['team_members','team_daily_reports','daily_reports'])await db.exec(`alter table ${table} enable row level security`);
  for(const p of live.policies)await db.exec(`create policy "${p.policyname}" on ${p.tablename} as ${p.permissive} for ${p.cmd} to authenticated ${p.qual?'using ('+p.qual+')':''} ${p.with_check?'with check ('+p.with_check+')':''}`);
  await db.exec(`set role authenticated;select set_config('test.user','${U}',false);select set_config('test.admin','no',false)`);
  assert.equal((await db.query('select * from team_members')).rows.length,2);
  await db.exec(`insert into team_daily_reports(client_id,member_id,report_date,responses,updated_by) values('${A}','${M}','2026-10-20',0,'${U}')`);
  await assert.rejects(db.exec(`insert into team_daily_reports(client_id,member_id,report_date,responses,updated_by) values('${A}','${N}','2026-10-20',1,'${U}')`),/row-level/);
  await assert.rejects(db.exec(`insert into team_daily_reports(client_id,member_id,report_date,responses,updated_by) values('${B}','${O}','2026-10-20',1,'${U}')`),/row-level/);
  await assert.rejects(db.exec(`insert into daily_reports(client_id,report_date,leads,updated_by) values('${A}','2026-10-20',5,'${U}')`),/row-level/);
  await assert.rejects(db.exec(`update team_daily_reports set report_date='2026-10-21'`),/déplacés/);
  await assert.rejects(db.exec(`insert into team_daily_reports(client_id,member_id,report_date,responses,updated_by) values('${A}','${M}','2026-10-20',3,'${U}')`),/unique/);
  await assert.rejects(db.query(`select save_team_member('${A}',null,'Non autorisé','Responsable','')`),/administrateur/);
  await db.exec(`select set_config('test.user','${V}',false);insert into daily_reports(client_id,report_date,leads,updated_by) values('${A}','2026-10-20',5,'${V}')`);
  await assert.rejects(db.exec(`update team_daily_reports set responses=99,updated_by='${V}' where member_id='${M}' returning *`).then(r=>{if(r[0].rows.length===0)throw Error('own-member-only')}),/own-member-only/);
  await db.exec(`select set_config('test.user','${W}',false)`);assert.equal((await db.query('select * from team_daily_reports')).rows.length,0);assert.equal((await db.query('select * from daily_reports')).rows.length,0);
 }finally{await db.close()}
});
