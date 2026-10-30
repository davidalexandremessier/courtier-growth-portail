// Une seule fonction serveur pour tout /api (limite Hobby de 12 fonctions).
import botClients from '../routes/bot-clients.js';
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
import ghlWebhook from '../routes/ghl-webhook.js';

const routes={
 'bot-clients':botClients,
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
 'zoom-archive':zoomArchive,
 'ghl-webhook':ghlWebhook
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

function routeFor(parts){
 if(parts.length===2&&parts[0]==='ghl-webhook'&&parts[1]==='buyer-cockpit')return routes['ghl-webhook'];
 const key=parts.length===1?parts[0]:undefined;
 return key?routes[aliases[key]||key]:undefined;
}

export default function handler(req,res){
 const parts=segments(req),route=routeFor(parts);
 if(!route){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(404).json({error:'Introuvable.'});
 }
 return route(req,res);
}
