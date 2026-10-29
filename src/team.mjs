import {shiftDay,validDay,periodBounds} from './kpi.mjs';
export const personMetrics=[['leads_assigned','Leads pris en charge'],['calls','Tentatives de contact'],['responses','Premières réponses'],['appointments','Découvertes réservées'],['appointments_due','Découvertes prévues'],['attended','Découvertes tenues'],['pitches','Pitchs réalisés'],['signatures','Contrats signés']];
export function validatePersonDay(row,today){
 if(!validDay(row.report_date)||row.report_date>today)throw Error('Choisissez une journée valide, aujourd’hui ou avant.');
 for(const [key] of personMetrics)if(row[key]!=null&&(!Number.isInteger(row[key])||row[key]<0))throw Error('Renseignez des nombres entiers positifs ou nuls.');
 if(!personMetrics.some(([k])=>row[k]!=null))throw Error('Renseignez au moins un chiffre.');
 if(row.attended!=null&&row.appointments_due!=null&&row.attended>row.appointments_due)throw Error('Les découvertes tenues ne peuvent pas dépasser celles prévues.');
 return row;
}
export function personSummary(reports,memberId,end,period=30){
 const {start,window_days}=periodBounds(reports,end,period),rows=[...new Map(reports.filter(r=>r.member_id===memberId&&r.report_date>=start&&r.report_date<=end).map(r=>[r.report_date,r])).values()];
 const totals={},coverage={};for(const [key] of personMetrics){const values=rows.filter(r=>r[key]!=null);totals[key]=values.length?values.reduce((sum,r)=>sum+r[key],0):null;coverage[key]=values.length;}
 const aligned=rows.every(r=>(r.attended!=null)===(r.appointments_due!=null));
 return {start,end,window_days,days:rows.length,totals,coverage,showRate:aligned&&totals.appointments_due>0?totals.attended/totals.appointments_due:null};
}
