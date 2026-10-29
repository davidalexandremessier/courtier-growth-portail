import {importedMetaPeriod} from './imported-meta.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function metaPanel(activities,client,period,{readError=false}={}){
 if(readError)return '<section class="card"><h2>Meta · données importées</h2><p role="status">Lecture indisponible. Vos saisies manuelles restent disponibles.</p></section>';
 const m=importedMetaPeriod(activities,client,{...period,currency:'CAD',timezone:'America/Toronto'});
 const n=v=>v==null?'Non disponible':new Intl.NumberFormat('fr-CA').format(v);
 const status=m.state==='not_connected'?'Aucun compte Meta associé':m.state==='incompatible'?'Devise, fuseau ou périmètre à vérifier':!m.lastSuccess?'Aucun import confirmé':m.stale?'Données à actualiser':m.incomplete?'Période incomplète':'Import confirmé';
 return `<section class="card"><h2>Meta · données importées</h2><p>${esc(status)}</p><p class="muted small">${esc(period.start)} au ${esc(period.end)} · CAD · America/Toronto</p><ul class="vol">${[['spend','Dépense ($)'],['impressions','Impressions'],['clicks','Clics (tous)'],['meta_leads','Leads déclarés par Meta']].map(([k,l])=>`<li><span>${l}</span><strong>${n(m.totals[k])}</strong></li>`).join('')}<li><span>Coût par lead Meta ($)</span><strong>${n(m.cpl)}</strong></li></ul><p class="muted small">Dernier import réussi : ${esc(m.lastSuccess||'aucun')}. Source : Meta API. Ces volumes ne sont pas ajoutés aux chiffres manuels.</p>${m.error?`<p role="status">${esc(m.error)}</p>`:''}<p class="muted small">La synchronisation automatique reste désactivée tant que sa validation n’est pas terminée.</p></section>`;
}
