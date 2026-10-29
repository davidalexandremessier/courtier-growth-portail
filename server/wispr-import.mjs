// Lecture Wispr réelle (search_meetings + get_meeting) vers des sources normalisées. Lecture seule.
import {wisprClient} from './wispr-mcp.mjs';
import {decodeToolResult,listPage,transcriptChunk,buildWisprSource,WISPR_TOOLS,TRANSCRIPT_PAGE,MAX_TRANSCRIPT} from './wispr-real.mjs';
import {CallError} from './calls.mjs';
const ISO=/^\d{4}-\d\d-\d\dT[\d:.]+(Z|[+-]\d\d:\d\d)$/;
export async function readWisprMeetings({actor,accessToken,accountId,since,until,excludeEmails=[],maxMeetings=50,client}){
 if(!ISO.test(since||'')||!ISO.test(until||'')||Date.parse(until)<=Date.parse(since)||Date.parse(until)-Date.parse(since)>31*864e5)throw new CallError('Période invalide (31 jours maximum).');
 const c=client||await wisprClient({actor,confirmed:true,accessToken});
 const items=[];let cursor,pages=0,partial=false;
 do{const p=listPage(decodeToolResult(await c.call(WISPR_TOOLS.list,{since,until,limit:50,...(cursor?{cursor}:{})})));items.push(...p.items);cursor=p.next;if(p.truncated)partial=true;if(++pages>=10&&cursor){partial=true;break}}while(cursor&&items.length<maxMeetings);
 if(items.length>maxMeetings){items.length=maxMeetings;partial=true}
 const sources=[],errors=[];
 for(const item of items){try{
  const first=decodeToolResult(await c.call(WISPR_TOOLS.get,{meeting_id:item.id,view_transcript:item.hasTranscript?{start_char:0,char_limit:TRANSCRIPT_PAGE}:undefined,view_content:{char_limit:1}}));
  const parts=[];let next=0,raw=first.transcript,guard=0;
  while(item.hasTranscript&&raw!=null){const ch=transcriptChunk(raw,next);parts.push(ch.text);if(ch.next==null)break;if(ch.next>MAX_TRANSCRIPT||++guard>20)throw new CallError('Transcription trop longue.',413);next=ch.next;raw=decodeToolResult(await c.call(WISPR_TOOLS.get,{meeting_id:item.id,view_transcript:{start_char:next,char_limit:TRANSCRIPT_PAGE},view_content:{char_limit:1}})).transcript}
  sources.push(buildWisprSource({accountId,item,detail:first,transcriptParts:parts,excludeEmails}));
 }catch(e){errors.push({id:item.id,error:e instanceof CallError?e.message:'Lecture impossible.'})}}
 return {sources,errors,partial};
}
