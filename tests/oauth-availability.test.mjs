import test from 'node:test';
import assert from 'node:assert/strict';
import {oauthStatus,oauthConfig,startFlow,readFlow,cookieHeader,encryptCredential,unseal} from '../server/oauth.mjs';
import oauthRoute from '../api/oauth.js';

test('OAuth synthétique : deux fournisseurs disponibles, callbacks corrects et state borné',()=>{
 const fake={APP_URL:'https://portail.courtiergrowth.com',GHL_OAUTH_CLIENT_ID:'synthetic-client',GHL_OAUTH_CLIENT_SECRET:'synthetic-only',GHL_OAUTH_APP_ID:'synthetic-app',GHL_OAUTH_VERSION_ID:'synthetic-version',META_OAUTH_CLIENT_ID:'synthetic-meta',META_OAUTH_CLIENT_SECRET:'synthetic-only',META_OAUTH_CONFIG_ID:'synthetic-config',OAUTH_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),OAUTH_STORAGE_READY:'true'};
 const previous=Object.fromEntries(Object.keys(fake).map(k=>[k,process.env[k]]));Object.assign(process.env,fake);
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Aucun appel fournisseur autorisé dans ce test')};
 try{
  assert.equal(oauthStatus().ghl.ready,true);assert.equal(oauthStatus().meta.ready,true);
  assert.equal(oauthConfig('ghl').redirect,'https://portail.courtiergrowth.com/api/oauth?callback=crm');assert.equal(oauthConfig('meta').redirect,'https://portail.courtiergrowth.com/api/oauth?callback=meta');
  for(const provider of ['ghl','meta']){
   const flow=startFlow(provider,'synthetic-client-A','synthetic-session',1,'synthetic-account-A'),url=new URL(flow.url);
   assert.equal(url.protocol,'https:');assert.equal(url.hostname,provider==='ghl'?'marketplace.gohighlevel.com':'www.facebook.com');
   const context=readFlow(flow.cookie,url.searchParams.get('state'),provider);assert.equal(context.clientId,'synthetic-client-A');assert.equal(context.accountHint,'synthetic-account-A');
   assert.throws(()=>readFlow(flow.cookie,url.searchParams.get('state'),provider,Date.now()+660000),/expirée/);
   assert.throws(()=>readFlow(flow.cookie,'x'.repeat(43),provider),/invalide/);
   assert.throws(()=>readFlow(flow.cookie,url.searchParams.get('state'),provider==='ghl'?'meta':'ghl'),/invalide/);
   assert.match(cookieHeader(flow.cookie),/HttpOnly; Secure; SameSite=Lax/);
  }
  const row={client_id:'A',provider:'meta',account_id:'one'},cipher=encryptCredential(row,{access_token:'synthetic-not-real'});
  assert.throws(()=>unseal(cipher,'credential:B:meta:one'),/invalide/);assert.throws(()=>unseal(cipher,'credential:A:meta:two'),/invalide/);
  delete process.env.META_OAUTH_CONFIG_ID;assert.equal(oauthStatus().meta.ready,false);
 }finally{globalThis.fetch=originalFetch;for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value}
});

test('OAuth : route protégée sans session, aucun flux ni fournisseur appelé',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=()=>{throw Error('Réseau interdit')};
 try{const res={setHeader(){},status(s){this.code=s;return this},json(body){this.body=body;return this}};await oauthRoute({method:'GET',url:'/api/oauth',headers:{}},res);assert.equal(res.code,401)}finally{globalThis.fetch=previous}
});
