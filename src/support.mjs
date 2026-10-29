import {shiftDay,summarizeDaily,diagnose} from './kpi.mjs';
import {torontoClock} from './reminders.mjs';
export const helpCategories=['Publicité','CRM','Prospection','Vente','Contenu','Technique','Autre'];
export const helpStatuses=['Ouvert','En cours','En attente client','Résolu'];
export function clientsToFollow(data,requests=[],now=new Date()){
 const day=torontoClock(now).day,daysBetween=(a,b)=>Math.floor((new Date(b+'T12:00:00Z')-new Date(a+'T12:00:00Z'))/86400000);
 return data.clients.filter(c=>!['En pause','Terminé'].includes(c.status)).map(c=>{
  const tickets=requests.filter(r=>r.client_id===c.id&&r.status!=='Résolu'),tasks=(data.tasks||[]).filter(t=>t.client_id===c.id&&t.owner==='Client'&&t.client_visible!==false&&t.status!=='Terminé'&&t.due_date&&t.due_date<day),steps=(data.onboarding_steps||[]).filter(s=>s.client_id===c.id&&s.done&&!s.validated),reports=(data.daily_reports||[]).filter(r=>r.client_id===c.id&&r.report_date<=day),latest=reports.map(r=>r.report_date).sort().at(-1),reasons=[];
  const recent=(data.client_reflections||[]).filter(r=>r.client_id===c.id&&r.author_name!=='Courtier Growth'),reviews=data.coach_followup_reviews||[],reviewed=r=>reviews.some(v=>v.reflection_id===r.id&&new Date(v.reviewed_version).getTime()===new Date(r.updated_at||r.created_at).getTime());
  const weekly=[...recent.filter(r=>r.kind==='weekly'&&r.reference_date>=shiftDay(day,-13)&&r.reference_date<=day)].sort((a,b)=>b.reference_date.localeCompare(a.reference_date));
  const latestByAuthor=[...new Map(weekly.map(r=>r.user_id).map(id=>[id,weekly.find(r=>r.user_id===id)])).values()];
  const blockers=latestByAuthor.filter(r=>r.blocker?.trim()&&!/^(aucun(e)?( blocage)?|rien( pour le moment)?|non|n\/a|pas de blocage)[.! ]*$/i.test(r.blocker.trim())&&!reviewed(r));
  const preparations=recent.filter(r=>r.kind==='preparation'&&r.reference_date>=day&&r.reference_date<=shiftDay(day,7)&&(r.blocker?.trim()||r.focus?.trim())&&!reviewed(r)).sort((a,b)=>a.reference_date.localeCompare(b.reference_date));
  const coachTasks=(data.tasks||[]).filter(t=>t.client_id===c.id&&t.owner==='Courtier Growth'&&t.status!=='Terminé'&&t.due_date&&t.due_date<day);
  if(blockers.length)reasons.push({key:'blockers',weight:90,label:`${blockers.length} blocage(s) dans les bilans`,detail:blockers[0].blocker,action:'Lire le bilan',page:'weekly',reflectionId:blockers[0].id});
  if(preparations.length)reasons.push({key:'preparations',weight:preparations[0].reference_date<=shiftDay(day,2)?95:75,label:`${preparations.length} rencontre(s) à préparer`,detail:`${preparations[0].reference_date} · ${preparations[0].blocker||preparations[0].focus}`,action:'Lire la préparation',page:'preparation',reflectionId:preparations[0].id});
  if(coachTasks.length)reasons.push({key:'coach_tasks',weight:95,label:`${coachTasks.length} de vos actions en retard`,detail:coachTasks[0].title,action:'Ouvrir mes actions',page:'tasks'});
  const urgent=tickets.filter(t=>t.priority==='Urgent'),waiting=tickets.filter(t=>!t.last_sender_admin&&t.status!=='En attente client');
  const due=tickets.filter(t=>t.due_date&&t.due_date<=day);if(due.length)reasons.push({key:'help_due',weight:85,label:`${due.length} demande(s) à relancer`,detail:'L’échéance de suivi est arrivée. Vérifiez la prochaine réponse attendue.',page:'help'});
  if(c.support_end&&c.support_end<day)reasons.push({key:'end',weight:70,label:'Fin d’accompagnement à revoir',detail:`Fin prévue : ${c.support_end}. Confirmez la suite avec le client.`,page:'dashboard'});
  if(urgent.length)reasons.push({key:'urgent',weight:100,label:`${urgent.length} demande(s) prioritaire(s)`,detail:'Priorité indiquée dans la demande; à qualifier avec le client.',page:'help'});
  if(waiting.length){const stale=waiting.some(t=>now-new Date(t.last_activity_at||t.created_at)>86400000);reasons.push({key:'help',weight:stale?90:65,label:`${waiting.length} demande(s) à répondre`,detail:stale?'Une réponse est attendue depuis plus de 24 h.':'Le dernier message vient du client.',page:'help'})}
  if(tasks.length)reasons.push({key:'tasks',weight:80,label:`${tasks.length} action(s) en retard`,detail:'Vérifiez l’échéance et le statut avec le client.',page:'tasks'});
  if(steps.length)reasons.push({key:'onboarding',weight:92,label:`${steps.length} étape(s) à valider`,detail:steps.map(s=>s.title||'Étape terminée par le client').join(' · '),page:'onboarding'});
  if(!latest)reasons.push({key:'data',weight:30,label:'Aucune journée saisie',detail:'Vérifiez les accès et les jours travaillés avant de relancer.',page:'kpi'});
  else if(daysBetween(latest,day)>=3)reasons.push({key:'data',weight:45,label:'Saisies à vérifier',detail:`Dernière journée saisie : ${latest}. Les jours travaillés restent à confirmer.`,page:'kpi'});
  const summary=summarizeDaily(reports,day),diagnosis=diagnose(summary);if(['quality','response','booking','show','pitch','close','show-small'].includes(diagnosis.key))reasons.push({key:'kpi',weight:40,label:diagnosis.title,detail:diagnosis.preliminary?'Signal préliminaire à confirmer en coaching.':'Repère sous la cible; examiner le contexte avant de conclure.',page:'kpi'});
  if(diagnosis.key==='missing'&&!reasons.some(r=>r.key==='data'))reasons.push({key:'data',weight:35,label:'Chiffres incomplets',detail:diagnosis.detail,page:'kpi'});
  const earliest=list=>[...list].sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999'))[0];
  for(const reason of reasons){
   const ticket=reason.key==='urgent'?urgent[0]:reason.key==='help_due'?earliest(due):reason.key==='help'?waiting[0]:null;
   const task=reason.key==='coach_tasks'?earliest(coachTasks):reason.key==='tasks'?earliest(tasks):null;
   reason.owner=reason.key==='tasks'||ticket?.status==='En attente client'?'client':'coach';
   reason.ownerLabel=reason.owner==='client'?'Client':'David / équipe';
   reason.dueDate=task?.due_date||ticket?.due_date||(reason.key==='preparations'?preparations[0].reference_date:reason.key==='end'?c.support_end:null);
   reason.dateLabel=reason.key==='preparations'?'Rencontre':reason.key==='end'?'Fin prévue':'Échéance';
   reason.overdue=!!reason.dueDate&&reason.dueDate<day;
   reason.source=({blockers:'Bilan de semaine',preparations:'Préparation de rencontre',coach_tasks:'Plan de match · équipe',tasks:'Plan de match · client',onboarding:'Parcours · étapes marquées terminées',data:'Journal quotidien',kpi:'KPI · 30 derniers jours',end:'Dates d’accompagnement'})[reason.key]||'Demande d’aide';
   reason.state=({blockers:'Blocage signalé',preparations:'Réponse à préparer',onboarding:'Approbation attendue',coach_tasks:'Action équipe en retard',tasks:'Action client en retard',data:'Données à confirmer',kpi:diagnosis.preliminary?'Signal à confirmer':'Repère sous la cible',end:'Suite à confirmer'})[reason.key]||(reason.owner==='client'?'Réponse du client attendue':'Réponse équipe attendue');
   reason.nextAction=task?(reason.owner==='client'?'Confirmer l’avancement et convenir de la suite':'Réaliser ou replanifier l’action'):({blockers:'Lire le blocage et décider de la prochaine étape',preparations:'Lire la question et préparer votre réponse',onboarding:'Vérifier le travail et valider les étapes',data:'Confirmer les jours travaillés et compléter le journal',kpi:'Examiner les chiffres et le contexte avec le client',end:'Confirmer la suite de l’accompagnement'})[reason.key]||(reason.owner==='client'?'Relancer le client sur la réponse attendue':'Lire la demande et répondre au client');
   if(reason.key==='preparations'&&!preparations[0].blocker?.trim()){reason.state='Rencontre à préparer';reason.nextAction='Lire l’objectif et préparer la rencontre';}
   if(task)reason.detail=task.title;
   if(ticket)reason.detail=[ticket.title,ticket.blocker].filter(Boolean).join(' — ')||reason.detail;
  }
  reasons.sort((a,b)=>b.weight-a.weight||(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));return {client:c,reasons,score:reasons[0]?.weight||0,tickets,lateTasks:tasks,steps,latestReport:latest,diagnosis,blockers,preparations,coachTasks};
 }).filter(c=>c.reasons.length).sort((a,b)=>b.score-a.score||a.client.name.localeCompare(b.client.name));
}
