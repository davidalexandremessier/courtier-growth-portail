// Portail V2 — logique pure (testable). Vide = inconnu ; 0 = zéro confirmé.
import {kpiReference} from '../kpi-reference.mjs';

export const salesFields=[
  ['leads','leads','Leads reçus','Personnes distinctes arrivées cette semaine.'],
  ['contacted','contacted','Leads contactés','Au moins une tentative humaine (appel ou texto).'],
  ['responses','responses','Réponses','Personnes qui ont répondu, une fois par personne.'],
  ['appointments','booked','Découvertes réservées','Rendez-vous découverte pris (seuls et par vous).'],
  ['appointments_due','due','Découvertes prévues','Réservées dont la date est passée, issue connue.'],
  ['attended','held','Découvertes tenues','Découvertes qui ont eu lieu.'],
  ['pitches','pitches','Pitchs tenus','Présentations réalisées.'],
  ['signatures','signed','Contrats signés','Contrats signés cette semaine.']
];
export const metaFields=[
  ['spend','spend','Montant dépensé ($)','Colonne « Montant dépensé » de Meta Ads Manager.',true],
  ['impressions','impressions','Impressions','Colonne « Impressions ».'],
  ['clicks_all','clicksAll','Clics (tous)','Colonne « Clics (tous) ».'],
  ['link_clicks','linkClicks','Clics sur le lien','Colonne « Clics sur un lien ».'],
  ['thank_you_views','thankYou','Vues de la page de remerciement','Statistiques du funnel dans GoHighLevel.']
];
export const crmFields=[
  ['auto_bookings','autoBookings','Réservés seuls (funnel)','Rendez-vous pris directement par le lead dans le calendrier.'],
  ['manual_bookings','manualBookings','Réservés par vous','Rendez-vous que vous avez fixés après un appel.'],
  ['quiz_completed','quiz','Quiz complétés','Leads qui ont terminé le quiz.'],
  ['invalid_numbers','invalid','Numéros invalides','Statut « Numéro invalide ».']
];
export const allFields=[...salesFields,...metaFields,...crmFields];

export function fromRow(r){if(!r)return null;const v={};for(const [col,key] of allFields)v[key]=r[col]==null?null:Number(r[col]);return {id:r.id,week:r.period_start,values:v,complete:r.week_complete===true,cohort:r.same_cohort===true,updated:r.updated_at}}
export function toRow(clientId,week,values,fields,extra={}){const out={client_id:clientId,period_start:week,period_end:shiftDay(week,6),source:'manual',...extra};for(const [col,key] of fields)out[col]=values[key]??null;return out}

export function shiftDay(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function weekStart(day){const n=new Date(day+'T12:00:00Z').getUTCDay();return shiftDay(day,-((n+6)%7))}
export function torontoToday(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export function recentWeeks(today,n=8){const s=weekStart(today);return Array.from({length:n},(_,i)=>shiftDay(s,-7*i))}

export function parseCount(raw,{money=false}={}){const s=String(raw??'').trim().replace(/\s/g,'').replace(',', '.');if(s==='')return {ok:true,value:null};if(money?!/^\d+(\.\d{1,2})?$/.test(s):!/^\d+$/.test(s))return {ok:false};return {ok:true,value:Number(s)}}
export function validate(values){const v=values;if(v.held!=null&&v.due!=null&&v.held>v.due)return 'Les découvertes tenues ne peuvent pas dépasser les découvertes prévues.';if(v.linkClicks!=null&&v.clicksAll!=null&&v.linkClicks>v.clicksAll)return 'Les clics sur le lien ne peuvent pas dépasser les clics (tous).';return null}

// Couleurs : vert = repère atteint ; jaune = à moins de 25 % ; rouge = plus loin ; gris = inconnu ou trop peu de volume.
export function status(rate,{low,inverse=false},denom,min){if(rate==null||denom==null||denom<min)return 'gray';if(inverse)return rate<=low?'green':rate<=low*1.25?'yellow':'red';return rate>=low?'green':rate>=low*0.75?'yellow':'red'}
const div=(n,d)=>n==null||d==null||d===0?null:n/d;
export const salesKpis=[
  {key:'responses',name:'Réponses',num:'responses',den:'leads',denLabel:'leads',low:.40,high:.50,min:30,source:'PB13 v1.2 · ligne 7'},
  {key:'booking',name:'Découvertes réservées',num:'booked',den:'leads',denLabel:'leads',low:kpiReference.booking.low,high:kpiReference.booking.high,min:30,source:kpiReference.version},
  {key:'show',name:'Présence aux découvertes',num:'held',den:'due',denLabel:'découvertes prévues',low:kpiReference.discovery_show.low,high:null,min:5,source:kpiReference.version},
  {key:'close',name:'Contrats signés',num:'signed',den:'pitches',denLabel:'pitchs tenus',low:.40,high:null,min:5,source:'PB13 v1.2 · ligne 12'}
];
export const metaKpis=[
  {key:'ctr',name:'CTR (tous les clics)',num:'clicksAll',den:'impressions',denLabel:'impressions',low:.03,high:null,max:.06,min:1000,source:'PB13 v1.2 · ligne 1',hint:'sinon revoir le visuel'},
  {key:'ctrLink',name:'CTR (clics sur le lien)',num:'linkClicks',den:'impressions',denLabel:'impressions',low:.01,high:null,max:.03,min:1000,source:'PB13 v1.2 · ligne 2',hint:'sinon revoir le texte ou l’offre'},
  {key:'clickLead',name:'Clic vers lead',num:'leads',den:'linkClicks',denLabel:'clics sur le lien',low:.10,high:null,max:.2,min:50,source:'PB13 v1.2 · ligne 3',hint:'sinon revoir la page ou le formulaire'},
  {key:'cpl',name:'Coût par lead',num:'spend',den:'leads',denLabel:'leads',low:20,high:null,max:40,min:5,inverse:true,money:true,source:'PB13 v1.2 · ligne 4',hint:'repère 10 à 20 $ ou moins'}
];
export const crmKpis=[
  {key:'quiz',name:'Quiz complété',num:'quiz',den:'leads',denLabel:'leads',low:.80,high:null,min:30,source:'PB13 v1.2 · ligne 5'},
  {key:'auto',name:'Réservés seuls (funnel)',num:'autoBookings',den:'leads',denLabel:'leads',low:.05,high:.10,max:.3,min:30,source:'PB13 v1.2 · ligne 6'},
  {key:'invalid',name:'Numéros invalides',num:'invalid',den:'leads',denLabel:'leads',low:.25,high:null,max:.5,min:30,inverse:true,source:'PB13 v1.2 · ligne 13'}
];
export function kpi(values,def){const n=values?.[def.num]??null,d=values?.[def.den]??null,rate=div(n,d);const s=rate!=null&&!def.inverse&&rate>1?'gray':status(rate,def,d,def.min);return {...def,n,d,rate,status:s}}
export const kpis=(values,defs)=>defs.map(d=>kpi(values,d));

export function reading(w){if(!w)return {kind:'empty',title:'Aucun chiffre cette semaine',reason:'Ajoutez vos chiffres pour voir où vous en êtes.'};const miss=salesFields.filter(([,k])=>w.values[k]==null);if(miss.length===salesFields.length)return {kind:'empty',title:'Aucun chiffre de vente',reason:'Ajoutez vos chiffres pour voir où vous en êtes.'};if(miss.length)return {kind:'missing',title:'Chiffres à compléter',reason:'Manquant : '+miss.map(f=>f[2]).join(', ')+'. Un champ vide reste inconnu, pas zéro.'};const rs=kpis(w.values,salesKpis),bad=rs.find(r=>r.status==='red')||rs.find(r=>r.status==='yellow');if(bad)return {kind:'signal',title:bad.name+(bad.status==='red'?' hors repère':' proche du repère'),reason:'Une piste à vérifier ensemble, pas une cause certaine.'};if(rs.every(r=>r.status==='green'))return {kind:'ok',title:'Repères atteints',reason:'Continuez le rythme.'};return {kind:'scope',title:'Activité de la semaine',reason:'Volume trop faible pour conclure sur certains repères.'}}

export function sumWeeks(list){const out={};for(const w of list)for(const [,k] of allFields){const v=w?.values?.[k];if(v!=null)out[k]=(out[k]??0)+v}return out}
export function teamWeek(rows,members,week){const end=shiftDay(week,6),by={};for(const m of members)by[m.id]={member:m,values:{}};for(const r of rows){if(r.report_date<week||r.report_date>end||!by[r.member_id])continue;const v=by[r.member_id].values,add=(k,x)=>{if(x!=null)v[k]=(v[k]??0)+Number(x)};add('leads',r.leads_assigned);add('contacted',r.calls);add('responses',r.responses);add('booked',r.appointments);add('due',r.appointments_due);add('held',r.attended);add('pitches',r.pitches);add('signed',r.signatures)}return Object.values(by)}

export const isClientOwner=o=>String(o||'').trim().toLowerCase()==='client';
export function openTasks(tasks,cid){return tasks.filter(t=>t.client_id===cid&&t.status!=='Terminé').sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')))}
export function triage(clients,weeks,tasks,today){const order={blocked:0,late:1,signal:2,missing:3,empty:3,scope:4,ok:5};return clients.map(c=>{const w=weeks[c.id]||null,r=reading(w),open=openTasks(tasks,c.id),blocked=open.find(t=>t.blocked),late=open.find(t=>t.due_date&&t.due_date<today);const why=blocked?{kind:'blocked',title:'Blocage signalé',reason:blocked.blocker_note||blocked.title}:late?{kind:'late',title:'Action en retard',reason:late.title}:r;return {client:c,reading:r,why,next:open[0]||null,rank:order[why.kind]??9}}).sort((a,b)=>a.rank-b.rank||String(a.client.name).localeCompare(String(b.client.name)))}
