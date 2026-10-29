import {offerKey,hasCapability,pageAllowed} from './entitlements.mjs';
export function dossierSidebarGroups(offer,{admin=false}={}){
 return [
  ['Parcours',[['onboarding','check','Mon parcours'],['campaign-hub','chart','Campagne'],['production','check','Créations'],['leads97','people','Prospects']]],
  ['Suivi',[['tasks','check','Mes tâches'],['kpi','chart','Mes chiffres'],['weekly','chart','Bilan de semaine'],['team','people','Mon équipe'],['coachings','clock','Rendez-vous'],['preparation','clock','Préparer un appel']]],
  ['Échanges',[['messages','chat','Messages'],['announcements','chat','Annonces'],['help','chat','Demander de l’aide']]],
  ['Ressources et réglages',[['resources','link','Mes ressources'],['preferences','settings','Paramètres'],['notifications','clock','Historique'],['offer-suite','people','Accompagnements']]]
 ].map(([label,items])=>[label,items.filter(([page])=>pageAllowed(offer,page,{admin}))]).filter(([,items])=>items.length);
}
export const focusDestinations=[['dashboard','chart','Résultats'],['action-hub','check','Actions']];
export const clientDestinations=[
 ['dashboard','grid','Vue d’ensemble'],['onboarding','check','Mon parcours'],['action-hub','check','À faire'],
 ['kpi','chart','Mes résultats'],['coachings','clock','Rendez-vous'],['messages','chat','Messages'],
 ['resources','link','Mes ressources'],['preferences','settings','Paramètres']
];
export function destinationsFor(){return clientDestinations}
export function clientSectionFor(page){if(['diagnostic','data-hub'].includes(page))return page;
 if(['onboarding','production','campaign97','campaign-hub','leads97'].includes(page))return 'onboarding';
 if(['action-hub','tasks'].includes(page))return 'action-hub';
 if(['kpi','weekly','team'].includes(page))return 'kpi';
 if(['coachings','preparation','calls'].includes(page))return 'coachings';
 if(['messages','announcements','help'].includes(page))return 'messages';
 if(page==='resources')return 'resources';
 if(['preferences','notifications','david','offer-suite','connections','notes'].includes(page))return 'preferences';
 return 'dashboard';
}
export function followupLinks(offer,team=false){return [['tasks','Mes tâches'],['coachings','Mes rendez-vous'],...(hasCapability(offer,'reflections')?[['weekly','Mon bilan de semaine'],['preparation','Préparer une rencontre']]:[]),...(team&&hasCapability(offer,'team')?[['team','Mon équipe']]:[]),['messages','Mes messages'],['announcements','Annonces'],['help','Demander de l’aide']]}
export const accompanimentPages=['onboarding','production','campaign97','leads97','tasks','kpi','weekly','team'];
export function destination(page){return ['kpi','leads97'].includes(page)?page:accompanimentPages.includes(page)||['preparation','announcements','help'].includes(page)?'onboarding':page;}
export function clientTabs(page,team=false,offer='1:1'){if(offerKey(offer)==='97')return accompanimentPages.includes(page)?[['onboarding','Mon parcours'],['tasks','Mes actions'],['kpi','Mes résultats']]:[];if(accompanimentPages.includes(page))return [['onboarding','Mon parcours'],['tasks','Mes actions'],['kpi','Mes résultats'],['weekly','Bilan de semaine'],...(team&&hasCapability(offer,'team')?[['team','Mon équipe']]:[])];if(['coachings','preparation'].includes(page))return [['coachings','Mes rendez-vous'],['preparation','Préparer ma rencontre']];if(['messages','announcements','help'].includes(page))return [['messages','Conversation'],['announcements','Annonces'],['help','Demander de l’aide']];return [];}

// Four mobile shortcuts; the complete eight-section dossier remains in the sidebar.
export function primaryItems(admin,offer){return admin?[
 ['overview','grid','Aujourd’hui'],['clients','people','Clients'],['production-queue','check','À valider'],['admin-help','chat','Aide']
]:[['dashboard','grid','Aujourd’hui'],['action-hub','check','À faire'],['campaign-hub',offerKey(offer)==='97'?'people':'chart',offerKey(offer)==='97'?'Prospects':'Campagne'],['help','chat','Aide']];}
export function primaryDestination(page,admin,offer){
 if(admin){if(['clients','connections','calls','notes'].includes(page))return 'clients';if(['production-queue','followup','automations'].includes(page))return 'production-queue';if(['admin-help','help','feedback'].includes(page))return 'admin-help';return 'overview'}
 if(['action-hub','tasks','onboarding','weekly','preparation'].includes(page))return 'action-hub';
 if(['campaign-hub','production','campaign97','leads97','kpi','resources','team'].includes(page))return 'campaign-hub';
 if(['help','messages','announcements','coachings','notifications','preferences','david','offer-suite'].includes(page))return 'help';
 return 'dashboard';
}
