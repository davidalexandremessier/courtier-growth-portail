// Repères PB13 v1.2 approuvés le 19 octobre; ratios d'activité, pas conversions de cohorte.
import {kpiReference} from './kpi-reference.mjs';
export const dailyFields=['spend','leads','invalid_numbers','responses','appointments','appointments_due','attended','pitches','signatures','transactions','commissions'];
export const targets=[['responses','Réponses',.4,.5],['appointments','Découvertes réservées',kpiReference.booking.low,kpiReference.booking.high],['pitches','Pitchs réalisés',.04,.08],['signatures','Contrats signés',.02,.05]];
export function shiftDay(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function validDay(day){return /^\d{4}-\d{2}-\d{2}$/.test(day||'')&&!Number.isNaN(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day}
export const divide=(n,d)=>n==null||d==null||d===0?null:n/d;
export function validateDaily(r,today){
 if(!validDay(r.report_date)||r.report_date>today)throw Error('Choisissez une date valide, aujourd’hui ou dans le passé.');
 for(const k of dailyFields)if(r[k]!=null&&(!Number.isFinite(r[k])||r[k]<0||(!['spend','commissions'].includes(k)&&!Number.isInteger(r[k]))))throw Error('Les volumes doivent être des entiers positifs ou nuls; les montants doivent être positifs ou nuls.');
 if(!dailyFields.some(k=>r[k]!=null))throw Error('Renseignez au moins un chiffre.');
 if(r.attended!=null&&r.appointments_due!=null&&r.attended>r.appointments_due)throw Error('Les découvertes tenues ne peuvent pas dépasser celles prévues ce jour-là.');
 return r;
}
export function periodBounds(all,end,period=30){
 if(!validDay(end)||!(period==='all'||[1,7,14,30,90].includes(period)))throw Error('Période invalide.');
 const dates=all.map(r=>r.report_date).filter(d=>validDay(d)&&d<=end).sort();
 const start=period==='all'?(dates[0]||end):shiftDay(end,1-period);
 return {start,end,window_days:Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000)+1,period};
}
export function summarizeDaily(all,end,period=30){
 const {start,window_days}=periodBounds(all,end,period),selected=all.filter(r=>validDay(r.report_date)&&r.report_date>=start&&r.report_date<=end);
 // Unique(client,date) is enforced by the database; latest row wins defensively in demos/imports.
 const days=[...new Map(selected.map(r=>[r.report_date,r])).values()];
 const totals={},coverage={};for(const k of dailyFields){const values=days.filter(r=>r[k]!=null);coverage[k]=values.length;totals[k]=values.length?values.reduce((s,r)=>s+Number(r[k]),0):null;}
 const comparable=(n,d)=>coverage[n]===coverage[d]&&days.every(r=>(r[n]!=null)===(r[d]!=null));
 const rate=(n,d)=>comparable(n,d)?divide(totals[n],totals[d]):null;
 const rates=Object.fromEntries(targets.map(([k])=>[k,rate(k,'leads')]));
 rates.show=rate('attended','appointments_due');rates.invalid=rate('invalid_numbers','leads');
 const costs=Object.fromEntries(['leads','appointments','pitches','signatures'].map(k=>[k,rate('spend',k)]));
 const transitions={booking:rate('appointments','responses'),pitch:rate('pitches','attended'),close:rate('signatures','pitches')};
 return {start,end,window_days,period,days:days.length,totals,coverage,rates,costs,transitions,complete:dailyFields.every(k=>coverage[k]===window_days),comparable};
}
export function diagnose(s){
 const {totals:t,rates:r,coverage:c}=s;
 const result=(key,title,detail,actions,preliminary=true)=>({key,title,detail,actions,preliminary});
 if(!s.days)return result('empty','Commencez par vos chiffres','Ajoutez une journée pour calculer vos KPI. Les jours sans saisie restent inconnus.', ['Renseigner les chiffres du jour, y compris les zéros confirmés.']);
 if(targets.some(([k])=>r[k]!=null&&r[k]>1)||r.invalid>1)return result('cohort','Vérifier la lecture des chiffres','Certains événements dépassent les nouveaux leads : ils peuvent concerner des leads plus anciens. Ces volumes ne permettent pas de conclure à une conversion.', ['Vérifier les dates et le comptage unique des personnes.','Distinguer les nouveaux leads des suivis d’anciens leads.']);
 const need=['leads','responses','appointments','pitches','signatures','appointments_due','attended'];
 if(need.some(k=>t[k]==null)||targets.some(([k])=>!s.comparable(k,'leads'))||!s.comparable('attended','appointments_due'))return result('missing','Compléter les données pour trouver la priorité','Les champs nécessaires ne couvrent pas les mêmes journées. Un champ vide n’est jamais interprété comme zéro.', ['Compléter les chiffres manquants dans le journal.','Renseigner les découvertes prévues et tenues sur les mêmes journées.']);
 if(t.leads<30)return result('small','Accumuler un peu plus de données',`${t.leads} leads renseignés. Les ratios restent visibles, mais le volume est trop faible pour prioriser un blocage de façon fiable.`, ['Continuer la saisie quotidienne.','Vérifier qu’une prochaine étape est notée après chaque échange.']);
 const preliminary=need.some(k=>c[k]<(s.window_days||30));
 if(r.invalid!=null&&r.invalid>.25)return result('quality','Vérifier la qualité des coordonnées','Plus de 25 % de numéros invalides dans les volumes saisis. Vérifiez la saisie et la source avant d’attribuer la difficulté aux appels.', ['Contrôler les faux numéros et doublons.','Examiner les formulaires et les sources concernés.'],preliminary);
 if(r.responses<.4)return result('response','Créer davantage de conversations','Le ratio de réponses est inférieur au repère de 40 % des leads. Le délai de rappel et les tentatives sont des pistes à vérifier.', ['Vérifier le délai du premier appel sur quelques leads.','Reprendre les leads sans réponse selon la cadence du playbook.','Noter le statut et la prochaine étape après chaque appel.'],preliminary);
 if(r.appointments<kpiReference.booking.low)return result('booking','Transformer les conversations en découvertes','Le ratio de découvertes réservées est inférieur au repère de 15 % des leads (PB13 v1.2).', ['Reprendre les conversations avec projet sans rendez-vous.','Proposer deux plages horaires concrètes.','Fixer une prochaine étape datée après chaque échange.'],preliminary);
 if(r.show!=null&&r.show<kpiReference.discovery_show.low&&t.appointments_due>=10)return result('show','Améliorer la présence aux découvertes','La présence est inférieure à la cible de 85 % des découvertes arrivées à échéance (PB13 v1.2). Les rendez-vous futurs ne sont pas comptés.', ['Vérifier les confirmations et rappels.','Confirmer la valeur de l’appel et sa préparation.','Recontacter les personnes absentes pour proposer un nouveau créneau.'],preliminary);
 if(r.pitches<.04)return result('pitch','Faire avancer les découvertes vers un pitch','Le ratio de pitchs réalisés est inférieur au repère de 4 % des leads.', ['Revoir la qualification et la fin de l’appel découverte.','Proposer une présentation adaptée au projet.','Écouter un appel avec Courtier Growth au prochain coaching.'],preliminary);
 if(r.signatures<.02)return result('close','Faire progresser les décisions après le pitch','Le ratio de contrats signés est inférieur au repère de 2 % des leads.', ['Reprendre les pitchs sans décision avec une prochaine étape précise.','Noter les objections rencontrées.','Revoir une présentation au prochain coaching.'],preliminary);
 if(r.show!=null&&r.show<kpiReference.discovery_show.low)return result('show-small','Surveiller la présence aux découvertes','La présence est sous 85 %, mais moins de 10 découvertes sont arrivées à échéance. Le signal reste préliminaire.', ['Confirmer les prochains appels.','Recontacter les personnes absentes.'],true);
 return result('healthy','Maintenir ce qui fonctionne','Les ratios renseignés atteignent les repères minimums. Continuez le suivi et vérifiez les résultats avant de modifier le budget.', ['Tenir la cadence de suivi.','Préparer le prochain coaching avec un appel et une question.'],preliminary);
}
export function dailyCSV(rows){const keys=['report_date',...dailyFields,'note'];const cell=v=>'"'+String(v??'').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"';return '\uFEFF'+[keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(cell).join(';')).join('\r\n')}
