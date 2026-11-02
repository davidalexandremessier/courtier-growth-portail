import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {assertServerlessBudget,listServerlessFunctions,SERVERLESS_FUNCTION_LIMIT} from '../scripts/serverless-budget.mjs';
import dispatch,{config as functionConfig} from '../api/[...slug].js';
import {config as statsConfig} from '../routes/stats.js';
import {config as backgroundConfig} from '../routes/stats-background.js';
import {config as zoomConfig} from '../routes/zoom-archive.js';
import {config as workerConfig} from '../routes/notification-worker.js';

const names=['bot-clients','calls','config','connections','david','ghl-tags','invite','notification-worker','notifications','oauth','results','stats-background','stats','zoom-archive'];

function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(b){this.body=b;return this},end(b){this.ended=b;return this}}}

test('une seule fonction /api, sous le plafond de 10',async()=>{
 assert.equal(SERVERLESS_FUNCTION_LIMIT,10);
 const files=await assertServerlessBudget();
 assert.deepEqual(files,['api/[...slug].js']);
 assert.equal(functionConfig.maxDuration,300);
 assert.equal(statsConfig.maxDuration,300);
 assert.equal(backgroundConfig.maxDuration,300);
 assert.equal(zoomConfig.maxDuration,300);
 assert.equal(workerConfig.maxDuration,60);
});

test('réécritures OAuth et cron Zoom inchangés, chemins /api imbriqués réécrits',async()=>{
 const vercel=JSON.parse(await fs.readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.deepEqual(vercel.crons,[{path:'/api/zoom-archive',schedule:'0 9 * * *'}]);
 assert.deepEqual(vercel.rewrites.slice(0,2),[
  {source:'/api/agency-oauth',destination:'/api/oauth?route=agency'},
  {source:'/api/wispr-client-metadata',destination:'/api/oauth?route=wispr-metadata'}
 ]);
 assert.equal(vercel.rewrites.length,3);
 const nested=vercel.rewrites[2];
 assert.equal(nested.destination,'/api/$1?cg_path=$1/$2');
 assert.equal(new RegExp(nested.source).test('/api/ghl-webhook/buyer-cockpit'),true);
 assert.equal(new RegExp(nested.source).test('/api/bot-clients/x'),true);
 assert.equal(new RegExp(nested.source).test('/api/ghl-webhook'),false);
 assert.equal(new RegExp(nested.source).test('/api/zoom-archive'),false);
 assert.equal(new RegExp(nested.source).test('/api/agency-oauth'),false);
 assert.equal(new RegExp(nested.source).test('/api/bot-clients'),false);
});

test('une réécriture Vercel à un segment porte encore le chemin complet',async()=>{
 const prev=Object.fromEntries(['GHL_BUYER_WEBHOOK_TOKEN','GHL_BUYER_PORTAL_SECRET','APP_URL','SUPABASE_URL','SUPABASE_ARCHIVE_SECRET_KEY'].map(key=>[key,process.env[key]]));
 process.env.GHL_BUYER_WEBHOOK_TOKEN='webhook-token-test-value';
 process.env.GHL_BUYER_PORTAL_SECRET='portal-secret-test-value';
 process.env.APP_URL='https://portail.example.test';
 process.env.SUPABASE_URL='https://db.example.test';
 process.env.SUPABASE_ARCHIVE_SECRET_KEY='archive-secret-test-value';
 try{
  const post=response();
  await dispatch({method:'POST',url:'/api/ghl-webhook?cg_path=ghl-webhook/buyer-cockpit',headers:{},query:{slug:'ghl-webhook',cg_path:'ghl-webhook/buyer-cockpit'},body:{}},post);
  assert.equal(post.statusCode,401);
  assert.deepEqual(post.body,{error:'Jeton webhook refusé.'});
  assert.match(post.headers['Content-Type'],/application\/json/);
  const read=response();
  await dispatch({method:'GET',url:'/api/ghl-webhook?cg_path=ghl-webhook/buyer-cockpit',headers:{},query:{slug:'ghl-webhook',cg_path:'ghl-webhook/buyer-cockpit'}},read);
  assert.equal(read.statusCode,401);
  assert.deepEqual(read.body,{error:'Lien requis.'});
  const single=response();
  await dispatch({method:'POST',url:'/api/ghl-webhook',headers:{},query:{slug:'ghl-webhook'},body:{}},single);
  assert.equal(single.statusCode,401);
  assert.deepEqual(single.body,{error:'Jeton webhook refusé.'});
  const bots=response();
  await dispatch({method:'GET',url:'/api/bot-clients/x?cg_path=bot-clients/x',headers:{},query:{slug:'bot-clients',cg_path:'bot-clients/x'}},bots);
  assert.equal(bots.statusCode,404);
  assert.deepEqual(bots.body,{error:'Introuvable.'});
 }finally{
  for(const [key,value] of Object.entries(prev)){if(value===undefined)delete process.env[key];else process.env[key]=value}
 }
});

test('le garde échoue au-dessus de 10 fonctions et ignore routes/',async()=>{
 const cwd=await fs.mkdtemp(path.join(os.tmpdir(),'api-budget-'));
 try{
  await fs.mkdir(path.join(cwd,'api'),{recursive:true});
  await fs.mkdir(path.join(cwd,'routes'),{recursive:true});
  await fs.writeFile(path.join(cwd,'routes','calls.js'),'');
  await fs.writeFile(path.join(cwd,'api','notes.md'),'');
  for(let i=0;i<10;i++)await fs.writeFile(path.join(cwd,'api',`f${i}.js`),'');
  assert.equal((await assertServerlessBudget(cwd)).length,10);
  await fs.writeFile(path.join(cwd,'api','extra.js'),'');
  await assert.rejects(()=>assertServerlessBudget(cwd),/plafond 10/);
  await fs.mkdir(path.join(cwd,'pages','api'),{recursive:true});
  await fs.writeFile(path.join(cwd,'pages','api','again.ts'),'');
  const listed=await listServerlessFunctions(cwd);
  assert.equal(listed.length,12);
  assert.ok(listed.includes('pages/api/again.ts'));
 }finally{await fs.rm(cwd,{recursive:true,force:true})}
});

test('chaque URL /api est déléguée au handler déplacé, sans le modifier',async()=>{
 for(const name of names){
  const route=(await import(`../routes/${name}.js`)).default;
  const req={method:'GET',url:`/api/${name}`,headers:{},query:{slug:[name]}};
  const direct=response(),via=response();
  await route({...req},direct);
  await dispatch({...req,query:{slug:[name]}},via);
  assert.equal(via.statusCode,direct.statusCode,name);
  assert.deepEqual(via.body,direct.body,name);
  assert.notEqual(via.statusCode,404,name);
 }
});

test('chemin inconnu : JSON 404, et la réécriture OAuth atteint encore son handler',async()=>{
 const missing=response();
 await dispatch({method:'POST',url:'/api/inexistant',headers:{},query:{slug:['inexistant']}},missing);
 assert.equal(missing.statusCode,404);
 assert.deepEqual(missing.body,{error:'Introuvable.'});
 assert.match(missing.headers['Content-Type'],/application\/json/);
 const nested=response();
 await dispatch({method:'GET',url:'/api/calls/extra',headers:{},query:{slug:['calls','extra']}},nested);
 assert.equal(nested.statusCode,404);
 const fromUrl=response();
 await dispatch({method:'GET',url:'/api/config',headers:{}},fromUrl);
 assert.equal(fromUrl.statusCode,200);
 assert.equal(typeof fromUrl.body.configured,'boolean');
 const prev=process.env.APP_URL;
 process.env.APP_URL='https://portail.example.test/';
 try{
  const meta=response();
  await dispatch({method:'GET',url:'/api/oauth?route=wispr-metadata',headers:{},query:{slug:['oauth']}},meta);
  assert.equal(meta.statusCode,200);
  assert.equal(meta.body.client_id,'https://portail.example.test/api/wispr-client-metadata');
  const agency=response();
  await dispatch({method:'GET',url:'/api/oauth?route=agency',headers:{},query:{slug:['oauth']}},agency);
  assert.equal(agency.statusCode,401);
  assert.equal(agency.body.error,'Connexion requise.');
  const publicAgency=response();
  await dispatch({method:'GET',url:'/api/agency-oauth',headers:{},query:{slug:['agency-oauth']}},publicAgency);
  assert.equal(publicAgency.statusCode,401);
  assert.equal(publicAgency.body.error,'Connexion requise.');
  const publicMeta=response();
  await dispatch({method:'GET',url:'/api/wispr-client-metadata',headers:{},query:{slug:['wispr-client-metadata']}},publicMeta);
  assert.equal(publicMeta.statusCode,200);
  assert.equal(publicMeta.body.client_id,'https://portail.example.test/api/wispr-client-metadata');
 }finally{if(prev===undefined)delete process.env.APP_URL;else process.env.APP_URL=prev}
});
