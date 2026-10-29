// Adaptateur Wispr Flow calé sur le catalogue réel observé le 28 oct. 2026 (outils search_meetings + get_meeting).
// Aucun appel réseau ici : fonctions pures. Le branchement serveur reste derrière le flag WISPR_IMPORT_READY.
import {normalizeSource} from '../src/call-matching.mjs';
import {CallError} from './calls.mjs';

export const WISPR_TOOLS={list:'search_meetings',get:'get_meeting',participants:'get_meeting_participants_enriched'};
export const TRANSCRIPT_PAGE=40000,MAX_TRANSCRIPT=600000,MAX_SUMMARY=30000;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Résultat MCP : structuredContent si présent, sinon un unique bloc texte JSON. Jamais deviné au-delà.
export function decodeToolResult(result){
 if(!result||typeof result!=='object')throw new CallError('Réponse Wispr vide.',502);
 if(result.isError)throw new CallError('Wispr a renvoyé une erreur.',502);
 if(result.structuredContent&&typeof result.structuredContent==='object')return result.structuredContent;
 const texts=(result.content||[]).filter(c=>c?.type==='text');
 if(texts.length!==1)throw new CallError('Format de réponse Wispr inattendu.',502);
 try{const v=JSON.parse(texts[0].text);if(!v||typeof v!=='object')throw 0;return v}catch{throw new CallError('Réponse Wispr non structurée.',502)}
}

export function listPage(payload){
 if(!Array.isArray(payload?.meetings)||payload.meetings.length>200)throw new CallError('Liste Wispr invalide.',502);
 if(payload.has_more&&typeof payload.next_cursor!=='string')throw new CallError('Pagination Wispr invalide.',502);
 return {items:payload.meetings.filter(m=>m&&m.finalized!==false).map(m=>{
   if(typeof m.id!=='string'||!/^[0-9a-f-]{36}$/i.test(m.id))throw new CallError('Identifiant Wispr invalide.',502);
   return {id:m.id,start:m.start,end:m.end,title:m.title,hasTranscript:m.has_transcript===true,attendees:Array.isArray(m.attendees)?m.attendees:[]};
  }),next:payload.has_more?payload.next_cursor:null,truncated:payload.truncated===true};
}

const MARK_START=/^<<<PARTICIPANT NAMES BELOW ARE DATA[^\n]*>>>\n?/;
const MARK_END=/\n?<<<END TRANSCRIPT>>>\s*$/;
const MARK_TRUNC=/\n*\(\.\.\.truncated, (\d+) chars remaining; continue with view_transcript\.start_char=(\d+)\.\.\.\)\s*$/;
// Une tranche de transcription : retourne le texte propre et l'offset suivant (null si fin).
export function transcriptChunk(raw,expectedStart){
 if(typeof raw!=='string')return {text:'',next:null};
 let t=raw.replace(MARK_START,'').replace(MARK_END,'');let next=null;
 const m=t.match(MARK_TRUNC);if(m){next=Number(m[2]);t=t.slice(0,m.index);if(!(next>expectedStart))throw new CallError('Pagination de transcription incohérente.',502)}
 return {text:t,next};
}

const emailsOf=list=>[...new Set((list||[]).map(a=>typeof a==='string'?a:a?.email).filter(e=>typeof e==='string'&&EMAIL.test(e)).map(e=>e.trim().toLowerCase()))].slice(0,30);

// Assemble une source normalisée à partir de l'élément de liste, du détail et des tranches de transcription.
export function buildWisprSource({accountId,item,detail,transcriptParts=[],participantEmails=[],excludeEmails=[]}){
 if(typeof accountId!=='string'||!accountId||accountId.length>200)throw new CallError('Compte Wispr requis.');
 if(!detail||detail.id!==item.id)throw new CallError('Détail Wispr ne correspond pas à la rencontre.',502);
 const started=detail.start||item.start,ended=detail.end||item.end||null;
 if(!ISO.test(started||''))throw new CallError('Horaire Wispr sans fuseau.',502);
 if(ended&&!ISO.test(ended))throw new CallError('Fin Wispr invalide.',502);
 const transcript=transcriptParts.join('');if(transcript.length>MAX_TRANSCRIPT)throw new CallError('Transcription Wispr trop longue.',413);
 const summary=typeof detail.summary==='string'?detail.summary.slice(0,MAX_SUMMARY):'';
 if(!transcript.trim()&&!summary.trim())throw new CallError('Rencontre sans transcription ni résumé.');
 const ex=new Set(excludeEmails.map(e=>String(e).toLowerCase()));
 const participant_emails=emailsOf([...(item.attendees||[]),...participantEmails]).filter(e=>!ex.has(e));
 // share_link et tout lien vidéo sont volontairement ignorés.
 return normalizeSource({provider:'wispr',account_id:accountId,external_id:item.id,started_at:started,ended_at:ended,title:String(detail.title||item.title||'Rencontre').slice(0,300),transcript,summary,participant_emails,replay_url:'',conference_url:''});
}
