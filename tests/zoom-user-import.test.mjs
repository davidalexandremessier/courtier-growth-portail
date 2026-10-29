import test from 'node:test';import assert from 'node:assert/strict';import {readZoomUserMeetings} from '../server/zoom-user-import.mjs';
const args={accessToken:'synthetic',hostId:'host',accountId:'account',from:'2026-10-01',to:'2026-10-10'};
function fetcher({host='host',url='https://zoom.us/transcript',pagination=false}={}){return async(u,o)=>{assert.equal(o.redirect,'error');if(u.includes('/recordings'))return {ok:true,json:async()=>({meetings:[{host_id:host,uuid:'uuid',id:123,start_time:'2026-10-01T15:00:00Z',duration:30}],...(pagination?{next_page_token:'repeat'}:{})})};if(u.includes('/meetings/'))return {ok:true,json:async()=>({host_id:'host',can_download:true,download_url:url})};if(u.includes('/participants'))return {ok:true,json:async()=>({participants:[{user_email:'synthetic@example.test'}]})};return new Response('Synthetic transcript')}}
test('Zoom OAuth reader: only own host, text-only drafts, source preserved',async()=>{const r=await readZoomUserMeetings({...args,fetcher:fetcher()});assert.equal(r.items.length,1);assert.equal(r.items[0].replay_url,'');assert.equal(r.items[0].account_id,'account');assert.equal((await readZoomUserMeetings({...args,fetcher:fetcher({host:'other'})})).items.length,0)});
test('Zoom OAuth reader: rejects off-provider transcript URLs and incomplete pagination',async()=>{assert.equal((await readZoomUserMeetings({...args,fetcher:fetcher({url:'https://evil.test/file'})})).retry.length,1);await assert.rejects(readZoomUserMeetings({...args,fetcher:fetcher({pagination:true})}),/Pagination/)});
test('Zoom backup: transcript and native summary are independently optional and occurrence-bound',async()=>{
 for(const [hasTranscript,hasSummary] of [[true,true],[true,false],[false,true],[false,false]]){
  const base=fetcher();const r=await readZoomUserMeetings({...args,fetcher:async(u,o)=>{
   if(u.endsWith('/meeting_summary'))return {ok:hasSummary,json:async()=>({meeting_uuid:'uuid',summary_overview:'Synthetic native summary'})};
   if(u.endsWith('/transcript')&&!hasTranscript)return {ok:false};return base(u,o);
  }});
  assert.equal(r.items.length,hasTranscript||hasSummary?1:0);
  if(r.items.length){assert.equal(Boolean(r.items[0].transcript),hasTranscript);assert.equal(Boolean(r.items[0].summary),hasSummary)}
 }
 const base=fetcher();const r=await readZoomUserMeetings({...args,fetcher:async(u,o)=>u.endsWith('/meeting_summary')?{ok:true,json:async()=>({meeting_uuid:'other',summary_overview:'Wrong meeting'})}:base(u,o)});
 assert.equal(r.items[0].summary,'');assert.ok(r.items[0].transcript);
});
function summaryDiscovery({recordings=true,summaries=true,duplicate=false,repeated=false,foreign=false}={}){return async(u)=>{
 if(u.includes('/recordings'))return {ok:recordings,json:async()=>({meetings:duplicate?[{host_id:'host',uuid:'only-summary',id:123,start_time:'2026-10-01T15:00:00Z',duration:30}]:[]})};
 if(u.includes('/users/me/meeting_summaries')){const url=new URL(u);assert.equal(url.searchParams.get('from'),'2026-10-01T00:00:00Z');return {ok:summaries,json:async()=>({summaries:[{meeting_uuid:'only-summary',meeting_host_id:foreign?'other':'host',meeting_start_time:'2026-10-01T15:00:00Z',meeting_end_time:'2026-10-01T15:30:00Z',meeting_topic:'Summary only'}],...(repeated?{next_page_token:'repeat'}:{})})}}
 if(u.endsWith('/meeting_summary'))return {ok:true,json:async()=>({meeting_uuid:'only-summary',summary_overview:'Native summary without recording'})};
 return {ok:false};
}}
test('Zoom discovers own summary-only meetings without cloud recordings',async()=>{
 const r=await readZoomUserMeetings({...args,discoverSummaries:true,fetcher:summaryDiscovery()});assert.equal(r.items.length,1);assert.equal(r.items[0].transcript,'');assert.match(r.items[0].summary,/Native summary without recording/);assert.equal(r.items[0].replay_url,'');assert.equal(r.items[0].ended_at,'2026-10-01T15:30:00Z');
 assert.equal((await readZoomUserMeetings({...args,discoverSummaries:true,fetcher:summaryDiscovery({foreign:true})})).items.length,0);
});
test('Zoom deduplicates a meeting discovered through both recording and summary lists',async()=>{
 const r=await readZoomUserMeetings({...args,discoverSummaries:true,fetcher:summaryDiscovery({duplicate:true})});assert.equal(r.items.length,1);
});
test('Zoom discovery reports partial failures but keeps independent available sources',async()=>{
 const r=await readZoomUserMeetings({...args,discoverSummaries:true,fetcher:summaryDiscovery({recordings:false})});assert.equal(r.items.length,1);assert.equal(r.discoveryWarnings[0].source,'recordings');
 const repeated=await readZoomUserMeetings({...args,discoverSummaries:true,fetcher:summaryDiscovery({repeated:true})});assert.equal(repeated.items.length,0);assert.equal(repeated.discoveryWarnings[0].source,'summaries');
 await assert.rejects(readZoomUserMeetings({...args,discoverSummaries:true,fetcher:summaryDiscovery({recordings:false,summaries:false})}));
});
