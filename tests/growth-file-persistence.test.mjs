import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadGrowthDocument} from '../src/production-data.js';

test('un fichier conserve sa réservation et sa confirmation après relecture simulée; une réservation croisée est refusée',async()=>{
 const rows=[];
 const sb={
  from(table){assert.equal(table,'growth_documents');return {
   insert(record){return {select(){return {single:async()=>{rows.push({...record,uploaded_at:null});return {data:rows.at(-1)}}}}}},
   update(values){return {eq(key,id){assert.equal(key,'id');return {select(){return {single:async()=>{const row=rows.find(x=>x.id===id);Object.assign(row,values);return {data:{...row}}}}}}}}},
  }},
  storage:{from(bucket){assert.equal(bucket,'portal-chat');return {upload:async()=>({error:null})}}},
 };
 const c={clientId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',user:{id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'},data:{growth_documents:[]},sb};
 const bytes=new TextEncoder().encode('preuve');
 const file={name:'preuve.txt',size:bytes.byteLength,type:'text/plain',arrayBuffer:async()=>bytes.buffer};
 await assert.rejects(()=>uploadGrowthDocument(c,file,{stage:'production',category:'evidence',internal:'false'},{id:'other',client_id:'other-client',path:'other-client/dossier/user/other/asset',recorded:true}),/hors de ce dossier/);
 const saved=await uploadGrowthDocument(c,file,{stage:'production',category:'evidence',internal:'false'});
 assert.equal(saved.client_id,c.clientId);
 assert.ok(saved.path.startsWith(c.clientId+'/dossier/'+c.user.id+'/'));
 assert.ok(saved.uploaded_at);
 assert.equal(rows.length,1);
 assert.equal(rows[0].uploaded_at,saved.uploaded_at);
});
