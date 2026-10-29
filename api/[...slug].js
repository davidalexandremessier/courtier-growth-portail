// Une seule fonction serveur pour tout /api (limite Hobby de 12 fonctions).
import calls from '../routes/calls.js';
import configRoute from '../routes/config.js';
import connections from '../routes/connections.js';
import david from '../routes/david.js';
import invite from '../routes/invite.js';
import notificationWorker from '../routes/notification-worker.js';
import notifications from '../routes/notifications.js';
import oauth from '../routes/oauth.js';
import results from '../routes/results.js';
import statsBackground from '../routes/stats-background.js';
import stats from '../routes/stats.js';
import zoomArchive from '../routes/zoom-archive.js';

const routes={
 calls,
 config:configRoute,
 connections,
 david,
 invite,
 'notification-worker':notificationWorker,
 notifications,
 oauth,
 results,
 'stats-background':statsBackground,
 stats,
 'zoom-archive':zoomArchive
};

export const config={maxDuration:300};

// Le catch-all correspond avant les rewrites de vercel.json : ces deux
// adresses publiques doivent donc être reconnues ici. Le handler OAuth
// distingue encore le chemin d’origine et le paramètre route.
const aliases={'agency-oauth':'oauth','wispr-client-metadata':'oauth'};

function segments(req){
 const slug=req.query?.slug;
 if(Array.isArray(slug))return slug.map(String);
 if(typeof slug==='string'&&slug)return [slug];
 let pathname='/';
 try{pathname=new URL(req.url||'/','https://portal.invalid').pathname}catch{return []}
 if(!pathname.startsWith('/api/'))return [];
 return pathname.slice('/api/'.length).split('/').filter(Boolean).map(part=>{try{return decodeURIComponent(part)}catch{return part}});
}

export default function handler(req,res){
 const parts=segments(req),key=parts.length===1?parts[0]:undefined,route=key?routes[aliases[key]||key]:undefined;
 if(!route){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(404).json({error:'Introuvable.'});
 }
 return route(req,res);
}
