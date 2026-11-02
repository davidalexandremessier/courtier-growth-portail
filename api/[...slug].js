// Une seule fonction serveur pour tout /api (limite Hobby de 12 fonctions).
import botClients from '../routes/bot-clients.js';
import calls from '../routes/calls.js';
import configRoute from '../routes/config.js';
import connections from '../routes/connections.js';
import david from '../routes/david.js';
import ghlTags from '../routes/ghl-tags.js';
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
 'ghl-tags':ghlTags,
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
// Sur Vercel, api/[...slug] ne correspond qu’à un seul segment. La réécriture
// /api/:tête/:reste envoie le chemin complet dans cg_path, sans toucher aux
// routes à un seul segment, aux cron ni aux réécritures OAuth.
const aliases={'agency-oauth':'oauth','wispr-client-metadata':'oauth'};

function decodePart(part){
 try{return decodeURIComponent(part)}catch{return part}
}
function pathParts(value){
 return String(value||'').split('/').filter(Boolean).map(decodePart);
}
function segments(req){
 const slug=req.query?.slug;
 const fromSlug=Array.isArray(slug)?slug.map(String):typeof slug==='string'&&slug?[slug]:[];
 if(fromSlug.length>1)return fromSlug;
 const hinted=req.query?.cg_path;
 const hint=typeof hinted==='string'?hinted:Array.isArray(hinted)?hinted[0]:'';
 if(typeof hint==='string'&&hint.includes('/')){
  const fromHint=pathParts(hint);
  if(fromHint.length>1&&(!fromSlug.length||fromHint[0]===fromSlug[0]))return fromHint;
 }
 let pathname='/';
 try{pathname=new URL(req.url||'/','https://portal.invalid').pathname}catch{pathname='/'}
 if(pathname.startsWith('/api/')){
  const fromUrl=pathParts(pathname.slice('/api/'.length));
  if(fromUrl.length>1)return fromUrl;
  if(!fromSlug.length)return fromUrl;
 }
 return fromSlug;
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
