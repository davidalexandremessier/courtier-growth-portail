import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
try{process.loadEnvFile('.env.local')}catch{}
if(!process.env.SUPABASE_URL)process.env.DEMARRER_ICI_MEMORY='1';
const {default:stats}=await import('../routes/stats.js');
const {default:config}=await import('../routes/config.js');
const {default:invite}=await import('../routes/invite.js');
const {default:calls}=await import('../routes/calls.js');
const {default:results}=await import('../routes/results.js');
const {default:connections}=await import('../routes/connections.js');
const {default:oauth}=await import('../routes/oauth.js');
const {default:david}=await import('../routes/david.js');
const {default:agencyOAuth}=await import('../server/agency-oauth-handler.mjs');
const {default:wisprMetadata}=await import('../server/wispr-metadata-handler.mjs');
const {default:ghlWebhook}=await import('../routes/ghl-webhook.js');
const {default:demarrerIci}=await import('../routes/demarrer-ici.js');
const routes={'/api/stats':stats,'/api/david':david,'/api/connections':connections,'/api/invite':invite,'/api/calls':calls,'/api/results':results,'/api/oauth':oauth,'/api/agency-oauth':agencyOAuth,'/api/wispr-client-metadata':wisprMetadata,'/api/ghl-webhook/buyer-cockpit':ghlWebhook,'/api/demarrer-ici':demarrerIci};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 res.status=n=>{res.statusCode=n;return res};res.json=v=>res.end(JSON.stringify(v));
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/api/config')return config(req,res);
 if(routes[pathname]){
  const cap=pathname==='/api/stats'?4000000:pathname==='/api/calls'?220000:pathname==='/api/ghl-webhook/buyer-cockpit'?16384:12000;
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>cap){res.statusCode=400;res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify({error:'Requête trop volumineuse.',fields:['body']}))}}
  if(raw){try{req.body=JSON.parse(raw)}catch{res.statusCode=400;res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify({error:'JSON invalide.',fields:['body']}))}}
  req.query=Object.fromEntries(new URL(req.url,'http://localhost').searchParams);
  return routes[pathname](req,res);
 }
 const pages={'/demarrer-ici':'demarrer-ici/index.html','/demarrer-ici/':'demarrer-ici/index.html','/demarrer-ici/agence':'demarrer-ici/agence/index.html','/demarrer-ici/agence/':'demarrer-ici/agence/index.html'};
 const f=pages[pathname]||(pathname==='/'?'index.html':pathname.slice(1));
 if(f.includes('..')){res.statusCode=400;return res.end()}
 try{const bytes=await fs.readFile(path.join('dist',f));res.setHeader('Content-Type',types[path.extname(f)]||'application/octet-stream');res.end(bytes)}catch{res.statusCode=404;res.end('Not found')}
});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+server.address().port));
