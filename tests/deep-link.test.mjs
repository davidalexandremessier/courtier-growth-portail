import test from 'node:test';
import assert from 'node:assert/strict';
import {DEEP_LINK_URLS,readPortalEntry,rememberDeepLink,resolveDeepLink,takeDeepLink} from '../src/deep-link.mjs';

test('liens profonds publics',()=>{
 assert.equal(DEEP_LINK_URLS.help,'https://portail.courtiergrowth.com/?page=help');
 assert.equal(DEEP_LINK_URLS.kpi,'https://portail.courtiergrowth.com/?page=kpi');
 assert.equal(DEEP_LINK_URLS.leads97,'https://portail.courtiergrowth.com/?page=leads97');
});

test('?page= est gardé hors OAuth et retiré de l’adresse',()=>{
 const kpi=readPortalEntry('/','?page=kpi','');
 assert.equal(kpi.page,'kpi');
 assert.equal(kpi.oauthActive,false);
 assert.equal(kpi.rewrite,'/');
 const extra=readPortalEntry('/','?foo=1&page=leads97','#section');
 assert.equal(extra.page,'leads97');
 assert.equal(extra.rewrite,'/?foo=1#section');
 const plain=readPortalEntry('/','','');
 assert.equal(plain.page,null);
 assert.equal(plain.rewrite,null);
});

test('OAuth et invitation gardent leurs paramètres en mémoire et ne posent pas la page',()=>{
 const oauth=readPortalEntry('/','?page=kpi&oauth_pending=abc','');
 assert.equal(oauth.page,null);
 assert.equal(oauth.oauth.pending,'abc');
 assert.equal(oauth.oauthActive,true);
 assert.equal(oauth.rewrite,'/');
 const error=readPortalEntry('/','?oauth_error=refus','');
 assert.equal(error.oauth.error,'refus');
 assert.equal(error.page,null);
 assert.equal(error.rewrite,'/');
 const invite=readPortalEntry('/','?page=help','#access_token=secret&type=invite&invite=jeton');
 assert.equal(invite.page,null);
 assert.equal(invite.auth.flow,true);
 assert.equal(invite.auth.token,'jeton');
 assert.equal(invite.auth.type,'invite');
 assert.equal(invite.oauthActive,true);
 assert.equal(invite.rewrite,'/');
 const recovery=readPortalEntry('/','?page=kpi','#type=recovery&recovery=jeton');
 assert.equal(recovery.page,null);
 assert.equal(recovery.auth.type,'recovery');
 assert.equal(recovery.auth.token,'jeton');
});

test('la page demandée survit au stockage le temps de la connexion',()=>{
 const storage=new Map();
 const box={getItem:key=>storage.get(key)||'',setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 rememberDeepLink(box,'kpi');
 assert.equal(takeDeepLink(box,''),'kpi');
 assert.equal(takeDeepLink(box,''),null);
 rememberDeepLink(box,'help');
 assert.equal(takeDeepLink(box,'leads97'),'leads97');
 assert.equal(box.getItem('cg-deep-page'),'');
});

test('la page ouverte respecte l’offre et retombe sur l’accueil',()=>{
 assert.deepEqual(resolveDeepLink('kpi',{offer:'Campagne 97 $'}),{page:'numbers',allowed:true,focus:null,requested:'kpi'});
 assert.deepEqual(resolveDeepLink('help',{offer:'Campagne 97 $'}),{page:'help',allowed:true,focus:'poser-une-question',requested:'help'});
 assert.deepEqual(resolveDeepLink('leads97',{offer:'Campagne 97 $'}),{page:'leads97',allowed:true,focus:null,requested:'leads97'});
 assert.deepEqual(resolveDeepLink('leads97',{offer:'Groupe'}),{page:'follow',allowed:false,focus:null,requested:'leads97'});
 assert.deepEqual(resolveDeepLink('production',{offer:'Campagne 97 $'}),{page:'follow',allowed:false,focus:null,requested:'production'});
 assert.deepEqual(resolveDeepLink('notes',{offer:'Campagne 97 $'}),{page:'follow',allowed:false,focus:null,requested:'notes'});
 assert.deepEqual(resolveDeepLink('notes',{offer:'Campagne 97 $',admin:true}),{page:'agency',allowed:false,focus:null,requested:'notes'});
 assert.deepEqual(resolveDeepLink('team',{offer:'Campagne 97 $'}),{page:'follow',allowed:false,focus:null,requested:'team'});
 assert.equal(resolveDeepLink('team',{offer:'1:1'}).page,'team');
 assert.equal(resolveDeepLink('n-importe-quoi',{offer:'Campagne 97 $'}).page,'follow');
 assert.equal(resolveDeepLink('',{offer:'Campagne 97 $',admin:true}).page,'agency');
});
