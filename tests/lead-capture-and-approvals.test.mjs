import test from 'node:test';
import assert from 'node:assert/strict';
import {leadCaptureState,countsLeadFrom,connectedDayProposal} from '../src/lead-capture.mjs';
import {cleanCampaign97Settings} from '../src/campaign97.mjs';
import {checkMatchesCurrentVersion,cleanProfile} from '../src/production.mjs';
import {JSDOM} from 'jsdom';

test('la source des demandes dépend du formulaire de la campagne, indépendamment de l’offre',()=>{
 const meta=leadCaptureState('facebook_instant_form'),ghl=leadCaptureState('ghl_funnel_form');
 assert.equal(meta.provider,'meta_instant_forms');
 assert.equal(meta.permission,'leads_retrieval');
 assert.equal(ghl.provider,'ghl');
 assert.equal(ghl.permission,null);
 assert.match(ghl.description,/Aucun droit Meta/);
 assert.equal(meta.connected,false);
 assert.equal(ghl.connected,false);
 assert.equal(leadCaptureState(undefined).provider,null);
 assert.equal(countsLeadFrom('facebook_instant_form','meta_instant_forms'),true);
 assert.equal(countsLeadFrom('facebook_instant_form','ghl'),false);
 assert.equal(countsLeadFrom('ghl_funnel_form','ghl'),true);
 assert.equal(countsLeadFrom('ghl_funnel_form','meta_instant_forms'),false);
 assert.equal(countsLeadFrom(null,'ghl'),false);
 assert.equal(cleanCampaign97Settings({lead_capture_mode:'ghl_funnel_form'}).lead_capture_mode,'ghl_funnel_form');
 assert.equal(cleanProfile({settings:{lead_capture_mode:'facebook_instant_form'}}).settings.lead_capture_mode,'facebook_instant_form');
 assert.throws(()=>cleanCampaign97Settings({lead_capture_mode:'other'}),/Type de formulaire/);
 assert.throws(()=>cleanProfile({settings:{lead_capture_mode:'other'}}),/Type de formulaire/);
});

test('une lecture GHL ne propose des leads que pour un formulaire funnel GHL',()=>{
 const day={leads:7,appointments_due:3,attended:2,spend:40};
 assert.deepEqual(connectedDayProposal('ghl','ghl_funnel_form',day),{leads:7,appointments_due:3,attended:2});
 assert.deepEqual(connectedDayProposal('ghl','facebook_instant_form',day),{appointments_due:3,attended:2});
 assert.deepEqual(connectedDayProposal('ghl',null,day),{appointments_due:3,attended:2});
 assert.deepEqual(connectedDayProposal('meta','facebook_instant_form',day),{spend:40});
});

test('les dossiers Meta et GHL indiquent la bonne provenance sans annoncer un import actif',async()=>{
 const dom=new JSDOM('<!doctype html><main></main>'),prior=global.document;global.document=dom.window.document;
 try{
 const {setupCampaign97,campaign97Page}=await import('../src/campaign97-ui.js');
 const {setupProduction,selectProductionView,productionPage}=await import('../src/production-ui.js');
 const base={user:{id:'u'},clientId:'a',admin:true,previewClient:false};
 const c97={...base,data:{clients:[{id:'a',offer:'Campagne 97 $',name:'Client fictif'}],campaign97_available:true,campaign97_settings:[{id:'s',client_id:'a',version:1,data:{lead_capture_mode:'ghl_funnel_form'}}],campaign97_events:[]}};
 setupCampaign97({context:()=>c97});
 const ghl=campaign97Page('leads97');
 assert.match(ghl,/Formulaire du funnel/);
 assert.match(ghl,/Aucun droit Meta/);
 assert.doesNotMatch(ghl,/connecté · actif|Import Meta si autorisé/);
 c97.data.campaign97_settings[0].data.lead_capture_mode='facebook_instant_form';
 const meta=campaign97Page('leads97');
 assert.match(meta,/Formulaire instantané Facebook/);
 assert.match(meta,/leads_retrieval/);
 const profile={id:'p',client_id:'a',version:1,created_at:'2026-10-20T12:00:00Z',data:cleanProfile({territory:'Québec',settings:{lead_capture_mode:'ghl_funnel_form'}})};
 const c11={...base,data:{clients:[{id:'a',offer:'Expansion 1:1',name:'Client fictif'}],growth_available:true,growth_profiles:[profile],growth_packets:[]}};
 setupProduction({context:()=>c11});selectProductionView('u','a','profile');
 assert.match(productionPage(),/Formulaire du funnel/);
 }finally{global.document=prior;dom.window.close()}
});

test('un accord ancien ne s’applique ni à un nouveau texte, ni à une nouvelle fiche ou preuve documentaire',()=>{
 const old={check_key:'client_approval',profile_id:'p1',packet_id:'copy-v1',document_manifest:[]};
 const state={profile:{id:'p1'},packet:{id:'copy-v1'},growth_documents:[],growth_qa_tests:[]};
 assert.equal(checkMatchesCurrentVersion(old,'client_approval',state),true);
 assert.equal(checkMatchesCurrentVersion(old,'client_approval',{...state,packet:{id:'copy-v2'}}),false);
 assert.equal(checkMatchesCurrentVersion(old,'client_approval',{...state,profile:{id:'p2'}}),false);
 assert.equal(checkMatchesCurrentVersion(old,'client_approval',{...state,growth_documents:[{id:'visual-v2',internal:false,uploaded_at:'2026-10-20',category:'creative'}]}),false);
 const final={check_key:'final',profile_id:'p1',packet_id:'copy-v1',document_manifest:[],qa_manifest:['qa-1']};
 assert.equal(checkMatchesCurrentVersion(final,'final',{...state,growth_qa_tests:[{id:'qa-1',packet_id:'copy-v1',case_key:'capture',version:1}]}),true);
 assert.equal(checkMatchesCurrentVersion(final,'final',{...state,growth_qa_tests:[{id:'qa-2',packet_id:'copy-v1',case_key:'capture',version:2}]}),false);
});
