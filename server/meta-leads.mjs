import {CallError,must} from './calls.mjs';
import {connectionRow,connectionToken} from './oauth.mjs';
import {metaFailure} from './meta-error.mjs';
import {normalizeInstantLead,mergeInstantLeadFixtures} from '../src/meta-lead-contract.mjs';
const graph='https://graph.facebook.com/v24.0/';
const metaId=id=>typeof id==='string'&&/^\d{1,40}$/.test(id);
async function graphRead(path,params,token,fetcher=fetch){
 const url=new URL(path,graph);if(url.origin!=='https://graph.facebook.com'||!url.pathname.startsWith('/v24.0/'))throw new CallError('Chemin Meta invalide.');url.search=new URLSearchParams(params);
 let r;try{r=await fetcher(url,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)})}catch{throw new CallError('Lecture Meta indisponible.',502)}
 if(!r.ok){const endpoint=path==='me/permissions'?path:path.endsWith('/leadgen_forms')?'leadgen_forms':path.endsWith('/leads')?'leads':'unknown';throw new CallError('Lecture Meta refusée ('+await metaFailure(r,endpoint)+'). Les droits des formulaires restent à vérifier.',r.status===429?429:502)}
 try{return await r.json()}catch{throw new CallError('Réponse Meta invalide.',502)}
}
export async function inspectLeadPermissions(accessToken,{fetcher=fetch}={}){
 if(!accessToken)throw new CallError('Connexion Meta existante requise.',409);
 const r=await graphRead('me/permissions',{},accessToken,fetcher);
 if(!Array.isArray(r.data)||r.paging?.next||r.data.some(x=>typeof x.permission!=='string'||!['granted','declined','expired'].includes(x.status)))throw new CallError('Liste des droits Meta incomplète.',502);
 const permissions=r.data.map(({permission,status})=>({permission,status})),granted=name=>permissions.some(x=>x.permission===name&&x.status==='granted');
 return {provider:'meta_instant_forms',checked_at:new Date().toISOString(),permissions,ads_read:granted('ads_read'),leads_retrieval:granted('leads_retrieval'),pages_show_list:granted('pages_show_list'),state:granted('leads_retrieval')?'page_form_binding_required':permissions.some(x=>x.permission==='leads_retrieval')?'missing_leads_permission':'lead_permission_not_returned',live_import_enabled:false};
}
export async function storedMetaConnection(db,clientId){
 if(process.env.OAUTH_STORAGE_READY!=='true')throw new CallError('Stockage OAuth existant indisponible côté serveur.',409);
 const c=must(await db.from('clients').select('id,meta_ad_account_id').eq('id',clientId).single()),row=await connectionRow(db,clientId,'meta');
 if(!row||row.client_id!==clientId||row.provider!=='meta'||row.account_id!==c.meta_ad_account_id)throw new CallError('Connexion Meta du dossier à confirmer. Aucun jeton pilote d’un autre dossier utilisé.',409);
 return {adAccountId:row.account_id,accessToken:await connectionToken(db,row)};
}
export async function inspectClientLeadPermissions(db,clientId){
 const {adAccountId,accessToken}=await storedMetaConnection(db,clientId);
 const result=await inspectLeadPermissions(accessToken);
 return {...result,client_id:clientId,account_id:adAccountId};
}
async function pages(path,params,token,fetcher,maxPages=10){
 let after='';const out=[],seen=new Set();
 for(let i=0;i<maxPages;i++){const r=await graphRead(path,{...params,limit:'100',...(after?{after}:{})},token,fetcher);if(!Array.isArray(r.data))throw new CallError('Liste Meta incomplète.',502);out.push(...r.data);if(!r.paging?.next)return out;const cursor=r.paging?.cursors?.after;if(typeof cursor!=='string'||!cursor||seen.has(cursor))throw new CallError('Pagination Meta incohérente; aucun résultat partiel enregistré.',502);seen.add(cursor);after=cursor}
 throw new CallError('Volume Meta à restreindre; aucun résultat partiel enregistré.',409);
}
// Read adapter only. No DB write, page subscription, OAuth grant, ad or client message.
export async function readBoundInstantLeads({accessToken,binding,formId,from,to,fetcher=fetch}){
 if(!binding?.approved||!binding.client_id||!metaId(binding.page_id)||!Array.isArray(binding.form_ids)||!binding.form_ids.includes(formId)||!metaId(formId)||!Number.isSafeInteger(binding.version)||binding.version<1)throw new CallError('Association client/page/formulaire versionnée et approuvée requise.',409);
 if(!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||Date.parse(to)<Date.parse(from)||Date.parse(to)>Date.now())throw new CallError('Fenêtre de lecture Meta invalide.');
 const permissions=await inspectLeadPermissions(accessToken,{fetcher});if(!permissions.leads_retrieval)throw new CallError('Le droit leads_retrieval n’est pas vérifié comme accordé sur cette connexion. Aucun nouveau droit demandé.',409);
 // Membership in the Page edge verifies the form→Page relationship. Do not trust client input or a lead.page_id field.
 const forms=await pages(binding.page_id+'/leadgen_forms',{fields:'id,name,questions'},accessToken,fetcher);
 const matches=forms.filter(f=>f.id===formId);if(matches.length!==1)throw new CallError(matches.length?'Formulaire ambigu sur la Page approuvée.':'Formulaire absent de la Page approuvée.',409);
 const form=matches[0];
 if(!Array.isArray(form.questions))throw new CallError('Questions du formulaire non reçues; révision requise.',409);
 const snapshot={...form,page_id:binding.page_id},retrievedAt=new Date().toISOString();
 const leads=await pages(formId+'/leads',{fields:'id,created_time,ad_id,form_id,field_data,custom_disclaimer_responses',filtering:JSON.stringify([{field:'time_created',operator:'GREATER_THAN',value:Math.max(0,Math.floor(Date.parse(from)/1000)-1)}])},accessToken,fetcher);
 const normalized=[];for(const lead of leads){const when=Date.parse(lead.created_time);if(!Number.isFinite(when))throw new CallError('Lead Meta sans date vérifiable.',502);if(when<Date.parse(from)||when>Date.parse(to))continue;try{normalized.push(normalizeInstantLead(lead,binding,{retrievedAt,formSnapshot:snapshot}))}catch{throw new CallError('Données Meta ou association incomplètes; aucun résultat partiel enregistré.',409)}}
 const rows=mergeInstantLeadFixtures([],normalized);
 return {contract:'courtier-growth.meta-read-batch.v1',client_id:binding.client_id,page_id:binding.page_id,form_id:formId,binding_version:binding.version,from,to,retrieved_at:retrievedAt,complete:true,persisted:false,rows};
}
