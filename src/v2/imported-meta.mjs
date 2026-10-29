// Read-only projection. Never writes into weekly_reports or replaces manual entries.
import {sourceView} from '../source-stats.mjs';
const metrics=['spend','impressions','clicks','meta_leads'];
function daysBetween(start,end){
 const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 if(!valid(start)||!valid(end)||end<start)throw Error('Période invalide.');
 const days=[];for(let d=Date.parse(start+'T00:00:00Z');d<=Date.parse(end+'T00:00:00Z');d+=86400000){days.push(new Date(d).toISOString().slice(0,10));if(days.length>366)throw Error('Période trop longue.');}return days;
}
export function importedMetaPeriod(activities,client,{start,end,currency,timezone,now=Date.now()}){
 const days=daysBetween(start,end),view=sourceView(activities,client,'meta',now);
 const records=view.records.filter(r=>r.origin==='meta_api'&&r.date>=start&&r.date<=end);
 const incompatible=records.some(r=>r.currency!==currency||r.timezone!==timezone||r.cohort!=='activity_period'||r.channel!=='paid');
 const totals={},coverage={};let invalid=incompatible;
 for(const metric of metrics){
  const byDay=new Map();let conflict=false;
  for(const r of records.filter(r=>r.metric===metric)){
   if(r.object_id!=='account_daily'||!Number.isFinite(r.value)||r.value<0||metric!=='spend'&&!Number.isInteger(r.value)){conflict=true;continue;}
   if(byDay.has(r.date)){conflict=true;continue;}byDay.set(r.date,r.value);
  }
  invalid ||= conflict;coverage[metric]={available:byDay.size,expected:days.length};
  totals[metric]=incompatible||conflict||days.some(d=>!byDay.has(d))?null:days.reduce((sum,d)=>sum+byDay.get(d),0);
 }
 return {source:'meta_api',period:{start,end},currency,timezone,totals,coverage,
  cpl:totals.spend!==null&&totals.meta_leads>0?totals.spend/totals.meta_leads:null,
  lastSuccess:view.success?.retrieved_at||null,stale:view.stale,
  state:!view.accountId?'not_connected':invalid?'incompatible':view.state,
  incomplete:metrics.some(k=>totals[k]===null),error:view.latest?.phase==='error'?'La dernière synchronisation a échoué. Les données confirmées sont conservées.':null};
}
