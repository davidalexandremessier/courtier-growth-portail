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

const names=['calls','config','connections','david','invite','notification-worker','notifications','oauth','results','stats-background','stats','zoom-archive'];

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

test('réécritures publiques et cron Zoom inchangés',async()=>{
 const vercel=JSON.parse(await fs.readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.deepEqual(vercel.crons,[{path:'/api/zoom-archive',schedule:'0 9 * * *'}]);
 assert.deepEqual(vercel.rewrites,[
  {source:'/api/agency-oauth',destination:'/api/oauth?route=agency'},
  {source:'/api/wispr-client-metadata',destination:'/api/oauth?route=wispr-metadata'}
 ]);
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
 }finally{if(prev===undefined)delete process.env.APP_URL;else process.env.APP_URL=prev}
});
