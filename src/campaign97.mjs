import {offerKey} from './entitlements.mjs';
import {instant} from './call-matching.mjs';
import {torontoClock} from './reminders.mjs';
import {shiftDay,validDay} from './kpi.mjs';
import {newest} from './production.mjs';
import {leadCaptureMode} from './lead-capture.mjs';

export const campaign97Tables=['campaign97_settings','campaign97_events'];
export const intake97Id='kguNgjPSrAbYEy6cMLtf';
export const campaign97SourceVersion='2026-10-18-human-18h23';
export const campaign97Stages=[
 ['purchase','Achat reconnu','David',[]],
 ['access','Préparation disponible','David',['purchase']],
 ['video','Vidéo de préparation','Client',['access']],
 ['playbook','Playbook et documents','Client',['video']],
 ['form_sent','Formulaire transmis','Client',['playbook']],
 ['form_read','Lecture et clarification','David',['form_sent']],
 ['call_booked','Premier appel réservé','Client',['form_read']],
 ['call_held','Appel de cadrage','David',['call_booked']],
 ['launch_plan','Échéance · 24 h ouvrables','David',['call_held']],
 ['launch_authorized','Validation avant lancement','David',['launch_plan']],
 ['launch','Lancement effectif','David',['launch_authorized']],
 ['check_j7','Point J7','David',['launch']],
 ['check_j14','Point J14','David',['launch']],
 ['review_request','Préparer le bilan · J18','David',['launch']],
 ['review_form','Fiche bilan','Client',['review_request']],
 ['review_read','Lecture de la fiche bilan','David',['review_form']],
 ['review_booked','Appel bilan réservé','Client',['review_form']],
 ['review_call','Bilan humain · J21','David',['review_read','review_booked']],
];
export const campaign97StageMap=Object.fromEntries(campaign97Stages.map(([key,label,owner,deps])=>[key,{key,label,owner,deps}]));
const text=v=>String(v||'').trim();
export function httpsLink(value){if(!value)return null;try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||[...u.searchParams.keys()].some(k=>/^(access_token|token|download_access_token|secret|api_key)$/i.test(k)))throw Error();return u.href}catch{throw Error('Utilisez un lien HTTPS vérifié, sans identifiant secret.')}}
export function cleanCampaign97Settings(v){const out={};for(const key of ['video_url','playbook_url','intake_url'])out[key]=httpsLink(text(v[key]));if(out.intake_url&&(!decodeURIComponent(out.intake_url).includes(intake97Id)||/form-builder|\/location\//i.test(out.intake_url)))throw Error('Réutilisez le formulaire Installation Meta 97 $ existant.');out.lead_capture_mode=leadCaptureMode(v.lead_capture_mode);if(v.lead_capture_mode&&!out.lead_capture_mode)throw Error('Type de formulaire inconnu.');out.working_hours_note=text(v.working_hours_note)||null;out.timezone='America/Toronto';out.question_variant_note=text(v.question_variant_note)||'Écart documentaire : trois réponses dans le script, cinq dans la roadmap. Ne pas recréer le formulaire.';return out}
export function campaign97Data(data,clientId){const out={};for(const t of campaign97Tables)out[t]=(data[t]||[]).filter(x=>x.client_id===clientId);out.settings=newest(out.campaign97_settings);return out}
export function latestCampaign97Events(rows){return Object.fromEntries(campaign97Stages.map(([key])=>[key,newest(rows.filter(r=>r.event_key===key))]))}
export function event97Active(row,latest,settings,seen=new Set()){
 if(!row||seen.has(row.id))return false;const next=new Set(seen).add(row.id),def=campaign97StageMap[row.event_key];if(!def)return false;
 if(row.event_key==='video'&&(!settings?.data.video_url||row.data.source_url!==settings.data.video_url))return false;
 if(row.event_key==='playbook'&&(!settings?.data.playbook_url||row.data.source_url!==settings.data.playbook_url))return false;
 if(row.event_key==='form_sent'&&(!settings?.data.intake_url||row.data.source_url!==settings.data.intake_url))return false;
 for(const dep of def.deps){const prior=latest[dep];if(row.anchors?.[dep]!==prior?.id||!event97Active(prior,latest,settings,next)||dep==='form_read'&&prior.data.decision!=='approved')return false}return true;
}
export function milestone97Dates(launchAt){if(!launchAt)return {};const day=torontoClock(new Date(launchAt)).day;return Object.fromEntries([0,3,7,14,18,20,21].map(n=>['j'+n,shiftDay(day,n)]))}
export function campaign97State(s,now=new Date()){
 const latest=latestCampaign97Events(s.campaign97_events),done={},blocked={};
 for(const [key,,owner,deps] of campaign97Stages){done[key]=event97Active(latest[key],latest,s.settings)&&(key!=='form_read'||latest[key].data.decision==='approved');blocked[key]=deps.filter(d=>!done[d]).map(d=>campaign97StageMap[d].label);if(['video','playbook','form_sent'].includes(key)){const field={video:'video_url',playbook:'playbook_url',form_sent:'intake_url'}[key];if(!s.settings?.data[field])blocked[key].push('Ressource vérifiée à mettre à disposition')}if(key==='access'&&(!s.settings?.data.video_url||!s.settings?.data.playbook_url||!s.settings?.data.intake_url))blocked[key].push('Vidéo, playbook et formulaire à configurer');if(key==='launch_authorized'&&!leadCaptureMode(s.settings?.data?.lead_capture_mode))blocked[key].push('Source des demandes à confirmer');}
 const launch=done.launch?latest.launch:null,dates=milestone97Dates(launch?.occurred_at),deadline=done.launch_plan?latest.launch_plan.data.deadline_at:null;
 for(const [k,d]of Object.entries({check_j7:'j7',check_j14:'j14',review_request:'j18'}))if(dates[d]&&torontoClock(now).day<dates[d])blocked[k].push('À partir du '+dates[d]+' · depuis le lancement réel');
 return {latest,done,blocked,next:campaign97Stages.find(([key])=>!done[key]),dates,deadline,deadlineLate:!!deadline&&!launch&&Date.parse(deadline)<+now,workingHoursConfirmed:!!s.settings?.data.working_hours_note,initialBookingUrl:done.form_read?latest.form_read.data.booking_url:null,reviewBookingUrl:done.review_request?latest.review_request.data.booking_url:null};
}
export const review97Numbers=['active_days','spend','leads','duplicates','invalid','out_of_area','contacted','conversations','appointments_booked','appointments_held','contracts','transactions','commission'];
export function validateCampaign97Event(input,s,{offer,admin,now=new Date()}={}){
 if(offerKey(offer)!=='97')throw Error('Ce parcours est réservé à l’offre 97 $.');const def=campaign97StageMap[input.event_key];if(!def)throw Error('Étape inconnue.');if(def.owner==='David'&&!admin)throw Error('Validation humaine de David requise.');const state=campaign97State(s,now);if(state.blocked[def.key].length)throw Error('À compléter : '+state.blocked[def.key].join(', '));
 const occurred_at=instant(input.occurred_at,'America/Toronto');if(Date.parse(occurred_at)>+now)throw Error('La date réalisée ne peut pas être future.');for(const dep of def.deps)if(Date.parse(occurred_at)<Date.parse(state.latest[dep].occurred_at))throw Error('La réalisation précède un prérequis.');const target={check_j7:'j7',check_j14:'j14',review_request:'j18'}[def.key];if(target&&torontoClock(new Date(occurred_at)).day<state.dates[target])throw Error('Date antérieure au repère depuis le lancement réel.');const note=text(input.note);if(!note||note.length>4000)throw Error('Ajoutez une note ou une référence de preuve.');const data={...input.data};
 for(const key of ['video','playbook','form_sent'])if(def.key===key)data.source_url=s.settings.data[{video:'video_url',playbook:'playbook_url',form_sent:'intake_url'}[key]];
 if(def.key==='form_sent'){data.form_id=intake97Id;data.provenance='manual_declaration';}
 if(def.key==='form_read'){if(!['approved','clarify'].includes(data.decision))throw Error('Consignez la lecture et la décision humaine.');data.booking_url=data.decision==='approved'?httpsLink(data.booking_url):null;if(data.decision==='approved'&&!data.booking_url)throw Error('Ajoutez le lien de réservation vérifié après lecture.');}
 if(['call_booked','review_booked'].includes(def.key)){data.scheduled_at=instant(data.scheduled_at,'America/Toronto');if(Date.parse(data.scheduled_at)<Date.parse(occurred_at))throw Error('La réservation ne peut précéder sa confirmation.');if(!text(data.appointment_ref))throw Error('Ajoutez la référence de réservation.');if(def.key==='review_booked'&&!state.reviewBookingUrl)throw Error('Lien du bilan à mettre à disposition par David.');}
 if(def.key==='launch_plan'){data.deadline_at=instant(data.deadline_at,'America/Toronto');if(!s.settings?.data.working_hours_note||data.human_checked!==true||Date.parse(data.deadline_at)<=Date.parse(state.latest.call_held.occurred_at))throw Error('Convention des heures ouvrables et échéance humaine à confirmer.');data.method='manual_human_approved';data.working_hours_note=s.settings.data.working_hours_note;}
 if(def.key==='launch_authorized'){if(!leadCaptureMode(s.settings?.data?.lead_capture_mode))throw Error('Confirmez le type de formulaire et la source des demandes avant lancement.');for(const key of ['access_verified','client_content_approved','lead_delivery_tested','followup_ready','budget_authorized'])if(data[key]!==true)throw Error('La checklist humaine de lancement est incomplète.');if(!text(data.budget_source_ref))throw Error('Référence de l’autorisation de budget requise.');}
 if(def.key==='launch'&&(data.real_launch_confirmed!==true||Date.parse(occurred_at)<Date.parse(state.latest.call_held.occurred_at)))throw Error('Consignez uniquement le lancement effectif vérifié après l’appel.');
 if(def.key==='review_request'){data.booking_url=httpsLink(data.booking_url);if(!data.booking_url)throw Error('Ajoutez le lien vérifié de l’appel bilan.');}
 if(def.key==='review_form'){if(!validDay(data.period_end)||data.period_end>torontoClock(now).day||data.period_end<state.dates.j0)throw Error('Vérifiez la période depuis le lancement réel.');for(const key of review97Numbers){data[key]=data[key]===''||data[key]==null?null:Number(data[key]);if(data[key]!=null&&(!Number.isFinite(data[key])||data[key]<0||!['spend','commission'].includes(key)&&!Number.isInteger(data[key])))throw Error('Les chiffres inconnus restent vides; les valeurs négatives sont refusées.');}if(!text(data.source_note))throw Error('Précisez la provenance et le comptage sans doublons.');}
 if(def.key==='review_call'){if(!['continue','measure_first','interested_group','interested_individual'].includes(data.outcome)||!text(data.next_action)||!validDay(data.next_action_day))throw Error('Consignez la décision humaine et la prochaine action datée.');}
 const anchors=Object.fromEntries(def.deps.map(key=>[key,state.latest[key].id]));return {event_key:def.key,occurred_at,note,data,anchors,version:(state.latest[def.key]?.version||0)+1,source:'manual',source_version:campaign97SourceVersion};
}
