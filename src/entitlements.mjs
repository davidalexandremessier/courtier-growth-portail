import {davidMessageAccess} from './portal-features.mjs';
import {offerGroup} from './offers.mjs';

export const offerKey=value=>({'Campagne 97 $':'97','Groupe':'group','1:1':'individual'}[offerGroup(value)]||'legacy');
export const capabilityMatrix={
 '97':['portal','messages','resources','files','activities','metrics','campaign97','offers_info'],
 group:['portal','messages','resources','files','activities','metrics','goals','self_guidance','group_coaching','crm_client','legacy_onboarding','reflections','offers_info'],
 individual:['portal','messages','resources','files','activities','metrics','goals','self_guidance','group_coaching','crm_client','legacy_onboarding','reflections','dfy_production','individual_support','team','offers_info'],
 // Preserve existing access while an administrator classifies historical dossiers.
 // This grants no new production or campaign97 entitlement.
 legacy:['portal','messages','resources','files','activities','metrics','goals','self_guidance','group_coaching','crm_client','legacy_onboarding','reflections','individual_support','team','offers_info'],
};
export const offerDescriptions={
 '97':{label:'Installation Meta 97 $',execution:'Une campagne installée par Courtier Growth; le courtier traite ses demandes.',support:'Préparation, appel de cadrage et bilan J21.',boundary:'Leads · première étape de L.I.S.T. Aucun CRM client ou accès groupe/1:1 inclus.'},
 group:{label:'Système L.I.S.T. · Groupe',execution:'Vous ou votre équipe apprenez, pilotez et exécutez le système L.I.S.T. complet.',support:'Ressources et cadre de groupe; aucune production déléguée ou prise en charge individuelle présumée.',boundary:'Une modalité pour maîtriser votre exécution. Guidage IA non connecté dans cette version.'},
 individual:{label:'Système L.I.S.T. · 1:1',execution:'Un partenaire marketing pour produire et exécuter le système L.I.S.T. dans le périmètre convenu.',support:'Validation humaine de la stratégie et accompagnement individuel.',boundary:'Vous conservez votre rôle commercial. Aucun résultat garanti ou lancement sans autorisation.'},
 legacy:{label:'Offre à préciser',execution:'Parcours historique conservé.',support:'Périmètre à confirmer avec Courtier Growth.',boundary:'Aucune nouvelle offre attribuée automatiquement.'},
};
export function hasCapability(offer,capability){return capabilityMatrix[offerKey(offer)].includes(capability)}
export function rowScopeAllowed(offer,scope){const key=offerKey(offer);return scope==='common'||scope===key||scope==='legacy'&&['legacy','individual'].includes(key)}
const pageCaps={production:'dfy_production',campaign97:'campaign97',leads97:'campaign97',kpi:'metrics',diagnostic:'metrics','data-hub':'metrics',tasks:'activities',weekly:'reflections',preparation:'reflections',team:'team',david:'self_guidance',connections:'crm_client',calls:'individual_support',notes:'individual_support'};
export function pageAllowed(offer,page,{admin=false}={}){if(page==='david'&&!davidMessageAccess())return false;if(['overview','clients','followup','automations','production-queue','admin-help','notes','calls','connections','feedback'].includes(page))return admin;const cap=pageCaps[page];return !cap||hasCapability(offer,cap)}
export function nextOffers(offer){return offerKey(offer)==='97'?['group','individual']:offerKey(offer)==='group'?['individual']:[]}
export function offerInformation(){return Object.entries(offerDescriptions).filter(([key])=>key!=='legacy').map(([key,value])=>({key,...value}))}
