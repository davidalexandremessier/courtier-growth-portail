// Graph error text can contain account details or credentials. Expose only
// allowlisted diagnostics from an admin-only request, never the raw message.
const permissions=['ads_read','leads_retrieval','pages_show_list','pages_read_engagement','business_management'];
const safeTrace=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{6,64}$/.test(value)&&!/^EAA/i.test(value)?value:null;
const safeNumber=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const allowedEndpoints=new Set(['me/permissions','ad-account','insights','leadgen_forms','leads']);

export async function metaDiagnostic(response,endpoint='unknown'){
 let error={};try{error=(await response.json())?.error||{}}catch{}
 const message=typeof error.message==='string'?error.message:'';
 const missingPermission=permissions.find(name=>new RegExp(`\\b${name}\\b`,'i').test(message))||null;
 const code=safeNumber(error.code),subcode=safeNumber(error.error_subcode);
 const category=code===190?'authentification rejetée':
  code===10||code===200?'autorisation refusée':
  code===100?'requête ou champ invalide':'cause non déterminée';
 const headers=response.headers;
 const requestId=safeTrace(headers?.get?.('x-fb-request-id'));
 const traceId=safeTrace(error.fbtrace_id)||safeTrace(headers?.get?.('x-fb-trace-id'));
 return {httpStatus:safeNumber(response.status),code,subcode,category,missingPermission,
  traceId,requestId,endpoint:allowedEndpoints.has(endpoint)?endpoint:'unknown',version:'v24.0'};
}

export async function metaFailure(response,endpoint='unknown'){
 const d=await metaDiagnostic(response,endpoint);
 return [
  'HTTP '+(d.httpStatus??'inconnu'),
  d.code===null?null:'code Meta '+d.code+(d.subcode===null?'':'/'+d.subcode),
  d.category,
  d.missingPermission?'droit mentionné '+d.missingPermission:null,
  'Graph '+d.version+' '+d.endpoint,
  d.traceId?'trace '+d.traceId:null,
  d.requestId?'requête '+d.requestId:null
 ].filter(Boolean).join(' · ');
}
