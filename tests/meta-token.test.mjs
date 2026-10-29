import test from 'node:test';
import assert from 'node:assert/strict';
import {CallError} from '../server/calls.mjs';
import {hasPilotMetaToken,resolvePilotMetaToken} from '../server/meta-token.mjs';
import {PILOT,resolveMetaClient,resultsStatus} from '../server/results.mjs';

const legacy='legacy-synthetic';
const daniel='daniel-synthetic';

test('jeton Meta : le nom historique est utilisé quand il est défini',()=>{
 assert.equal(resolvePilotMetaToken({META_LEGACY_A_TOKEN:legacy}),legacy);
 assert.equal(hasPilotMetaToken({META_LEGACY_A_TOKEN:'  '+legacy+'  '}),true);
});

test('jeton Meta : nom historique absent ou vide, repli sur Daniel',()=>{
 assert.equal(resolvePilotMetaToken({META_DANIEL_TOKEN:daniel}),daniel);
 assert.equal(resolvePilotMetaToken({META_LEGACY_A_TOKEN:'',META_DANIEL_TOKEN:daniel}),daniel);
 assert.equal(resolvePilotMetaToken({META_LEGACY_A_TOKEN:'   ',META_DANIEL_TOKEN:'  '+daniel}),daniel);
});

test('jeton Meta : les deux absents, erreur claire sans valeur',()=>{
 for(const env of [{}, {META_LEGACY_A_TOKEN:'',META_DANIEL_TOKEN:'   '}]){
  assert.throws(()=>resolvePilotMetaToken(env),err=>{
   assert.equal(err instanceof CallError,true);
   assert.equal(err.status,409);
   assert.match(err.message,/Accès Meta à autoriser/);
   assert.doesNotMatch(err.message,/legacy-synthetic|daniel-synthetic|EAA/);
   return true;
  });
  assert.equal(hasPilotMetaToken(env),false);
 }
});

test('jeton Meta : deux valeurs différentes, avertissement sans secret',()=>{
 const warnings=[];
 const original=console.warn;
 console.warn=(...args)=>warnings.push(args.map(String).join(' '));
 try{
  assert.equal(resolvePilotMetaToken({META_LEGACY_A_TOKEN:legacy,META_DANIEL_TOKEN:legacy}),legacy);
  assert.equal(warnings.length,0);
  assert.equal(resolvePilotMetaToken({META_LEGACY_A_TOKEN:legacy,META_DANIEL_TOKEN:daniel}),legacy);
  assert.equal(resolvePilotMetaToken({META_LEGACY_A_TOKEN:legacy,META_DANIEL_TOKEN:daniel}),legacy);
 }finally{console.warn=original}
 assert.equal(warnings.length,1);
 assert.match(warnings[0],/META_LEGACY_A_TOKEN/);
 assert.match(warnings[0],/META_DANIEL_TOKEN/);
 assert.doesNotMatch(warnings[0],/legacy-synthetic|daniel-synthetic/);
});

test('lecture pilote : repli Daniel quand le nom historique est absent',async()=>{
 const saved={legacy:process.env.META_LEGACY_A_TOKEN,daniel:process.env.META_DANIEL_TOKEN,oauth:process.env.OAUTH_STORAGE_READY,ghl:process.env.GHL_DANIEL_TOKEN};
 delete process.env.META_LEGACY_A_TOKEN;
 delete process.env.OAUTH_STORAGE_READY;
 delete process.env.GHL_DANIEL_TOKEN;
 process.env.META_DANIEL_TOKEN=daniel;
 const db={from(){return {select(){return this},eq(){return this},single:async()=>({data:{id:PILOT.clientId,ghl_location_id:PILOT.locationId,meta_ad_account_id:PILOT.adAccountId},error:null})}}};
 try{
  assert.equal(resultsStatus().meta,true);
  assert.equal(resultsStatus().ghl,false);
  const account=await resolveMetaClient(db,PILOT.clientId);
  assert.equal(account.adAccountId,PILOT.adAccountId);
  assert.equal(account.accessToken,daniel);
  assert.equal(JSON.stringify(resultsStatus()).includes(daniel),false);
 }finally{
  for(const [key,name] of [['META_LEGACY_A_TOKEN','legacy'],['META_DANIEL_TOKEN','daniel'],['OAUTH_STORAGE_READY','oauth'],['GHL_DANIEL_TOKEN','ghl']]){
   if(saved[name]===undefined)delete process.env[key];else process.env[key]=saved[name];
  }
 }
});
