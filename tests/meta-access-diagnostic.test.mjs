import test from 'node:test';
import assert from 'node:assert/strict';
import {probeMetaReadAccess} from '../server/meta-access-diagnostic.mjs';
import {metaDiagnosticHTML,metaLeadCapabilityHTML} from '../src/meta-diagnostic-view.mjs';
import {encryptCredential} from '../server/oauth.mjs';
import handler from '../routes/results.js';

const cid='11111111-1111-4111-8111-111111111111';
const graphError=(code,subcode)=>new Response(JSON.stringify({error:{code,error_subcode:subcode,message:'Token TEST-SECRET belongs to person@example.invalid',fbtrace_id:'TRACE_123456'}}),{status:400,headers:{'content-type':'application/json'}});

test('Code Graph 200 indépendant sur droits et compte, sans jeton, message ou compte dans le résultat',async()=>{
 const calls=[];
 const result=await probeMetaReadAccess({adAccountId:'4444',accessToken:'TEST-SECRET',fetcher:async(url,options)=>{calls.push({url:String(url),options});return graphError(200,2018001)}});
 assert.equal(result.permissions.diagnostic.code,200);
 assert.equal(result.account.diagnostic.code,200);
 assert.equal(result.permissions.diagnostic.subcode,2018001);
 assert.equal(result.permissions.diagnostic.category,'autorisation refusée');
 assert.equal(result.account.diagnostic.endpoint,'ad-account');
 assert.equal(calls.length,2);
 assert.ok(calls.every(c=>c.options.method==='GET'&&c.options.redirect==='error'));
 assert.ok(calls.every(c=>!c.url.includes('TEST-SECRET')));
 const serial=JSON.stringify(result);
 assert.doesNotMatch(serial,/TEST-SECRET|person@example|4444|Token|TRACE_123456/);
 const html=metaDiagnosticHTML(result);
 assert.match(html,/code Graph 200 · sous-code 2018001/);
 assert.doesNotMatch(html,/TEST-SECRET|person@example|4444|Token/);
});

test('Diagnostic distingue refus et accès confirmé; droit absent reste non retourné',async()=>{
 const result=await probeMetaReadAccess({adAccountId:'4444',accessToken:'TEST',fetcher:async url=>String(url).includes('/permissions')?new Response(JSON.stringify({data:[{permission:'ads_read',status:'granted'}]}),{status:200}):graphError(200,0)});
 assert.equal(result.permissions.state,'ok');
 assert.equal(result.permissions.permissions.ads_read,'granted');
 assert.equal(result.permissions.permissions.leads_retrieval,'not_returned');
 assert.equal(result.account.state,'rejected');
 assert.match(metaDiagnosticHTML(result),/leads_retrieval : non retourné/);
});

test('Diagnostic affiche séparément lecture pub et accès leads, sans inventer un refus',async()=>{
 const result=await probeMetaReadAccess({adAccountId:'4444',accessToken:'TEST',fetcher:async url=>new Response(JSON.stringify(String(url).includes('/permissions')?{data:[{permission:'ads_read',status:'granted'}]}:{id:'act_4444'}),{status:200})});
 const html=metaDiagnosticHTML(result);
 assert.match(html,/Compte publicitaire vérifié en lecture/);
 assert.match(html,/Accès aux leads non vérifié/);
 assert.doesNotMatch(html,/leads_retrieval : refusé/);
 const capability=metaLeadCapabilityHTML({provider:'meta_instant_forms',permissions:[{permission:'ads_read',status:'granted'}],ads_read:true,leads_retrieval:false});
 assert.match(capability,/non retourné par Meta/);
 assert.match(capability,/Association Page\/formulaires non vérifiée/);
 assert.doesNotMatch(capability,/n’est pas accordé/);
});

test('Diagnostic refuse identifiant non sûr et réponse de compte croisée',async()=>{
 await assert.rejects(()=>probeMetaReadAccess({adAccountId:'1/insights',accessToken:'TEST',fetcher:async()=>{throw Error('unexpected')}}),/invalide/);
 const result=await probeMetaReadAccess({adAccountId:'4444',accessToken:'TEST',fetcher:async url=>String(url).includes('/permissions')?new Response(JSON.stringify({data:[]}),{status:200}):new Response(JSON.stringify({id:'act_9999'}),{status:200})});
 assert.equal(result.account.state,'invalid_response');
 assert.doesNotMatch(JSON.stringify(result),/9999/);
});

test('API diagnostic : admin requis, connexion du dossier exact, état pause et aucune écriture',async()=>{
 const env={...process.env},original=global.fetch;
 process.env.APP_URL='https://portal.test.invalid';
 process.env.SUPABASE_URL='https://db.test.invalid';
 process.env.SUPABASE_PUBLISHABLE_KEY='TEST';
 process.env.OAUTH_STORAGE_READY='true';
 process.env.OAUTH_ENCRYPTION_KEY=Buffer.alloc(32,17).toString('base64');
 const row={client_id:cid,provider:'meta',account_id:'4444',expires_at:new Date(Date.now()+3600000).toISOString()};
 row.ciphertext=encryptCredential(row,{access_token:'TEST-SECRET'});
 let admin=false,paused=false,account='4444',writes=0,graphCalls=0;
 global.fetch=async(url,options={})=>{
  const u=new URL(url);
  if(u.hostname==='graph.facebook.com'){graphCalls++;return graphError(200,2018001)}
  assert.equal(u.hostname,'db.test.invalid');
  if(options.method&&options.method!=='GET'&&!u.pathname.endsWith('/rpc/is_admin'))writes++;
  let data;
  if(u.pathname==='/auth/v1/user')data={id:cid};
  else if(u.pathname.endsWith('/rpc/is_admin'))data=admin;
  else if(u.pathname.endsWith('/connection_controls'))data={enabled:!paused};
  else if(u.pathname.endsWith('/oauth_connections'))data=row;
  else if(u.pathname.endsWith('/clients'))data={id:cid,meta_ad_account_id:account};
  else throw Error('Unexpected '+u.pathname);
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 const req={method:'POST',headers:{origin:process.env.APP_URL,authorization:'Bearer fixture'},body:{clientId:cid,provider:'meta',action:'meta-read-diagnostic'}};
 const res=()=>({setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return this}});
 try{
  let r=res();await handler(req,r);assert.equal(r.code,403);assert.equal(graphCalls,0);
  admin=true;paused=true;r=res();await handler(req,r);assert.equal(r.code,409);assert.equal(graphCalls,0);
  paused=false;account='9999';r=res();await handler(req,r);assert.equal(r.code,409);assert.equal(graphCalls,0);
  account='4444';r=res();await handler(req,r);assert.equal(r.code,200);assert.equal(r.body.permissions.diagnostic.code,200);assert.equal(graphCalls,2);
  assert.equal(writes,0);
  assert.doesNotMatch(JSON.stringify(r.body),/TEST-SECRET|person@example|4444|Token/);
 }finally{global.fetch=original;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
});
