import {offerKey,hasCapability} from './entitlements.mjs';
import {escapeHTML as h} from './model.mjs';
const views=new Map();let refresh;
const definitions={
 resources:['Mes outils',[['overview','Mes accès'],['crm','CRM en ligne'],['crm-mobile','App CRM'],['portal','App portail'],['library','Ressources'],['support','Accompagnement']]],
 kpi:['Mes chiffres',[['overview','Vue d’ensemble'],['journal','Mes journées'],['history','Anciens bilans']]],
 coachings:['Mes rencontres',[['agenda','Agenda'],['group','Groupe'],['recaps','Comptes rendus']]],
 tasks:['Mon plan de match',[['list','Liste'],['all','Tableau Kanban']]],
 onboarding:['Mon parcours',[['journey','Vue d’ensemble'],['overview','Mon démarrage'],['access','Mon accompagnement']]],
 dashboard:['Accueil',[['overview','Ma vue du jour']]],
 david:['David IA',[['overview','Mon assistant · à venir']]],
 team:['Mon équipe',[['overview','Résultats de l’équipe']]],
 connections:['Connexions',[['overview','État des connexions']]],
 calls:['Appels et transcriptions',[['overview','Bibliothèque des appels']]],
 notes:['Notes internes',[['overview','Notes du dossier']]],
 help:['Aide',[['overview','Mes demandes']]],
};
export const sectionView=page=>views.get(page)||definitions[page]?.[1][0][0]||'overview';
export function selectSectionView(page,view){if(definitions[page]?.[1].some(([id])=>id===view))views.set(page,view)}
export function setupSectionNavigation(render){refresh=render}
export function sectionTabs(page,offer,admin=false){if(offerKey(offer)==='97'&&['onboarding','coachings','resources','kpi'].includes(page))return '';if(page==='onboarding'&&sectionView(page)==='journey')return ''; if(['overview','clients','followup','automations','production-queue'].includes(page))return `<nav class="section-tabs" aria-label="Gestion"><strong>Gestion</strong>${[['overview','Vue d’ensemble'],['clients','Clients'],['followup','Clients à suivre'],['production-queue','Production'],['automations','Automatisations']].map(([id,label])=>`<button data-page="${id}" ${page===id?'aria-current="page"':''}>${label}</button>`).join('')}</nav>`;if(['weekly','preparation'].includes(page))return `<nav class="section-tabs" aria-label="Ma progression"><strong>Ma progression</strong>${[['weekly','Bilan de semaine'],['preparation','Préparer une rencontre']].map(([id,label])=>`<button data-page="${id}" ${page===id?'aria-current="page"':''}>${label}</button>`).join('')}</nav>`;if(['messages','announcements','notifications','preferences'].includes(page)){const items=['messages','announcements'].includes(page)?[['messages','Conversation'],['announcements','Annonces']]:[['notifications','Notifications'],['preferences','Mes préférences']];return `<nav class="section-tabs" aria-label="${items[0][0]==='messages'?'Échanges':'Notifications'}"><strong>${items[0][0]==='messages'?'Échanges':'Notifications'}</strong>${items.map(([id,label])=>`<button data-page="${id}" ${page===id?'aria-current="page"':''}>${label}</button>`).join('')}</nav>`}const d=definitions[page];if(!d||d[1].length<2)return '';return `<nav class="section-tabs" aria-label="Sous-sections ${h(d[0])}"><strong>${h(d[0])}</strong>${d[1].map(([id,label])=>`<button data-section="${page}" data-view="${id}" ${sectionView(page)===id?'aria-current="page"':''}>${h(label)}</button>`).join('')}${page==='coachings'?'<button data-page="preparation">Préparer ma rencontre</button>':''}</nav>`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-section]');if(!b||!definitions[b.dataset.section]?.[1].some(([id])=>id===b.dataset.view))return;views.set(b.dataset.section,b.dataset.view);refresh?.();document.querySelector(`[data-section="${b.dataset.section}"][data-view="${b.dataset.view}"]`)?.focus()});
export function applySectionView(page,offer){if(offerKey(offer)==='97'&&['onboarding','coachings','resources','kpi'].includes(page))return;const v=sectionView(page),main=document.querySelector('#main-content');if(!main)return;
 if(page==='kpi'){const nodes=[...main.children];const journal=nodes.find(n=>n.querySelector('h2')?.textContent==='Journal de saisie'),legacy=main.querySelector('.legacy-reports');for(const n of nodes){if(n.classList.contains('page-heading')||n.id==='portal-reminders')continue;n.hidden=v==='journal'?n!==journal:v==='history'?n!==legacy:n===legacy||n===journal}if(v==='history'&&legacy)legacy.open=true;}
 if(page==='coachings'&&v!=='overview'){const allowed={agenda:'.appointment-agenda',group:'.group-coaching-card',recaps:'.coaching-grid,.empty'}[v];for(const n of main.children){if(n.classList.contains('page-heading')||n.id==='portal-reminders')continue;n.hidden=!n.matches(allowed)}if(!main.querySelector(allowed))main.insertAdjacentHTML('beforeend','<section class="section-empty panel"><h2>Rien à afficher pour le moment.</h2><p>Les éléments disponibles apparaîtront dans cette section.</p></section>')}
 if(page==='onboarding'&&v!=='journey'){const access=main.querySelector('.client-access');for(const n of main.children){if(n.classList.contains('page-heading')||n.id==='portal-reminders')continue;n.hidden=v==='access'?n!==access:n===access}}
}
