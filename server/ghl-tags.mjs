import {CENTRAL_GHL_LOCATION} from '../src/call-matching.mjs';
import {offerGroup} from '../src/offers.mjs';

// Ajout seul : POST /contacts/:id/tags. Jamais de retrait, jamais de message.
export const GHL_TAG_ACTIONS={
 'clarif-ok':'cg97-clarif-ok',
 'apercus-ok':'cg97-aperçus-ok',
 'apercus-correction':'cg97-aperçus-correction',
 'expansion-oui':'cg97-expansion-oui',
 'expansion-retire':'cg97-expansion-retiré',
};
export const GHL_LOCATION_ID=CENTRAL_GHL_LOCATION;

export function taggingEnabled(env=process.env){return env.GHL_TAGGING_ENABLED==='true'}
export function tagForAction(action){return GHL_TAG_ACTIONS[action]||null}
export function sprint97Offer(offer){return offerGroup(offer)==='Campagne 97 $'}

export async function applyClientTag({action,client,contactId=null,env=process.env,fetchImpl=fetch,log=console.info}){
 const tag=tagForAction(action);
 if(!tag){const error=new Error('Action inconnue.');error.status=400;throw error}
 if(!client?.id){const error=new Error('Dossier requis.');error.status=400;throw error}
 if(!taggingEnabled(env)){
  log(JSON.stringify({event:'ghl_tag_skipped',clientId:client.id,email:client.email||null,contactId:contactId||null,action,tag,reason:'GHL_TAGGING_ENABLED désactivé'}));
  return {ok:true,simulated:true,tag,contactId:contactId||null};
 }
 if(!env.GHL_CENTRAL_TOKEN){const error=new Error('Jeton GHL central manquant.');error.status=409;throw error}
 const headers={Authorization:'Bearer '+env.GHL_CENTRAL_TOKEN,Version:'2021-07-28',Accept:'application/json','Content-Type':'application/json'};
 const id=await resolveContactId({contactId,email:client.email,locationId:GHL_LOCATION_ID,headers,fetchImpl});
 const url='https://services.leadconnectorhq.com/contacts/'+encodeURIComponent(id)+'/tags';
 const response=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify({tags:[tag]})});
 if(!response.ok){const error=new Error('Le tag n’a pas été ajouté.');error.status=502;throw error}
 log(JSON.stringify({event:'ghl_tag_added',clientId:client.id,contactId:id,action,tag}));
 return {ok:true,simulated:false,tag,contactId:id};
}

export async function resolveContactId({contactId,email,locationId,headers,fetchImpl}){
 if(contactId){
  const response=await fetchImpl('https://services.leadconnectorhq.com/contacts/'+encodeURIComponent(contactId),{method:'GET',headers});
  const body=await response.json().catch(()=>({}));
  const contact=body.contact||body;
  if(!response.ok||!contact?.id){const error=new Error('Fiche contact introuvable.');error.status=404;throw error}
  if(contact.locationId!==locationId){const error=new Error('Cette fiche n’est pas dans le sous-compte Courtier Growth.');error.status=409;throw error}
  return contact.id;
 }
 const normalized=String(email||'').trim().toLowerCase();
 if(!normalized){const error=new Error('Aucune fiche contact ni courriel pour ce dossier.');error.status=409;throw error}
 const response=await fetchImpl('https://services.leadconnectorhq.com/contacts/search',{method:'POST',headers,body:JSON.stringify({locationId,page:1,pageLimit:20,query:normalized})});
 const body=await response.json().catch(()=>({}));
 if(!response.ok||!Array.isArray(body.contacts)){const error=new Error('Recherche du contact impossible.');error.status=502;throw error}
 const matches=body.contacts.filter(item=>String(item.email||'').trim().toLowerCase()===normalized&&(!item.locationId||item.locationId===locationId));
 if(matches.length!==1){const error=new Error(matches.length?'Plusieurs fiches ont ce courriel.':'Aucune fiche avec ce courriel.');error.status=409;throw error}
 return matches[0].id;
}
