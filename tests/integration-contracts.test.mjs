import test from 'node:test';
import assert from 'node:assert/strict';
import {importedMetaPeriod} from '../src/v2/imported-meta.mjs';
import {prepareImportedDrafts} from '../server/meeting-drafts.mjs';
const marker='CG_SOURCE_STATS_V1\n',client={id:'a',meta_ad_account_id:'account-a'};
const opts={start:'2026-10-19',end:'2026-10-19',currency:'CAD',timezone:'America/Toronto',now:Date.parse('2026-10-20T12:00:00Z')};
function activity(v,id){return {id,client_id:'a',created_at:'2026-10-20T12:00:00Z',body:marker+JSON.stringify(v)};}
function facts(value=0){return [activity({type:'status',provider:'meta',account_id:'account-a',phase:'success',run_id:'run',retrieved_at:'2026-10-20T12:00:00Z'},'status'),...['spend','impressions','clicks','meta_leads'].map((metric,i)=>activity({type:'fact',origin:'meta_api',run_id:'run',record:{client_id:'a',provider:'meta',account_id:'account-a',object_id:'account_daily',date:'2026-10-19',metric,value,currency:'CAD',timezone:'America/Toronto',channel:'paid',cohort:'activity_period'}},'fact'+i))];}
test('Meta: missing differs from zero, no manual overwrite, zero denominator',()=>{
 assert.equal(importedMetaPeriod([],client,opts).totals.spend,null);
 const rows=facts(),before=JSON.stringify(rows),v=importedMetaPeriod(rows,client,opts);
 assert.equal(v.totals.spend,0);assert.equal(v.cpl,null);assert.equal(v.incomplete,false);assert.equal(JSON.stringify(rows),before);
});
test('Meta: client/account isolation, incomplete period, currency mismatch, failed batch hidden',()=>{
 assert.equal(importedMetaPeriod(facts(5),{id:'b',meta_ad_account_id:'account-b'},opts).totals.spend,null);
 assert.equal(importedMetaPeriod(facts(5),client,{...opts,end:'2026-10-20'}).totals.spend,null);
 assert.equal(importedMetaPeriod(facts(5),client,{...opts,currency:'USD'}).state,'incompatible');
 assert.equal(importedMetaPeriod(facts(5).slice(1),client,opts).totals.spend,null);
});
test('Meta: duplicate delivery is not added twice; error keeps last successful values',()=>{
 const rows=facts(5);rows.push({...rows[1],id:'duplicate'});
 rows.push(activity({type:'status',provider:'meta',account_id:'account-a',phase:'error'},'error'));rows.at(-1).created_at='2026-10-20T13:00:00Z';
 const v=importedMetaPeriod(rows,client,opts);assert.equal(v.totals.spend,5);assert.equal(v.state,'error');assert.ok(v.lastSuccess);
});
const id='00000000-0000-0000-0000-000000000001';
function fakeDB({admin=true,match='auto',media='',fail=false,groupMedia=''}={}){
 const prepared=new Map();let calls=0;
 return {prepared,get calls(){return calls},async rpc(name,args){if(name==='is_admin')return {data:admin};calls++;if(fail)return {error:{message:'private detail'}};prepared.set(args.source_id,'draft');return {data:'draft'}},from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{id,client_id:'a',match_status:match,transcript:'Synthetic transcript',replay_url:media}}},async or(){return {data:[{replay_url:groupMedia}]}}}}};
}
test('Drafts: clients A/B cannot run admin preparation; ambiguous stays unassigned',async()=>{
 for(const admin of [false,null])await assert.rejects(prepareImportedDrafts(fakeDB({admin}),[id]),/administrateur/);
 const db=fakeDB({match:'ambiguous'});assert.deepEqual((await prepareImportedDrafts(db,[id])).needsConfirmation,[id]);assert.equal(db.calls,0);
});
test('Drafts: duplicate source, retry and private-media guard',async()=>{
 const db=fakeDB();assert.equal((await prepareImportedDrafts(db,[id,id])).prepared.length,1);assert.equal(db.calls,1);
 const failed=await prepareImportedDrafts(fakeDB({fail:true}),[id]);assert.deepEqual(failed.retry,[id]);assert.ok(!JSON.stringify(failed).includes('private detail'));
 for(const options of [{media:'https://example.org/video'},{groupMedia:'https://example.org/video'}]){const mediaDB=fakeDB(options);assert.deepEqual((await prepareImportedDrafts(mediaDB,[id])).privateMediaRequired,[id]);assert.equal(mediaDB.calls,0);}
});
