import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.join(import.meta.dirname,'rendered');
const server=http.createServer(async(req,res)=>{
 try{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
 const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found')}
});
server.listen(Number(process.env.QA_PORT||4173),'127.0.0.1',()=>console.log('QA_READY http://127.0.0.1:'+server.address().port));
