// Parcours pilote « Démarrer ici ». Aucun secret, aucune écriture GoHighLevel.
// Validé ne vient jamais d’un clic client : seulement d’une vérification serveur ou de l’agence.

export const PILOT_LOCATION_IDS=['DsPXZp1SUaWntQvf0OTU'];
export const LOCATION_PATTERN=/^[A-Za-z0-9]{10,40}$/;

export const STATUSES={
 a_faire:'À faire',
 en_attente:'En attente',
 valide:'Validé',
 besoin_aide:'Besoin d’aide',
 non_applicable:'Non applicable'
};
export const STATUS_CHIP={
 a_faire:'neutral',
 en_attente:'yellow',
 valide:'green',
 besoin_aide:'red',
 non_applicable:'gold'
};

export const SECTEURS=[
 ['residentiel','Résidentiel'],
 ['commercial','Commercial'],
 ['les_deux','Résidentiel et commercial'],
 ['autre','Autre']
];
export const FUSEAUX=[
 ['America/Toronto','Heure de l’Est (Québec)'],
 ['America/Halifax','Heure de l’Atlantique'],
 ['America/Winnipeg','Heure du Centre'],
 ['America/Edmonton','Heure des Rocheuses'],
 ['America/Vancouver','Heure du Pacifique'],
 ['America/Blanc-Sablon','Blanc-Sablon']
];

const APPLE='https://apps.apple.com/ca/app/lead-connector/id1564302502';
const PLAY='https://play.google.com/store/apps/details?id=com.LeadConnector&hl=fr_CA';

// Chemins v2 observés dans le sous-compte TEMPLATE (inspection du 2 nov. 2026)
// ou nommés dans le brief et recoupés avec l’aide HighLevel (Settings > Domains,
// Contacts > Import, Automation > Workflows, Settings > Calendars).
const GHL={
 phone:'/settings/phone_system?tab=manage',
 integrations:'/settings/integrations',
 calendars:'/calendars',
 domain:'/settings/domain',
 import:'/contacts/import',
 workflows:'/automation/workflows'
};

export function allowedLocation(id){
 return typeof id==='string'&&LOCATION_PATTERN.test(id)&&PILOT_LOCATION_IDS.includes(id);
}

export function ghlLink(locationId,path){
 if(!allowedLocation(locationId))throw new Error('Sous-compte hors pilote.');
 const suffix=path.startsWith('/')?path:'/'+path;
 const url=new URL('https://app.gohighlevel.com/v2/location/'+locationId+suffix);
 if(url.origin!=='https://app.gohighlevel.com'||!url.pathname.startsWith('/v2/location/'+locationId+'/'))throw new Error('Lien refusé.');
 return url.href;
}

function lien(label,path){return {kind:'lien',label,path}}
const TERMINE='J’ai terminé cette étape';

export const STEPS=[
 {
  id:1,
  title:'Infos du courtier',
  summary:'Votre nom, votre courriel, votre téléphone personnel, votre entreprise, le type de propriétés, votre secteur (villes ou région) et votre fuseau horaire. Aucun mot de passe n’est demandé.',
  fields:[
   {name:'nom',label:'Nom',type:'text',autocomplete:'name'},
   {name:'courriel',label:'Courriel',type:'email',autocomplete:'email'},
   {name:'telephone',label:'Téléphone personnel',type:'tel',autocomplete:'tel'},
   {name:'entreprise',label:'Entreprise',type:'text',autocomplete:'organization'},
   {name:'secteur',label:'Type de propriétés',type:'select',options:SECTEURS},
   {name:'territoire',label:'Secteur (villes ou région)',type:'text',autocomplete:'address-level2'},
   {name:'fuseau',label:'Fuseau horaire',type:'select',options:FUSEAUX}
  ],
  actions:[{kind:'formulaire',label:'Enregistrer mes informations'}],
  signaler:TERMINE
 },
 {
  id:2,
  title:'Préparation du compte',
  summary:'L’agence charge le bon modèle : pipelines, formulaires, calendriers et séquences, sans doublons. Les automatisations de prospection restent inactives jusqu’à la validation finale. Vous pouvez les consulter, sans les activer.',
  actions:[lien('Voir les automatisations',GHL.workflows)],
  signaler:TERMINE
 },
 {
  id:3,
  title:'Numéro canadien',
  summary:'La page Numéros affiche les frais avant tout achat. S’il faut une vérification d’identité, elle se fait dans GoHighLevel, pas ici. Ce parcours n’achète aucun numéro et n’envoie aucun message. L’indicatif vérifié et l’identité (A2P ou Persona) restent confirmés par l’agence.',
  actions:[lien('Ouvrir les numéros',GHL.phone)],
  signaler:TERMINE
 },
 {
  id:4,
  title:'Facebook et Instagram',
  summary:'La connexion de la page Facebook et d’Instagram, s’il y a lieu, se fait dans Intégrations. Le compte publicitaire et le Business Portfolio se règlent dans Meta, à l’extérieur de GoHighLevel. Le mapping des formulaires de leads n’est pas lisible par l’API.',
  actions:[lien('Ouvrir les intégrations',GHL.integrations)],
  signaler:TERMINE
 },
 {
  id:5,
  title:'Google Agenda',
  summary:'Autorisez Google Agenda depuis les calendriers (onglet Connexions), choisissez le bon agenda, puis vérifiez les disponibilités et les conflits. La connexion Google elle-même n’est pas lisible par l’API : l’agence la confirme.',
  actions:[lien('Ouvrir les calendriers',GHL.calendars)],
  signaler:TERMINE
 },
 {
  id:6,
  title:'Sous-domaine du funnel',
  summary:'Le DNS de nomcourtier.courtiergrowth.com est fait par l’agence. On ne vous demande pas de le configurer. Le domaine du funnel et le domaine d’envoi des courriels sont deux choses différentes.',
  actions:[lien('Ouvrir les domaines',GHL.domain)],
  signaler:TERMINE
 },
 {
  id:7,
  title:'Ancienne liste',
  optional:true,
  summary:'Étape facultative : elle ne bloque pas le lancement. L’import CSV natif montre le mapping et les doublons avant d’écrire. Aucun envoi de masse n’est lancé. Classez ensuite anciens acheteurs, anciens vendeurs, prospects et réseau.',
  consignes:'Le bouton ouvre la page d’import des contacts dans votre compte. Le classement et l’absence d’envoi se confirment avec l’agence.',
  actions:[lien('Ouvrir l’import des contacts',GHL.import)],
  signaler:TERMINE,
  decliner:'Cette étape ne me concerne pas'
 },
 {
  id:8,
  title:'Application LeadConnector',
  summary:'Installez LeadConnector (pas GoKollab) et activez les notifications. Aucune API ne dit si l’application est installée : l’agence confirme après un essai interne, sans message à un vrai contact.',
  consignes:'Choisissez le magasin de votre téléphone. Connectez-vous dans l’application avec votre accès GoHighLevel, puis activez les notifications. Ce formulaire ne demande pas votre mot de passe.',
  actions:[
   {kind:'lien',label:'App Store',href:APPLE},
   {kind:'lien',label:'Google Play',href:PLAY}
  ],
  signaler:TERMINE
 },
 {
  id:9,
  title:'Validation finale',
  summary:'L’agence vérifie le chemin formulaire, contact, opportunité et suivi, une réservation, puis les communications. Le statut Validé n’est jamais posé parce que vous avez cliqué.',
  actions:[],
  signaler:TERMINE
 }
];

const STEP_BY_ID=new Map(STEPS.map(step=>[step.id,step]));
export function stepById(id){return STEP_BY_ID.get(Number(id))||null}

export function emptyProgress(locationId,now){
 const steps={};
 for(const step of STEPS)steps[String(step.id)]={status:'a_faire',source:null,detail:'',updatedAt:now};
 return {locationId,broker:{},steps,help:null,lastCheckAt:null,updatedAt:now};
}

export function blockingStep(state){
 for(const step of STEPS){
  if(step.optional)continue;
  const status=state.steps[String(step.id)]?.status;
  if(status!=='valide'&&status!=='non_applicable')return step;
 }
 return null;
}

export function progressCount(state){
 let done=0;
 for(const step of STEPS){
  const status=state.steps[String(step.id)]?.status;
  if(status==='valide'||status==='non_applicable')done++;
 }
 return {done,total:STEPS.length};
}

const FORBIDDEN=/^(password|motdepasse|mot_de_passe|mdp|token|secret|apikey|api_key|access_token|authorization)$/i;

export function normalizePhone(value){
 const digits=String(value||'').replace(/\D/g,'');
 if(digits.length===10)return '+1'+digits;
 if(digits.length===11&&digits.startsWith('1'))return '+'+digits;
 return '';
}

export function parseBroker(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {errors:{form:'Informations requises.'}};
 for(const key of Object.keys(input))if(FORBIDDEN.test(key))return {errors:{form:'Ce formulaire ne recueille aucun mot de passe ni aucun jeton.'}};
 const nom=clean(input.nom,80);
 const courriel=clean(input.courriel,120).toLowerCase();
 const telephone=normalizePhone(input.telephone);
 const entreprise=clean(input.entreprise,120);
 const secteur=String(input.secteur||'');
 const territoire=clean(input.territoire,120);
 const fuseau=String(input.fuseau||'America/Toronto');
 const errors={};
 if(nom.length<2)errors.nom='Indiquez votre nom.';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel))errors.courriel='Indiquez un courriel valide.';
 if(!telephone)errors.telephone='Indiquez un numéro canadien à 10 chiffres.';
 if(entreprise.length<2)errors.entreprise='Indiquez le nom de l’entreprise.';
 if(!SECTEURS.some(([value])=>value===secteur))errors.secteur='Choisissez un type de propriétés.';
 if(territoire.length<2)errors.territoire='Indiquez votre secteur : villes ou région.';
 if(!FUSEAUX.some(([value])=>value===fuseau))errors.fuseau='Choisissez un fuseau horaire.';
 if(Object.keys(errors).length)return {errors};
 return {value:{nom,courriel,telephone,entreprise,secteur,territoire,fuseau}};
}

function clean(value,max){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max)}
function clone(state){return structuredClone(state)}
function touch(state,now){state.updatedAt=now;return state}

function locked(step){
 if(!step)return false;
 if(step.status==='besoin_aide'||step.status==='non_applicable')return true;
 return step.status==='valide'&&step.source==='agence';
}

export function applyBroker(state,input,now){
 const parsed=parseBroker(input);
 if(parsed.errors)return {errors:parsed.errors};
 if(locked(state.steps['1']))return {error:'Cette étape est déjà confirmée par l’agence. Écrivez-lui si un détail a changé.'};
 const next=clone(state);
 next.broker=parsed.value;
 next.steps['1']={status:'valide',source:'auto',detail:'Informations complètes et vérifiées.',updatedAt:now};
 return {state:touch(next,now)};
}

export function applySignal(state,stepId,now){
 const step=stepById(stepId);
 if(!step?.signaler)return {error:'Cette étape ne se confirme pas par un clic.'};
 if(step.id===9){
  const block=blockingStep(state);
  if(block&&block.id!==9)return {error:'L’étape qui bloque : '+block.title+'.',blockingId:block.id};
 }
 const current=state.steps[String(step.id)];
 if(current.status==='valide'||current.status==='non_applicable')return {state};
 const next=clone(state);
 next.steps[String(step.id)]={
  ...current,
  status:'en_attente',
  source:'client',
  detail:current.detail||'En attente de vérification. Un clic ne valide pas l’étape.',
  updatedAt:now
 };
 return {state:touch(next,now)};
}

export function applyDecline(state,stepId,now){
 const step=stepById(stepId);
 if(!step?.optional)return {error:'Cette étape est obligatoire.'};
 const next=clone(state);
 next.steps[String(step.id)]={status:'non_applicable',source:'client',detail:'Vous avez indiqué que cette étape ne vous concerne pas. Elle ne bloque pas le lancement.',updatedAt:now};
 return {state:touch(next,now)};
}

export function applyHelp(state,note,now,stepId){
 const text=clean(note,500);
 if(text.length<3)return {error:'Décrivez le blocage en quelques mots.'};
 const block=stepById(stepId)||blockingStep(state)||stepById(9);
 const next=clone(state);
 const current=next.steps[String(block.id)];
 next.steps[String(block.id)]={...current,status:'besoin_aide',source:'client',detail:text,updatedAt:now};
 next.help={stepId:block.id,note:text,at:now};
 return {state:touch(next,now),blockingId:block.id};
}

const AGENCY_STATUSES=new Set(Object.keys(STATUSES));
export function applyAgency(state,{stepId,status,note},now){
 const step=stepById(stepId);
 if(!step||!AGENCY_STATUSES.has(status))return {error:'Étape ou statut invalide.'};
 if(status==='non_applicable'&&!step.optional)return {error:'Seule l’ancienne liste peut être non applicable.'};
 const text=clean(note,500);
 const next=clone(state);
 const current=next.steps[String(step.id)];
 next.steps[String(step.id)]={
  status,
  source:'agence',
  detail:text||(status==='valide'?'Confirmé par l’agence.':current.detail||''),
  ...(Array.isArray(current.publishedWorkflows)?{publishedWorkflows:current.publishedWorkflows}:{}),
  updatedAt:now
 };
 return {state:touch(next,now)};
}

export function applyChecks(state,results,now){
 const next=clone(state);
 const broker=parseBroker(next.broker);
 if(!broker.errors&&!locked(next.steps['1'])){
  next.steps['1']={status:'valide',source:'auto',detail:'Informations complètes et vérifiées.',updatedAt:now};
 }
 for(const result of results||[]){
  const key=String(result.step);
  const current=next.steps[key];
  if(!current||!stepById(result.step)||locked(current))continue;
  const detail=clean(result.detail,400);
  const base={detail,updatedAt:now};
  if(Array.isArray(result.publishedWorkflows))base.publishedWorkflows=result.publishedWorkflows.slice(0,40);
  else if(Array.isArray(current.publishedWorkflows))base.publishedWorkflows=current.publishedWorkflows;
  if(result.outcome==='reussi'){
   next.steps[key]={...base,status:'valide',source:'auto'};
  }else if(result.outcome==='partiel'){
   next.steps[key]={...base,status:'en_attente',source:'auto'};
  }else if(result.outcome==='a_faire'){
   next.steps[key]={...base,status:'a_faire',source:'auto'};
  }else if(current.status==='valide'&&current.source==='auto'&&(result.outcome==='echoue'||result.outcome==='manuel')){
   next.steps[key]={...base,status:'a_faire',source:'auto'};
  }else if(detail||base.publishedWorkflows){
   next.steps[key]={...current,...base};
  }
 }
 next.lastCheckAt=now;
 return touch(next,now);
}

function publicWorkflows(list){
 if(!Array.isArray(list))return [];
 return list.slice(0,40).map(item=>({name:String(item?.name||'').slice(0,120),blocks:item?.blocks===true})).filter(item=>item.name);
}

function actionView(action,locationId){
 if(action.kind==='lien'){
  const href=action.href||ghlLink(locationId,action.path);
  const url=new URL(href);
  if(url.protocol!=='https:')throw new Error('Lien refusé.');
  return {kind:'lien',label:action.label,href:url.href,externe:true};
 }
 return {kind:action.kind,label:action.label};
}

export function publicView(state,{checks='manuel',storage='memoire'}={}){
 const block=blockingStep(state);
 const count=progressCount(state);
 return {
  locationId:state.locationId,
  storage,
  checks,
  pilot:true,
  broker:state.broker||{},
  help:state.help,
  lastCheckAt:state.lastCheckAt,
  updatedAt:state.updatedAt,
  progress:count,
  blocking:block?{id:block.id,title:block.title,status:state.steps[String(block.id)].status}:null,
  steps:STEPS.map(step=>{
   const saved=state.steps[String(step.id)]||{status:'a_faire',detail:''};
   return {
    id:step.id,
    title:step.title,
    summary:step.summary,
    consignes:step.consignes||'',
    optional:!!step.optional,
    fields:step.fields||[],
    actions:step.actions.map(action=>actionView(action,state.locationId)),
    signaler:step.signaler||'',
    decliner:step.decliner||'',
    status:saved.status,
    statusLabel:STATUSES[saved.status]||STATUSES.a_faire,
    chip:STATUS_CHIP[saved.status]||'neutral',
    source:saved.source==='agence'?'agence':saved.source==='auto'?'auto':null,
    detail:saved.detail||'',
    publishedWorkflows:publicWorkflows(saved.publishedWorkflows)
   };
  })
 };
}

export function agencyRow(state){
 const view=publicView(state);
 const block=view.blocking;
 const next=block?STEPS.find(step=>step.id===block.id):null;
 const nextLabel=next?.actions?.[0]?.label||next?.signaler||'Rien à faire';
 return {
  locationId:state.locationId,
  broker:state.broker?.nom?{nom:state.broker.nom,entreprise:state.broker.entreprise,courriel:state.broker.courriel,telephone:state.broker.telephone,secteur:state.broker.secteur,territoire:state.broker.territoire,fuseau:state.broker.fuseau}:{},
  progress:view.progress,
  blocking:view.blocking,
  nextAction:block?nextLabel:'Parcours vérifié',
  help:state.help,
  lastCheckAt:state.lastCheckAt,
  updatedAt:state.updatedAt,
  steps:view.steps.map(step=>({id:step.id,title:step.title,optional:step.optional,status:step.status,statusLabel:step.statusLabel,detail:step.detail,source:step.source,publishedWorkflows:step.publishedWorkflows}))
 };
}
