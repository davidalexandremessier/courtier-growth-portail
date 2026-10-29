import test from 'node:test';
import assert from 'node:assert/strict';
import {importSources} from '../server/calls.mjs';
const item={provider:'wispr',account_id:'synthetic-account',external_id:'meeting-1',started_at:'2026-10-28T14:00:00Z',transcript:'Synthetic transcript'};
function racingDB(){
 const rows=new Map();let reads=0,release;const bothRead=new Promise(r=>release=r);
 return {rows,from(){let filters={},pending;return {
  eq(k,v){filters[k]=v;return this},
  select(){if(pending){const key=JSON.stringify([pending.provider,pending.account_id,pending.external_id,pending.source_kind]);if(rows.has(key))return Promise.resolve({data:[]});const row={...pending,id:'source-'+rows.size};rows.set(key,row);return Promise.resolve({data:[{id:row.id}]});}return this},
  upsert(value){pending=value;return this},
  async maybeSingle(){const key=JSON.stringify([filters.provider,filters.account_id,filters.external_id,filters.source_kind]);const found=rows.get(key);if(reads<2){reads++;if(reads===2)release();await bothRead;return {data:null};}return {data:found||null}}
 }}};
}
test('Concurrent duplicate imports return the same durable source ID to both callers',async()=>{
 const db=racingDB();const [a,b]=await Promise.all([importSources(db,[item]),importSources(db,[item])]);
 assert.equal(db.rows.size,1);assert.equal(a.count,1);assert.deepEqual(a.ids,b.ids);
 const retry=await importSources(db,[{...item,transcript:'must not overwrite'}]);assert.deepEqual(retry.ids,a.ids);assert.equal([...db.rows.values()][0].transcript,item.transcript);
});
test('Same provider meeting ID in distinct accounts remains distinct',async()=>{
 const db=racingDB();const [a,b]=await Promise.all([importSources(db,[item]),importSources(db,[{...item,account_id:'other-authorized-account'}])]);
 assert.equal(db.rows.size,2);assert.notDeepEqual(a.ids,b.ids);
});
