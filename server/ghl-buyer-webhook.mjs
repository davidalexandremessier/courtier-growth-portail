import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {supabaseBuyerDb} from './ghl-buyer-db.mjs';

export const MAX_BODY=16384;
export const LOCATION_LIMIT=30;
export const GLOBAL_LIMIT=120;
export const READ_LIMIT=60;
const WINDOW_MS=60_000;
const buckets=new Map();

const TOP_FIELDS=['event','location_id','contact_id','occurred_at','contact_email','contact_name','note','property'];
const TOP=new Set(TOP_FIELDS);
const PROP=new Set(['centris_id','address','price','url']);
const EVENTS=new Set(['coup_de_coeur','portal_link']);
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

export function resetBuyerRateLimit(){buckets.clear()}

function take(key, limit, now){
 const prev=(buckets.get(key)||[]).filter(t=>now-t<WINDOW_MS);
 if(prev.length>=limit){buckets.set(key, prev);return false}
 prev.push(now);
 buckets.set(key, prev);
 if(buckets.size>2000){for(const [name, times] of buckets) if(!times.some(t=>now-t<WINDOW_MS)) buckets.delete(name)}
 return true;
}

export function tokenMatches(presented, expected){
 const left=createHash('sha256').update(String(presented)).digest();
 const right=createHash('sha256').update(String(expected)).digest();
 return timingSafeEqual(left, right);
}

function header(req, name){
 const headers=req.headers||{};
 if(typeof headers.get==='function'){
  const value=headers.get(name);
  return typeof value==='string'?value:'';
 }
 const key=Object.keys(headers).find(item=>item.toLowerCase()===name.toLowerCase());
 const value=key?headers[key]:'';
 return typeof value==='string'?value:'';
}

export function webhookConfigured(){
 const token=process.env.GHL_BUYER_WEBHOOK_TOKEN;
 const secret=process.env.GHL_BUYER_PORTAL_SECRET;
 if(typeof token!=='string'||token.length<16) return false;
 if(typeof secret!=='string'||secret.length<16) return false;
 try{
  const url=new URL(process.env.APP_URL||'');
  if(url.protocol==='https:') return true;
  return url.protocol==='http:'&&(url.hostname==='localhost'||url.hostname==='127.0.0.1');
 }catch{return false}
}

export function signBuyerToken(clientId, contactId){
 return createHmac('sha256', process.env.GHL_BUYER_PORTAL_SECRET).update(`${clientId}\u001f${contactId}`).digest('base64url');
}

export function hashBuyerToken(token){
 return createHash('sha256').update(token).digest('hex');
}

export function buyerPortalUrl(token){
 const url=new URL(process.env.APP_URL);
 url.pathname='/';
 url.search='';
 url.hash='';
 url.searchParams.set('acheteur', token);
 return url.href;
}

export function propertyIdentity(property){
 const centris=String(property?.centris_id||'').trim();
 const url=String(property?.url||'').trim();
 return centris||url;
}

export function eventIdentity(row){
 return [row.ghl_location_id, row.contact_id, row.event, propertyIdentity(row.property), row.occurred_at].join('\u001f');
}

function httpsUrl(value){
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password;
 }catch{return false}
}

function parseOccurred(value){
 if(typeof value!=='string'||!ISO.test(value)) return null;
 const date=new Date(value);
 if(Number.isNaN(date.getTime())) return null;
 const year=date.getUTCFullYear();
 if(year<2000||year>2100) return null;
 return date.toISOString();
}

export function validateBuyerEvent(body){
 const fields=[];
 if(!body||typeof body!=='object'||Array.isArray(body)) return {fields:['body']};
 for(const key of Object.keys(body)) if(!TOP.has(key)) fields.push(key);
 if(!EVENTS.has(body.event)) fields.push('event');
 if(typeof body.location_id!=='string'||!body.location_id.trim()||body.location_id.trim().length>80) fields.push('location_id');
 if(typeof body.contact_id!=='string'||!body.contact_id.trim()||body.contact_id.trim().length>120) fields.push('contact_id');
 const occurred=parseOccurred(body.occurred_at);
 if(!occurred) fields.push('occurred_at');
 let email=null;
 if(body.contact_email!=null&&body.contact_email!==''){
  if(typeof body.contact_email!=='string'||body.contact_email.trim().length>200||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contact_email.trim())) fields.push('contact_email');
  else email=body.contact_email.trim();
 }
 let name=null;
 if(body.contact_name!=null&&body.contact_name!==''){
  if(typeof body.contact_name!=='string'||!body.contact_name.trim()||body.contact_name.trim().length>200) fields.push('contact_name');
  else name=body.contact_name.trim();
 }
 let note=null;
 if(body.note!=null&&body.note!==''){
  if(typeof body.note!=='string'||body.note.length>2000) fields.push('note');
  else note=body.note.trim()||null;
 }
 let property=null;
 const propertyObject=body.property!=null&&typeof body.property==='object'&&!Array.isArray(body.property);
 if(body.property!=null&&!propertyObject) fields.push('property');
 if(propertyObject){
  for(const key of Object.keys(body.property)) if(!PROP.has(key)) fields.push('property.'+key);
  const next={};
  if(body.property.centris_id!=null&&body.property.centris_id!==''){
   if(typeof body.property.centris_id!=='string'||!body.property.centris_id.trim()||body.property.centris_id.trim().length>40) fields.push('property.centris_id');
   else next.centris_id=body.property.centris_id.trim();
  }
  if(body.property.address!=null&&body.property.address!==''){
   if(typeof body.property.address!=='string'||!body.property.address.trim()||body.property.address.trim().length>300) fields.push('property.address');
   else next.address=body.property.address.trim();
  }
  if(body.property.price!=null&&body.property.price!==''){
   if(typeof body.property.price!=='number'||!Number.isFinite(body.property.price)||body.property.price<0||body.property.price>1e12) fields.push('property.price');
   else next.price=body.property.price;
  }
  if(body.property.url!=null&&body.property.url!==''){
   if(typeof body.property.url!=='string'||body.property.url.length>2000||!httpsUrl(body.property.url.trim())) fields.push('property.url');
   else next.url=body.property.url.trim();
  }
  if(Object.keys(next).length) property=next;
 }
 if(body.event==='coup_de_coeur'&&!(property?.centris_id||property?.url)){
  if(!fields.includes('property.centris_id')) fields.push('property.centris_id');
  if(!fields.includes('property.url')) fields.push('property.url');
 }
 const unique=[];
 for(const field of [...TOP_FIELDS.filter(field=>fields.includes(field)), ...fields.filter(field=>!TOP_FIELDS.includes(field))]) if(!unique.includes(field)) unique.push(field);
 if(unique.length) return {fields:unique};
 return {value:{event:body.event, location_id:body.location_id.trim(), contact_id:body.contact_id.trim(), occurred_at:occurred, contact_email:email, contact_name:name, note, property}};
}

function send(res, status, body, extra){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(extra) for(const [key, value] of Object.entries(extra)) res.setHeader(key, value);
 return res.status(status).json(body);
}

function readJson(req){
 const rawLength=header(req,'content-length');
 if(rawLength&&Number(rawLength)>MAX_BODY) return {error:'size'};
 const body=req.body;
 if(typeof body==='string'){
  if(body.length>MAX_BODY) return {error:'size'};
  try{return {value:JSON.parse(body)}}catch{return {error:'json'}}
 }
 if(Buffer.isBuffer(body)){
  if(body.length>MAX_BODY) return {error:'size'};
  try{return {value:JSON.parse(body.toString('utf8'))}}catch{return {error:'json'}}
 }
 if(body&&typeof body==='object'){
  let encoded;
  try{encoded=JSON.stringify(body)}catch{return {error:'json'}}
  if(encoded.length>MAX_BODY) return {error:'size'};
  return {value:body};
 }
 return {error:'json'};
}

function queryToken(req){
 const fromQuery=req.query?.token??req.query?.acheteur;
 if(typeof fromQuery==='string') return fromQuery;
 try{
  const url=new URL(req.url||'/','https://portal.invalid');
  return url.searchParams.get('token')||url.searchParams.get('acheteur')||'';
 }catch{return ''}
}

function buyerPayload(events, clientId, contactId){
 const mine=events.filter(event=>event?.client_id===clientId&&event?.contact_id===contactId);
 const coups=mine.filter(event=>event.event==='coup_de_coeur').sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at))).slice(0,100);
 const contactName=mine.find(event=>event.contact_name)?.contact_name||coups.find(event=>event.contact_name)?.contact_name||'';
 return {contact_name:contactName, coups_de_coeur:coups.map(event=>({occurred_at:event.occurred_at, note:event.note??null, property:event.property??null}))};
}

export async function handleBuyerWebhook(req, res, deps={}){
 const now=deps.now?.()??Date.now();
 const method=String(req.method||'GET').toUpperCase();
 if(!['GET','POST'].includes(method)) return send(res,405,{error:'Méthode non permise.'},{'Allow':'GET, POST'});
 if(!webhookConfigured()) return send(res,503,{error:'Configuration serveur indisponible.'});
 const db=deps.db===undefined?supabaseBuyerDb():deps.db;
 if(!db) return send(res,503,{error:'Configuration serveur indisponible.'});
 if(method==='GET') return readBuyer(req, res, db, now);
 return writeBuyer(req, res, db, now);
}

async function writeBuyer(req, res, db, now){
 const expected=process.env.GHL_BUYER_WEBHOOK_TOKEN;
 const presented=header(req,'x-cg-webhook-token');
 if(!presented||!tokenMatches(presented, expected)) return send(res,401,{error:'Jeton webhook refusé.'});
 const parsed=readJson(req);
 if(parsed.error){
  if(!take('global', GLOBAL_LIMIT, now)||!take('loc:malforme', LOCATION_LIMIT, now)) return send(res,429,{error:'Trop de requêtes pour ce sous-compte. Réessayez dans un moment.'},{'Retry-After':'60'});
  return send(res,400,parsed.error==='size'?{error:'Requête trop volumineuse.', fields:['body']}:{error:'JSON invalide.', fields:['body']});
 }
 const validated=validateBuyerEvent(parsed.value);
 if(validated.fields){
  const raw=typeof parsed.value?.location_id==='string'?parsed.value.location_id.trim().slice(0,80):'';
  const bucket=raw||'malforme';
  if(!take('global', GLOBAL_LIMIT, now)||!take('loc:'+bucket, LOCATION_LIMIT, now)) return send(res,429,{error:'Trop de requêtes pour ce sous-compte. Réessayez dans un moment.'},{'Retry-After':'60'});
  return send(res,400,{error:'Requête invalide.', fields:validated.fields});
 }
 const value=validated.value;
 if(!take('global', GLOBAL_LIMIT, now)||!take('loc:'+value.location_id, LOCATION_LIMIT, now)) return send(res,429,{error:'Trop de requêtes pour ce sous-compte. Réessayez dans un moment.'},{'Retry-After':'60'});
 let matches;
 try{matches=await db.clientsByLocation(value.location_id)}catch{return send(res,502,{error:'Lecture du dossier impossible.'})}
 if(!matches?.length) return send(res,404,{error:'Sous-compte GHL inconnu : aucun dossier du portail ne correspond à ce location_id.'});
 if(matches.length>1) return send(res,409,{error:'Plusieurs dossiers du portail portent ce location_id. Rien n’a été enregistré.'});
 const client=matches[0];
 const token=signBuyerToken(client.id, value.contact_id);
 try{
  await db.insertEvent({client_id:client.id, ghl_location_id:value.location_id, contact_id:value.contact_id, contact_email:value.contact_email, contact_name:value.contact_name, event:value.event, property:value.property, note:value.note, occurred_at:value.occurred_at});
  await db.ensureAccess({client_id:client.id, contact_id:value.contact_id, token_hash:hashBuyerToken(token)});
 }catch{return send(res,502,{error:'Enregistrement impossible.'})}
 return send(res,200,{ok:true, portal_url:buyerPortalUrl(token)});
}

async function readBuyer(req, res, db, now){
 const presented=queryToken(req).trim();
 if(!presented) return send(res,401,{error:'Lien requis.'});
 if(presented.length>128) return send(res,404,{error:'Lien introuvable.'});
 const hash=hashBuyerToken(presented);
 if(!take('read:'+hash.slice(0,32), READ_LIMIT, now)) return send(res,429,{error:'Trop de requêtes. Réessayez dans un moment.'},{'Retry-After':'60'});
 let access;
 try{access=await db.accessByHash(hash)}catch{return send(res,502,{error:'Lecture impossible.'})}
 const signed=access?signBuyerToken(access.client_id, access.contact_id):signBuyerToken('00000000-0000-4000-8000-000000000000','absent');
 if(!access||access.revoked_at||!tokenMatches(presented, signed)) return send(res,404,{error:'Lien introuvable.'});
 let events;
 try{events=await db.eventsFor(access.client_id, access.contact_id)}catch{return send(res,502,{error:'Lecture impossible.'})}
 const view=buyerPayload(Array.isArray(events)?events:[], access.client_id, access.contact_id);
 return send(res,200,{ok:true, broker_name:access.broker_name||'', ...view});
}
