import {escapeHTML as h} from './model.mjs';

const money=value=>new Intl.NumberFormat('fr-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(value);
const when=value=>{
 const date=new Date(value);
 if(Number.isNaN(date.getTime())) return '';
 return new Intl.DateTimeFormat('fr-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Toronto'}).format(date);
};
function https(value){
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:''}catch{return ''}
}

export function buyerActivity(events,{admin=false,clientId=null,clients=[]}={}){
 const rows=(Array.isArray(events)?events:[]).filter(event=>admin||event?.client_id===clientId);
 const names=new Map((clients||[]).map(client=>[client.id, client.name]));
 const grouped=new Map();
 for(const event of rows){
  const key=`${event.client_id}\u001f${event.contact_id}`;
  const current=grouped.get(key)||{clientId:event.client_id, contactId:event.contact_id, name:'', email:'', broker:names.get(event.client_id)||'', latest:'', coups:[]};
  const newer=!current.latest||String(event.occurred_at||'')>=String(current.latest);
  if(newer) current.latest=event.occurred_at||current.latest;
  if(event.contact_name&&(newer||!current.name)) current.name=event.contact_name;
  if(event.contact_email&&(newer||!current.email)) current.email=event.contact_email;
  if(event.event==='coup_de_coeur') current.coups.push(event);
  grouped.set(key, current);
 }
 const buyers=[...grouped.values()];
 for(const buyer of buyers) buyer.coups.sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at)));
 buyers.sort((a,b)=>String(b.latest).localeCompare(String(a.latest)));
 return buyers;
}

function propertyHtml(property){
 if(!property||typeof property!=='object') return '';
 const link=https(property.url);
 const bits=[property.address?`<span>${h(property.address)}</span>`:'', property.price!=null?`<span class="price">${h(money(property.price))}</span>`:'', property.centris_id?`<span>Centris ${h(property.centris_id)}</span>`:''].filter(Boolean).join(' · ');
 return `<p class="buyer-property-meta">${bits}</p>${link?`<p><a href="${h(link)}" target="_blank" rel="noopener noreferrer">Voir l’annonce</a></p>`:''}`;
}

function coupHtml(coup){
 return `<article class="buyer-coup" data-coup="${h(coup.id||'')}"><time datetime="${h(coup.occurred_at||'')}">${h(when(coup.occurred_at))}</time>${propertyHtml(coup.property)}${coup.note?`<p>${h(coup.note)}</p>`:''}</article>`;
}

export function dossierBuyersHtml(buyers,{unavailable=false,missing=false,admin=false}={}){
 if(missing) return '<section class="panel"><h2>Acheteurs</h2><p>Cette section s’activera lorsque la mise à jour de la base aura été appliquée.</p></section>';
 if(unavailable) return '<section class="panel"><h2>Acheteurs</h2><p>Lecture impossible pour le moment. Réessayez.</p></section>';
 if(!buyers.length) return '<section class="panel"><h2>Aucun acheteur pour le moment</h2><p>Un coup de cœur envoyé depuis GoHighLevel apparaîtra ici, du plus récent au plus ancien.</p></section>';
 return buyers.map(buyer=>`<section class="panel buyer-card" data-buyer-contact="${h(buyer.contactId)}" data-client="${h(buyer.clientId)}"><h2>${h(buyer.name||'Contact sans nom')}</h2><p class="muted">${[buyer.email, admin?buyer.broker:''].filter(Boolean).map(h).join(' · ')||'Contact GoHighLevel'}</p>${buyer.coups.length?buyer.coups.map(coupHtml).join(''):'<p>Aucun coup de cœur pour le moment.</p>'}</section>`).join('');
}

export function v2BuyersHtml(buyers,{unavailable=false,missing=false,admin=false,access=[]}={}){
 const revoked=new Set((access||[]).filter(row=>row.revoked_at).map(row=>`${row.client_id}\u001f${row.contact_id}`));
 const intro='<div class="head"><div><h1>Acheteurs</h1><p class="muted">Les coups de cœur de vos contacts, du plus récent au plus ancien. Lecture seule pour l’acheteur.</p></div></div>';
 if(missing) return intro+'<section class="card"><h2>Pas encore activé</h2><p>Cette section s’activera lorsque la mise à jour de la base aura été appliquée.</p></section>';
 if(unavailable) return intro+'<section class="card"><h2>Lecture impossible</h2><p>Réessayez dans un instant.</p></section>';
 if(!buyers.length) return intro+'<section class="card"><h2>Aucun acheteur pour le moment</h2><p>Un coup de cœur envoyé depuis GoHighLevel apparaîtra ici.</p></section>';
 return intro+buyers.map(buyer=>{
  const key=`${buyer.clientId}\u001f${buyer.contactId}`;
  const isRevoked=revoked.has(key);
  const action=admin?`<button type="button" class="secondary" data-act="revoke-buyer:${encodeURIComponent(buyer.clientId)}:${encodeURIComponent(buyer.contactId)}" data-revoke="${isRevoked?'restore':'revoke'}">${isRevoked?'Réactiver le lien':'Révoquer le lien'}</button>`:'';
  return `<section class="card buyer-card" data-buyer-contact="${h(buyer.contactId)}" data-client="${h(buyer.clientId)}"><div class="section-head"><div><h2>${h(buyer.name||'Contact sans nom')}</h2><p class="muted small">${[buyer.email, admin&&buyer.broker?buyer.broker:'', isRevoked?'Lien révoqué':''].filter(Boolean).map(h).join(' · ')||'Contact GoHighLevel'}</p></div>${action}</div>${buyer.coups.length?buyer.coups.map(coupHtml).join(''):'<p>Aucun coup de cœur pour le moment.</p>'}</section>`;
 }).join('');
}

export function publicBuyerHtml({loading=false,error='',brokerName='',contactName='',coups=[]}={}){
 const brand='<header class="top"><div class="brand">Courtier<span>Growth</span></div></header>';
 if(loading) return `<main class="main buyer-public">${brand}<div class="head"><div><h1>Vos coups de cœur</h1><p class="muted">Chargement…</p></div></div></main>`;
 if(error) return `<main class="main buyer-public">${brand}<div class="head"><div><h1>Lien indisponible</h1><p class="error" role="alert">${h(error)}</p><p class="muted">Demandez un nouveau lien à votre courtier.</p></div></div></main>`;
 const who=[contactName, brokerName?`avec ${brokerName}`:''].filter(Boolean).join(' ');
 return `<main class="main buyer-public">${brand}<div class="head"><div><h1>Vos coups de cœur</h1><p class="muted">${who?h(who)+' · ':''}Lecture seule. Du plus récent au plus ancien.</p></div></div>${coups.length?`<section class="card buyer-coups">${coups.map(coup=>`<article class="buyer-coup" data-coup><time datetime="${h(coup.occurred_at||'')}">${h(when(coup.occurred_at))}</time>${propertyHtml(coup.property)}${coup.note?`<p>${h(coup.note)}</p>`:''}</article>`).join('')}</section>`:'<section class="card"><h2>Aucun coup de cœur pour le moment</h2><p>Les propriétés que vous aimez apparaîtront ici.</p></section>'}</main>`;
}

export async function loadBuyerCockpit({sb,demo,clientId}){
 if(demo) return {events:demoBuyerEvents(clientId), unavailable:false, missing:false};
 if(!sb) return {events:[], unavailable:true, missing:false};
 const {data, error}=await sb.from('buyer_cockpit_events').select('id,client_id,contact_id,contact_name,contact_email,event,property,note,occurred_at').order('occurred_at',{ascending:false}).limit(500);
 if(error){
  const text=`${error.code||''} ${error.message||''}`;
  return {events:[], unavailable:true, missing:/42P01|PGRST205|schema cache|does not exist|buyer_cockpit_events/i.test(text)};
 }
 return {events:data||[], unavailable:false, missing:false};
}

export function demoBuyerEvents(clientId){
 return [
  {id:'demo-coup-1', client_id:clientId, contact_id:'demo-contact-1', contact_name:'Alex Martin', contact_email:'alex@example.com', event:'coup_de_coeur', property:{centris_id:'24589001', address:'123 rue des Érables, Québec', price:489000, url:'https://www.centris.ca/fr/maison~a-vendre~quebec/24589001'}, note:'Beaucoup de lumière.', occurred_at:'2026-10-28T18:00:00.000Z'},
  {id:'demo-link-2', client_id:clientId, contact_id:'demo-contact-2', contact_name:'Sam Roy', contact_email:'', event:'portal_link', property:null, note:null, occurred_at:'2026-10-20T18:00:00.000Z'}
 ];
}
