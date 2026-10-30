import {pageAllowed} from './entitlements.mjs';

export const DEEP_LINK_STORAGE='cg-deep-page';
export const DEEP_LINK_URLS={
 help:'https://portail.courtiergrowth.com/?page=help',
 kpi:'https://portail.courtiergrowth.com/?page=kpi',
 leads97:'https://portail.courtiergrowth.com/?page=leads97',
};

// Identifiants publics (ceux des messages) → page du portail v2.
const ROUTES={
 help:{v2:'help',entitlement:'help',focus:'poser-une-question'},
 kpi:{v2:'numbers',entitlement:'kpi'},
 numbers:{v2:'numbers',entitlement:'kpi'},
 leads97:{v2:'leads97',entitlement:'leads97'},
 dashboard:{v2:'follow',entitlement:'dashboard'},
 follow:{v2:'follow',entitlement:'dashboard'},
 meetings:{v2:'meetings',entitlement:'meetings'},
 team:{v2:'team',entitlement:'team'},
 access:{v2:'access',entitlement:'access'},
};

export function readPortalEntry(pathname='/',search='',hash=''){
 const q=new URLSearchParams(String(search).replace(/^\?/,''));
 const hashParams=new URLSearchParams(String(hash).replace(/^#/,''));
 const oauth={pending:q.get('oauth_pending'),error:q.get('oauth_error'),agency:q.get('agency_oauth'),agencyError:q.get('agency_error')};
 const token=hashParams.get('invite')||hashParams.get('recovery')||'';
 const auth={token,type:hashParams.has('invite')?'invite':'recovery',flow:/type=(invite|recovery)/.test(String(hash))};
 const oauthActive=!!(token||auth.flow||oauth.pending||oauth.error||oauth.agency||oauth.agencyError);
 const page=q.get('page');
 let rewrite=null;
 if(oauthActive)rewrite=pathname||'/';
 else if(page){q.delete('page');const rest=q.toString();rewrite=(pathname||'/')+(rest?'?'+rest:'')+String(hash||'')}
 return {page:oauthActive?null:(page||null),oauth,auth,oauthActive,rewrite};
}

export function rememberDeepLink(storage,page){if(page)storage.setItem(DEEP_LINK_STORAGE,page)}
export function takeDeepLink(storage,memory=''){const stored=storage.getItem(DEEP_LINK_STORAGE)||'';storage.removeItem(DEEP_LINK_STORAGE);return memory||stored||null}

export function resolveDeepLink(page,{offer,admin=false}={}){
 const home=admin?'agency':'follow';
 const requested=String(page??'').trim();
 if(!requested)return {page:home,allowed:true,focus:null,requested:null};
 const route=ROUTES[requested];
 if(!route||!pageAllowed(offer,route.entitlement,{admin}))return {page:home,allowed:false,focus:null,requested};
 return {page:route.v2,allowed:true,focus:route.focus||null,requested};
}
