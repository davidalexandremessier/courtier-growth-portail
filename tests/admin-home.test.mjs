import test from 'node:test';
import assert from 'node:assert/strict';
import {adminGlobalPage} from '../src/admin-home.mjs';

const clients=[
  {id:'a',name:'Annie & Associés',sector:'Montréal',offer:'Expansion 1:1',status:'Actif',main_constraint:'Valider les faits'},
  {id:'b',name:'Client B',sector:'Québec',offer:'Campagne 97 $',status:'Onboarding',main_constraint:''},
  {id:'c',name:'Client C',sector:'Laval',offer:'Groupe',status:'Actif'},
  {id:'d',name:'Client D',sector:'Estrie',offer:'Autre',status:'Actif'},
  {id:'e',name:'Client E',sector:'Gatineau',offer:'Autre',status:'Actif'}
];
const data={clients,tasks:[{status:'À faire',due_date:'2026-10-18'},{status:'Terminé',due_date:'2026-10-18'}],coachings:[{published:false},{published:true}]};

test('accueil admin : priorités réelles, aperçu court et accès à la liste complète',()=>{
  const html=adminGlobalPage({page:'overview',data,today:'2026-10-19'});
  assert.match(html,/1<\/strong><span>action en retard/);
  assert.match(html,/1<\/strong><span>coaching à publier/);
  assert.match(html,/data-page="followup"/);
  assert.match(html,/data-page="clients"/);
  assert.match(html,/Annie &amp; Associés/);
  assert.doesNotMatch(html,/Client E/);
  assert.doesNotMatch(html,/18 prospects|Camille Laurent/);
});

test('annuaire : filtre et recherche sans perdre les compteurs ni les actions',()=>{
  const html=adminGlobalPage({page:'clients',data,search:'Annie',offerFilter:'1:1',today:'2026-10-19'});
  assert.match(html,/Annie &amp; Associés/);
  assert.doesNotMatch(html,/Client B<\/strong>/);
  assert.match(html,/data-action="open-client" data-id="a"/);
  assert.match(html,/Tous <span>5<\/span>/);
  assert.match(html,/data-action="new-client"/);
});

test('la file visuelle lie une échéance au bon dossier et garde les inconnus distincts de zéro',()=>{
  const html=adminGlobalPage({page:'overview',data:{clients,tasks:[{client_id:'b',title:'Clarifier le formulaire',owner:'David',status:'À faire',due_date:'2026-10-18'}],coachings:[]},today:'2026-10-19'});
  assert.match(html,/Client B · Clarifier le formulaire/);
  assert.match(html,/data-action="open-client" data-id="b"/);
  assert.match(html,/admin-queue-item/);
  assert.match(html,/admin-mobile-nav|admin-action-grid/);
  const unknown=adminGlobalPage({page:'overview',data:{clients},today:'2026-10-19'});
  assert.match(unknown,/À vérifier/);
  assert.doesNotMatch(unknown,/0 actions échues/);
});
