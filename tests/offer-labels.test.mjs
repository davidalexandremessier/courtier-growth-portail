import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {offers,offerGroup,offerLabel} from '../src/offers.mjs';
import {offerKey,offerDescriptions} from '../src/entitlements.mjs';
import {offerJourney} from '../src/progress.mjs';

const stored={sprint:'Campagne 97 $',group:'Groupe',individual:'1:1'};

test('les dossiers continuent d’enregistrer les valeurs d’offre existantes',()=>{
 assert.deepEqual(offers.map(o=>o.value),[stored.sprint,stored.group,stored.individual,'Autre']);
 assert.deepEqual(offers.map(o=>o.short),['Sprint 97 $','Accelerator','Expansion 1:1','Autre / à préciser']);
});

test('les anciens noms s’affichent avec les offres actuelles, sans réécrire la valeur',()=>{
 const cases=[
  [stored.sprint,'Sprint 97 $','97',stored.sprint],
  ['Campagne 97$','Sprint 97 $','97',stored.sprint],
  ['97 $','Sprint 97 $','97',stored.sprint],
  ['Installation Meta 97 $','Sprint 97 $','97',stored.sprint],
  ['Onboarding 97 $','Sprint 97 $','97',stored.sprint],
  [stored.group,'Accelerator','group',stored.group],
  ['Croissance groupe','Accelerator','group',stored.group],
  ['Système L.I.S.T. Groupe','Accelerator','group',stored.group],
  ['Système L.I.S.T. · Groupe','Accelerator','group',stored.group],
  [stored.individual,'Expansion 1:1','individual',stored.individual],
  ['Expansion 1:1','Expansion 1:1','individual',stored.individual],
  ['Système L.I.S.T. · 1:1','Expansion 1:1','individual',stored.individual],
 ];
 for(const [value,label,key,group] of cases){
  assert.equal(offerLabel(value),label,value);
  assert.equal(offerLabel(`  ${value}  `),label,value);
  assert.equal(offerKey(value),key,value);
  assert.equal(offerGroup(value),group,value);
 }
 assert.equal(offerLabel(''),'');
 assert.equal(offerLabel('  '),'');
 assert.equal(offerLabel('Offre historique inconnue'),'Offre historique inconnue');
 assert.equal(offerGroup('Offre historique inconnue'),'Autre');
 assert.equal(offerKey('Offre historique inconnue'),'legacy');
 assert.equal(offerLabel('Système L.I.S.T.'),'Système L.I.S.T.');
});

test('les textes d’offre décrivent le Sprint, l’Accelerator et l’Expansion 1:1',()=>{
 assert.equal(offerDescriptions['97'].label,'Sprint 97 $');
 assert.match(offerDescriptions['97'].execution,/Offre d’entrée à petit prix/);
 assert.match(offerDescriptions['97'].execution,/21 jours/);
 assert.equal(offerDescriptions.group.label,'Accelerator');
 assert.match(offerDescriptions.group.execution,/3 mois/);
 assert.match(offerDescriptions.group.execution,/20 à 30 clients/);
 assert.equal(offerDescriptions.individual.label,'Expansion 1:1');
 assert.match(offerDescriptions.individual.execution,/individuel de 3 mois/);
 assert.equal(offerJourney('97 $').name,'Sprint 97 $');
 assert.equal(offerJourney('Système L.I.S.T. Groupe').name,'Accelerator');
 assert.match(offerJourney('Système L.I.S.T. Groupe').description,/20 à 30 clients/);
 assert.equal(offerJourney('1:1').name,'Expansion 1:1');
 assert.match(offerJourney('1:1').description,/3 mois/);
});

test('le choix d’offre d’une annonce affiche le libellé et poste la valeur enregistrée',async()=>{
 const src=await fs.readFile(new URL('../src/communication.js',import.meta.url),'utf8');
 assert.match(src,/<option value="\$\{h\(o\)\}">\$\{h\(offerLabel\(o\)\|\|o\)\}<\/option>/);
});
