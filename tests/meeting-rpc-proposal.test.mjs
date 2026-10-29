import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('proposed PostgreSQL draft: admin gate, no video URL, one draft per anchor, mismatched dossier refused',async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema private; create function private.is_admin() returns boolean language sql as $$ select coalesce(current_setting('test.admin',true),'false')='true' $$;
 create table clients(id uuid primary key);insert into clients values('00000000-0000-0000-0000-000000000010'),('00000000-0000-0000-0000-000000000020');
 create table call_sources(id uuid primary key, client_id uuid, linked_appointment_id uuid, match_status text,provider text,transcript text,summary text,replay_url text,started_at timestamptz,title text,source_kind text default 'meeting',match_reason text);
 create table coachings(id uuid primary key default gen_random_uuid(),client_id uuid,meeting_at timestamptz,title text,transcript text,summary text,replay_url text,published boolean,source_anchor_id uuid unique);
 insert into call_sources values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010',null,'manual','zoom','Synthetic transcript','Synthetic summary','https://example.test/public-video',now(),'Synthetic');`);
 await db.exec(await fs.readFile(new URL('../review/prepare_call_coaching.text-only.proposal.sql',import.meta.url),'utf8'));
 await db.exec(await fs.readFile(new URL('../review/associate-meeting-group.proposal.sql',import.meta.url),'utf8'));
 const sql="select prepare_call_coaching_text('00000000-0000-0000-0000-000000000001') as id";
 await assert.rejects(db.query(sql),/administrateur/);await db.exec("set test.admin='true'");
 await assert.rejects(db.query("select associate_meeting_group(array['00000000-0000-0000-0000-000000000001']::uuid[],'00000000-0000-0000-0000-000000000020')"),/différent/);
 await db.query("select associate_meeting_group(array['00000000-0000-0000-0000-000000000001']::uuid[],'00000000-0000-0000-0000-000000000010')");
 const a=await db.query(sql),b=await db.query(sql);assert.equal(a.rows[0].id,b.rows[0].id);
 const rows=(await db.query('select * from coachings')).rows;assert.equal(rows.length,1);assert.equal(rows[0].published,false);assert.equal(rows[0].replay_url,'');assert.match(rows[0].transcript,/Synthetic transcript/);
 // A late source linked by reconciliation must not overwrite a published review.
 await db.exec("update coachings set published=true,summary='Reviewed published summary'");
 await db.exec(`insert into call_sources values('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','auto','wispr','Late Wispr original','Late Wispr native summary','',now(),'Late source');`);
 const late=await db.query("select prepare_call_coaching_text('00000000-0000-0000-0000-000000000003') as id");assert.equal(late.rows[0].id,a.rows[0].id);
 assert.deepEqual((await db.query('select published,summary from coachings')).rows,[{published:true,summary:'Reviewed published summary'}]);
 assert.equal((await db.query("select transcript from call_sources where id='00000000-0000-0000-0000-000000000003'")).rows[0].transcript,'Late Wispr original');
 await db.exec(`insert into call_sources values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000001','auto','wispr','Other transcript','','',now(),'Other');`);
 await assert.rejects(db.query("select prepare_call_coaching_text('00000000-0000-0000-0000-000000000002')"),/incompatible/);await db.close();
});
test('two native sources form one private draft and retries preserve the reviewed content',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema private;
 create function private.is_admin() returns boolean language sql as $$ select true $$;
 create table clients(id uuid primary key);
 create table call_sources(id uuid primary key,client_id uuid,linked_appointment_id uuid,match_status text,provider text,transcript text,summary text,replay_url text,started_at timestamptz,title text,source_kind text,match_reason text);
 create table coachings(id uuid primary key default gen_random_uuid(),client_id uuid,meeting_at timestamptz,title text,transcript text,summary text,replay_url text,published boolean,source_anchor_id uuid unique);`);
 for(const file of ['prepare_call_coaching.text-only.proposal.sql','associate-meeting-group.proposal.sql'])await db.exec(await fs.readFile(new URL('../review/'+file,import.meta.url),'utf8'));
 const client='00000000-0000-0000-0000-000000000010',z='00000000-0000-0000-0000-000000000001',w='00000000-0000-0000-0000-000000000002';
 await db.query('insert into clients values ($1)',[client]);
 for(const [id,provider] of [[z,'zoom'],[w,'wispr']])await db.query(`insert into call_sources(id,client_id,match_status,provider,transcript,summary,replay_url,started_at,title,source_kind) values($1,$2,'manual',$3,$4,$5,'https://example.test/private-replay',now(),'Synthetic meeting','meeting')`,[id,client,provider,provider+' original transcript',provider+' native summary']);
 await db.query('select associate_meeting_group($1::uuid[],$2)',[[z,w],client]);
 const first=(await db.query('select prepare_call_coaching_text($1) as id',[z])).rows[0].id;
 const second=(await db.query('select prepare_call_coaching_text($1) as id',[w])).rows[0].id;
 assert.equal(first,second);
 const rows=(await db.query('select * from coachings')).rows;assert.equal(rows.length,1);
 assert.equal(rows[0].published,false);assert.equal(rows[0].replay_url,'');assert.equal(rows[0].client_id,client);
 for(const provider of ['zoom','wispr']){assert.ok(rows[0].transcript.includes('['+provider+']\n'+provider+' original transcript'));assert.ok(rows[0].summary.includes('['+provider+']\n'+provider+' native summary'));}
 await db.query("update coachings set transcript='Reviewed by David', summary='Reviewed summary' where id=$1",[first]);
 await db.query("update call_sources set transcript='Late provider correction' where id=$1",[w]);
 assert.equal((await db.query('select prepare_call_coaching_text($1) as id',[w])).rows[0].id,first);
 assert.deepEqual((await db.query('select transcript,summary,published from coachings')).rows,[{transcript:'Reviewed by David',summary:'Reviewed summary',published:false}]);
 await assert.rejects(db.query('select associate_meeting_group($1::uuid[],$2)',[[z,w],client]),/existe déjà/);
 }finally{await db.close()}
});
