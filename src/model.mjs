export const tables=['clients','coach_followup_reviews','client_reflections','daily_reports','weekly_reports','coachings','tasks','resources','onboarding_steps','private_notes','client_call_bindings','call_sources','team_members','team_daily_reports'];
export const steps=[['Contrat et paiement confirmés','Courtier Growth'],['Formulaire d’accueil et ancienne liste transmis','Client'],['Accès Meta et GHL configurés','Courtier Growth'],['Positionnement et contenus validés','Client'],['Campagne lancée et suivi KPI présenté','Courtier Growth'],['VSL enregistré et transmis','Client'],['Système validé et suivi hebdomadaire démarré','Courtier Growth']];
export function escapeHTML(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export function safeURL(v){try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
export function localDate(d=new Date()){const v=new Date(d);return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`}
export function weekStart(){const d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7));return localDate(d)}
export function endOfWeek(start){const d=new Date(start+'T12:00:00');if(Number.isNaN(d.getTime()))return '';d.setDate(d.getDate()+6);return localDate(d)}
export function ratio(n,d){return n==null||d==null||Number(d)===0?null:Number(n)/Number(d)}
export function metricTotals(rows){const fields=['spend','leads','responses','appointments','signatures','transactions','commissions'];const out={};for(const f of fields){const values=rows.map(x=>x[f]);out[f]=rows.length&&values.every(v=>v!=null)?values.reduce((a,b)=>a+Number(b),0):null}out.cpl=ratio(out.spend,out.leads);return out}
export function validateReport(r){
 if(!r.period_start||r.period_end!==endOfWeek(r.period_start))throw Error('La période doit couvrir exactement 7 jours.');
 for(const k of ['spend','leads','invalid_numbers','responses','appointments','signatures','transactions','commissions'])if(r[k]!=null&&(!Number.isFinite(r[k])||r[k]<0||(k!=='spend'&&k!=='commissions'&&!Number.isInteger(r[k]))))throw Error('Les chiffres doivent être positifs; les volumes sont des nombres entiers.');
 return r;
}
export function visibleRows(rows,{admin,clientId,table}){return rows.filter(r=>(!clientId||r.client_id===clientId)&&(admin||(table==='coachings'?r.published:table==='private_notes'?false:r.client_visible!==false)))}
export function reportCSV(rows){const keys=['period_start','period_end','spend','leads','invalid_numbers','responses','appointments','signatures','transactions','commissions','win','obstacle'];const cell=v=>'"'+String(v??'').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"';return '\uFEFF'+[keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(cell).join(';')).join('\r\n')}
