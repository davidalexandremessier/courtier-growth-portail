import {dailyFields} from './kpi.mjs';
export function torontoClock(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 return {day:`${p.year}-${p.month}-${p.day}`,minutes:Number(p.hour)*60+Number(p.minute)};
}
export function portalReminders({client,reports=[],tasks=[],admin=false,dismissed=false,now=new Date(),preferences={}}){
 const clock=torontoClock(now),report=reports.find(r=>r.client_id===client?.id&&r.report_date===clock.day),remaining=dailyFields.filter(k=>report?.[k]==null).length;
 const at=preferences.daily_time||'17:00',reminderAt=Number(at.slice(0,2))*60+Number(at.slice(3,5)),weekday=new Date(clock.day+'T12:00:00Z').getUTCDay();
 const active=preferences.daily!==false&&(!preferences.work_days||preferences.work_days.includes(weekday))&&!!client&&!['En pause','Terminé'].includes(client.status);
 const open=(preferences.tasks===false?[]:tasks).filter(t=>t.client_id===client?.id&&t.status!=='Terminé'&&(admin||t.client_visible!==false&&t.owner==='Client'));
 return {...clock,remaining,complete:remaining===0,reportDate:clock.day,showDaily:active&&clock.minutes>=reminderAt&&remaining>0&&!dismissed,due:open.filter(t=>t.due_date===clock.day),overdue:open.filter(t=>t.due_date&&t.due_date<clock.day)};
}
export function coachingActionSuggestions(summary=''){
 const lines=String(summary).split('\n');let inActions=false,person='',items=[];
 for(const raw of lines){const line=raw.trim();if(/^(?:#{1,2}\s*)?(?:PROCHAINES?\s+(?:ÉTAPES|ETAPES|ACTIONS)|PLAN D[’']ACTION)\s*:?$/i.test(line)){inActions=true;continue}if(!inActions)continue;
 if(/^#{1,2}\s/.test(line)||/^(?:BLOCAGES|À CONFIRMER|DÉCISIONS|SYNTHÈSE)\s*:?$/i.test(line))break;
 const heading=line.match(/^###\s+(.+)/);if(heading){person=heading[1].trim();continue}
 const bullet=line.match(/^(?:[-*•]|\d+[.)])\s+(.+)/);if(!bullet)continue;
 let title=bullet[1].replace(/^\[[ xX]\]\s*/,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\*\*/g,'').trim();
 if(!title||/^(?:Non précisé|À confirmer)/i.test(title))continue;
 let hint=person;const parts=title.split(/\s+[—–]\s+/);if(parts.length>1){title=parts[0];if(!hint)hint=parts.slice(1).join(' — ').split(' · ')[0];}
 if(!items.some(i=>i.title===title))items.push({title:title.slice(0,500),person:hint});if(items.length>=15)break;
 }return items;
}
