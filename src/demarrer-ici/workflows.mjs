// Seule liste à modifier pour l’étape 2.
// Un workflow publié dont le nom ne correspond à aucune règle bloque la préparation :
// il doit rester en brouillon jusqu’à la validation finale.
// Les séquences de prospection, de suivi d’inscription, de visites, d’appels sortants
// et de fidélisation des anciens clients ne sont pas des exceptions.

export const WORKFLOWS_PUBLISHED_ALLOWED=[
 {key:'reply-stop',label:'Reply STOP',pattern:/^reply stop$/i},
 {key:'rappel',label:'Rappel de rendez-vous',pattern:/rappel/i},
 {key:'rendez-vous',label:'Rendez-vous',pattern:/rendez-vous/i},
 {key:'appel-decouverte',label:'Appel découverte réservé',pattern:/appel d[ée]couverte book/i},
 {key:'appel-pitch',label:'Appel pitch réservé',pattern:/appel pitch book/i},
 {key:'pipeline-rdv',label:'Changement de pipeline au rendez-vous',pattern:/booked pipeline change/i}
];

export function workflowName(value){
 const text=String(value||'').replace(/\s+/g,' ').trim().slice(0,120);
 if(!text||/bearer|pit-|sk_|secret|token|api[_-]?key/i.test(text))return '';
 return text;
}

export function isPublishedWorkflow(status,item){
 if(item?.published===true)return true;
 const value=String(status??item?.state??'').trim().toLowerCase();
 return value==='published'||value==='active';
}

export function workflowMayStayPublished(name){
 return WORKFLOWS_PUBLISHED_ALLOWED.some(rule=>rule.pattern.test(name));
}

export function classifyPublishedWorkflows(workflows){
 const published=[];
 const seen=new Set();
 for(const item of workflows||[]){
  if(!isPublishedWorkflow(item?.status,item))continue;
  const name=workflowName(item?.name);
  const key=name.toLowerCase();
  if(!name||seen.has(key))continue;
  seen.add(key);
  published.push({name,blocks:!workflowMayStayPublished(name)});
  if(published.length>=40)break;
 }
 return published;
}
