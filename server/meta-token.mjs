import {CallError} from './calls.mjs';

// META_LEGACY_A_TOKEN is the previous name of the pilot token for Daniel
// Kadima's ad account. Production defines META_DANIEL_TOKEN only. Same
// account and the same read path, not a second Meta ad account.
let warnedDifferentTokens=false;

function text(value){return typeof value==='string'?value.trim():''}

export function resolvePilotMetaToken(env=process.env){
 const legacy=text(env.META_LEGACY_A_TOKEN),daniel=text(env.META_DANIEL_TOKEN);
 if(legacy&&daniel&&legacy!==daniel&&!warnedDifferentTokens){
  warnedDifferentTokens=true;
  console.warn('Jeton Meta pilote : META_LEGACY_A_TOKEN et META_DANIEL_TOKEN diffèrent. Le nom historique est utilisé pour le compte publicitaire pilote.');
 }
 if(legacy)return legacy;
 if(daniel)return daniel;
 throw new CallError('Accès Meta à autoriser.',409);
}

export function hasPilotMetaToken(env=process.env){
 try{return !!resolvePilotMetaToken(env)}catch(e){if(e instanceof CallError)return false;throw e}
}
