import {activeActivities} from './production.mjs';
export function evidenceBody(taskId,kind,body){if(!['proof','blocker'].includes(kind)||!String(body||'').trim())throw Error('Ajoutez un motif ou une preuve.');return `[action:${taskId};${kind}]\n${String(body).trim()}`}
export function taskEvidence(task,activities){
 const prefix=`[action:${task.id};`;
 const entries=activeActivities(activities).filter(a=>a.client_id===task.client_id&&String(a.body||'').startsWith(prefix)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 return entries.map(a=>({id:a.id,date:a.activity_date,kind:a.body.startsWith(prefix+'proof]')?'proof':'blocker',body:a.body.slice(a.body.indexOf('\n')+1)}));
}
