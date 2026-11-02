import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {offerLabel} from '../src/offers.mjs';
import {
 ADDONS,BILAN_TAG,FAQ,GHL_LINKS,HANDOFF_PHRASE,LINK_KEYS,LINK_PLACEHOLDERS,
 answerQuestion,joinWaitlist,normalizeTags,openWaitlist,portalHttpsUrl,resourcesCardHtml,
 sprint97Cards,suiteCardHtml,suiteWaitState,supportCardHtml,ticketDraft,visibleAddons,waitlistUpdate
} from '../src/sprint97-portal.mjs';

const A='00000000-0000-4000-8000-00000000000a';
const B='00000000-0000-4000-8000-00000000000b';
const U='10000000-0000-4000-8000-00000000000a';
const V='10000000-0000-4000-8000-00000000000b';
const PUB='https://docs.google.com/document/d/pub-reel/copy';
const PRO='https://docs.google.com/document/d/prospection-reel/copy';
const APP='https://courtiergrowth.com/candidature-accelerator';

test('échelle d’offres inchangée pour le bot et l’affichage',()=>{
 assert.equal(offerLabel('Campagne 97 $'),'Sprint 97 $');
 assert.equal(offerLabel('Groupe'),'Accelerator');
 assert.equal(offerLabel('1:1'),'Expansion 1:1');
 assert.equal(offerLabel('Expansion 1:1'),'Expansion 1:1');
});

test('Mes ressources : seulement les templates achetés, liens configurables',()=>{
 assert.deepEqual(visibleAddons([],{[LINK_KEYS.templatePub]:PUB}),[]);
 assert.equal(resourcesCardHtml([]),'');
 const one=visibleAddons(['CG97-bump-template-pub'],{[LINK_KEYS.templatePub]:PUB,[LINK_KEYS.templateProspection]:PRO});
 assert.deepEqual(one.map(x=>x.label),['Template de pub']);
 assert.equal(one[0].url,PUB);
 const html=resourcesCardHtml(one);
 assert.match(html,/Template de pub/);
 assert.equal(html.includes('Template de prospection'),false);
 assert.match(html,new RegExp(PUB.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.equal(html.includes('PLACEHOLDER'),false);
 const both=sprint97Cards({offer:'Campagne 97 $',tags:ADDONS.map(a=>a.tag),links:{[LINK_KEYS.templatePub]:PUB,[LINK_KEYS.templateProspection]:PRO},waitlist:[],clientId:A});
 assert.match(both.resources,/Template de pub/);
 assert.match(both.resources,/Template de prospection/);
 const pending=resourcesCardHtml(visibleAddons(['CG97-bump-template-prospection'],{}));
 assert.match(pending,/Template de prospection/);
 assert.match(pending,/à configurer/);
 assert.equal(pending.includes('href='),false);
 assert.equal(sprint97Cards({offer:'Groupe',tags:ADDONS.map(a=>a.tag),links:{[LINK_KEYS.templatePub]:PUB},waitlist:[],clientId:A}).resources,'');
 assert.deepEqual(normalizeTags(['CG97-bump-template-pub','inconnu',BILAN_TAG,'CG97-bump-template-pub']),['CG97-bump-template-pub',BILAN_TAG]);
});

test('Ta suite : après le bilan seulement, sans prix ni places',()=>{
 const before=sprint97Cards({offer:'Campagne 97 $',tags:['CG97-bump-template-pub'],links:{[LINK_KEYS.accelerator]:APP},waitlist:[],clientId:A});
 assert.equal(before.suite,'');
 const after=sprint97Cards({offer:'Campagne 97 $',tags:[BILAN_TAG],links:{[LINK_KEYS.accelerator]:APP},waitlist:[],clientId:A});
 assert.match(after.suite,/Candidature Accelerator/);
 assert.match(after.suite,/Liste d'attente Expansion/);
 assert.match(after.suite,new RegExp(APP.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.doesNotMatch(after.suite,/\$|prix|2[\s\u00a0]?000|3[\s\u00a0]?000|4[\s\u00a0]?500|fondateur|rabais|places disponibles/i);
 const waiting=suiteCardHtml({visible:true,acceleratorUrl:null,waitState:'waiting'});
 assert.match(waiting,/Tu es inscrit sur la liste d'attente/);
 assert.match(waiting,/Me retirer de la liste/);
 assert.match(waiting,/Liste d'attente Expansion/);
 assert.equal(waiting.includes("J'accepte la place"),false);
 assert.equal(waiting.includes('cg97-expansion-oui'),false);
 assert.match(waiting,new RegExp(GHL_LINKS.expansion.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(waiting,new RegExp(GHL_LINKS.accelerator.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.doesNotMatch(waiting,/\$|prix|places disponibles/i);
 const offered=suiteCardHtml({visible:true,acceleratorUrl:null,waitState:'offered'});
 assert.match(offered,/J'accepte la place/);
 assert.match(offered,/data-act="waitlist-accept"/);
 assert.equal(offered.includes('Liste d\'attente Expansion'),false);
 assert.equal(offered.includes('cg97-expansion-oui'),false);
 assert.equal(suiteWaitState([{client_id:A,status:'place_offerte'}],A),'offered');
 assert.equal(suiteWaitState([{client_id:A,status:'en_attente'}],A),'waiting');
 assert.equal(suiteCardHtml({visible:false,acceleratorUrl:APP,waitState:'none'}),'');
});

test('liste d’attente : une demande ouverte par client, sans envoi',()=>{
 const now='2026-10-30T15:00:00.000Z';
 const first=joinWaitlist([],A,now);
 assert.equal(first.already,false);
 assert.deepEqual(first.row,{client_id:A,requested_at:now,status:'en_attente'});
 assert.equal('email' in first.row,false);
 const again=joinWaitlist([first.row],A,'2026-10-31T15:00:00.000Z');
 assert.equal(again.already,true);
 assert.equal(again.row,first.row);
 const afterRemoval=joinWaitlist([{client_id:A,status:'retiree',requested_at:now}],A,'2026-11-02T15:00:00.000Z');
 assert.equal(afterRemoval.already,false);
 assert.equal(afterRemoval.row.status,'en_attente');
 assert.equal(openWaitlist([{client_id:A,status:'place_offerte'}],A).status,'place_offerte');
 assert.deepEqual(waitlistUpdate('retiree',now),{status:'retiree',updated_at:now});
 assert.throws(()=>waitlistUpdate('disponible',now),/Statut/);
});

test('FAQ : les 28 questions, une réponse couverte, transfert sinon',()=>{
 assert.equal(FAQ.length,28);
 assert.deepEqual(FAQ.map(x=>x.id),Array.from({length:28},(_,i)=>i+1));
 const pay=answerQuestion('Qui paie la publicité?');
 assert.equal(pay.matched,5);
 assert.equal(pay.handoff,false);
 assert.match(pay.answer,/Meta/);
 assert.doesNotMatch(pay.answer,/tu auras \d+ (leads|demandes)/i);
 const start=answerQuestion('Par où je commence?');
 assert.equal(start.matched,1);
 const refund=answerQuestion('Je veux un remboursement');
 assert.equal(refund.matched,27);
 assert.equal(refund.handoff,true);
 assert.match(refund.answer,/20 leads en 21 jours/);
 const change=answerQuestion('Je veux changer ma pub');
 assert.equal(change.handoff,true);
 const budget=answerQuestion('Je peux changer mon budget?');
 assert.equal(budget.matched,22);
 assert.equal(budget.handoff,false);
 const volume=answerQuestion('Combien de demandes je vais avoir?',{leads:12,spend:340});
 assert.equal(volume.matched,17);
 assert.match(volume.answer,/12 demandes/);
 assert.match(volume.answer,/340 \$ dépensés/);
 assert.match(volume.answer,/Aucune projection/);
 assert.doesNotMatch(volume.answer,/tu vas avoir \d+/i);
 const unknown=answerQuestion('Quelle est la météo à Sept-Îles demain?');
 assert.equal(unknown.matched,null);
 assert.equal(unknown.answer,null);
 assert.equal(unknown.handoff,true);
 const pixel=answerQuestion('Est-ce que je dois partager mon pixel?');
 assert.equal(pixel.matched,4);
 assert.equal(pixel.handoff,false);
});

test('assistant : la phrase de transfert est dans le portail, pas un envoi',()=>{
 const card=supportCardHtml({tickets:[{question:'Je veux annuler',status:'ouvert',reply:null}],result:{saved:true}});
 assert.match(card,/Poser une question/);
 assert.match(card,/Je transfère ta question à l&#39;équipe\. Tu auras une réponse ici d&#39;ici 48 h ouvrables\./);
 assert.match(card,/48 h ouvrables/);
 assert.match(card,/texto ni en privé/);
 assert.match(card,new RegExp(GHL_LINKS.support.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.equal(card.includes('mailto:'),false);
 const draft=ticketDraft('  Où sont   mes leads ?  ',A,U,'2026-10-30T16:00:00.000Z');
 assert.equal(draft.question,'Où sont mes leads ?');
 assert.equal(draft.status,'ouvert');
 assert.equal(draft.created_by,U);
 assert.throws(()=>ticketDraft('?',A,U,'2026-10-30T16:00:00.000Z'),/question/);
});

test('liens https seulement, sans secret, placeholders non cliquables par défaut',()=>{
 assert.equal(portalHttpsUrl(''),null);
 assert.equal(portalHttpsUrl(PUB),PUB);
 assert.throws(()=>portalHttpsUrl('http://docs.google.com/document/d/x'),/https/);
 assert.throws(()=>portalHttpsUrl('https://user:pw@docs.google.com/document/d/x'),/identifiant/);
 assert.throws(()=>portalHttpsUrl('https://docs.google.com/document/d/x?access_token=secret'),/secret/);
 for(const key of ['cg97_lien_template_pub','cg97_lien_template_prospection'])assert.match(LINK_PLACEHOLDERS[key],/PLACEHOLDER/);
 assert.equal(LINK_PLACEHOLDERS.lien_app_accelerator,GHL_LINKS.accelerator);
 assert.equal(portalHttpsUrl(GHL_LINKS.accelerator),GHL_LINKS.accelerator);
 const empty=resourcesCardHtml(visibleAddons(['CG97-bump-template-pub'],{}));
 assert.equal(empty.includes(LINK_PLACEHOLDERS[LINK_KEYS.templatePub]),false);
});

test('l’assistant du portail v2 est sur les pages client Sprint 97 $, sans nouvelle fonction',async()=>{
 const src=await fs.readFile(new URL('../src/v2/main.js',import.meta.url),'utf8');
 assert.match(src,/offerKey\(client\(\)\?\.offer\)==='97'\?supportCardHtml/);
 assert.match(src,/sprint97Cards\(/);
 assert.equal(/\b(mailto:|twilio|sendgrid|nodemailer|service_role)\b/i.test(src),false);
 const api=await fs.readdir(new URL('../api',import.meta.url));
 assert.deepEqual(api,['[slug].js']);
});

test('le module ne déclenche aucun envoi',async()=>{
 const src=await fs.readFile(new URL('../src/sprint97-portal.mjs',import.meta.url),'utf8');
 assert.equal(/\bfetch\s*\(|mailto:|twilio|sendgrid|nodemailer|service_role|SUPABASE_ARCHIVE/i.test(src),false);
 const api=await fs.readdir(new URL('../api',import.meta.url));
 assert.deepEqual(api,['[slug].js']);
});

test('RLS : le client voit ses lignes, l’admin voit tout, pas d’écriture croisée',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema private; create schema auth; create role anon; create role authenticated;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
   create function private.is_admin() returns boolean language sql stable as $$ select current_setting('test.admin',true)='yes' $$;
   create table public.clients(id uuid primary key);
   create table public.client_memberships(client_id uuid, user_id uuid);
   insert into public.clients values('${A}'),('${B}');
   insert into public.client_memberships values('${A}','${U}'),('${B}','${V}');
   grant usage on schema public, auth, private to authenticated;
   grant execute on function auth.uid() to authenticated;
   grant execute on function private.is_admin() to authenticated;`);
  await db.exec(await fs.readFile(new URL('../migrations/20261030_sprint97_portal.sql',import.meta.url),'utf8'));
  await db.exec(`set role authenticated; select set_config('test.user','${U}',false); select set_config('test.admin','no',false)`);
  assert.equal((await db.query('select key from portal_links order by key')).rows.length,3);
  const hidden=await db.query(`update portal_links set url='https://example.com/a' where key='lien_app_accelerator' returning key`);
  assert.equal(hidden.rows.length,0);
  assert.equal((await db.query(`select url from portal_links where key='lien_app_accelerator'`)).rows[0].url,GHL_LINKS.accelerator);
  await assert.rejects(db.exec(`insert into sprint97_client_state(client_id,tags) values('${A}',array['CG97-bilan-livré'])`),/row-level/);
  await db.exec(`insert into expansion_waitlist(client_id,requested_at) values('${A}','2026-10-30T15:00:00Z')`);
  await assert.rejects(db.exec(`insert into expansion_waitlist(client_id,status) values('${B}','en_attente')`),/row-level/);
  await assert.rejects(db.exec(`insert into expansion_waitlist(client_id,status) values('${A}','place_offerte')`),/row-level/);
  await db.exec(`insert into portal_support_tickets(client_id,created_by,question) values('${A}','${U}','Où sont mes leads')`);
  const ticketHidden=await db.query(`update portal_support_tickets set reply='non' where client_id='${A}' returning id`);
  assert.equal(ticketHidden.rows.length,0);
  await assert.rejects(db.exec(`insert into portal_support_tickets(client_id,created_by,question) values('${A}','${V}','Autre personne')`),/row-level/);
  await assert.rejects(db.exec(`insert into portal_support_tickets(client_id,created_by,question) values('${B}','${U}','Dossier voisin')`),/row-level/);
  assert.equal((await db.query('select question from portal_support_tickets')).rows.length,1);
  assert.equal((await db.query('select client_id from expansion_waitlist')).rows.length,1);
  await db.exec(`select set_config('test.user','${V}',false)`);
  assert.equal((await db.query('select * from expansion_waitlist')).rows.length,0);
  assert.equal((await db.query('select * from portal_support_tickets')).rows.length,0);
  await db.exec(`select set_config('test.admin','yes',false)`);
  await db.exec(`insert into sprint97_client_state(client_id,tags) values('${A}',array['CG97-bump-template-pub','CG97-bilan-livré'])`);
  await db.exec(`update expansion_waitlist set status='retiree', updated_at=now() where client_id='${A}'`);
  await db.exec(`update portal_support_tickets set status='repondu', reply='Regarde Formulaires instantanés.', replied_at=now()`);
  await db.exec(`update portal_links set url='${APP}', updated_at=now() where key='lien_app_accelerator'`);
  assert.equal((await db.query('select status from expansion_waitlist')).rows[0].status,'retiree');
  assert.equal((await db.query(`select tags from sprint97_client_state where client_id='${A}'`)).rows[0].tags.length,2);
  assert.equal((await db.query(`select * from portal_support_tickets`)).rows.length,1);
  assert.equal((await db.query(`select * from expansion_waitlist`)).rows.length,1);
 }finally{await db.close()}
});
