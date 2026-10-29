// Offline mapping boundary only. No Wispr tools/call or production route is wired.
// A reviewed catalogue and actual response schema are still required before activation.
import {createHash} from 'node:crypto';
import {normalizeSource} from '../src/call-matching.mjs';
import {CallError} from './calls.mjs';
export const catalogueDigest=catalogue=>createHash('sha256').update(JSON.stringify(catalogue)).digest('hex');
const fields=new Set(['external_id','started_at','ended_at','title','transcript','summary','participant_emails','zoom_occurrence_id','calendar_event_id']);
function readPath(value,path){
 if(!Array.isArray(path)||path.length>10||path.some(k=>typeof k!=='string'||!k||['__proto__','prototype','constructor'].includes(k)))throw new CallError('Chemin de mapping invalide.');
 for(const k of path){if(!value||typeof value!=='object'||!Object.hasOwn(value,k))return undefined;value=value[k]}return value;
}
export function mapWisprMeetingBatch({actor,confirmed,accountId,catalogue,mapping,result}){
 if(actor?.admin!==true||!actor.id||confirmed!==true)throw new CallError('Administrateur et compte confirmé requis.',403);
 if(typeof accountId!=='string'||!accountId||accountId.length>200)throw new CallError('Compte Wispr requis.');
 if(!Array.isArray(catalogue?.tools)||mapping?.catalogueSha256!==catalogueDigest(catalogue))throw new CallError('Catalogue différent du mapping revu.',409);
 const tool=catalogue.tools.filter(t=>t.name===mapping.toolName);if(tool.length!==1||!tool[0].inputSchema)throw new CallError('Outil absent ou ambigu.',409);
 if(result?.isError||!result?.structuredContent||typeof result.structuredContent!=='object')throw new CallError('Contenu structuré Wispr non confirmé.');
 if(!mapping.fields||Object.keys(mapping.fields).some(k=>!fields.has(k))||!mapping.fields.external_id||!mapping.fields.started_at)throw new CallError('Champs de mapping invalides.');
 const rows=readPath(result.structuredContent,mapping.recordsPath);if(!Array.isArray(rows)||rows.length>100)throw new CallError('Lot Wispr invalide (100 rencontres maximum).');
 const ids=new Set();return rows.map(row=>{
  const mapped={};for(const [key,path] of Object.entries(mapping.fields)){const v=readPath(row,path);if(v===undefined)continue;if(key==='participant_emails'){if(!Array.isArray(v)||v.some(x=>typeof x!=='string'))throw new CallError('Participants Wispr invalides.')}else if(typeof v!=='string')throw new CallError('Champ Wispr non textuel.');mapped[key]=v;}
  if(!mapped.transcript?.trim()&&!mapped.summary?.trim())throw new CallError('Rencontre sans transcription ni résumé.');
  if(!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(mapped.started_at||''))throw new CallError('Horaire Wispr sans fuseau.');
  const source=normalizeSource({...mapped,provider:'wispr',account_id:accountId,replay_url:'',conference_url:''});
  if(ids.has(source.external_id))throw new CallError('Occurrences Wispr dupliquées : vérifier le mapping.');ids.add(source.external_id);return source;
 });
}
