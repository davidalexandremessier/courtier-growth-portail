import {validDay} from './kpi.mjs';
import {kpiReference} from './kpi-reference.mjs';

export const commercialPolicy='David · 18 octobre 2026 · réponse → réservation → présence → proposition de pitch → closing';
export const diagnosticStages=[
 {key:'response',label:'Réponses',numerator:'R',denominator:'L',known:'Rknown',threshold:'responses',base:.4,source:'PB13 §04 · réponses / leads'},
 {key:'booking',label:'Réservations découverte',numerator:'Db',denominator:'L',known:'Dbknown',threshold:'booked',base:kpiReference.booking.low,source:kpiReference.version+' · '+kpiReference.booking.location+' · découvertes réservées / leads'},
 {key:'presence',label:'Présence découverte',numerator:'Dh',denominator:'Dtotal',known:'Ddue',threshold:'discovery_show',base:kpiReference.discovery_show.low,source:kpiReference.version+' · '+kpiReference.discovery_show.location+' · rendez-vous futurs exclus'},
 {key:'proposal',label:'Proposition de rendez-vous pitch',numerator:'Pproposed',denominator:'Dh',known:'Pproposed_known',threshold:null,base:null,source:'David · 18 octobre 2026 · proposition distincte de réservation et présence'},
 {key:'closing',label:'Contrats après pitch',numerator:'MafterPitch',denominator:'Ph',known:'Mknown',threshold:'close',base:.4,source:'PB13 §04 · contrats issus des pitchs tenus / pitchs tenus'}
];
// Answers are observations declared by the user, never inferred from a low rate.
export const commercialAudit=[
 ['response','calls72','Au moins trois appels téléphoniques aux leads sans réponse dans les 72 premières heures?', 'yes','Cadence d’appels à vérifier','Documenter trois tentatives téléphoniques sur les 72 premières heures pour les leads encore sans réponse. Les SMS complètent les appels.'],
 ['response','firstHour','Premier appel tenté dans la première heure?', 'yes','Délai du premier appel à examiner','Vérifier les dates de réception et de premier appel sur les leads sans réponse.'],
 ['response','first24','Un premier appel a-t-il été tenté dans les premières 24 heures?', 'yes','Le premier appel pourrait être tardif','Revoir les leads sans premier appel et consigner leur prochaine tentative.'],
 ['response','slots','Des heures et créneaux d’appel variés ont-ils été essayés?', 'yes','Les créneaux pourraient limiter les échanges','Tester un autre créneau sur les prochains leads toujours sans réponse.'],
 ['response','smsReply','Les SMS complémentaires invitent-ils à répondre?', 'yes','L’invitation à répondre pourrait manquer','Revoir un SMS complémentaire avec une question simple liée au projet.'],
 ['response','smsQuality','Le contenu des SMS a-t-il été relu pour sa pertinence et son ton?', 'yes','La qualité des SMS reste à vérifier','Relire un SMS réel avec le coach et vérifier sa pertinence pour le projet.'],
 ['response','smsHours','Les SMS ont-ils été envoyés à des horaires appropriés au prospect?', 'yes','Les horaires des SMS restent à vérifier','Comparer les heures d’envoi et le fuseau des prospects concernés.'],
 ['response','stop','Le suivi cesse-t-il après réponse, refus ou rendez-vous?', 'yes','Des relances pourraient continuer après un changement de statut','Vérifier les statuts et interrompre les relances devenues inutiles.'],
 ['booking','opening','L’ouverture de conversation est-elle naturelle et non défensive?', 'yes','L’ouverture pourrait freiner la conversation','Réécouter une ouverture de prospection avec le coach.'],
 ['booking','discovery','Le projet ou problème réel est-il exploré dans la conversation?', 'yes','Le besoin pourrait rester trop général','Revoir les questions de découverte du projet avant de proposer un rendez-vous.'],
 ['booking','value','Le rendez-vous est-il présenté comme un conseil utile au projet?', 'yes','La valeur du rendez-vous pourrait être floue','Revoir une proposition de rendez-vous en la reliant au problème exprimé.'],
 ['booking','project','Le projet est-il confirmé dans les réponses au formulaire ET la conversation?', 'yes','Un décalage de qualification est possible','Comparer les réponses au formulaire avec la conversation, puis relever les écarts.'],
 ['booking','promise','La promesse publicitaire correspond-elle à la conversation et à la consultation?', 'yes','Un décalage de promesse est possible','Comparer la promesse et les conversations, en distinguant les sources.'],
 ['presence','reminders','Les rappels prévus ont-ils été reçus?', 'yes','Les rappels pourraient manquer','Vérifier les preuves de réception des rappels sur les absences observées.'],
 ['presence','commitment','Un micro-engagement utile a-t-il été accepté?', 'yes','La préparation pourrait manquer de sens','Revoir une préparation courte et pertinente avec le prospect.'],
 ['presence','value','La valeur de la rencontre est-elle comprise, sans rendez-vous accepté sous pression?', 'yes','La valeur ou l’adhésion pourrait être insuffisante','Réécouter la proposition et confirmer l’intérêt réel pour la rencontre.'],
 ['presence','over72','Le rendez-vous a-t-il été réservé plus de 72 heures à l’avance?', 'no','Un délai supérieur à 72 heures est un risque à examiner, sans causalité établie','Comparer la présence selon le délai entre réservation et rendez-vous.'],
 ['proposal','fit','Le type de lead, sa qualification et son timing conviennent-ils au pitch?', 'yes','L’adéquation ou le timing pourrait limiter la suite','Revoir le type de lead, le projet et le timing des découvertes sans proposition.'],
 ['proposal','discovery','La découverte fait-elle émerger un problème et une suite pertinente?', 'yes','La découverte pourrait ne pas faire émerger la suite','Réécouter une découverte et sa conclusion avec le coach.'],
 ['proposal','proposed','Une proposition explicite de rendez-vous pitch est-elle documentée?', 'yes','La proposition de suite pourrait manquer','Consigner si le rendez-vous pitch a été proposé, réservé puis tenu, séparément.'],
 ['closing','gap','La situation actuelle et la situation désirée sont-elles comprises par les deux parties?', 'yes','L’écart à résoudre pourrait rester flou','Réécouter les questions qui font préciser la situation actuelle et le résultat désiré.'],
 ['closing','objections','Les objections ont-elles été explorées avant la demande de décision?', 'yes','Des objections pourraient rester inexprimées','Revoir les questions NEPQ et les objections avec le coach.'],
 ['closing','budget','Le budget et les honoraires ont-ils été discutés humainement?', 'yes','Les conditions économiques pourraient rester floues','Clarifier avec le prospect les honoraires et conditions pertinentes, sans décision automatique de solvabilité.'],
 ['closing','decision','Les décideurs, l’adéquation et le timing ont-ils été clarifiés?', 'yes','Le cadre de décision pourrait être incomplet','Clarifier avec le prospect les personnes impliquées, l’adéquation et le calendrier.'],
 ['closing','urgency','L’urgence réelle du prospect a-t-elle été comprise?', 'yes','Le motif d’agir pourrait être insuffisamment exploré','Revoir le calendrier réel du projet sans créer d’urgence artificielle.'],
 ['closing','decisionCall','Une décision pendant l’appel a-t-elle été proposée quand le prospect était qualifié et prêt?', 'yes','La prochaine décision pourrait rester implicite','Revoir la demande de décision pendant l’appel, avec un prospect qualifié et prêt, sans pression.']
].map(([stage,key,question,expected,hypothesis,action])=>({stage,key:stage+'.'+key,question,expected,hypothesis,action,source:'David · 18 octobre 2026 · PB3 / PB13 comme contexte'}));

const count=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function commercialMetrics(c={}){return diagnosticStages.map(s=>{
 const n=c[s.numerator],d=c[s.denominator],known=c[s.known];
 const invalid=[n,d,known].some(v=>v!=null&&!count(v))||(count(d)&&count(known)&&known>d)||(count(n)&&count(d)&&n>d)||(count(n)&&count(known)&&n>known)||(s.key==='closing'&&count(n)&&count(c.M)&&n>c.M);
 const coverage=!invalid&&count(known)&&count(d)&&d>0?known/d:null;
 // The partial known subgroup can be shown, but must not become the cohort conversion.
 const partialRate=!invalid&&count(n)&&count(known)&&known>0?n/known:null;
 const rate=!invalid&&count(n)&&count(d)&&count(known)&&known===d&&d>0?n/d:null;
 return {...s,numeratorValue:n??null,denominatorValue:d??null,known:known??null,coverage,partialRate,rate,invalid};
})}
export function validateCommercialCohort(c,today){
 for(const s of diagnosticStages)for(const k of [s.numerator,s.denominator,s.known])if(c[k]!=null&&!count(c[k]))throw Error('Les étapes commerciales comptent des leads distincts entiers, jamais des événements additionnés.');
 if(commercialMetrics(c).some(x=>x.invalid))throw Error('Le réalisé et les statuts connus ne peuvent dépasser le dénominateur.');
 if(count(c.MafterPitch)&&count(c.M)&&c.MafterPitch>c.M)throw Error('Les contrats après pitch ne peuvent dépasser les contrats de la cohorte.');
 for(const [k,v]of Object.entries(c.audit||{}))if(!commercialAudit.some(q=>q.key===k)||!['yes','no','unknown'].includes(v))throw Error('Observation d’audit invalide.');
 for(const k of ['period_start','period_end'])if(c[k]&&!validDay(c[k]))throw Error('Période de cohorte invalide.');
 if(c.period_start&&c.period_end&&c.period_end<c.period_start||c.period_end&&c.period_end>today)throw Error('La période de cohorte doit être terminée à la date d’arrêté.');
 if(c.focus_stage&&!diagnosticStages.some(s=>s.key===c.focus_stage))throw Error('Étape d’audit invalide.');
 return c;
}
function guards(c,config,m,today){const out=[];
 if(!c.cohort_id?.trim()||!c.source_note?.trim()||!c.channel?.trim()||!validDay(c.period_start)||!validDay(c.period_end)||!validDay(c.as_of)||c.period_end<c.period_start||c.period_end>c.as_of||c.as_of>today)out.push('Cohorte, période terminée, date d’arrêté et provenance à préciser');
 if(!c.complete)out.push('Comptage unique et complétude à confirmer');
 if(c.mature!==true||!c.maturity_note?.trim())out.push('Maturité insuffisante ou non documentée');
 if(m.invalid)out.push('Comptage incohérent');
 if(m.rate==null)out.push(m.coverage!=null&&m.coverage<1?'Statuts partiellement connus':'Dénominateur et statuts connus à renseigner');
 const minimum=config.commercial_min_sample?.[m.key]??(['response','booking'].includes(m.key)?config.min_sample:null);
 if(!Number.isSafeInteger(minimum)||minimum<1)out.push('Minimum d’échantillon non approuvé pour cette étape');
 else if(m.denominatorValue==null||m.denominatorValue<minimum)out.push('Échantillon insuffisant selon la politique du dossier');
 if(config.stale_days!=null&&(!validDay(c.as_of)||(Date.parse(today)-Date.parse(c.as_of))/86400000>config.stale_days))out.push('Données anciennes');
 return out;
}
export function commercialDiagnostic(c={},config={},today){
 const metrics=commercialMetrics(c).map(m=>{const threshold=m.threshold?(config.thresholds?.[m.threshold]??m.base):(config.commercial_proposal_threshold??null);const changed=m.threshold&&threshold!==m.base;const thresholdSource=m.key==='proposal'?config.commercial_proposal_source:changed?config.threshold_sources?.[m.threshold]||config.rule_reason:m.source;const blockers=guards(c,config,m,today);if(threshold==null||typeof thresholdSource!=='string'||!thresholdSource.trim())blockers.push(m.key==='proposal'?'Repère de proposition à approuver':'Source du repère modifié à documenter');else if(typeof threshold!=='number'||!Number.isFinite(threshold)||threshold<0||threshold>1)blockers.push('Repère invalide');return {...m,threshold,thresholdSource,guards:blockers,below:!blockers.length&&m.rate<threshold}});
 // David’s commercial order supersedes the old creative/copy ordering for this panel.
 let candidate=null,firstIncomplete=null;for(const m of metrics){if(m.guards.length){firstIncomplete=m;break}if(m.below){candidate=m;break}}
 const manual=metrics.find(m=>m.key===c.focus_stage);
 const selected=manual||candidate||firstIncomplete||metrics[0];
 const audit=commercialAudit.filter(q=>q.stage===selected.key).map(q=>({...q,answer:c.audit?.[q.key]||'unknown'}));
 const observation=audit.find(q=>q.answer!==q.expected&&q.answer!=='unknown')||audit.find(q=>q.answer==='unknown');
 const insufficient=selected.guards.length>0;
 const result={policy:commercialPolicy,metrics,stage:selected.key,manual:!!manual,status:insufficient?'insufficient':candidate||manual?'review':'observed',guards:selected.guards,audit,
  problem:insufficient?'Données insuffisantes pour conclure sur cette étape':selected.below?'Écart observé au repère du dossier':'Étape choisie pour une revue factuelle',
  hypothesis:insufficient?'Un faible taux ne permet pas encore de distinguer données manquantes, délai et difficulté commerciale.':observation?.answer==='unknown'?'Les observations de terrain restent à vérifier.':observation?.hypothesis||'Les observations déclarées ne suffisent pas à établir une cause.',
  action:insufficient?'Compléter la période, les statuts et la preuve de maturité de cette cohorte.':observation?.answer==='unknown'?'Vérifier : '+observation.question:observation?.action||'Revoir un cas documenté avec le coach avant de modifier une étape.'};
 // A manual audit remains useful with insufficient statistics; it is labelled separately.
 result.auditAction=observation?.answer==='unknown'?'Vérifier : '+observation.question:observation?.action||null;
 return result;
}
export function compareCommercialCohorts(current,previous){
 if(!previous)return {comparable:false,reason:'Aucune cohorte de référence comparable.'};
 if(!current.cohort_id||!current.source_key||current.cohort_id!==previous.cohort_id||current.period_start!==previous.period_start||current.period_end!==previous.period_end||current.channel!==previous.channel||current.source_key!==previous.source_key||current.mix_note!==previous.mix_note)return {comparable:false,reason:'Cohorte, période, source ou composition différentes : comparaison agrégée non attribuable aux publicités.'};
 const prior=commercialMetrics(previous);return {comparable:true,deltas:commercialMetrics(current).map((m,i)=>({stage:m.key,points:m.rate==null||prior[i].rate==null?null:(m.rate-prior[i].rate)*100})),reason:'Variation descriptive en points de pourcentage; aucune causalité établie.'};
}
export function validateDiagnosticAction(v,today){
 if(!diagnosticStages.some(s=>s.key===v.stage)||!v.action?.trim()||!v.reference?.trim())throw Error('Étape, action et référence requises.');
 if(!validDay(v.started_on)||v.started_on>today||!validDay(v.review_on)||v.review_on<=v.started_on)throw Error('Début réalisé et réévaluation postérieure requis.');
 if(!['planned','ongoing','reviewed'].includes(v.status))throw Error('État d’action invalide.');
 if(v.status==='reviewed'&&!v.result_note?.trim())throw Error('Documentez le résultat de la réévaluation.');
 return {stage:v.stage,action:v.action.trim(),reference:v.reference.trim(),started_on:v.started_on,review_on:v.review_on,status:v.status,result_note:(v.result_note||'').trim()};
}
