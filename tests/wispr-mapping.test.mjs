import test from 'node:test';import assert from 'node:assert/strict';import {mapWisprMeetingBatch,catalogueDigest} from '../server/wispr-mapping.mjs';
// This tool/response is deliberately synthetic, not an assertion about Wispr's catalogue.
const catalogue={tools:[{name:'fixture_meetings',inputSchema:{type:'object',properties:{},additionalProperties:false}}]};
const mapping={toolName:'fixture_meetings',catalogueSha256:catalogueDigest(catalogue),recordsPath:['fixtures'],fields:{external_id:['id'],started_at:['start'],transcript:['text'],summary:['recap'],participant_emails:['emails']}};
const row={id:'fixture-1',start:'2026-10-28T15:00:00Z',text:'Original fixture transcript',recap:'Original fixture summary',emails:['client@example.test']};
const args={actor:{id:'admin',admin:true},confirmed:true,accountId:'fixture-account',catalogue,mapping,result:{structuredContent:{fixtures:[row]}}};
test('Wispr offline mapping preserves original sources, configured account and no media',()=>{const [r]=mapWisprMeetingBatch(args);assert.equal(r.transcript,row.text);assert.equal(r.summary,row.recap);assert.equal(r.account_id,args.accountId);assert.equal(r.replay_url,'');assert.equal(r.client_id,undefined)});
test('Wispr offline mapping accepts either transcript or native summary alone',()=>{for(const change of [{text:''},{recap:''}])assert.equal(mapWisprMeetingBatch({...args,result:{structuredContent:{fixtures:[{...row,...change}]}}}).length,1)});
test('Wispr mapping rejects clients, unconfirmed account, catalogue drift and unstructured errors',()=>{for(const change of [{actor:{id:'client',admin:false}},{confirmed:false},{catalogue:{tools:[]}},{result:{isError:true}},{result:{content:[{type:'text',text:'unverified'}]}}])assert.throws(()=>mapWisprMeetingBatch({...args,...change}))});
test('Wispr mapping rejects malformed data, duplicate IDs, media mapping and dangerous paths',()=>{
 for(const rows of [[{...row,text:{invented:'text'}}],[row,row],[{...row,start:'2026-10-28T15:00:00'}],[{...row,text:'',recap:''}]])assert.throws(()=>mapWisprMeetingBatch({...args,result:{structuredContent:{fixtures:rows}}}));
 for(const fields of [{...mapping.fields,replay_url:['url']},{...mapping.fields,summary:['__proto__']}])assert.throws(()=>mapWisprMeetingBatch({...args,mapping:{...mapping,fields}}));
});
