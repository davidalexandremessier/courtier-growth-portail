// Lectures GET seulement. Jamais d’achat, de message, ni d’écriture GoHighLevel.
import {PILOT_LOCATION_IDS} from '../src/demarrer-ici/model.mjs';

const API='https://services.leadconnectorhq.com';
const MANUAL='Vérification manuelle par l’agence.';

export function pilotToken(env,locationId){
 if(!PILOT_LOCATION_IDS.includes(locationId))return '';
 const token=env.GHL_PILOT_LOCATION_TOKEN;
 if(typeof token==='string'&&token.length>=20)return token;
 // GHL_CENTRAL_TOKEN et GHL_DANIEL_TOKEN appartiennent à d’autres sous-comptes.
 return '';
}

export async function runChecks(locationId,{env=process.env,fetchImpl=fetch}={}){
 const token=pilotToken(env,locationId);
 if(!token){
  return {mode:'manuel',results:manualResults(MANUAL)};
 }
 const get=(path)=>ghlGet(path,token,fetchImpl);
 const [location,numbers,sms,email,social,calendars,funnels,workflows]=await Promise.all([
  get('/locations/'+encodeURIComponent(locationId)),
  get('/phone-system/numbers/location/'+encodeURIComponent(locationId)+'?page=0&pageSize=50'),
  get('/locations/'+encodeURIComponent(locationId)+'/conversationChannels/SMS'),
  get('/locations/'+encodeURIComponent(locationId)+'/conversationChannels/Email'),
  get('/social-media-posting/'+encodeURIComponent(locationId)+'/accounts'),
  get('/calendars/?locationId='+encodeURIComponent(locationId)),
  get('/funnels/funnel/list?locationId='+encodeURIComponent(locationId)+'&limit=20'),
  get('/workflows/?locationId='+encodeURIComponent(locationId))
 ]);
 const https=await funnelHttps(funnels,fetchImpl);
 return {mode:'auto',results:[
  accountResult(location,workflows),
  numberResult(numbers,sms),
  socialResult(social),
  calendarResult(calendars),
  domainResult(funnels,email,https),
  {step:7,outcome:'manuel',detail:'Aucun import n’est lancé d’ici. Le classement se confirme avec l’agence. Cette étape ne bloque pas le lancement.'},
  {step:8,outcome:'manuel',detail:'Aucune API ne dit si LeadConnector est installée. '+MANUAL},
  {step:9,outcome:'manuel',detail:'La validation finale est faite par l’agence. Un clic ne la valide pas.'}
 ]};
}

function manualResults(detail){
 return [2,3,4,5,6,7,8,9].map(step=>({step,outcome:'manuel',detail}));
}

async function ghlGet(path,token,fetchImpl){
 const url=new URL(path,API);
 if(url.origin!==API)return {ok:false,status:0};
 try{
  const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+token,Version:'2021-07-28',Accept:'application/json'}});
  if(!response.ok)return {ok:false,status:response.status};
  const body=await response.json().catch(()=>null);
  return {ok:true,status:response.status,body};
 }catch{
  return {ok:false,status:0};
 }
}

function refused(status){
 if(status===401||status===403)return 'Lecture refusée pour ce sous-compte. '+MANUAL;
 return 'Lecture impossible pour le moment. '+MANUAL;
}

function accountResult(location,workflows){
 if(!location.ok)return {step:2,outcome:'manuel',detail:refused(location.status)};
 const row=location.body?.location||location.body||{};
 const snapshot=String(row.snapshotId||row.snapshot_id||'').trim();
 const duplicates=row.allowDuplicateContact===true||row.allowDuplicateContacts===true;
 if(!workflows.ok){
  const detail=snapshot
   ?'Un modèle est chargé, mais les automatisations ne sont pas lisibles. '+MANUAL
   :'Aucun modèle détecté, et les automatisations ne sont pas lisibles. '+MANUAL;
  return {step:2,outcome:snapshot?'partiel':'manuel',detail};
 }
 const list=Array.isArray(workflows.body?.workflows)?workflows.body.workflows:[];
 const published=list.filter(item=>/published|active/i.test(String(item.status||''))&&/prospection|new lead|centris|anniversaire|no-show/i.test(String(item.name||'')));
 if(!snapshot)return {step:2,outcome:'echoue',detail:'Aucun modèle (snapshot) détecté sur le sous-compte.'};
 if(published.length){
  const names=published.slice(0,3).map(item=>safeLabel(item.name)).filter(Boolean).join(', ');
  return {step:2,outcome:'echoue',detail:'Automatisations de prospection encore actives'+(names?' : '+names:'')+'.'};
 }
 if(duplicates)return {step:2,outcome:'partiel',detail:'Le modèle est chargé et les automatisations de prospection sont inactives. Les contacts en double sont encore permis. '+MANUAL};
 return {step:2,outcome:'reussi',detail:'Modèle chargé. Automatisations de prospection inactives. Doublons non permis.'};
}

function numberResult(numbers,sms){
 if(!numbers.ok)return {step:3,outcome:'manuel',detail:refused(numbers.status)};
 const list=listOf(numbers.body,['numbers','data']);
 const ready=list.filter(canadianReady);
 if(!ready.length){
  return {step:3,outcome:list.length?'echoue':'echoue',detail:list.length?'Des numéros sont présents, sans numéro canadien avec SMS et voix confirmé.':'Aucun numéro actif. L’achat se fait dans la page Numéros, pas ici.'};
 }
 const channel=sms.ok?providerCount(sms.body):null;
 const channelText=channel==null?' Le canal SMS n’a pas pu être lu.' : channel>0?' Canal SMS configuré.' : ' Canal SMS sans fournisseur dédié.';
 const masked=maskPhone(ready[0].phoneNumber||ready[0].phone||ready[0].number);
 return {step:3,outcome:'partiel',detail:(masked?masked+' : numéro canadien avec SMS et voix.':'Numéro canadien avec SMS et voix.')+channelText+' L’identité et l’indicatif vérifié restent une vérification manuelle par l’agence.'};
}

function socialResult(social){
 if(!social.ok)return {step:4,outcome:'manuel',detail:refused(social.status)};
 const list=listOf(social.body,['accounts']).concat(Array.isArray(social.body?.results?.accounts)?social.body.results.accounts:[]);
 const live=platform=>list.find(item=>String(item.platform||item.type||item.oauthType||'').toLowerCase().includes(platform)&&item.isExpired!==true&&item.deleted!==true);
 const facebook=live('facebook');
 const instagram=live('instagram');
 if(!facebook)return {step:4,outcome:'echoue',detail:'Aucune page Facebook connectée et active.'};
 const fb=safeLabel(facebook.name||facebook.pageName||'page connectée');
 const ig=instagram?safeLabel(instagram.name||instagram.username||'profil connecté'):'non connecté';
 return {step:4,outcome:'partiel',detail:'Page Facebook : '+fb+'. Instagram : '+ig+'. Le mapping des formulaires de leads reste une vérification manuelle par l’agence. Le compte publicitaire se règle dans Meta.'};
}

function calendarResult(calendars){
 if(!calendars.ok)return {step:5,outcome:'manuel',detail:refused(calendars.status)};
 const list=(Array.isArray(calendars.body?.calendars)?calendars.body.calendars:[]).filter(item=>item.isActive!==false);
 if(!list.length)return {step:5,outcome:'echoue',detail:'Aucun calendrier actif. La connexion Google Agenda reste une vérification manuelle par l’agence.'};
 return {step:5,outcome:'manuel',detail:list.length+' calendrier'+(list.length>1?'s':'')+' actif'+(list.length>1?'s':'')+'. La connexion Google Agenda n’est pas lisible par l’API. '+MANUAL};
}

function domainResult(funnels,email,https){
 if(!funnels.ok)return {step:6,outcome:'manuel',detail:refused(funnels.status)};
 const list=Array.isArray(funnels.body?.funnels)?funnels.body.funnels:[];
 const hosts=list.map(funnelHost).filter(Boolean);
 const withDomain=list.some(item=>String(item.domainId||item.domain_id||item.domain||'').trim());
 const mail=email.ok?(providerCount(email.body)>0?' Un fournisseur courriel distinct est configuré.':' L’envoi courriel reste distinct du domaine du funnel.'):'';
 if(https.ok)return {step:6,outcome:'reussi',detail:'Le sous-domaine '+https.host+' répond en HTTPS.'+mail};
 if(hosts.length)return {step:6,outcome:'partiel',detail:'Un sous-domaine courtiergrowth.com est associé, sans réponse HTTPS confirmée.'+mail+' '+MANUAL};
 if(withDomain)return {step:6,outcome:'partiel',detail:'Un funnel a un domaine associé. Le bon sous-domaine et le HTTPS restent une vérification manuelle par l’agence.'+mail};
 return {step:6,outcome:'echoue',detail:'Aucun domaine de funnel détecté.'+mail};
}

async function funnelHttps(funnels,fetchImpl){
 if(!funnels.ok)return {ok:false,host:''};
 const list=Array.isArray(funnels.body?.funnels)?funnels.body.funnels:[];
 const host=list.map(funnelHost).find(Boolean)||'';
 if(!host)return {ok:false,host:''};
 try{
  const response=await fetchImpl('https://'+host+'/',{method:'GET',redirect:'manual',signal:AbortSignal.timeout(5000)});
  return {ok:response.status>=200&&response.status<400,host};
 }catch{
  return {ok:false,host};
 }
}

function funnelHost(funnel){
 const raw=String(funnel?.domain||funnel?.domainName||funnel?.domainUrl||'').trim();
 if(!raw||!/[.]/.test(raw))return '';
 try{
  const host=new URL(/^[a-z]+:\/\//i.test(raw)?raw:'https://'+raw).hostname.toLowerCase();
  return /^[a-z0-9.-]+\.courtiergrowth\.com$/.test(host)?host:'';
 }catch{return ''}
}

function listOf(body,keys){
 if(Array.isArray(body))return body;
 for(const key of keys)if(Array.isArray(body?.[key]))return body[key];
 if(Array.isArray(body?.data?.numbers))return body.data.numbers;
 if(Array.isArray(body?.results))return body.results;
 return [];
}

function canadianReady(number){
 const caps=number?.capabilities||{};
 const sms=caps.sms===true||caps.SMS===true||number?.sms===true||number?.smsEnabled===true;
 const voice=caps.voice===true||caps.VOICE===true||number?.voice===true||number?.voiceEnabled===true;
 const country=String(number?.countryCode||number?.country||number?.region||'').toUpperCase();
 return sms&&voice&&country==='CA';
}

function providerCount(body){
 const channel=body?.conversationChannel||body||{};
 const providers=channel.providers||channel.conversationProviders||[];
 return Array.isArray(providers)?providers.length:0;
}

function maskPhone(value){
 const digits=String(value||'').replace(/\D/g,'');
 if(digits.length<4)return '';
 return '+'+digits[0]+' ••• ••• '+digits.slice(-4);
}

function safeLabel(value){
 const text=String(value||'').replace(/\s+/g,' ').trim().slice(0,80);
 if(!text||/bearer|pit-|sk_|secret|token|api[_-]?key/i.test(text))return text?'compte connecté':'';
 return text;
}
