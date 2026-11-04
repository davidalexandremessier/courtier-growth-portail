import {createHash, randomUUID, timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const READ=['id','name','email','offer','status','sector','main_constraint','launch_date','work_mode','support_start','support_end','crm_url','meta_ad_account_id','ghl_location_id','created_at'];
const COLUMNS=READ.join(',');
const WRITABLE=new Set(['status','main_constraint','sector','launch_date','support_start','support_end','work_mode','crm_url']);
const STATUSES=new Set(['Onboarding','Actif','En pause','Terminé']);
const MODES=new Set(['Solo','Équipe']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCOPES=new Set(['read','write','full']);
const READ_ONLY_ERROR='Jeton en lecture seule : écriture refusée.';

function fail(res,status,error){return res.status(status).json({error})}
function header(req,name){
 const headers=req.headers||{};
 if(typeof headers.get==='function') return headers.get(name);
 const key=Object.keys(headers).find(item=>item.toLowerCase()===name);
 return key===undefined?undefined:headers[key];
}
function hasOrigin(req){
 const headers=req.headers||{};
 if(typeof headers.get==='function') return typeof headers.has==='function'?headers.has('origin'):headers.get('origin')!=null;
 return Object.keys(headers).some(key=>key.toLowerCase()==='origin'&&headers[key]!=null);
}
function keyEntry(value){
 let hash=value,scope='full';
 if(value&&typeof value==='object'){
  if(Array.isArray(value)||Object.keys(value).some(key=>key!=='hash'&&key!=='scope')) return null;
  hash=value.hash;
  if(value.scope!==undefined) scope=value.scope;
 }
 if(typeof hash!=='string'||!/^[0-9a-f]{64}$/i.test(hash)) return null;
 if(typeof scope!=='string'||!SCOPES.has(scope)) return null;
 return {hash:hash.toLowerCase(),scope};
}
function botKeys(){
 const raw=process.env.BOT_API_KEYS;
 if(typeof raw!=='string'||!raw.trim()) return null;
 let parsed;
 try{parsed=JSON.parse(raw)}catch{return null}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)) return null;
 const entries=Object.entries(parsed);
 if(!entries.length) return null;
 const keys=[];
 for(const [name,value] of entries){
  if(typeof name!=='string'||!/^[\p{L}\p{N}_.-]{1,64}$/u.test(name)||name==='refus') return null;
  const entry=keyEntry(value);
  if(!entry) return null;
  keys.push({name,...entry});
 }
 return keys;
}
function presentedToken(req){
 const value=header(req,'authorization');
 if(typeof value!=='string'||!value.trim()) return {token:'',presented:false};
 const match=/^Bearer\s+(\S+)$/i.exec(value.trim());
 if(!match||match[1].length>512) return {token:'',presented:true};
 return {token:match[1],presented:true};
}
function matchActor(token,keys){
 const actual=Buffer.from(createHash('sha256').update(token).digest('hex'));
 let actor=null;
 for(const entry of keys){
  const expected=Buffer.from(entry.hash);
  if(expected.length===actual.length&&timingSafeEqual(actual,expected)&&actor===null) actor=entry;
 }
 return actor;
}
function serverDb(){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_ARCHIVE_SECRET_KEY;
 if(!url||!key) return null;
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function looksSecret(value){
 return /password|mot\s+de\s+passe|\bmdp\b|token|api[\s_-]*key/i.test(value)||/sk_|EAA[A-Za-z0-9]{20,}/.test(value);
}
function isoDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const [year,month,day]=value.split('-').map(Number);
 const date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
}
function checkValue(key,value){
 if(key==='status') return STATUSES.has(value)?null:'Statut invalide.';
 if(key==='work_mode') return MODES.has(value)?null:'Mode de fonctionnement invalide.';
 if(key==='main_constraint') return value.length<=1000?null:'Contrainte trop longue.';
 if(key==='sector') return value.length<=120?null:'Secteur trop long.';
 if(key==='launch_date'||key==='support_start'||key==='support_end') return isoDate(value)?null:'Date invalide.';
 if(key==='crm_url') return value===''||(/^https:\/\/\S+$/.test(value)&&value.length<=2000)?null:'Lien CRM invalide.';
 return 'Champ non modifiable.';
}
function validatePatch(body){
 if(!body||typeof body!=='object'||Array.isArray(body)) return {error:'Requête invalide.'};
 if(Object.keys(body).some(key=>key!=='changes'&&key!=='reason')) return {error:'Requête invalide.'};
 if(typeof body.reason!=='string'||!body.reason.trim()) return {error:'Raison requise.'};
 const reason=body.reason.trim();
 if(reason.length>500) return {error:'Raison trop longue.'};
 if(looksSecret(reason)) return {error:'Valeur sensible refusée.'};
 const changes=body.changes;
 if(!changes||typeof changes!=='object'||Array.isArray(changes)) return {error:'Requête invalide.'};
 const keys=Object.keys(changes);
 if(!keys.length) return {error:'Modification vide.'};
 if(keys.some(key=>!WRITABLE.has(key))) return {error:'Champ non modifiable.'};
 const patch={};
 for(const key of keys){
  const value=changes[key];
  if(typeof value!=='string') return {error:'Requête invalide.'};
  if(looksSecret(value)) return {error:'Valeur sensible refusée.'};
  const error=checkValue(key,value);
  if(error) return {error};
  patch[key]=value;
 }
 if(patch.support_start&&patch.support_end&&patch.support_end<patch.support_start) return {error:'La fin de l’accompagnement précède le début.'};
 return {changes:patch,reason};
}
function requestedId(req){
 let id=req.query?.id;
 if(Array.isArray(id)) return {error:true};
 if(id==null){try{id=new URL(req.url||'/','https://portal.invalid').searchParams.get('id')}catch{id=null}}
 if(id==null) return {id:null};
 if(typeof id!=='string'||!UUID.test(id)) return {error:true};
 return {id};
}
function pick(row){
 const out={};
 for(const key of READ) out[key]=row?.[key]??null;
 return out;
}
function readBody(req){
 const body=req.body;
 if(body==null||body==='') return null;
 if(typeof body==='string'){if(body.length>20000) throw new Error('large');return JSON.parse(body)}
 if(Buffer.isBuffer(body)){if(body.length>20000) throw new Error('large');return JSON.parse(body.toString('utf8'))}
 return body;
}
async function auditDenial(presented){
 const db=serverDb();
 if(!db) return;
 try{await db.from('bot_audit_log').insert({actor:'refus',action:'denied',client_id:null,changes:null,reason:presented?'jeton refusé':'jeton absent',request_id:randomUUID()})}catch{/* le refus reste un 401, sans matériau de jeton */ }
}
function rpcFailure(res,error){
 const message=String(error?.message||error?.details||'');
 if(/client not found/i.test(message)) return fail(res,404,'Dossier introuvable.');
 if(/not allowed|empty patch|check constraint|invalid input syntax|violates/i.test(message)) return fail(res,400,'Modification refusée.');
 return fail(res,502,'Enregistrement impossible.');
}
async function readClients(req,res,db,actor){
 const id=requestedId(req);
 if(id.error) return fail(res,400,'Dossier invalide.');
 const requestId=randomUUID();
 if(!id.id){
  const listed=await db.from('clients').select(COLUMNS).order('name');
  if(listed.error||!Array.isArray(listed.data)) return fail(res,502,'Lecture impossible.');
  const logged=await db.from('bot_audit_log').insert({actor,action:'list',client_id:null,changes:null,reason:null,request_id:requestId});
  if(logged.error) return fail(res,503,'Journalisation impossible.');
  return res.status(200).json({clients:listed.data.map(pick)});
 }
 const one=await db.from('clients').select(COLUMNS).eq('id',id.id).maybeSingle();
 if(one.error) return fail(res,502,'Lecture impossible.');
 if(!one.data){
  const logged=await db.from('bot_audit_log').insert({actor,action:'get',client_id:null,changes:{requested_id:id.id},reason:'dossier introuvable',request_id:requestId});
  if(logged.error) return fail(res,503,'Journalisation impossible.');
  return fail(res,404,'Dossier introuvable.');
 }
 const logged=await db.from('bot_audit_log').insert({actor,action:'get',client_id:id.id,changes:null,reason:null,request_id:requestId});
 if(logged.error) return fail(res,503,'Journalisation impossible.');
 return res.status(200).json({client:pick(one.data)});
}
async function patchClient(req,res,db,actor){
 const id=requestedId(req);
 if(id.error||!id.id) return fail(res,400,'Dossier invalide.');
 let body;
 try{body=readBody(req)}catch{return fail(res,400,'Requête invalide.')}
 const parsed=validatePatch(body);
 if(parsed.error) return fail(res,400,parsed.error);
 const updated=await db.rpc('bot_update_client',{p_client:id.id,p_patch:parsed.changes,p_actor:actor,p_reason:parsed.reason});
 if(updated.error) return rpcFailure(res,updated.error);
 if(!updated.data||typeof updated.data!=='object'||Array.isArray(updated.data)) return fail(res,502,'Enregistrement impossible.');
 return res.status(200).json({client:pick(updated.data)});
}

// Comparaison par empreinte. Le jeton n’est jamais écrit dans bot_audit_log.
// clients n’est jamais modifié ici : PATCH appelle seulement rpc bot_update_client.
// scope absent ou "full" : droits historiques. "write" : GET et PATCH. "read" : GET seul.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(hasOrigin(req)) return fail(res,403,'Origine refusée.');
 const method=String(req.method||'').toUpperCase();
 const apiMethod=method==='GET'||method==='PATCH';
 if(!apiMethod&&method!=='POST'&&method!=='PUT'&&method!=='DELETE') return fail(res,405,'Méthode non permise.');
 const keys=botKeys();
 const presented=keys?presentedToken(req):null;
 const actor=keys&&presented.token?matchActor(presented.token,keys):null;
 if(actor?.scope==='read'&&method!=='GET') return fail(res,403,READ_ONLY_ERROR);
 if(!apiMethod) return fail(res,405,'Méthode non permise.');
 if(!keys) return fail(res,503,'Configuration serveur indisponible.');
 if(!actor){await auditDenial(presented.presented);return fail(res,401,'Accès refusé.')}
 try{
  const db=serverDb();
  if(!db) return fail(res,503,'Configuration serveur indisponible.');
  if(method==='GET') return await readClients(req,res,db,actor.name);
  return await patchClient(req,res,db,actor.name);
 }catch{return fail(res,502,'Service indisponible.')}
}
