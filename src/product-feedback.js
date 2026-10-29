import {escapeHTML as h} from './model.mjs';

const kinds={like:'J’aime',blocker:'Ça bloque',improvement:'À améliorer',idea:'Idée'};
const statuses={new:'Nouveau',todo:'À faire',working:'En cours',delivered:'Livré'};
const decisions={pending:'À valider',approved:'Approuvée',refused:'Refusée'};
let context,render,toast,navigate;
let items=[],error='',opened=null,pendingCapture=null;
const demoItems=[];
const isAdmin=()=>{const c=context();return c.admin&&!c.previewClient};
const date=value=>{const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?'Date inconnue':new Intl.DateTimeFormat('fr-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Toronto'}).format(parsed)};
const validImage=value=>typeof value==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)&&value.length<=250000;
const button=(label,action,id='')=>`<button type="button" data-feedback="${action}" ${id?`data-id="${h(id)}"`:''}>${label}</button>`;

export function setupProductFeedback(options){({context,render,toast,navigate}=options)}
export async function loadProductFeedback(){
 if(!isAdmin())return;
 const c=context();
 if(c.demo){items=demoItems.slice().sort((a,b)=>b.updated_at.localeCompare(a.updated_at));error='';return}
 const result=await c.sb.from('product_feedback').select('id,created_by,client_id,kind,body,route,screen,status,decision,history,created_at,updated_at').order('updated_at',{ascending:false}).limit(200);
 if(result.error){error='Les retours sont indisponibles. Réessayez.';items=[];return}
 items=result.data||[];error='';
}
export function productFeedbackButton(){return isAdmin()?'<button type="button" class="feedback-fab" data-feedback="new">Donner mon avis</button>':''}
function feedbackCard(row){return `<article class="feedback-card"><div class="feedback-card-top"><span>${h(kinds[row.kind]||'Retour')}</span><span>${h(decisions[row.decision]||'À valider')}</span></div><p>${h(row.body.length>180?row.body.slice(0,180)+'…':row.body)}</p><div class="feedback-card-foot"><small>${h(row.screen)} · ${date(row.created_at)}</small><strong>${h(statuses[row.status]||'Nouveau')}</strong></div>${button('Voir et commenter','open',row.id)}</article>`}
export function productFeedbackPage(){
 if(!isAdmin())return '';
 const ideas=items.filter(row=>['idea','improvement'].includes(row.kind)&&row.decision==='pending');
 return `<div class="feedback-page"><header class="feedback-hero"><div><span class="feedback-kicker">ESPACE GESTION · PRODUIT</span><h1>Vos avis sur le portail</h1><p>Déposez une idée, un point fort ou un blocage depuis l’écran concerné. Le suivi et les commentaires restent privés à l’administration.</p></div>${button('Donner mon avis','new')}</header><p class="feedback-disclaimer">Dépôt et commentaires asynchrones. Aucun assistant ne répond en direct; une approbation ne lance ni modification, ni publication.</p>${error?`<p class="notice" role="alert">${h(error)}</p>`:''}<section class="feedback-section"><div class="feedback-section-title"><h2>Idées à valider</h2><span>${ideas.length}</span></div><div class="feedback-list">${ideas.map(feedbackCard).join('')||'<p class="feedback-empty">Aucune idée en attente de décision.</p>'}</div></section><section class="feedback-section"><div class="feedback-section-title"><h2>Historique des retours</h2><span>${items.length}</span></div><div class="feedback-list">${items.map(feedbackCard).join('')||'<p class="feedback-empty">Aucun retour déposé pour le moment.</p>'}</div></section></div>`;
}
function form(){
 if(!isAdmin())return;
 pendingCapture=null;
 const c=context(),screen=document.querySelector('#main-content h1')?.textContent?.trim()||'Portail',route=c.page||'overview';
 document.querySelector('#modal-root').innerHTML=`<div class="modal-overlay"><section class="modal feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title"><div class="modal-header"><div><span class="eyebrow">RETOUR PRIVÉ</span><h2 id="feedback-title">Donner mon avis</h2></div><button type="button" class="close" data-action="close" aria-label="Fermer">×</button></div><form id="feedback-create"><p class="small muted">Écran associé : <strong>${h(screen)}</strong> · ${h(route)}</p><label class="field"><span>Type de retour</span><select name="kind">${Object.entries(kinds).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label class="field"><span>Votre avis</span><textarea name="body" required maxlength="3000" rows="5" placeholder="Qu’est-ce qui fonctionne, bloque ou devrait changer ?"></textarea></label><div class="feedback-capture"><input id="feedback-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>${button('Joindre une capture','capture')}<span>Facultatif, choisi manuellement.</span><div id="feedback-preview"></div><label class="feedback-safe" hidden><input type="checkbox" name="safe"> Je confirme que la capture ne contient ni mot de passe, ni jeton, ni données sensibles.</label></div><p class="small muted">Aucune capture automatique. Ce retour reste interne; les réponses éventuelles apparaîtront plus tard dans la liste.</p><p id="feedback-error" class="form-error" role="alert"></p><button class="btn primary" type="submit">Enregistrer mon avis</button></form></section></div>`;
 document.querySelector('#feedback-create textarea')?.focus();
}
async function encodeCapture(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3_000_000)throw Error('Choisissez une image PNG, JPG ou WebP de 3 Mo maximum.');
 const source=URL.createObjectURL(file);
 try{
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=source});
  const scale=Math.min(1,960/image.naturalWidth,960/image.naturalHeight),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const encoded=canvas.toDataURL('image/jpeg',.68);
  if(!validImage(encoded))throw Error('La capture compressée est trop lourde. Choisissez une zone plus petite.');
  return encoded;
 }finally{URL.revokeObjectURL(source)}
}
async function open(id){
 if(!isAdmin())throw Error('Accès administrateur requis.');
 const row=items.find(item=>item.id===id);if(!row)throw Error('Retour introuvable.');
 opened=row;let capture=null;
 const c=context();
 if(c.demo)capture=demoItems.find(item=>item.id===id)?.screenshot_data;
 else{const result=await c.sb.from('product_feedback').select('screenshot_data').eq('id',id).single();if(result.error)throw Error('Impossible de lire ce retour.');capture=result.data?.screenshot_data}
 const history=Array.isArray(row.history)?row.history:[];
 document.querySelector('#modal-root').innerHTML=`<div class="modal-overlay"><section class="modal feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title"><div class="modal-header"><div><span class="eyebrow">${h(kinds[row.kind]||'RETOUR')} · ${h(statuses[row.status]||'Nouveau')}</span><h2 id="feedback-title">Retour sur ${h(row.screen)}</h2></div><button type="button" class="close" data-action="close" aria-label="Fermer">×</button></div><p>${h(row.body)}</p><p class="small muted">Section : ${h(row.route)} · ${date(row.created_at)}</p>${validImage(capture)?`<details><summary>Voir la capture jointe</summary><img class="feedback-attached" src="${capture}" alt="Capture jointe volontairement au retour"></details>`:''}<form id="feedback-review" data-id="${h(row.id)}"><div class="preferences-grid"><label class="field"><span>Décision</span><select name="decision">${Object.entries(decisions).map(([value,label])=>`<option value="${value}" ${row.decision===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="field"><span>Suivi</span><select name="status">${Object.entries(statuses).map(([value,label])=>`<option value="${value}" ${row.status===value?'selected':''}>${label}</option>`).join('')}</select></label></div><label class="field"><span>Commentaire facultatif</span><textarea name="comment" maxlength="1000" rows="2"></textarea></label><p class="small muted">Décider ou commenter n’entraîne aucun changement automatique du portail.</p><p id="feedback-error" class="form-error" role="alert"></p><button class="btn primary" type="submit">Enregistrer le suivi</button></form><details class="feedback-history"><summary>Historique (${history.length})</summary>${history.map(entry=>`<p><small>${date(entry.at)} · ${h(entry.action||'Suivi')}</small>${entry.text?`<br>${h(entry.text)}`:''}</p>`).join('')}</details></section></div>`;
}
async function saveNew(formElement){
 const c=context();if(!isAdmin())throw Error('Accès administrateur requis.');
 const values=Object.fromEntries(new FormData(formElement));
 const body=String(values.body||'').trim(),kind=String(values.kind||'');
 if(!kinds[kind]||!body||body.length>3000)throw Error('Précisez votre avis en 3000 caractères maximum.');
 if(pendingCapture&&!values.safe)throw Error('Vérifiez la capture et confirmez qu’elle ne contient aucune donnée sensible.');
 const now=new Date().toISOString(),route=formElement.dataset.route||c.page||'overview',screen=formElement.dataset.screen||document.querySelector('#main-content h1')?.textContent?.trim()||'Portail';
 const row={created_by:c.user.id,client_id:['overview','clients','followup','production-queue','automations','admin-help','feedback'].includes(route)?null:c.clientId||null,kind,body,route,screen,screenshot_data:pendingCapture,status:'new',decision:'pending',history:[{at:now,by:c.user.id,action:'Créé'}]};
 if(c.demo)demoItems.push({...row,id:crypto.randomUUID(),created_at:now,updated_at:now});
 else{const result=await c.sb.from('product_feedback').insert(row);if(result.error)throw Error('Enregistrement impossible. Réessayez.');}
 pendingCapture=null;document.querySelector('#modal-root').innerHTML='';await loadProductFeedback();navigate();toast('Avis enregistré pour revue asynchrone.');
}
async function saveReview(formElement){
 const c=context();if(!isAdmin()||!opened||opened.id!==formElement.dataset.id)throw Error('Revenez au retour.');
 const values=Object.fromEntries(new FormData(formElement));
 const status=String(values.status||''),decision=String(values.decision||''),comment=String(values.comment||'').trim();
 if(!statuses[status]||!decisions[decision]||comment.length>1000)throw Error('Suivi invalide.');
 if(status===opened.status&&decision===opened.decision&&!comment)throw Error('Ajoutez une décision, un statut ou un commentaire.');
 const now=new Date().toISOString(),changes=[];
 if(decision!==opened.decision)changes.push(decisions[decision]);
 if(status!==opened.status)changes.push(statuses[status]);
 if(comment)changes.push('Commentaire');
 const event={at:now,by:c.user.id,action:changes.join(' · '),...(comment?{text:comment}:{})};
 if(c.demo){const row=demoItems.find(item=>item.id===opened.id);Object.assign(row,{status,decision,updated_at:now,history:[...(Array.isArray(row.history)?row.history:[]),event]})}
 else{
  const latest=await c.sb.from('product_feedback').select('history,updated_at').eq('id',opened.id).single();
  if(latest.error)throw Error('Impossible de relire ce retour.');
  const result=await c.sb.from('product_feedback').update({status,decision,updated_at:now,history:[...(Array.isArray(latest.data.history)?latest.data.history:[]),event]}).eq('id',opened.id).eq('updated_at',latest.data.updated_at).select('id');
  if(result.error||result.data?.length!==1)throw Error('Ce retour a changé. Rechargez-le avant de poursuivre.');
 }
 const id=opened.id;await loadProductFeedback();render();await open(id);toast('Suivi enregistré.');
}

document.addEventListener('click',async event=>{
 const control=event.target.closest('[data-feedback]');if(!control)return;
 try{
  if(!isAdmin())throw Error('Accès administrateur requis.');
  if(control.dataset.feedback==='new'){form();const c=context(),formElement=document.querySelector('#feedback-create');formElement.dataset.route=c.page;formElement.dataset.screen=document.querySelector('#main-content h1')?.textContent?.trim()||'Portail';}
  if(control.dataset.feedback==='open')await open(control.dataset.id);
  if(control.dataset.feedback==='capture')document.querySelector('#feedback-file')?.click();
  if(control.dataset.feedback==='clear-capture'){pendingCapture=null;document.querySelector('#feedback-preview').innerHTML='';document.querySelector('.feedback-safe').hidden=true;document.querySelector('#feedback-file').value=''}
 }catch(err){toast(err.message||'Action impossible.',true)}
});
document.addEventListener('change',async event=>{
 if(event.target.id!=='feedback-file')return;
 try{const file=event.target.files?.[0];if(!file)return;pendingCapture=await encodeCapture(file);document.querySelector('#feedback-preview').innerHTML=`<img src="${pendingCapture}" alt="Aperçu de la capture choisie"><button type="button" data-feedback="clear-capture">Retirer la capture</button>`;document.querySelector('.feedback-safe').hidden=false}
 catch(err){pendingCapture=null;event.target.value='';document.querySelector('#feedback-preview').innerHTML='';document.querySelector('.feedback-safe').hidden=true;toast(err.message||'Capture impossible.',true)}
});
document.addEventListener('submit',async event=>{
 if(!['feedback-create','feedback-review'].includes(event.target.id))return;
 event.preventDefault();const formElement=event.target,submit=formElement.querySelector('[type="submit"]');submit.disabled=true;
 try{if(formElement.id==='feedback-create')await saveNew(formElement);else await saveReview(formElement)}
 catch(err){const output=document.querySelector('#feedback-error');if(output)output.textContent=err.message||'Enregistrement impossible.'}
 finally{submit.disabled=false}
});
