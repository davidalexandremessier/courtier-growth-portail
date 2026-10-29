import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {metaPanel} from '../src/v2/meta-panel.mjs';
const client={id:'a',meta_ad_account_id:'acc'},period={start:'2026-10-19',end:'2026-10-19'};
const row=(v,id)=>({id,client_id:'a',created_at:new Date().toISOString(),body:'CG_SOURCE_STATS_V1\n'+JSON.stringify(v)});
const rows=[row({type:'status',provider:'meta',account_id:'acc',phase:'success',run_id:'run',retrieved_at:new Date().toISOString()},'s'),...['spend','impressions','clicks','meta_leads'].map(metric=>row({type:'fact',origin:'meta_api',run_id:'run',record:{client_id:'a',provider:'meta',account_id:'acc',object_id:'account_daily',date:'2026-10-19',metric,value:0,currency:'CAD',timezone:'America/Toronto',channel:'paid',cohort:'activity_period'}},metric))];
test('Meta panel: confirmed zero rendered, CPL zero denominator unknown, provenance and disabled sync explicit',()=>{
 const doc=new JSDOM(metaPanel(rows,client,period)).window.document;
 assert.deepEqual([...doc.querySelectorAll('strong')].map(x=>x.textContent),['0','0','0','0','Non disponible']);assert.match(doc.body.textContent,/Meta API/);assert.match(doc.body.textContent,/automatique reste désactivée/);assert.match(doc.body.textContent,/America\/Toronto/);
});
test('Meta panel: client B cannot render client A figures, errors do not become zero',()=>{
 const doc=new JSDOM(metaPanel(rows,{id:'b',meta_ad_account_id:'b'},period)).window.document;
 assert.ok([...doc.querySelectorAll('strong')].every(x=>x.textContent==='Non disponible'));
 assert.match(metaPanel(rows,client,period,{readError:true}),/Lecture indisponible/);
 assert.doesNotMatch(metaPanel(rows,client,period,{readError:true}),/Import confirmé/);
});
