import {createClient} from '@supabase/supabase-js';
import {authenticate as portalAdmin,CallError} from './calls.mjs';
import {runChecks,pilotToken} from './demarrer-ici-checks.mjs';
import {
 PILOT_LOCATION_IDS,agencyRow,allowedLocation,applyAgency,applyBroker,applyChecks,applyDecline,applyHelp,applySignal,emptyProgress,publicView
} from '../src/demarrer-ici/model.mjs';

const buckets=new Map();

export function memoryStore(){
 const rows=new Map();
 return {
  kind:'memoire',
  async get(id){const row=rows.get(id);return row?structuredClone(row):null},
  async put(row){rows.set(row.locationId,structuredClone(row));return structuredClone(row)},
  async list(){return [...rows.values()].map(row=>structuredClone(row))}
 };
}

function memorySingleton(){
 if(!globalThis.__demarrerIciMemory)globalThis.__demarrerIciMemory=memoryStore();
 return globalThis.__demarrerIciMemory;
}

export function supabaseStore(env=process.env){
 if(!env.SUPABASE_URL||!env.SUPABASE_ARCHIVE_SECRET_KEY)return null;
 const db=createClient(env.SUPABASE_URL,env.SUPABASE_ARCHIVE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 return {
  kind:'supabase',
  async get(id){
   const result=await db.from('demarrer_ici_progress').select('location_id,broker,steps,help,last_check_at,updated_at').eq('location_id',id).maybeSingle();
   if(result.error){
    if(missingTable(result.error))return {missing:true};
    throw new CallError('Lecture de la progression impossible.',500);
   }
   return result.data?fromRow(result.data):null;
  },
  async put(row){
   const saved=await db.from('demarrer_ici_progress').upsert(toRow(row),{onConflict:'location_id'}).select('location_id').maybeSingle();
   if(saved.error){
    if(missingTable(saved.error))throw new CallError('La progression n’est pas encore enregistrée : la migration du pilote n’est pas appliquée.',503);
    throw new CallError('Enregistrement de la progression impossible.',500);
   }
   return row;
  },
  async list(){
   const result=await db.from('demarrer_ici_progress').select('location_id,broker,steps,help,last_check_at,updated_at');
   if(result.error){
    if(missingTable(result.error))return {missing:true};
    throw new CallError('Lecture de la progression impossible.',500);
   }
   return (result.data||[]).map(fromRow);
  }
 };
}

function missingTable(error){
 return /42P01|PGRST205|does not exist|schema cache/i.test(`${error?.code||''} ${error?.message||''}`);
}
function fromRow(row){
 return {locationId:row.location_id,broker:row.broker||{},steps:row.steps||{},help:row.help||null,lastCheckAt:row.last_check_at||null,updatedAt:row.updated_at};
}
function toRow(row){
 return {location_id:row.locationId,broker:row.broker||{},steps:row.steps,help:row.help,last_check_at:row.lastCheckAt,updated_at:row.updatedAt};
}

export function resolveStore(env=process.env){
 if(env.DEMARRER_ICI_MEMORY==='1')return memorySingleton();
 return supabaseStore(env);
}

function limited(map,key,max,now){
 const windowMs=10*60*1000;
 const hits=(map.get(key)||[]).filter(at=>now-at<windowMs);
 if(hits.length>=max)return true;
 hits.push(now);
 map.set(key,hits);
 return false;
}

function originAllowed(req){
 const origin=req.headers?.origin;
 if(!origin)return true;
 try{
  const host=new URL(origin).host;
  const expected=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();
  return !!expected&&host===expected;
 }catch{return false}
}

function locationFrom(req){
 const raw=req.method==='GET'?req.query?.location_id:req.body?.location_id;
 const id=Array.isArray(raw)?raw[0]:raw;
 return typeof id==='string'?id.trim():'';
}

async function loadRow(store,locationId,now){
 if(!store)return {row:emptyProgress(locationId,now),storage:'indisponible'};
 const found=await store.get(locationId);
 if(found?.missing)return {row:emptyProgress(locationId,now),storage:'indisponible'};
 if(!found)return {row:emptyProgress(locationId,now),storage:store.kind};
 const row=emptyProgress(locationId,found.updatedAt||now);
 row.broker=found.broker||{};
 row.help=found.help||null;
 row.lastCheckAt=found.lastCheckAt||null;
 row.updatedAt=found.updatedAt||now;
 for(const [key,value] of Object.entries(found.steps||{})){
  if(row.steps[key]&&value&&typeof value.status==='string')row.steps[key]={...row.steps[key],...value};
 }
 return {row,storage:store.kind};
}

export async function handleDemarrerIci(req,res,deps={}){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(!originAllowed(req))return res.status(403).json({error:'Origine refusée.'});
 const env=deps.env||process.env;
 const now=deps.now||new Date().toISOString();
 const store=deps.store===undefined?resolveStore(env):deps.store;
 const adminAuth=deps.authenticate||portalAdmin;
 const checks=deps.runChecks||runChecks;
 const limits=deps.buckets||buckets;
 const fetchImpl=deps.fetchImpl||fetch;
 try{
  if(req.method==='GET'&&(req.query?.vue==='agence'||req.query?.vue==='agency'))return await agencyList(req,res,{store,adminAuth,env,now});
  if(req.method==='GET')return await clientGet(req,res,{store,env,now});
  if(req.method!=='POST')return res.status(405).json({error:'Méthode non permise.'});
  const action=req.body?.action;
  if(action==='agence')return await agencyUpdate(req,res,{store,adminAuth,env,now});
  if(action==='reinitialiser')return await agencyReset(req,res,{store,adminAuth,now});
  return await clientPost(req,res,{store,env,now,checks,limits,fetchImpl});
 }catch(error){
  const status=error.status||500;
  return res.status(status).json({error:status===500?'Service indisponible.':error.message});
 }
}

async function clientGet(req,res,{store,env,now}){
 const locationId=locationFrom(req);
 if(!locationId)return res.status(400).json({error:'Identifiant de sous-compte requis.'});
 if(!allowedLocation(locationId))return res.status(404).json({error:'Ce parcours n’est pas disponible pour ce compte.'});
 const loaded=await loadRow(store,locationId,now);
 return res.status(200).json(publicView(loaded.row,{checks:pilotToken(env,locationId)?'auto':'manuel',storage:loaded.storage}));
}

async function clientPost(req,res,{store,env,now,checks,limits,fetchImpl}){
 const locationId=locationFrom(req);
 if(!locationId)return res.status(400).json({error:'Identifiant de sous-compte requis.'});
 if(!allowedLocation(locationId))return res.status(404).json({error:'Ce parcours n’est pas disponible pour ce compte.'});
 const action=req.body?.action;
 if(!['enregistrer','signaler','ne_sapplique_pas','aide','verifier'].includes(action))return res.status(400).json({error:'Action inconnue.'});
 if(!store)throw new CallError('La progression n’est pas encore enregistrée.',503);
 if(limited(limits,locationId+':'+action,action==='verifier'?8:20,Date.parse(now)||Date.now()))return res.status(429).json({error:'Trop de demandes. Réessayez dans un moment.'});
 const loaded=await loadRow(store,locationId,now);
 if(loaded.storage==='indisponible')throw new CallError('La progression n’est pas encore enregistrée : la migration du pilote n’est pas appliquée.',503);
 let result;
 if(action==='enregistrer')result=applyBroker(loaded.row,req.body?.broker,now);
 else if(action==='signaler')result=applySignal(loaded.row,req.body?.step,now);
 else if(action==='ne_sapplique_pas')result=applyDecline(loaded.row,req.body?.step,now);
 else if(action==='aide')result=applyHelp(loaded.row,req.body?.note,now,req.body?.step);
 else {
  const report=await checks(locationId,{env,fetchImpl});
  result={state:applyChecks(loaded.row,report.results,now)};
 }
 if(result.errors)return res.status(400).json({error:'Informations à corriger.',fields:result.errors});
 if(result.error)return res.status(409).json({error:result.error,blockingId:result.blockingId||null});
 await store.put(result.state);
 return res.status(200).json(publicView(result.state,{checks:pilotToken(env,locationId)?'auto':'manuel',storage:loaded.storage}));
}

async function agencyList(req,res,{store,adminAuth,env,now}){
 await adminAuth(req);
 const loaded=store?await store.list():[];
 if(loaded?.missing||!store){
  const empty=emptyProgress('DsPXZp1SUaWntQvf0OTU',now);
  return res.status(200).json({storage:'indisponible',checks:pilotToken(env,empty.locationId)?'auto':'manuel',locations:[agencyRow(empty)]});
 }
 const byId=new Map((loaded||[]).filter(row=>allowedLocation(row.locationId)).map(row=>[row.locationId,row]));
 const locations=PILOT_LOCATION_IDS.map(id=>{
  const row=byId.get(id)||emptyProgress(id,now);
  return agencyRow(normalize(row,id,now));
 });
 return res.status(200).json({storage:store.kind,checks:pilotToken(env,'DsPXZp1SUaWntQvf0OTU')?'auto':'manuel',locations});
}

function normalize(found,locationId,now){
 const row=emptyProgress(locationId,found.updatedAt||now);
 row.broker=found.broker||{};
 row.help=found.help||null;
 row.lastCheckAt=found.lastCheckAt||null;
 row.updatedAt=found.updatedAt||now;
 for(const [key,value] of Object.entries(found.steps||{})){
  if(row.steps[key]&&value&&typeof value.status==='string')row.steps[key]={...row.steps[key],...value};
 }
 return row;
}

async function agencyReset(req,res,{store,adminAuth,now}){
 await adminAuth(req);
 const locationId=locationFrom(req);
 if(!allowedLocation(locationId))return res.status(404).json({error:'Ce parcours n’est pas disponible pour ce compte.'});
 if(!store)throw new CallError('La progression n’est pas encore enregistrée.',503);
 const loaded=await loadRow(store,locationId,now);
 if(loaded.storage==='indisponible')throw new CallError('La progression n’est pas encore enregistrée : la migration du pilote n’est pas appliquée.',503);
 const fresh=emptyProgress(locationId,now);
 await store.put(fresh);
 return res.status(200).json({location:agencyRow(fresh),storage:loaded.storage});
}

async function agencyUpdate(req,res,{store,adminAuth,env,now}){
 await adminAuth(req);
 const locationId=locationFrom(req);
 if(!allowedLocation(locationId))return res.status(404).json({error:'Ce parcours n’est pas disponible pour ce compte.'});
 if(!store)throw new CallError('La progression n’est pas encore enregistrée.',503);
 const loaded=await loadRow(store,locationId,now);
 if(loaded.storage==='indisponible')throw new CallError('La progression n’est pas encore enregistrée : la migration du pilote n’est pas appliquée.',503);
 const result=applyAgency(loaded.row,{stepId:req.body?.step,status:req.body?.status,note:req.body?.note},now);
 if(result.error)return res.status(400).json({error:result.error});
 await store.put(result.state);
 return res.status(200).json({location:agencyRow(result.state),checks:pilotToken(env,locationId)?'auto':'manuel',storage:loaded.storage});
}
