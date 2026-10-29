// Read-only protocol discovery. No tool is executed without a reviewed mapping.
import {CallError} from './calls.mjs';
const endpoint='https://api.wisprflow.ai/connect/mcp';
export async function wisprClient({actor,confirmed,accessToken,fetcher=fetch}){
 if(actor?.admin!==true||confirmed!==true)throw new CallError('Connexion administrateur confirmée requise.',403);
 let session,version='2025-11-25',id=0;
 async function rpc(method,params,notification=false){
 const request={jsonrpc:'2.0',...(notification?{}:{id:++id}),method,...(params?{params}:{})};
 const r=await fetcher(endpoint,{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':version,...(session?{'Mcp-Session-Id':session}:{})},body:JSON.stringify(request),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new CallError(r.status===401?'Autorisation Wispr expirée.':'Wispr indisponible ou autorisation supplémentaire nécessaire.',502);
 if(r.headers.get('Mcp-Session-Id'))session=r.headers.get('Mcp-Session-Id');if(notification)return;
 const reader=r.body.getReader();let size=0,text='';const decoder=new TextDecoder();try{for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>1000000)throw new CallError('Réponse Wispr trop volumineuse.',502);text+=decoder.decode(x.value,{stream:true})}text+=decoder.decode()}finally{await reader.cancel()}
 let messages;try{messages=r.headers.get('content-type')?.includes('text/event-stream')?text.split(/\r?\n\r?\n/).map(event=>event.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n')).filter(Boolean).map(JSON.parse):[JSON.parse(text)]}catch{throw new CallError('Réponse MCP invalide.',502)}
 const response=messages.find(x=>x.id===request.id);if(!response||response.error||!response.result)throw new CallError('Réponse MCP non confirmée.',502);return response.result;
 }
 const init=await rpc('initialize',{protocolVersion:version,capabilities:{},clientInfo:{name:'courtier-growth-admin',version:'1.0'}});
 if(!['2025-11-25','2025-06-18','2025-03-26'].includes(init.protocolVersion))throw new CallError('Version MCP non prise en charge.',502);version=init.protocolVersion;
 await rpc('notifications/initialized',undefined,true);
 return {rpc,call:(name,args)=>rpc('tools/call',{name,arguments:args})};
}
export async function discoverWisprTools(opts){
 const {rpc}=await wisprClient(opts);const tools=[],seen=new Set();let cursor;
 for(let page=0;page<10;page++){const r=await rpc('tools/list',cursor?{cursor}:{});if(!Array.isArray(r.tools))throw new CallError('Catalogue Wispr invalide.',502);tools.push(...r.tools);if(!r.nextCursor)return {tools,importReady:false,reason:'Mapping des outils à valider avant lecture des rencontres.'};if(seen.has(r.nextCursor))throw new CallError('Pagination Wispr répétée.',502);seen.add(r.nextCursor);cursor=r.nextCursor}
 throw new CallError('Catalogue Wispr incomplet.',502);
}
