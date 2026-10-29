import {escapeHTML as h} from './model.mjs';

const labels={'me/permissions':'Droits du compte','ad-account':'Compte publicitaire'};
const rightLabels={ads_read:'ads_read',leads_retrieval:'leads_retrieval',pages_show_list:'pages_show_list'};
const rightStates={granted:'accordé',declined:'refusé',expired:'expiré',not_returned:'non retourné'};

export function metaLeadCapabilityHTML(result){
 if(result?.provider!=='meta_instant_forms'||!Array.isArray(result.permissions))throw Error('Droits Meta invalides.');
 const lead=result.permissions.find(p=>p.permission==='leads_retrieval');
 const leadLine=result.leads_retrieval?'Droit leads_retrieval accordé. La Page et les formulaires restent à associer et tester.':lead?`Droit leads_retrieval : ${rightStates[lead.status]||'non déterminé'}. L’accès aux leads reste indisponible.`:'Droit leads_retrieval non retourné par Meta : accès aux leads non vérifié.';
 return `<p>${h(leadLine)}</p><p>Compte publicitaire : ${result.ads_read?'ads_read accordé':'ads_read non confirmé'}. Association Page/formulaires non vérifiée. Import des coordonnées et réponses inactif.</p><details><summary>Droits effectivement reçus</summary>${result.permissions.map(p=>`<p>${h(p.permission)} · ${h(p.status)}</p>`).join('')}</details>`;
}

export function metaDiagnosticHTML(result){
 if(result?.provider!=='meta'||result.read_only!==true)throw Error('Diagnostic Meta invalide.');
 const line=(probe,endpoint)=>{
  if(!probe||!['ok','rejected','unavailable','invalid_response'].includes(probe.state))throw Error('Diagnostic Meta incomplet.');
  const label=labels[endpoint];
  if(probe.state==='ok'){
   const rights=endpoint==='me/permissions'?Object.entries(rightLabels).map(([key,name])=>`<li>${h(name)} : ${h(rightStates[probe.permissions?.[key]]||'non déterminé')}</li>`).join(''):'';
   return `<section><h3>${label}</h3><p>Lecture acceptée par Meta.</p>${rights?`<ul>${rights}</ul>`:''}</section>`;
  }
  if(probe.state!=='rejected')return `<section><h3>${label}</h3><p>${probe.state==='unavailable'?'Lecture indisponible.':'Réponse inattendue.'}</p></section>`;
  const d=probe.diagnostic||{};
  const number=n=>Number.isSafeInteger(n)&&n>=0?String(n):'non fourni';
  const mentioned=Object.hasOwn(rightLabels,d.missingPermission)?`<p>Droit mentionné par Meta : ${h(d.missingPermission)}. Sa cause précise reste à vérifier.</p>`:'';
  return `<section><h3>${label}</h3><p>Refus Meta · HTTP ${number(d.httpStatus)} · code Graph ${number(d.code)} · sous-code ${number(d.subcode)}.</p><p>Catégorie : ${h(['authentification rejetée','autorisation refusée','requête ou champ invalide','cause non déterminée'].includes(d.category)?d.category:'cause non déterminée')}.</p>${mentioned}</section>`;
 };
 const adRead=result.account?.state==='ok'&&result.permissions?.state==='ok'&&result.permissions.permissions?.ads_read==='granted';
 const leadVerified=result.permissions?.state==='ok'&&result.permissions.permissions?.leads_retrieval==='granted';
 const summary=adRead?`<p><strong>Compte publicitaire vérifié en lecture.</strong> Accès aux leads ${leadVerified?'accordé; association Page/formulaires à vérifier':'non vérifié'}.</p>`:'';
 return `<p>Contrôle en lecture seule du ${h(result.checked_at||'date indisponible')}. Les deux requêtes sont indépendantes. Une date de connexion future ne confirme pas l’accès réel.</p>${summary}${line(result.permissions,'me/permissions')}${line(result.account,'ad-account')}<p>Aucune permission supplémentaire ni reconnexion déclenchée. Si le code 200 apparaît, le droit précis reste à confirmer.</p>`;
}
