import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import dispatch from '../api/[slug].js';
import {CallError} from '../server/calls.mjs';
import {handleDemarrerIci,memoryStore} from '../server/demarrer-ici.mjs';
import {pilotToken,runChecks} from '../server/demarrer-ici-checks.mjs';
import {PILOT_LOCATION_IDS,emptyProgress,ghlLink,publicView} from '../src/demarrer-ici/model.mjs';
import {classifyPublishedWorkflows,workflowMayStayPublished} from '../src/demarrer-ici/workflows.mjs';

const PILOT=PILOT_LOCATION_IDS[0];
const CENTRAL='3dojB6zA4kH0xUBvGzEJ';
const TOKEN='pit-TEST-DO-NOT-LEAK-000000';
const broker={nom:'Camille Tremblay',courriel:'camille@example.test',telephone:'514 555-0199',entreprise:'Tremblay immobilier',secteur:'residentiel',territoire:'Montréal et Rive-Nord',fuseau:'America/Toronto'};

function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(b){this.body=b;return this}}}
function stamp(seconds){return new Date(Date.parse('2026-11-02T16:00:00Z')+seconds*1000).toISOString()}

function harness(){
 const store=memoryStore();
 const buckets=new Map();
 let now=stamp(0);
 const ctx={store,buckets,env:{},now:()=>now,setNow(seconds){now=stamp(seconds)},authenticate(req){if(req.headers.authorization!=='Bearer admin-test')throw new CallError('Connexion requise.',401)}};
 return ctx;
}
function call(ctx,method,extra={}){
 const res=response();
 const req={method,headers:extra.headers||{},query:extra.query||{},body:extra.body||{}};
 return handleDemarrerIci(req,res,{store:ctx.store,buckets:ctx.buckets,env:extra.env||ctx.env,now:ctx.now(),authenticate:ctx.authenticate,runChecks:extra.runChecks,fetchImpl:extra.fetchImpl}).then(()=>res);
}

test('liste blanche : un seul sous-compte, même refus pour les autres',async()=>{
 const ctx=harness();
 const missing=await call(ctx,'GET',{query:{}});
 assert.equal(missing.statusCode,400);
 const other=await call(ctx,'GET',{query:{location_id:CENTRAL}});
 const random=await call(ctx,'GET',{query:{location_id:'AAAAAAAAAAAAAAA'}});
 assert.equal(other.statusCode,404);
 assert.deepEqual(other.body,random.body);
 assert.equal(other.body.error,'Ce parcours n’est pas disponible pour ce compte.');
 const ok=await call(ctx,'GET',{query:{location_id:PILOT}});
 assert.equal(ok.statusCode,200);
 assert.equal(ok.body.locationId,PILOT);
 assert.equal(ok.body.checks,'manuel');
 assert.equal(ok.body.steps.length,9);
 assert.equal(JSON.stringify(ok.body).includes('password'),false);
});

test('le formulaire valide sans mot de passe, un clic ne valide pas',async()=>{
 const ctx=harness();
 const refused=await call(ctx,'POST',{body:{action:'enregistrer',location_id:PILOT,broker:{...broker,password:'ne-pas-garder'}}});
 assert.equal(refused.statusCode,400);
 assert.match(refused.body.fields.form,/mot de passe/);
 const saved=await call(ctx,'POST',{body:{action:'enregistrer',location_id:PILOT,broker}});
 assert.equal(saved.statusCode,200);
 assert.equal(saved.body.steps[0].status,'valide');
 assert.equal(saved.body.steps[0].source,'auto');
 assert.equal(saved.body.broker.telephone,'+15145550199');
 ctx.setNow(5);
 const clicked=await call(ctx,'POST',{body:{action:'signaler',location_id:PILOT,step:3,status:'valide'}});
 assert.equal(clicked.statusCode,200);
 assert.equal(clicked.body.steps[2].status,'en_attente');
 assert.equal(clicked.body.steps[2].source,null);
 assert.notEqual(clicked.body.steps[2].status,'valide');
});

test('l’aide nomme l’étape bloquante et l’ancienne liste ne bloque pas',async()=>{
 const ctx=harness();
 const help=await call(ctx,'POST',{body:{action:'aide',location_id:PILOT,note:'Je ne trouve pas mon secteur.'}});
 assert.equal(help.statusCode,200);
 assert.equal(help.body.help.stepId,1);
 assert.equal(help.body.blocking.id,1);
 assert.equal(help.body.steps[0].status,'besoin_aide');
 const skip=await call(ctx,'POST',{body:{action:'ne_sapplique_pas',location_id:PILOT,step:3}});
 assert.equal(skip.statusCode,409);
 assert.match(skip.body.error,/obligatoire/);
 ctx.setNow(3);
 const optional=await call(ctx,'POST',{body:{action:'ne_sapplique_pas',location_id:PILOT,step:7}});
 assert.equal(optional.body.steps[6].status,'non_applicable');
 assert.equal(optional.body.blocking.id,1);
});

test('la validation finale attend les étapes obligatoires, puis l’agence',async()=>{
 const ctx=harness();
 const early=await call(ctx,'POST',{body:{action:'signaler',location_id:PILOT,step:9}});
 assert.equal(early.statusCode,409);
 assert.match(early.body.error,/Infos du courtier/);
 for(const step of [1,2,3,4,5,6,8]){
  ctx.setNow(step);
  if(step===1)await call(ctx,'POST',{body:{action:'enregistrer',location_id:PILOT,broker}});
  else {
   const updated=await call(ctx,'POST',{headers:{authorization:'Bearer admin-test'},body:{action:'agence',location_id:PILOT,step,status:'valide',note:'Confirmé en test.'}});
   assert.equal(updated.statusCode,200,updated.body?.error);
  }
 }
 ctx.setNow(20);
 await call(ctx,'POST',{body:{action:'ne_sapplique_pas',location_id:PILOT,step:7}});
 const asked=await call(ctx,'POST',{body:{action:'signaler',location_id:PILOT,step:9}});
 assert.equal(asked.body.steps[8].status,'en_attente');
 const done=await call(ctx,'POST',{headers:{authorization:'Bearer admin-test'},body:{action:'agence',location_id:PILOT,step:9,status:'valide',note:'Parcours vérifié.'}});
 assert.equal(done.body.location.steps[8].status,'valide');
 assert.equal(done.body.location.steps[8].source,'agence');
 assert.equal(done.body.location.blocking,null);
 const list=await call(ctx,'GET',{headers:{authorization:'Bearer admin-test'},query:{vue:'agence'}});
 assert.equal(list.statusCode,200);
 assert.equal(list.body.locations.length,1);
 assert.equal(list.body.locations[0].progress.done,9);
 const stranger=await call(ctx,'GET',{query:{vue:'agence'}});
 assert.equal(stranger.statusCode,401);
});

test('sans jeton du sous-compte test, aucune lecture et vérification manuelle',async()=>{
 const ctx=harness();
 let called=0;
 const env={GHL_CENTRAL_TOKEN:TOKEN,GHL_DANIEL_TOKEN:TOKEN};
 assert.equal(pilotToken(env,PILOT),'');
 assert.equal(pilotToken({GHL_PILOT_LOCATION_TOKEN:TOKEN},CENTRAL),'');
 const result=await call(ctx,'POST',{env,body:{action:'verifier',location_id:PILOT},fetchImpl(){called++;throw new Error('ne pas appeler')}});
 assert.equal(called,0);
 assert.equal(result.statusCode,200);
 assert.equal(result.body.checks,'manuel');
 assert.match(result.body.steps[2].detail,/Vérification manuelle par l’agence/);
 assert.equal(result.body.steps[2].status,'a_faire');
 assert.equal(JSON.stringify(result.body).includes(TOKEN),false);
});

test('les lectures automatiques ne valident que ce que l’API peut prouver',async()=>{
 const ctx=harness();
 await call(ctx,'POST',{body:{action:'enregistrer',location_id:PILOT,broker}});
 const data=fixture();
 const {fetchImpl,calls}=mockFetch(data);
 const env={GHL_PILOT_LOCATION_TOKEN:TOKEN};
 ctx.setNow(4);
 const result=await call(ctx,'POST',{env,body:{action:'verifier',location_id:PILOT},fetchImpl});
 assert.equal(result.statusCode,200);
 assert.equal(result.body.steps[1].status,'valide');
 assert.equal(result.body.steps[2].status,'en_attente');
 assert.match(result.body.steps[2].detail,/identité/);
 assert.equal(result.body.steps[3].status,'en_attente');
 assert.match(result.body.steps[3].detail,/mapping/);
 assert.equal(result.body.steps[4].status,'a_faire');
 assert.match(result.body.steps[4].detail,/Google Agenda/);
 assert.equal(result.body.steps[5].status,'valide');
 assert.equal(calls.some(item=>item.method!=='GET'),false);
 assert.equal(calls.some(item=>/purchase|messages/i.test(item.href)),false);
 assert.equal(calls.filter(item=>item.href.includes('leadconnectorhq.com')).every(item=>item.authorization==='Bearer '+TOKEN),true);
 assert.equal(calls.filter(item=>item.href.includes('courtiergrowth.com')).every(item=>item.authorization===''),true);
 assert.equal(JSON.stringify(result.body).includes(TOKEN),false);
 data.workflows={workflows:[{name:'Centris — Nouveau lead',status:'published'}]};
 const again=mockFetch(data);
 ctx.setNow(8);
 const downgraded=await call(ctx,'POST',{env,body:{action:'verifier',location_id:PILOT},fetchImpl:again.fetchImpl});
 assert.equal(downgraded.body.steps[1].status,'a_faire');
 assert.match(downgraded.body.steps[1].detail,/Centris/);
});

test('les boutons mènent à une vraie page, jamais à un mot de passe',async()=>{
 const view=publicView(emptyProgress(PILOT,'2026-11-02T16:00:00Z'));
 const paths={2:'/automation/workflows',3:'/settings/phone_system',4:'/settings/integrations',5:'/calendars',6:'/settings/domain',7:'/contacts/import'};
 for(const step of view.steps){
  for(const field of step.fields)assert.notEqual(field.type,'password');
  for(const action of step.actions){
   if(action.kind!=='lien')continue;
   const url=new URL(action.href);
   assert.equal(url.protocol,'https:');
   if(step.id===8)assert.match(url.hostname,/apple\.com|play\.google\.com/);
   else {
    assert.equal(url.hostname,'app.gohighlevel.com');
    assert.ok(url.pathname.startsWith('/v2/location/'+PILOT+'/'));
    assert.match(url.pathname,new RegExp(paths[step.id]));
   }
  }
 }
 assert.equal(view.steps[7].consignes.length>0,true);
 assert.equal(view.steps[7].actions.every(action=>action.kind==='lien'),true);
 assert.equal(ghlLink(PILOT,'/calendars'),'https://app.gohighlevel.com/v2/location/'+PILOT+'/calendars');
 assert.throws(()=>ghlLink(CENTRAL,'/calendars'));
 const ui=await fs.readFile(new URL('../public/demarrer-ici/app.js',import.meta.url),'utf8');
 const html=await fs.readFile(new URL('../public/demarrer-ici/index.html',import.meta.url),'utf8');
 assert.equal(/type=["']password["']/i.test(ui+html),false);
 assert.match(ui,/target="_blank"/);
});

test('origine étrangère refusée, route branchée, en-têtes iframe',async()=>{
 const ctx=harness();
 const evil=await call(ctx,'POST',{headers:{origin:'https://evil.test',host:'portail.courtiergrowth.com'},body:{action:'signaler',location_id:PILOT,step:3}});
 assert.equal(evil.statusCode,403);
 const routed=response();
 await dispatch({method:'GET',url:'/api/demarrer-ici',headers:{},query:{slug:'demarrer-ici'}},routed);
 assert.equal(routed.statusCode,400);
 const vercel=JSON.parse(await fs.readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 const globalCsp=vercel.headers[0].headers.find(item=>item.key==='Content-Security-Policy').value;
 const embed=vercel.headers.find(item=>item.source==='/demarrer-ici');
 assert.ok(vercel.headers.indexOf(embed)>0);
 assert.match(globalCsp,/frame-ancestors 'none'/);
 const csp=embed.headers.find(item=>item.key==='Content-Security-Policy').value;
 const frame=embed.headers.find(item=>item.key==='X-Frame-Options').value;
 assert.match(csp,/frame-ancestors https:\/\/app\.gohighlevel\.com/);
 assert.equal(csp.includes("frame-ancestors 'none'"),false);
 assert.equal(frame.includes('DENY'),false);
 assert.equal(vercel.headers.some(item=>item.source==='/demarrer-ici/agence'),false);
});

test('la migration n’ouvre la table ni à anon ni à authenticated',async()=>{
 const sql=await fs.readFile(new URL('../migrations/20261102_demarrer_ici.sql',import.meta.url),'utf8');
 assert.match(sql,/revoke all on public\.demarrer_ici_progress from public, anon, authenticated/);
 const db=new PGlite();
 await db.exec('create role anon; create role authenticated; create role service_role;');
 await db.exec(sql);
 await db.exec(`insert into demarrer_ici_progress(location_id,steps) values('${PILOT}','{"1":{"status":"a_faire"}}')`);
 await assert.rejects(db.exec(`insert into demarrer_ici_progress(location_id,steps) values('court','{}')`),/check|violates/i);
 await db.exec('set role anon');
 await assert.rejects(db.query('select location_id from demarrer_ici_progress'),/permission|row-level/i);
 await db.exec('reset role');
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select location_id from demarrer_ici_progress'),/permission|row-level/i);
});

function fixture(){
 return {
  location:{location:{id:PILOT,snapshotId:'snap-1',allowDuplicateContact:false,timezone:'America/Toronto'}},
  numbers:{numbers:[{phoneNumber:'+15145550100',countryCode:'CA',capabilities:{sms:true,voice:true}}]},
  sms:{conversationChannel:{type:'SMS',providers:[{name:'LeadConnector'}]}},
  email:{conversationChannel:{type:'Email',providers:[]}},
  social:{results:{accounts:[{platform:'facebook',name:'Page test',isExpired:false},{platform:'instagram',name:'igtest',isExpired:false}]}},
  calendars:{calendars:[{name:'Appel Découverte',isActive:true},{name:'Plan de match',isActive:true}]},
  funnels:{funnels:[{name:'Vendeur',domain:'https://test.courtiergrowth.com',domainId:'dom-1'}]},
  workflows:{workflows:[{name:'New lead SMS',status:'draft'},{name:'Rappel RDV',status:'published'}]},
  https:200
 };
}
function mockFetch(data){
 const calls=[];
 const fetchImpl=async(url,options={})=>{
  const href=String(url);
  calls.push({href,method:options.method||'GET',authorization:options.headers?.Authorization||''});
  if(href.includes('courtiergrowth.com'))return {ok:data.https>=200&&data.https<300,status:data.https,json:async()=>({})};
  if(href.includes('/phone-system/')){
   const status=data.numberStatus||200;
   return {ok:status>=200&&status<300,status,json:async()=>status===200?data.numbers:{message:data.numberMessage||''}};
  }
  const body=href.includes('conversationChannels/SMS')?data.sms
   :href.includes('conversationChannels/Email')?data.email
   :href.includes('/social-media-posting/')?data.social
   :href.includes('/calendars/')?data.calendars
   :href.includes('/funnels/')?data.funnels
   :href.includes('/workflows/')?data.workflows
   :data.location;
  return {ok:true,status:200,json:async()=>body};
 };
 return {fetchImpl,calls};
}

test('runChecks masque le numéro et ignore un jeton d’un autre sous-compte',async()=>{
 const data=fixture();
 const {fetchImpl,calls}=mockFetch(data);
 const report=await runChecks(PILOT,{env:{GHL_PILOT_LOCATION_TOKEN:TOKEN,GHL_CENTRAL_TOKEN:'autre-jeton-central-secret'},fetchImpl});
 assert.equal(report.mode,'auto');
 assert.equal(report.results.find(item=>item.step===3).outcome,'partiel');
 assert.match(report.results.find(item=>item.step===3).detail,/\+1 ••• ••• 0100/);
 assert.equal(JSON.stringify(report).includes(TOKEN),false);
 assert.equal(JSON.stringify(report).includes('autre-jeton'),false);
 assert.equal(calls.every(item=>!item.authorization.includes('autre-jeton')),true);
});

test('les workflows publiés hors liste bloquent l’étape 2 et s’affichent à l’agence',async()=>{
 assert.equal(workflowMayStayPublished('Reply STOP'),true);
 assert.equal(workflowMayStayPublished('1.0. - Rappel + confirmation des RDV'),true);
 assert.equal(workflowMayStayPublished('1.0 Listing actif Jour 7'),false);
 assert.equal(workflowMayStayPublished('2.0 Visites Jour 7'),false);
 assert.equal(workflowMayStayPublished('Outbound Call - Custom Disposition - Book un Call'),false);
 assert.equal(workflowMayStayPublished('2.0 - Anciens clients fideliser'),false);
 const classified=classifyPublishedWorkflows([
  {name:'New lead SMS',status:'draft'},
  {name:'Reply STOP',status:'published'},
  {name:'1.0 Listing actif Jour 7',status:'published'},
  {name:'2.0 Visites Jour 7',status:'published'},
  {name:'Outbound Call - Custom Disposition - Book un Call',status:'published'},
  {name:'Anciens clients fideliser acheteur',status:'published'},
  {name:'Déclencheur retiré',status:'unpublished'}
 ]);
 assert.deepEqual(classified.map(item=>item.name),['Reply STOP','1.0 Listing actif Jour 7','2.0 Visites Jour 7','Outbound Call - Custom Disposition - Book un Call','Anciens clients fideliser acheteur']);
 assert.equal(classified.find(item=>item.name==='Reply STOP').blocks,false);
 assert.equal(classified.filter(item=>item.blocks).length,4);
 const ctx=harness();
 const data=fixture();
 data.workflows={workflows:[
  {name:'Reply STOP',status:'published'},
  {name:'1.0 Listing actif Jour 7',status:'published'},
  {name:'2.0 Visites Jour 7',status:'published'},
  {name:'Outbound Call - Custom Disposition - Book un Call',status:'published'},
  {name:'2.0 - Anciens clients fideliser',status:'published'},
  {name:'New lead SMS',status:'draft'}
 ]};
 const {fetchImpl}=mockFetch(data);
 const checked=await call(ctx,'POST',{env:{GHL_PILOT_LOCATION_TOKEN:TOKEN},body:{action:'verifier',location_id:PILOT},fetchImpl});
 assert.equal(checked.body.steps[1].status,'a_faire');
 assert.match(checked.body.steps[1].detail,/brouillon/);
 assert.match(checked.body.steps[1].detail,/Listing actif/);
 const names=checked.body.steps[1].publishedWorkflows.map(item=>item.name);
 assert.ok(names.includes('1.0 Listing actif Jour 7'));
 assert.ok(names.includes('Reply STOP'));
 assert.equal(checked.body.steps[1].publishedWorkflows.find(item=>item.name==='Reply STOP').blocks,false);
 const agency=await call(ctx,'GET',{headers:{authorization:'Bearer admin-test'},query:{vue:'agence'}});
 const prep=agency.body.locations[0].steps.find(step=>step.id===2);
 assert.ok(prep.publishedWorkflows.some(item=>item.name==='2.0 Visites Jour 7'&&item.blocks));
 assert.ok(prep.publishedWorkflows.some(item=>item.name==='Outbound Call - Custom Disposition - Book un Call'&&item.blocks));
 assert.ok(prep.publishedWorkflows.some(item=>item.name==='2.0 - Anciens clients fideliser'&&item.blocks));
 const ui=await fs.readFile(new URL('../public/demarrer-ici/app.js',import.meta.url),'utf8');
 assert.match(ui,/Workflows publiés/);
});

test('sans téléphonie, l’étape 3 reste à faire avec le message prévu',async()=>{
 const env={GHL_PILOT_LOCATION_TOKEN:TOKEN};
 const missing=fixture();
 missing.numberStatus=404;
 missing.numberMessage='No Twilio account found for location';
 const twilio=await runChecks(PILOT,{env,fetchImpl:mockFetch(missing).fetchImpl});
 const absent=twilio.results.find(item=>item.step===3);
 assert.equal(absent.outcome,'a_faire');
 assert.equal(absent.detail,'Aucun numéro / téléphonie pas encore configurée');
 const empty=fixture();
 empty.numbers={numbers:[]};
 const none=await runChecks(PILOT,{env,fetchImpl:mockFetch(empty).fetchImpl});
 assert.equal(none.results.find(item=>item.step===3).detail,'Aucun numéro / téléphonie pas encore configurée');
 const down=fixture();
 down.numberStatus=502;
 down.numberMessage='Bad gateway';
 const failed=await runChecks(PILOT,{env,fetchImpl:mockFetch(down).fetchImpl});
 const error=failed.results.find(item=>item.step===3);
 assert.equal(error.outcome,'manuel');
 assert.match(error.detail,/Lecture impossible pour le moment/);
 assert.equal(error.detail.includes('Aucun numéro'),false);
 const ctx=harness();
 await call(ctx,'POST',{body:{action:'signaler',location_id:PILOT,step:3}});
 const cleared=await call(ctx,'POST',{env,body:{action:'verifier',location_id:PILOT},fetchImpl:mockFetch(empty).fetchImpl});
 assert.equal(cleared.body.steps[2].status,'a_faire');
 assert.equal(cleared.body.steps[2].detail,'Aucun numéro / téléphonie pas encore configurée');
});

test('l’aide suit l’étape affichée, le fuseau a un défaut, l’agence efface la progression',async()=>{
 const view=publicView(emptyProgress(PILOT,'2026-11-02T16:00:00Z'));
 assert.equal(view.steps.every(step=>step.signaler==='J’ai terminé cette étape'),true);
 assert.equal(view.steps[0].fields.find(field=>field.name==='secteur').label,'Type de propriétés');
 assert.equal(view.steps[0].fields.find(field=>field.name==='territoire').label,'Secteur (villes ou région)');
 assert.equal(view.steps[0].fields.find(field=>field.name==='fuseau').options[0][1],'Heure de l’Est (Québec)');
 const ctx=harness();
 const saved=await call(ctx,'POST',{body:{action:'enregistrer',location_id:PILOT,broker:{...broker,fuseau:''}}});
 assert.equal(saved.statusCode,200);
 assert.equal(saved.body.broker.fuseau,'America/Toronto');
 assert.equal(saved.body.broker.territoire,'Montréal et Rive-Nord');
 const help=await call(ctx,'POST',{body:{action:'aide',location_id:PILOT,step:5,note:'Google ne s’ouvre pas.'}});
 assert.equal(help.body.help.stepId,5);
 assert.equal(help.body.steps[4].status,'besoin_aide');
 const denied=await call(ctx,'POST',{body:{action:'reinitialiser',location_id:PILOT}});
 assert.equal(denied.statusCode,401);
 const reset=await call(ctx,'POST',{headers:{authorization:'Bearer admin-test'},body:{action:'reinitialiser',location_id:PILOT}});
 assert.equal(reset.statusCode,200);
 assert.equal(reset.body.location.broker.nom,undefined);
 assert.equal(reset.body.location.steps[0].status,'a_faire');
 assert.equal(reset.body.location.steps[4].status,'a_faire');
 const ui=await fs.readFile(new URL('../public/demarrer-ici/app.js',import.meta.url),'utf8');
 assert.match(ui,/L’aide porte sur l’étape affichée/);
 assert.match(ui,/Aucun courriel ni texto/);
 assert.match(ui,/Effacer la progression/);
});
