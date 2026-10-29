import test from 'node:test';import assert from 'node:assert/strict';import {groupMeetingSources,combinedTranscript} from '../src/meeting-groups.mjs';
const z={id:'z',provider:'zoom',account_id:'za',external_id:'uuid',zoom_occurrence_id:'uuid',source_kind:'meeting',started_at:'2026-10-28T15:00:00Z',participant_emails:['host@example.test','client@example.test'],transcript:'Zoom original',match_status:'manual',client_id:'client-a'};
const w={...z,id:'w',provider:'wispr',account_id:'wa',external_id:'wispr-id',transcript:'Wispr original',match_status:'unmatched',client_id:null};
const opts={accounts:{zoom:'za',wispr:'wa'},ignoredEmails:['host@example.test']};
test('same meeting: two source transcripts, one draft, reliable client retained',()=>{const g=groupMeetingSources([z,w],opts);assert.equal(g.length,1);assert.equal(g[0].clientId,'client-a');assert.equal(g[0].published,false);assert.match(combinedTranscript(g[0]),/Zoom original/);assert.match(combinedTranscript(g[0]),/Wispr original/)});
test('unassigned stays in admin draft, ambiguous and conflicting clients never merged',()=>{assert.equal(groupMeetingSources([{...z,client_id:null},w],opts)[0].status,'À associer');assert.equal(groupMeetingSources([z,w,{...w,id:'w2'}],opts).length,3);assert.equal(groupMeetingSources([z,{...w,client_id:'client-b'}],opts).length,2)});
test('recurring room, host email and other accounts are insufficient',()=>{const common={zoom_occurrence_id:'',calendar_event_id:'',conference_url:'https://zoom.us/j/123',participant_emails:['host@example.test']};assert.equal(groupMeetingSources([{...z,...common},{...w,...common}],opts).length,2);assert.equal(groupMeetingSources([z,{...w,account_id:'other'}],opts).length,2);assert.equal(groupMeetingSources([z,{...w,started_at:'2026-10-29T15:00:00Z'}],opts).length,2)});
test('backup evidence retains both native summaries and accepts either single source',async()=>{
 const {meetingEvidence}=await import('../src/meeting-groups.mjs');
 for(const source of [z,w]){const groups=groupMeetingSources([source],opts);assert.equal(groups.length,1);assert.equal(groups[0].published,false)}
 const g=groupMeetingSources([{...z,summary:'Zoom summary'},{...w,summary:'Wispr summary'}],opts)[0];
 for(const text of ['Zoom original','Wispr original','Zoom summary','Wispr summary'])assert.ok(meetingEvidence(g).includes(text));
});
test('contradictory Zoom occurrences cannot merge through matching email, event or room',()=>{
 const a={...z,calendar_event_id:'recurring-event',conference_url:'https://zoom.us/j/123'};
 const b={...w,calendar_event_id:'recurring-event',conference_url:a.conference_url,zoom_occurrence_id:'different-occurrence'};
 assert.equal(groupMeetingSources([a,b],opts).length,2);
 assert.equal(groupMeetingSources([a,{...b,zoom_occurrence_id:''}],opts).length,1);
});
test('administrator email exclusion trims whitespace before comparison',()=>{
 const common={zoom_occurrence_id:'',participant_emails:['host@example.test']};
 assert.equal(groupMeetingSources([{...z,...common},{...w,...common}],{...opts,ignoredEmails:[' HOST@example.test ']}).length,2);
});
test('appointment matching keeps contradictory occurrences for manual review',async()=>{
 const {suggestMatch,CENTRAL_GHL_LOCATION}=await import('../src/call-matching.mjs');
 const appointment={...z,source_kind:'appointment',account_id:CENTRAL_GHL_LOCATION,calendar_event_id:'shared-event',zoom_occurrence_id:'other-occurrence'};
 const match=suggestMatch({...w,calendar_event_id:'shared-event'},[appointment]);
 assert.equal(match.status,'suggested');assert.equal(match.strong,false);assert.match(match.reason,/Occurrences Zoom différentes/);
});
