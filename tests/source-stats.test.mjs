import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {persistCSV,persistSourceFacts} from '../server/source-stats.mjs';
import {synchronizeClientStats} from '../server/stats-sync.mjs';
import {normalizeProviderSnapshot,storedSourceFacts,sourceView} from '../src/source-stats.mjs';
import {sourceTotals} from '../src/stats-import.mjs';
import statsRoute from '../routes/stats.js';
import backgroundRoute from '../routes/stats-background.js';
const client={id:'11111111-1111-4111-8111-111111111111',offer:'Expansion 1:1',meta_ad_account_id:'account-A',ghl_location_id:null};
const snapshot=(spend=0)=>({provider:'meta',verifiedAt:'2026-10-23T00:00:00Z',account:{id:'account-A',currency:'CAD',timezone:'America/Toronto'},from:'2026-09-23',to:'2026-10-22',days:[{day:'2026-10-21',spend,impressions:100,clicks:5,actions:[{type:'lead',count:2},{type:'offsite_conversion.fb_pixel_lead',count:90}]}]});
function fakeDB({admin=true,allowed=['11111111-1111-4111-8111-111111111111'],rows=[]}={}){
 const db={rows,clients:[client,{...client,id:'22222222-2222-4222-8222-222222222222',meta_ad_account_id:'account-B'}],controls:[],oauth:[],userId:'actor-A',admin,allowed};
 db.rpc=async name=>({data:name==='is_admin'?admin:null,error:null});
 db.from=table=>{
  let filters=[],mode='read',payload,lo=0,hi=999,single=false;
  const q={select(){return q},eq(k,v){filters.push(x=>x[k]===v);return q},like(k,v){filters.push(x=>String(x[k]||'').startsWith(v.replace('%','')));return q},order(){return q},range(a,b){lo=a;hi=b;return q},single(){single=true;return q},maybeSingle(){single=true;return q},insert(p){mode='insert';payload=Array.isArray(p)?p:[p];return q},upsert(p){mode='upsert';payload=[p];return q},then(resolve,reject){return Promise.resolve().then(()=>{
   if(mode==='read'){const all=table==='clients'?db.clients:table==='connection_controls'?db.controls:table==='oauth_connections'?db.oauth:db.rows;const visible=all.filter(x=>!x.client_id||db.allowed.includes(x.client_id)).filter(x=>filters.every(f=>f(x))).slice(lo,hi+1);return {data:single?visible[0]||null:structuredClone(visible),error:null}}
   if(mode==='upsert'){db.controls.push(...payload);return {data:payload,error:null}}
   if(db.failDone&&payload.some(x=>x.external_ref?.startsWith('stats:done:')))return {data:null,error:{code:'503'}};
   if(payload.some(x=>!db.allowed.includes(x.client_id)))return {data:null,error:{code:'42501'}};
   if(payload.some(x=>db.rows.some(y=>y.client_id===x.client_id&&y.external_ref===x.external_ref||x.replaces_id&&y.replaces_id===x.replaces_id)))return {data:null,error:{code:'23505'}};
   const saved=payload.map(x=>({...x,id:randomUUID(),created_by:db.userId,created_at:new Date(Date.now()+db.rows.length).toISOString()}));db.rows.push(...saved);return {data:structuredClone(saved),error:null};
  }).then(resolve,reject)}};return q;
 };return db;
}
test('lecture Meta → stockage partagé → relecture : zéros, action lead exacte et aucune écriture du journal humain',async()=>{
 const db=fakeDB(),records=normalizeProviderSnapshot(snapshot(),client).records;const r=await persistSourceFacts(db,client,records,{origin:'meta_api',userId:db.userId});assert.equal(r.saved,4);
 const facts=storedSourceFacts(db.rows,client.id),t=sourceTotals(facts,{clientId:client.id,provider:'meta',accountId:'account-A',currency:'CAD',timezone:'America/Toronto',channel:'paid',cohort:'activity_period',from:'2026-10-01',to:'2026-10-22'});assert.equal(t.spend,0);assert.equal(t.meta_leads,2);assert.equal(t.clicks,5);assert.equal(storedSourceFacts(db.rows,'22222222-2222-4222-8222-222222222222').length,0);assert.equal(db.rows.every(r=>r.kind==='note'),true);
});
test('persistance CSV : relecture idempotente, différence rejetée, isolation et admin',async()=>{
 const db=fakeDB(),records=normalizeProviderSnapshot(snapshot(),client).records;
 assert.equal((await persistCSV(db,client,records,db.userId)).saved,4);assert.equal((await persistCSV(db,client,records,db.userId)).duplicates,4);
 const changed=records.map(r=>({...r,value:9}));assert.equal((await persistCSV(db,client,changed,db.userId)).conflicts,4);assert.equal(db.rows.length,4);
 await assert.rejects(persistCSV(db,client,[{...records[0],client_id:'22222222-2222-4222-8222-222222222222'}],db.userId),/refusée/);await assert.rejects(persistCSV(fakeDB({admin:false}),client,records,'actor-A'),/administrateur/);
});
test('une lecture API confirme un CSV identique avec sa propre provenance, sans addition',async()=>{
 const db=fakeDB(),records=normalizeProviderSnapshot(snapshot(12),client).records;await persistCSV(db,client,records,db.userId);
 await synchronizeClientStats(db,db,client,db.userId,{now:new Date('2026-10-23T00:00:00Z'),readMeta:async()=>snapshot(12),resolveMeta:async()=>({})});
 const v=sourceView(db.rows,client,'meta');assert.equal(v.records.length,4);assert.equal(v.records.every(r=>r.origin==='meta_api'),true);assert.equal(v.records.find(r=>r.metric==='spend').value,12);assert.equal(db.rows.filter(r=>r.replaces_id).length,4);
});
test('synchronisation : garde 30 minutes, correction append-only, erreur conserve le dernier succès',async()=>{
 const db=fakeDB();let calls=0;const now=new Date('2026-10-23T00:00:00Z'),deps={now,readMeta:async()=>{calls++;return snapshot()},resolveMeta:async()=>({})};
 await synchronizeClientStats(db,db,client,db.userId,deps);await synchronizeClientStats(db,db,client,db.userId,deps);assert.equal(calls,1);assert.equal(storedSourceFacts(db.rows,client.id).length,4);
 await synchronizeClientStats(db,db,client,db.userId,{...deps,now:new Date(+now+31*60000),readMeta:async()=>snapshot(12)});assert.equal(storedSourceFacts(db.rows,client.id).find(r=>r.metric==='spend').value,12);assert.equal(db.rows.filter(r=>r.replaces_id).length,1);
 await synchronizeClientStats(db,db,client,db.userId,{...deps,now:new Date(+now+62*60000),readMeta:async()=>{throw Error('provider text must not escape')}});const v=sourceView(db.rows,client,'meta',+now+2*86400000);assert.ok(v.success);assert.equal(v.latest.phase,'error');assert.equal(v.stale,true);assert.doesNotMatch(v.latest.message,/provider text/);assert.equal(storedSourceFacts(db.rows,client.id).find(r=>r.metric==='spend').value,12);
});
test('normalisation : absence ne devient pas zéro et compte croisé refusé',()=>{
 const s=snapshot();s.days[0].actions=[];assert.equal(normalizeProviderSnapshot(s,client).records.some(r=>r.metric==='meta_leads'),false);assert.throws(()=>normalizeProviderSnapshot(snapshot(),{...client,meta_ad_account_id:'wrong'}),/différent/);
});
test('une écriture partielle reste invisible; le prochain succès confirme sans double comptage',async()=>{
 const db=fakeDB(),now=new Date('2026-10-23T00:00:00Z'),deps={now,readMeta:async()=>snapshot(10),resolveMeta:async()=>({})};
 await synchronizeClientStats(db,db,client,db.userId,deps);db.failDone=true;
 await synchronizeClientStats(db,db,client,db.userId,{...deps,now:new Date(+now+31*60000),readMeta:async()=>snapshot(20)});
 assert.equal(sourceView(db.rows,client,'meta').records.find(r=>r.metric==='spend').value,10);
 db.failDone=false;await synchronizeClientStats(db,db,client,db.userId,{...deps,now:new Date(+now+62*60000),readMeta:async()=>snapshot(20)});
 const facts=sourceView(db.rows,client,'meta').records.filter(r=>r.metric==='spend');assert.equal(facts.length,1);assert.equal(facts[0].value,20);
});
test('GHL expiré : aucun renouvellement de jeton ni lecture fournisseur',async()=>{
 const db=fakeDB(),old=process.env.OAUTH_STORAGE_READY;process.env.OAUTH_STORAGE_READY='true';const ghl={...client,meta_ad_account_id:null,ghl_location_id:'ghl-A'};db.oauth=[{client_id:client.id,provider:'ghl',expires_at:'2026-10-15T00:00:00Z'}];let reads=0;
 try{const result=await synchronizeClientStats(db,db,ghl,db.userId,{now:new Date('2026-10-23T00:00:00Z'),readGHL:async()=>{reads++},resolveGHL:async()=>{reads++}});assert.equal(reads,0);assert.equal(result.results[0].state,'error');assert.match(result.results[0].message,/expiré/)}finally{if(old===undefined)delete process.env.OAUTH_STORAGE_READY;else process.env.OAUTH_STORAGE_READY=old}
});
test('API stats : origine/session requises avant tout réseau',async()=>{
 const old=process.env.APP_URL;process.env.APP_URL='https://portail.courtiergrowth.com';const res=()=>({setHeader(){},status(code){this.code=code;return this},json(value){this.value=value;return this}});
 try{const a=res();await statsRoute({method:'POST',headers:{origin:'https://evil.invalid'},body:{}},a);assert.equal(a.code,403);const b=res();await statsRoute({method:'POST',headers:{origin:process.env.APP_URL},body:{}},b);assert.equal(b.code,401)}finally{if(old===undefined)delete process.env.APP_URL;else process.env.APP_URL=old}
});
test('écritures sources non vérifiées : route bloquée avant tout accès réseau',async()=>{
 const old=process.env.APP_URL;process.env.APP_URL='https://portail.courtiergrowth.com';
 const r={setHeader(){},status(code){this.code=code;return this},json(value){this.value=value;return this}};
 try{await statsRoute({method:'POST',headers:{origin:process.env.APP_URL,authorization:'Bearer invalid-test-only'},body:{}},r);assert.equal(r.code,503);assert.match(r.value.error,/vérification réelle/)}finally{if(old===undefined)delete process.env.APP_URL;else process.env.APP_URL=old}
});
test('planification de fond : désactivée avant tout accès réseau',async()=>{
 const r={setHeader(){},status(code){this.code=code;return this},json(value){this.value=value;return this}};await backgroundRoute({method:'GET',headers:{}},r);assert.equal(r.code,503);assert.match(r.value.error,/non activée/);
});
