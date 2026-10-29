import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
import webpush from 'web-push';
import {buildReminders,canDeliver} from '../server/notification-engine.mjs';
import {validPushSubscription,notificationLink} from '../src/notifications.mjs';
import {pushCopy} from '../server/push-copy.mjs';
export const config={maxDuration:60};
const must=({data,error})=>{if(error)throw Error('Database unavailable');return data};
async function all(db,table,day=null){const rows=[];for(let n=0;;n+=1000){const column=table==='notification_preferences'?'user_id':table==='client_memberships'?'user_id':table==='app_admins'?'user_id':'id',selection=table==='coachings'?'id,client_id,published,next_meeting_at':'*';let q=db.from(table).select(selection).order(column);if(table==='client_memberships')q=q.order('client_id');if(day)q=q.eq('report_date',day);const page=must(await q.range(n,n+999));rows.push(...page);if(page.length<1000)break}return rows}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');const secret=process.env.NOTIFICATION_WORKER_SECRET,actual=(req.headers.authorization||'').replace(/^Bearer /,'');if(!secret||!actual||Buffer.byteLength(secret)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(secret),Buffer.from(actual)))return res.status(401).json({error:'Accès refusé.'});if(req.method!=='POST')return res.status(405).json({error:'Méthode non permise.'});
 try{if(!process.env.SUPABASE_ARCHIVE_SECRET_KEY)throw Error('Missing server key');const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ARCHIVE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const now=new Date(),names={clients:'clients',memberships:'client_memberships',admins:'app_admins',preferences:'notification_preferences',tasks:'tasks',steps:'onboarding_steps',coachings:'coachings',announcements:'portal_announcements',automations:'portal_automations',team_members:'team_members'},data={};
 await Promise.all(Object.entries(names).map(async([key,table])=>{data[key]=await all(db,table)}));
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 [data.reports,data.team_reports]=await Promise.all([all(db,'daily_reports',day),all(db,'team_daily_reports',day)]);
 // Explicit server-authorized tests target only pre-created own-admin test alerts.
 const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{},testIds=body.test_notification_ids;
 if(testIds!==undefined&&(!Array.isArray(testIds)||testIds.length<1||testIds.length>2||testIds.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))))return res.status(400).json({error:'Test invalide.'});
 const events=testIds?[]:buildReminders(data,now);for(let i=0;i<events.length;i+=500)must(await db.from('portal_notifications').upsert(events.slice(i,i+500),{onConflict:'user_id,event_key',ignoreDuplicates:true}));
 let accepted=0,failed=0;const key=process.env.WEB_PUSH_PRIVATE_KEY;if(key&&process.env.WEB_PUSH_PUBLIC_KEY){webpush.setVapidDetails('https://portail.courtiergrowth.com',process.env.WEB_PUSH_PUBLIC_KEY,key);const pending=testIds?must(await db.from('portal_notifications').select('*').in('id',testIds).is('push_done_at',null)):must(await db.rpc('claim_portal_push',{p_limit:20}));
 if(testIds&&pending.some(n=>!n.event_key.startsWith('test:reflection:')||!data.admins.some(a=>a.user_id===n.user_id)))return res.status(403).json({error:'Test réservé aux administrateurs.'});
 for(const n of pending){if(/^(daily|task|call|admin|automation|announcement):/.test(n.event_key)&&!events.some(e=>e.event_key===n.event_key&&e.user_id===n.user_id)){must(await db.from('portal_notifications').update({push_done_at:now.toISOString()}).eq('id',n.id));continue}if(n.event_key.startsWith('coaching:')&&!data.coachings.some(c=>c.id===n.event_key.slice(9)&&c.published)){must(await db.from('portal_notifications').update({push_done_at:now.toISOString()}).eq('id',n.id));continue}const p=data.preferences.find(p=>p.user_id===n.user_id);if(n.client_id&&!data.memberships.some(m=>m.client_id===n.client_id&&m.user_id===n.user_id)&&!data.admins.some(a=>a.user_id===n.user_id)){must(await db.from('portal_notifications').update({push_done_at:now.toISOString()}).eq('id',n.id));continue}if(!canDeliver(n,testIds?{...p,quiet_start:"00:00",quiet_end:"00:00"}:p,now))continue;
 const reflection=n.reflection_id?must(await db.from('client_reflections').select('kind,blocker').eq('id',n.reflection_id).eq('client_id',n.client_id).maybeSingle()):null;
 const subs=must(await db.from('push_subscriptions').select('*').eq('user_id',n.user_id));let retry=false;
 for(const s of subs){const subscription={endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}};if(!validPushSubscription(subscription))continue;try{await webpush.sendNotification(subscription,JSON.stringify({...pushCopy(n,data.clients.find(c=>c.id===n.client_id)?.name,reflection),url:notificationLink(n),tag:n.id}),{TTL:3600,timeout:5000});accepted++}catch(e){if([404,410].includes(e.statusCode))must(await db.from('push_subscriptions').delete().eq('id',s.id));else{failed++;retry=true}}}
 if(!retry)must(await db.from('portal_notifications').update({push_done_at:now.toISOString()}).eq('id',n.id));}
 }
 console.info('portal_notifications',{prepared:events.length,accepted,failed});return res.json({prepared:events.length,accepted,failed})
 }catch{console.error('portal_notifications_failed');return res.status(502).json({error:'Rappels à vérifier.'})}}
