import {davidMessageAccess} from './portal-features.mjs';
import {offerGroup,offerLabel} from './offers.mjs';

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
 '97':{label:offerLabel('Campagne 97 $'),execution:'Offre d’entrée à petit prix, sur 21 jours. Courtier Growth installe la campagne; vous traitez vos demandes.',support:'Préparation, appel de cadrage et bilan au 21e jour.',boundary:'Première marche. Aucun CRM client, ni Accelerator, ni Expansion 1:1 inclus.'},
 group:{label:offerLabel('Groupe'),execution:'Offre de groupe de 3 mois, avec 20 à 30 clients. Vous avancez ensemble, dans un cadre commun.',support:'Candidature, puis approbation, puis lien de paiement.',boundary:'La production déléguée et le soutien individuel ne sont pas inclus. Le guidage IA n’est pas connecté dans cette version.'},
 individual:{label:offerLabel('1:1'),execution:'Accompagnement individuel de 3 mois, dans le périmètre convenu avec vous.',support:'Candidature, puis appel obligatoire avec David, avant le paiement.',boundary:'Vous conservez votre rôle commercial. Aucun résultat garanti et aucun lancement sans autorisation.'},
 legacy:{label:'Offre à préciser',execution:'Parcours historique conservé.',support:'Périmètre à confirmer avec Courtier Growth.',boundary:'Aucune nouvelle offre attribuée automatiquement.'},
};
export function hasCapability(offer,capability){return capabilityMatrix[offerKey(offer)].includes(capability)}
export function rowScopeAllowed(offer,scope){const key=offerKey(offer);return scope==='common'||scope===key||scope==='legacy'&&['legacy','individual'].includes(key)}
const pageCaps={production:'dfy_production',campaign97:'campaign97',leads97:'campaign97',kpi:'metrics',diagnostic:'metrics','data-hub':'metrics',tasks:'activities',weekly:'reflections',preparation:'reflections',team:'team',david:'self_guidance',connections:'crm_client',calls:'individual_support',notes:'individual_support'};
export function pageAllowed(offer,page,{admin=false}={}){if(page==='david'&&!davidMessageAccess())return false;if(['overview','clients','followup','automations','production-queue','admin-help','notes','calls','connections','feedback'].includes(page))return admin;const cap=pageCaps[page];return !cap||hasCapability(offer,cap)}
export function nextOffers(offer){return offerKey(offer)==='97'?['group','individual']:offerKey(offer)==='group'?['individual']:[]}
export function offerInformation(){return Object.entries(offerDescriptions).filter(([key])=>key!=='legacy').map(([key,value])=>({key,...value}))}
