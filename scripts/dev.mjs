import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
try{process.loadEnvFile('.env.local')}catch{}
const {default:stats}=await import('../api/stats.js');
const {default:config}=await import('../api/config.js');
const {default:invite}=await import('../api/invite.js');
const {default:calls}=await import('../api/calls.js');
const {default:results}=await import('../api/results.js');
const {default:connections}=await import('../api/connections.js');
const {default:oauth}=await import('../api/oauth.js');
const {default:david}=await import('../api/david.js');
const {default:agencyOAuth}=await import('../server/agency-oauth-handler.mjs');
const {default:wisprMetadata}=await import('../server/wispr-metadata-handler.mjs');
const routes={'/api/stats':stats,'/api/david':david,'/api/connections':connections,'/api/invite':invite,'/api/calls':calls,'/api/results':results,'/api/oauth':oauth,'/api/agency-oauth':agencyOAuth,'/api/wispr-client-metadata':wisprMetadata};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 res.status=n=>{res.statusCode=n;return res};res.json=v=>res.end(JSON.stringify(v));
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/api/config')return config(req,res);
 if(routes[pathname]){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>(pathname==='/api/stats'?4000000:pathname==='/api/calls'?220000:12000)){res.statusCode=413;return res.end()}}
  try{req.body=JSON.parse(raw||'{}')}catch{res.statusCode=400;return res.end()}
  return routes[pathname](req,res);
 }
 const f=pathname==='/'?'index.html':pathname.slice(1);
 if(f.includes('..')){res.statusCode=400;return res.end()}
 try{const bytes=await fs.readFile(path.join('dist',f));res.setHeader('Content-Type',types[path.extname(f)]||'application/octet-stream');res.end(bytes)}catch{res.statusCode=404;res.end('Not found')}
});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+server.address().port));
