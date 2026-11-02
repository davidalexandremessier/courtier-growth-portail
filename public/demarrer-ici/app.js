const PILOT='DsPXZp1SUaWntQvf0OTU';
const AGENCY=document.body.dataset.vue==='agence';
const qs=new URLSearchParams(location.search);
const locationId=(qs.get('location_id')||'').trim();
const app=document.querySelector('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SAFE_TYPES=new Set(['text','email','tel','select']);
const st={data:null,step:1,error:'',message:'',fields:{},help:false,busy:false,agency:null};

function shell(body){
 return `<header class="top di-top"><div class="brand">Courtier<span>Growth</span></div><span class="chip gold">Pilote</span></header><main class="main di-main" id="contenu">${body}</main>`;
}
function banner(text,kind){return `<p class="${kind==='error'?'error':'notice'} di-banner">${esc(text)}</p>`}

async function api(path,body,token){
 const headers={};
 if(body)headers['Content-Type']='application/json';
 if(token)headers.Authorization='Bearer '+token;
 const response=await fetch(path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});
 let payload={};
 try{payload=await response.json()}catch{}
 if(!response.ok){
  const error=new Error(payload.error||'Service indisponible.');
  error.fields=payload.fields||null;
  error.blockingId=payload.blockingId||null;
  throw error;
 }
 return payload;
}

function portalToken(){
 try{
  for(let i=0;i<localStorage.length;i++){
   const key=localStorage.key(i);
   if(!/^sb-.+-auth-token$/.test(key||''))continue;
   const parsed=JSON.parse(localStorage.getItem(key)||'');
   const token=parsed?.access_token||parsed?.currentSession?.access_token;
   if(typeof token==='string'&&token)return token;
  }
 }catch{}
 return '';
}

function sourceLabel(step){
 if(step.status==='valide'&&step.source==='auto')return 'Validé par la vérification';
 if(step.status==='valide'&&step.source==='agence')return 'Validé par l’agence';
 return '';
}

function renderClient(){
 const data=st.data;
 if(!data){
  app.innerHTML=shell(`<div class="auth-card card"><h1>Démarrer ici</h1><p class="error">${esc(st.error||'Chargement impossible.')}</p></div>`);
  return;
 }
 const current=data.steps.find(step=>step.id===st.step)||data.steps[0];
 const block=data.blocking;
 const dots=data.steps.map(step=>{
  const cls=step.status==='valide'||step.status==='non_applicable'?'done':step.status==='besoin_aide'?'help':'';
  return `<button type="button" class="di-dot ${cls}" data-go="${step.id}" aria-current="${step.id===current.id?'step':'false'}" aria-label="Étape ${step.id}, ${esc(step.title)}, ${esc(step.statusLabel)}">${step.id}</button>`;
 }).join('');
 const rail=data.steps.map(step=>{
  const cls=step.status==='valide'||step.status==='non_applicable'?'done':step.id===current.id?'now':'';
  return `<li class="step ${cls}"><button type="button" class="di-jump" data-go="${step.id}"><span class="dot-step">${step.id}</span><span class="step-body"><strong>${esc(step.title)}</strong><span>${esc(step.statusLabel)}</span></span></button></li>`;
 }).join('');
 const notices=[
  data.checks==='manuel'?banner('Les vérifications automatiques ne sont pas branchées pour ce compte. L’agence confirme les étapes. Un clic ne les valide pas.'):'',
  data.storage==='indisponible'?banner('La progression ne peut pas encore être enregistrée.'):'',
  st.message?`<p class="toast">${esc(st.message)}</p>`:'',
  st.error?`<p class="error">${esc(st.error)}</p>`:''
 ].join('');
 const proven=sourceLabel(current);
 app.innerHTML=shell(`
  <p class="kicker">Avant l’appel technique</p>
  <div class="di-kicker"><h1>Démarrer ici</h1><p class="muted di-count">${data.progress.done} sur ${data.progress.total}</p></div>
  <p class="muted">Une étape à la fois. La progression reste liée à ce sous-compte de test.</p>
  ${notices}
  <div class="di-dots" role="tablist" aria-label="Étapes">${dots}</div>
  <div class="di-layout">
   <aside class="rail-card di-rail"><div class="rail-head"><h2>Parcours</h2><p class="muted">${data.progress.done}/${data.progress.total}</p></div><ol class="rail">${rail}</ol></aside>
   <article class="card di-step" aria-labelledby="etape-titre">
    <p class="kicker">Étape ${current.id}${current.optional?' · facultative':''}</p>
    <div class="section-head"><h2 id="etape-titre">${esc(current.title)}</h2><span class="chip ${esc(current.chip)}">${esc(current.statusLabel)}</span></div>
    ${proven?`<p class="small muted">${esc(proven)}</p>`:''}
    <p class="lead">${esc(current.summary)}</p>
    ${current.consignes?`<p class="di-note">${esc(current.consignes)}</p>`:''}
    ${current.detail?`<p class="notice di-note">${esc(current.detail)}</p>`:''}
    ${stepBody(current,data)}
   </article>
  </div>
  <div class="di-foot">
   <button type="button" class="secondary" data-act="verifier" ${st.busy?'disabled':''}>Lancer la vérification</button>
   <button type="button" class="link" data-act="aide">Besoin d’aide</button>
  </div>
  <p class="small muted">L’aide indique l’étape qui bloque${block?` : ${esc(block.title)}`:''}.</p>
  <p class="small"><a href="/demarrer-ici/agence">Suivi de l’agence</a></p>
  ${helpDialog(data)}`);
 bind();
}

function stepBody(step){
 const links=step.actions.filter(action=>action.kind==='lien'&&action.href);
 const form=step.actions.some(action=>action.kind==='formulaire');
 const ask=step.actions.find(action=>action.kind==='demande');
 const parts=[];
 if(form)parts.push(brokerForm(step));
 if(links.length){
  parts.push(`<div class="di-actions">${links.map(action=>`<a class="primary" href="${esc(action.href)}" target="_blank" rel="noopener noreferrer">${esc(action.label)}</a>`).join('')}<p class="small muted">S’ouvre dans un nouvel onglet, sur la page concernée.</p></div>`);
 }
 if(ask)parts.push(`<div class="di-actions"><button type="button" class="primary" data-act="signaler" data-step="${step.id}" ${st.busy?'disabled':''}>${esc(ask.label)}</button></div>`);
 if(step.signaler&&!ask)parts.push(`<button type="button" class="secondary" data-act="signaler" data-step="${step.id}">${esc(step.signaler)}</button>`);
 if(step.decliner)parts.push(`<button type="button" class="link" data-act="decliner" data-step="${step.id}">${esc(step.decliner)}</button>`);
 return parts.join('');
}

function brokerForm(step){
 const broker=st.data.broker||{};
 const fields=step.fields.filter(field=>SAFE_TYPES.has(field.type)&&!/password|token|secret/i.test(field.name));
 const inputs=fields.map(field=>{
  const value=broker[field.name]||'';
  const err=st.fields?.[field.name];
  const control=field.type==='select'
   ? `<select name="${esc(field.name)}" required><option value="">Choisir</option>${field.options.map(([v,label])=>`<option value="${esc(v)}"${v===value?' selected':''}>${esc(label)}</option>`).join('')}</select>`
   : `<input name="${esc(field.name)}" type="${esc(field.type)}" autocomplete="${esc(field.autocomplete||'on')}" value="${esc(value)}" required>`;
  return `<label>${esc(field.label)}${control}${err?`<small>${esc(err)}</small>`:''}</label>`;
 }).join('');
 return `<form class="entry" data-form="broker"><p class="small muted">Aucun mot de passe, aucun jeton.</p>${inputs}<button class="primary" type="submit" ${st.busy?'disabled':''}>Enregistrer mes informations</button></form>`;
}

function helpDialog(data){
 const block=data.blocking;
 const text=block?`L’étape qui bloque : ${block.title}.`:'Aucune étape ne bloque le parcours. Vous pouvez quand même écrire à l’agence.';
 if(!st.help)return '';
 return `<dialog class="sheet"><form method="dialog" data-form="aide"><h2>Besoin d’aide</h2><p>${esc(text)}</p><label>Qu’est-ce qui bloque ?<textarea name="note" maxlength="500" required rows="4"></textarea></label><div class="di-actions"><button class="primary" type="submit">Envoyer à l’agence</button><button class="secondary" type="button" data-act="fermer">Fermer</button></div></form></dialog>`;
}

function bind(){
 app.querySelectorAll('[data-go]').forEach(node=>node.addEventListener('click',()=>{st.step=Number(node.dataset.go);st.error='';renderClient()}));
 const verifier=app.querySelector('[data-act=verifier]');
 if(verifier)verifier.addEventListener('click',()=>run('verifier',{}));
 const aide=app.querySelector('[data-act=aide]');
 if(aide)aide.addEventListener('click',()=>{st.help=true;st.error='';renderClient()});
 const close=app.querySelector('[data-act=fermer]');
 if(close)close.addEventListener('click',()=>{st.help=false;renderClient()});
 app.querySelectorAll('[data-act=signaler]').forEach(node=>node.addEventListener('click',()=>run('signaler',{step:Number(node.dataset.step)})));
 app.querySelectorAll('[data-act=decliner]').forEach(node=>node.addEventListener('click',()=>run('ne_sapplique_pas',{step:Number(node.dataset.step)})));
 const broker=app.querySelector('[data-form=broker]');
 if(broker)broker.addEventListener('submit',event=>{
  event.preventDefault();
  const data=Object.fromEntries(new FormData(broker));
  run('enregistrer',{broker:data});
 });
 const help=app.querySelector('[data-form=aide]');
 if(help)help.addEventListener('submit',event=>{
  event.preventDefault();
  run('aide',{note:new FormData(help).get('note')});
 });
 const dialog=app.querySelector('dialog');
 if(dialog)dialog.showModal();
}

async function run(action,extra){
 st.busy=true;st.error='';st.fields={};st.message='';
 renderClient();
 try{
  st.data=await api('/api/demarrer-ici',{action,location_id:locationId,...extra});
  st.help=false;
  st.message=action==='verifier'?'Vérification terminée.':'Progression enregistrée.';
  const block=st.data.blocking;
  if(block&&(action==='enregistrer'||action==='signaler'||action==='ne_sapplique_pas'))st.step=block.id;
 }catch(error){
  st.error=error.message;
  st.fields=error.fields||{};
  if(extra.broker&&st.data)st.data={...st.data,broker:{...st.data.broker,...extra.broker}};
  if(error.blockingId)st.step=error.blockingId;
 }finally{
  st.busy=false;
  renderClient();
 }
}

function renderGate(message){
 app.innerHTML=shell(`<div class="card" style="max-width:560px"><p class="kicker">Agence</p><h1>Suivi du parcours</h1><p class="lead">${esc(message)}</p><div class="di-actions"><a class="primary" href="/">Se connecter au portail</a><button type="button" class="secondary" id="reessayer">Réessayer</button></div><p class="small muted">Utilisez le même navigateur qu’une session administrateur du portail. Cette page ne demande pas un nouveau mot de passe.</p></div>`);
 document.querySelector('#reessayer').addEventListener('click',loadAgency);
}

function renderAgency(){
 const data=st.agency;
 const cards=(data.locations||[]).map(row=>{
  const steps=row.steps.map(step=>`<div class="di-row"><div class="section-head"><strong>${step.id}. ${esc(step.title)}</strong><span class="chip ${step.status==='valide'?'green':step.status==='besoin_aide'?'red':step.status==='en_attente'?'yellow':step.status==='non_applicable'?'gold':'neutral'}">${esc(step.statusLabel)}</span></div>${step.detail?`<p class="small">${esc(step.detail)}</p>`:''}<div class="di-buttons">${agencyButtons(row.locationId,step)}</div></div>`).join('');
  return `<article class="card di-agency"><p class="kicker">${esc(row.broker.nom||'Courtier pas encore inscrit')}</p><h2>${esc(row.broker.entreprise||'Sous-compte de test')}</h2><p class="meta"><span class="chip ink">${row.progress.done} sur ${row.progress.total}</span>${row.blocking?`<span class="chip red">Bloque : ${esc(row.blocking.title)}</span>`:'<span class="chip green">Rien ne bloque</span>'}</p><p><strong>Prochaine action.</strong> ${esc(row.nextAction)}</p>${row.help?`<p class="notice">Aide, étape ${row.help.stepId} : ${esc(row.help.note)}</p>`:''}${row.broker.courriel?`<p class="small muted">${esc(row.broker.courriel)} · ${esc(row.broker.telephone||'')}</p>`:''}<p class="small muted">Vérifications : ${data.checks==='auto'?'automatiques':'manuelles, jeton de lecture absent'}. Sauvegarde : ${esc(data.storage)}.</p>${steps}</article>`;
 }).join('');
 app.innerHTML=shell(`<p class="kicker">Agence</p><h1>Suivi — Démarrer ici</h1>${st.message?`<p class="toast">${esc(st.message)}</p>`:''}${st.error?`<p class="error">${esc(st.error)}</p>`:''}${data.checks==='manuel'?banner('Aucun jeton de lecture pour ce sous-compte. Les étapes restent en vérification manuelle tant que GHL_PILOT_LOCATION_TOKEN n’est pas posé.'):''}${cards}<p class="small"><a href="/demarrer-ici?location_id=${encodeURIComponent(PILOT)}">Ouvrir le parcours test</a></p>`);
 app.querySelectorAll('[data-statut]').forEach(node=>node.addEventListener('click',()=>agencyStatus(node)));
}

function agencyButtons(location,step){
 const button=(status,label)=>`<button type="button" class="secondary" data-statut="${esc(status)}" data-location="${esc(location)}" data-step="${step.id}">${label}</button>`;
 return [
  button('valide','Valider'),
  button('a_faire','Remettre à faire'),
  button('besoin_aide','Besoin d’aide'),
  step.optional?button('non_applicable','Non applicable'):''
 ].join('');
}

async function agencyStatus(node){
 const status=node.dataset.statut;
 let note='';
 if(status==='besoin_aide'||status==='valide'){
  note=window.prompt(status==='valide'?'Note de validation (facultative)':'Décrivez le blocage','')??'';
  if(status==='besoin_aide'&&note.trim().length<3){st.error='Une note est requise pour Besoin d’aide.';renderAgency();return}
 }
 st.error='';st.message='';
 try{
  const token=portalToken();
  const payload=await api('/api/demarrer-ici',{action:'agence',location_id:node.dataset.location,step:Number(node.dataset.step),status,note},token);
  const list=st.agency.locations.map(row=>row.locationId===payload.location.locationId?payload.location:row);
  st.agency={...st.agency,locations:list,checks:payload.checks,storage:payload.storage};
  st.message='Statut enregistré.';
 }catch(error){st.error=error.message}
 renderAgency();
}

async function loadClient(){
 if(!locationId){
  app.innerHTML=shell(`<div class="card" style="max-width:640px"><p class="kicker">Courtier Growth</p><h1>Démarrer ici</h1><p class="lead">Ouvrez ce parcours depuis le menu de votre compte GoHighLevel. Le lien doit contenir l’identifiant du sous-compte.</p><p class="notice">Pilote réservé à un seul sous-compte de test. Aucun compte client n’est modifié.</p></div>`);
  return;
 }
 try{
  st.data=await api('/api/demarrer-ici?location_id='+encodeURIComponent(locationId));
  st.step=st.data.blocking?.id||1;
  renderClient();
 }catch(error){
  st.error=error.message;
  renderClient();
 }
}

async function loadAgency(){
 const token=portalToken();
 if(!token)return renderGate('Connectez-vous au portail avec un compte administrateur, puis revenez sur cette page.');
 try{
  st.agency=await api('/api/demarrer-ici?vue=agence',null,token);
  renderAgency();
 }catch(error){
  renderGate(error.message==='Connexion requise.'||error.message==='Accès administrateur requis.'||error.message==='Session expirée.'?error.message+' Revenez après vous être connecté au portail.':error.message);
 }
}

if(AGENCY)loadAgency();else loadClient();
