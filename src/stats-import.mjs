import {validDay} from './kpi.mjs';
export const importFields=['client_id','provider','account_id','object_id','date','metric','value','currency','timezone','channel','cohort'];
export const sourceMetrics={meta:['spend','impressions','clicks','meta_leads'],ghl:['ghl_leads','appointments_due','attended']};
export function parseStatsCSV(text){
 if(typeof text!=='string'||text.length>2000000)throw Error('CSV limité à 2 Mo.');
 text=text.replace(/^\uFEFF/,'');
 const first=text.split(/\r?\n/)[0],delimiter=first.includes(';')?';':',';
 const rows=[];let row=[],cell='',quote=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++}else if(!quote&&cell.length)throw Error('Guillemets CSV invalides.');else quote=!quote}
 else if(!quote&&(ch===delimiter||ch==='\n'||ch==='\r')){row.push(cell);cell='';if(ch!==delimiter){if(row.some(x=>x.trim()))rows.push(row);row=[];if(ch==='\r'&&text[i+1]==='\n')i++}}
 else cell+=ch;if(rows.length>10001)throw Error('CSV limité à 10 000 lignes.');}
 if(quote)throw Error('Guillemets CSV non fermés.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);if(rows.length>10001)throw Error('CSV limité à 10 000 lignes.');
 const headers=(rows.shift()||[]).map(x=>x.trim());
 if(!headers.length||headers.some(x=>!x)||new Set(headers).size!==headers.length)throw Error('En-têtes vides ou répétés.');
 return {headers,rows};
}
export const importKey=r=>JSON.stringify([r.client_id,r.provider,r.account_id,r.object_id,r.date,r.metric,r.currency,r.timezone,r.channel,r.cohort]);
const same=(a,b)=>importFields.every(f=>(a[f]??'')===(b[f]??''));
export function validateStatsImport(parsed,mapping,{clientId,provider,accountId,currency,timezone,today,existing=[]}){
 if(!clientId||!sourceMetrics[provider]||!accountId||!['CAD','USD'].includes(currency)||!timezone)throw Error('Confirmez dossier, fournisseur, compte, devise et fuseau.');
 try{new Intl.DateTimeFormat('fr-CA',{timeZone:timezone})}catch{throw Error('Fuseau IANA invalide.')}
 for(const field of importFields.slice(0,9))if(!parsed.headers.includes(mapping[field]))throw Error('Colonne requise : '+field);
 const seen=new Map(existing.map(r=>[importKey(r),r])),accepted=[],rejected=[];let duplicates=0;
 parsed.rows.forEach((cells,index)=>{try{
  if(cells.length!==parsed.headers.length)throw Error('Nombre de colonnes différent.');
  const r=Object.fromEntries(importFields.map(f=>[f,(cells[parsed.headers.indexOf(mapping[f])]||'').trim()]));
  if(r.client_id!==clientId||r.provider!==provider||r.account_id!==accountId)throw Error('Autre dossier, fournisseur ou compte source.');
  if(r.currency!==currency||r.timezone!==timezone)throw Error('Devise ou fuseau différent.');
  if(!r.object_id||r.object_id.length>200||!validDay(r.date)||r.date>today)throw Error('Référence ou date invalide/future.');
  if(!sourceMetrics[provider].includes(r.metric))throw Error('Métrique non autorisée pour cette source.');
  if(r.value==='')throw Error('Valeur manquante, distincte de zéro.');r.value=Number(r.value.replace(',','.'));
  if(!Number.isFinite(r.value)||r.value<0||r.metric!=='spend'&&!Number.isInteger(r.value))throw Error('Valeur invalide.');
  const key=importKey(r),old=seen.get(key);if(old){if(!same(old,r))throw Error('Référence existante avec valeur différente : correction à revoir.');duplicates++;return}
  seen.set(key,r);accepted.push(r);
 }catch(e){rejected.push({line:index+2,reason:e.message})}});
 return {accepted,rejected,duplicates,total:parsed.rows.length};
}
export function sourceTotals(records,{clientId,provider,accountId,currency,timezone,channel='',cohort='',from,to}){
 const rows=[...new Map(records.filter(r=>r.client_id===clientId&&r.provider===provider&&r.account_id===accountId&&r.currency===currency&&r.timezone===timezone&&r.channel===channel&&r.cohort===cohort&&r.date>=from&&r.date<=to).map(r=>[importKey(r),r])).values()];
 const sum=metric=>{const values=rows.filter(r=>r.metric===metric);return values.length?values.reduce((n,r)=>n+r.value,0):null};
 // No cross-source lead total or CPL. No ROI from revenue alone.
 return Object.fromEntries(sourceMetrics[provider].map(metric=>[metric,sum(metric)]));
}
export const reviewedExport=records=>JSON.stringify({schema:'courtier-growth-source-stats/v1',status:'preview_not_saved',records},null,2);
