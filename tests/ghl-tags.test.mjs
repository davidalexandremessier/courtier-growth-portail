import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import dispatch from '../api/[slug].js';
import handler from '../routes/ghl-tags.js';
import {GHL_LOCATION_ID,GHL_TAG_ACTIONS,acceptOfferedSpot,applyClientTag,taggingEnabled} from '../server/ghl-tags.mjs';

const client={id:'00000000-0000-4000-8000-0000000000aa',email:'court@example.test',offer:'Campagne 97 $'};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(b){this.body=b;return this}}}
function http(handler){
 const calls=[];
 const fetchImpl=async(url,options={})=>{
  calls.push({url:String(url),method:options.method||'GET',body:options.body?JSON.parse(options.body):null,authorization:options.headers?.Authorization||''});
  return handler(calls.at(-1));
 };
 return {calls,fetchImpl};
}
const ok=(body)=>({ok:true,status:200,json:async()=>body});

test('le drapeau est éteint par défaut et n’appelle pas GHL',async()=>{
 assert.equal(taggingEnabled({}),false);
 assert.equal(taggingEnabled({GHL_TAGGING_ENABLED:'false'}),false);
 const logs=[];
 const net=http(()=>{throw new Error('appel GHL')});
 const result=await applyClientTag({action:'clarif-ok',client,contactId:'contact-1',env:{},fetchImpl:net.fetchImpl,log:line=>logs.push(JSON.parse(line))});
 assert.deepEqual(result,{ok:true,simulated:true,tag:'cg97-clarif-ok',contactId:'contact-1'});
 assert.equal(net.calls.length,0);
 assert.equal(logs[0].event,'ghl_tag_skipped');
 assert.equal(logs[0].tag,'cg97-clarif-ok');
 assert.equal(JSON.stringify(logs).includes('Bearer'),false);
});

test('marquage activé : un seul tag ajouté, les autres restent, aucun message',async()=>{
 const net=http(call=>{
  if(call.method==='GET')return ok({contact:{id:'contact-1',locationId:GHL_LOCATION_ID,email:client.email,tags:['existant']}});
  return ok({tags:['existant','cg97-aperçus-ok']});
 });
 const logs=[];
 const result=await applyClientTag({action:'apercus-ok',client,contactId:'contact-1',env:{GHL_TAGGING_ENABLED:'true',GHL_CENTRAL_TOKEN:'jeton-test'},fetchImpl:net.fetchImpl,log:line=>logs.push(JSON.parse(line))});
 assert.equal(result.simulated,false);
 assert.equal(result.contactId,'contact-1');
 assert.equal(net.calls.length,2);
 assert.equal(net.calls[1].method,'POST');
 assert.match(net.calls[1].url,/\/contacts\/contact-1\/tags$/);
 assert.deepEqual(net.calls[1].body,{tags:['cg97-aperçus-ok']});
 assert.equal(net.calls[1].authorization,'Bearer jeton-test');
 assert.equal(net.calls.some(call=>call.method==='DELETE'||/conversations|messages|emails|sms/i.test(call.url)),false);
 assert.equal(logs[0].event,'ghl_tag_added');
 assert.equal(JSON.stringify(logs).includes('jeton-test'),false);
});

test('sans identifiant, le courriel unique trouve la fiche ; un doublon ou un mauvais compte ne tague pas',async()=>{
 const one=http(call=>{
  if(call.url.endsWith('/contacts/search'))return ok({contacts:[{id:'c9',email:'Court@example.test',locationId:GHL_LOCATION_ID},{id:'autre',email:'autre@example.test',locationId:GHL_LOCATION_ID}]});
  return ok({tags:['cg97-expansion-oui']});
 });
 const added=await applyClientTag({action:'expansion-oui',client,env:{GHL_TAGGING_ENABLED:'true',GHL_CENTRAL_TOKEN:'jeton-test'},fetchImpl:one.fetchImpl,log:()=>{}});
 assert.equal(added.contactId,'c9');
 assert.deepEqual(one.calls[1].body,{tags:[GHL_TAG_ACTIONS['expansion-oui']]});
 const many=http(()=>ok({contacts:[{id:'a',email:client.email,locationId:GHL_LOCATION_ID},{id:'b',email:client.email,locationId:GHL_LOCATION_ID}]}));
 await assert.rejects(()=>applyClientTag({action:'expansion-retire',client,env:{GHL_TAGGING_ENABLED:'true',GHL_CENTRAL_TOKEN:'jeton-test'},fetchImpl:many.fetchImpl,log:()=>{}}),/Plusieurs/);
 assert.equal(many.calls.some(call=>call.url.endsWith('/tags')),false);
 const wrong=http(()=>ok({contact:{id:'contact-1',locationId:'autre-compte'}}));
 await assert.rejects(()=>applyClientTag({action:'apercus-correction',client,contactId:'contact-1',env:{GHL_TAGGING_ENABLED:'true',GHL_CENTRAL_TOKEN:'jeton-test'},fetchImpl:wrong.fetchImpl,log:()=>{}}),/sous-compte/);
 assert.equal(wrong.calls.some(call=>call.url.endsWith('/tags')),false);
 await assert.rejects(()=>applyClientTag({action:'clarif-ok',client,contactId:'contact-1',env:{GHL_TAGGING_ENABLED:'true'},fetchImpl:()=>{throw new Error('appel')},log:()=>{}}),/Jeton/);
});

test('cg97-expansion-oui seulement pour accepter une place offerte',()=>{
 assert.deepEqual(acceptOfferedSpot([{id:'1',client_id:'a',status:'en_attente'},{id:'2',client_id:'a',status:'place_offerte'}],'a'),{ok:true,status:'acceptee',ids:['2']});
 assert.deepEqual(acceptOfferedSpot([{id:'1',client_id:'a',status:'en_attente'}],'a'),{ok:false,status:null,ids:[]});
});

test('le bouton d’inscription n’envoie pas cg97-expansion-oui',async()=>{
 const src=await fs.readFile(new URL('../src/v2/main.js',import.meta.url),'utf8');
 const join=src.slice(src.indexOf('async function joinExpansion'),src.indexOf('async function acceptExpansion'));
 assert.equal(join.includes('expansion-oui'),false);
 assert.match(src,/async function acceptExpansion[\s\S]*expansion-oui/);
});

test('les cinq actions correspondent aux tags, et la route ne part pas en GHL',async()=>{
 assert.deepEqual(GHL_TAG_ACTIONS,{
  'clarif-ok':'cg97-clarif-ok',
  'apercus-ok':'cg97-aperçus-ok',
  'apercus-correction':'cg97-aperçus-correction',
  'expansion-oui':'cg97-expansion-oui',
  'expansion-retire':'cg97-expansion-retiré',
 });
 const src=await fs.readFile(new URL('../server/ghl-tags.mjs',import.meta.url),'utf8')+await fs.readFile(new URL('../routes/ghl-tags.js',import.meta.url),'utf8');
 assert.equal(/conversations|mailto:|sms|method:\s*'DELETE'/i.test(src),false);
 const req={method:'GET',url:'/api/ghl-tags',headers:{},query:{slug:['ghl-tags']}};
 const direct=response(),via=response();
 await handler(req,direct);
 await dispatch(req,via);
 assert.equal(direct.statusCode,405);
 assert.equal(via.statusCode,405);
 const blocked=response();
 await handler({method:'POST',url:'/api/ghl-tags',headers:{host:'portail.courtiergrowth.com'},body:{action:'clarif-ok',clientId:client.id}},blocked);
 assert.equal(blocked.statusCode,403);
 const anon=response();
 await handler({method:'POST',url:'/api/ghl-tags',headers:{origin:'https://portail.courtiergrowth.com',host:'portail.courtiergrowth.com'},body:{action:'clarif-ok',clientId:client.id}},anon);
 assert.equal(anon.statusCode,401);
});
