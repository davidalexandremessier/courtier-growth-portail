import test from 'node:test';import assert from 'node:assert/strict';import {requireOAuthScope,publicConnections} from '../server/meta-client-access.mjs';
test('Meta scope: admin preserved, owner A cannot select B or GHL, disabled gate fails closed',async()=>{
 const old=process.env.META_CLIENT_OAUTH_READY;process.env.META_CLIENT_OAUTH_READY='true';
 const session={actor:{id:'a',admin:false},db:{rpc:async(name,{cid})=>({data:cid==='a'})}};
 await requireOAuthScope(session,'a','meta');await assert.rejects(requireOAuthScope(session,'b','meta'),/responsable/);await assert.rejects(requireOAuthScope(session,'a','ghl'),/non activée/);await requireOAuthScope({actor:{admin:true}},'b','ghl');
 process.env.META_CLIENT_OAUTH_READY='false';await assert.rejects(requireOAuthScope(session,'a','meta'));if(old===undefined)delete process.env.META_CLIENT_OAUTH_READY;else process.env.META_CLIENT_OAUTH_READY=old;
});
test('OAuth response whitelist strips ciphertext, refresh tokens and other providers',()=>{const rows=[{provider:'meta',account_id:'a',ciphertext:'DO-NOT-EXPOSE',refresh_token:'DO-NOT-EXPOSE'},{provider:'ghl',ciphertext:'DO-NOT-EXPOSE'}];const v=publicConnections(rows,false);assert.equal(v.length,1);assert.ok(!JSON.stringify(v).includes('DO-NOT-EXPOSE'));assert.equal(publicConnections(rows,true).length,2)});
