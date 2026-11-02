import {escapeHTML as h} from './model.mjs';
import {offerKey} from './entitlements.mjs';

// Catalogue de l'offre, pas des données client. Les achats et les URL viennent des tables.
export const ADDONS=[
 {key:'template_pub',tag:'CG97-bump-template-pub',label:'Template de pub',linkKey:'cg97_lien_template_pub'},
 {key:'template_prospection',tag:'CG97-bump-template-prospection',label:'Template de prospection',linkKey:'cg97_lien_template_prospection'}
];
export const BILAN_TAG='CG97-bilan-livré';
export const KNOWN_TAGS=[...ADDONS.map(a=>a.tag),BILAN_TAG];
export const LINK_KEYS={templatePub:'cg97_lien_template_pub',templateProspection:'cg97_lien_template_prospection',accelerator:'lien_app_accelerator'};
// Affichés seulement comme exemple dans le formulaire admin. Jamais utilisés comme lien cliquable.
export const GHL_LINKS={
 accelerator:'https://api.leadconnectorhq.com/widget/survey/SGO67W4D6vqxQozBBVsw',
 expansion:'https://api.leadconnectorhq.com/widget/form/iDFU2G4kejEYEC5simah',
 support:'https://api.leadconnectorhq.com/widget/form/HbwL6vW2xmreY7YFQPLz',
};
export const LINK_PLACEHOLDERS={
 cg97_lien_template_pub:'https://docs.google.com/document/d/PLACEHOLDER_TEMPLATE_PUB/copy',
 cg97_lien_template_prospection:'https://docs.google.com/document/d/PLACEHOLDER_TEMPLATE_PROSPECTION/copy',
 lien_app_accelerator:GHL_LINKS.accelerator,
};
export const LINK_FIELDS=[
 {key:LINK_KEYS.templatePub,label:'Google Doc · template de pub'},
 {key:LINK_KEYS.templateProspection,label:'Google Doc · template de prospection'},
 {key:LINK_KEYS.accelerator,label:'Candidature Accelerator'}
];
export const WAITLIST_STATUSES=['en_attente','place_offerte','retiree','acceptee'];
export const WAITLIST_STATUS_LABELS={en_attente:'En attente',place_offerte:'Place offerte',retiree:'Retirée de la liste',acceptee:'Place acceptée'};
export const TICKET_STATUSES=['ouvert','en_cours','repondu','ferme'];
export const TICKET_STATUS_LABELS={ouvert:'Ouvert',en_cours:'En cours',repondu:'Répondu',ferme:'Fermé'};
export const HANDOFF_PHRASE="Je transfère ta question à l'équipe. Tu auras une réponse ici d'ici 48 h ouvrables.";
const OPEN_WAITLIST=['en_attente','place_offerte'];

export function portalHttpsUrl(value){
 const text=String(value??'').trim();
 if(!text)return null;
 let url;
 try{url=new URL(text)}catch{throw Error('Utilise un lien https.')}
 if(url.protocol!=='https:'||url.username||url.password)throw Error('Utilise un lien https, sans identifiant.');
 if([...url.searchParams.keys()].some(k=>/token|secret|api_key|key/i.test(k)))throw Error('Le lien ne doit pas contenir de secret.');
 if(url.href.length>500)throw Error('Lien trop long.');
 return url.href;
}
function safeLink(value){try{return portalHttpsUrl(value)}catch{return null}}
export function normalizeTags(tags){
 const known=new Set(KNOWN_TAGS);
 return [...new Set((tags||[]).filter(tag=>known.has(tag)))];
}
export function visibleAddons(tags,links={}){
 const owned=new Set(normalizeTags(tags));
 return ADDONS.filter(addon=>owned.has(addon.tag)).map(addon=>({...addon,url:safeLink(links[addon.linkKey])}));
}
export function suiteReady(tags){return normalizeTags(tags).includes(BILAN_TAG)}
export function openWaitlist(rows,clientId){
 return (rows||[]).find(row=>(!clientId||row.client_id===clientId)&&OPEN_WAITLIST.includes(row.status))||null;
}
export function joinWaitlist(rows,clientId,now){
 if(!clientId)throw Error('Dossier requis.');
 const current=openWaitlist(rows,clientId);
 if(current)return {already:true,row:current};
 return {already:false,row:{client_id:clientId,requested_at:now,status:'en_attente'}};
}
export function waitlistUpdate(status,now){
 if(!WAITLIST_STATUSES.includes(status))throw Error('Statut invalide.');
 return {status,updated_at:now};
}
export function ticketDraft(question,clientId,userId,now){
 const text=String(question||'').replace(/\s+/g,' ').trim();
 if(!clientId||!userId)throw Error('Dossier requis.');
 if(text.length<2||text.length>2000)throw Error('Écris ta question (2 à 2 000 caractères).');
 return {client_id:clientId,created_by:userId,question:text,status:'ouvert',created_at:now};
}
export function ticketUpdate({status,reply},now){
 if(!TICKET_STATUSES.includes(status))throw Error('Statut invalide.');
 const text=String(reply||'').trim();
 if(text.length>4000)throw Error('Réponse trop longue.');
 return {status,reply:text||null,replied_at:text?now:null};
}

export function resourcesCardHtml(addons){
 if(!addons?.length)return '';
 const buttons=addons.map(addon=>addon.url
  ?`<a class="secondary-link" href="${h(addon.url)}" target="_blank" rel="noopener noreferrer">${h(addon.label)}</a>`
  :`<span class="sprint97-pending"><button type="button" class="secondary" disabled>${h(addon.label)}</button><p class="small muted">Lien Google Doc à configurer.</p></span>`).join('');
 return `<section class="card sprint97-card" data-card="resources"><p class="kicker">MES RESSOURCES</p><h2>Tes ajouts, prêts à utiliser</h2><p>Chaque bouton ouvre le Google Doc. Tu peux en faire une copie.</p><div class="sprint97-actions">${buttons}</div></section>`;
}
export function acceleratorHref(url){return safeLink(url)||GHL_LINKS.accelerator}
export function suiteWaitState(rows,clientId){
 const open=openWaitlist(rows,clientId);
 if(open?.status==='place_offerte')return 'offered';
 if(open)return 'waiting';
 if((rows||[]).some(row=>(!clientId||row.client_id===clientId)&&row.status==='acceptee'))return 'accepted';
 return 'none';
}
export function suiteCardHtml({visible,acceleratorUrl,waitState='none'}){
 if(!visible)return '';
 const accelerator=`<a class="secondary-link" href="${h(acceleratorHref(acceleratorUrl))}" target="_blank" rel="noopener noreferrer">Candidature Accelerator</a>`;
 const join=`<a class="secondary-link" href="${h(GHL_LINKS.expansion)}" target="_blank" rel="noopener noreferrer" data-act="waitlist-join">Liste d'attente Expansion 1:1</a>`;
 const leave=`<button type="button" class="secondary" data-act="waitlist-leave">Me retirer de la liste</button>`;
 const accept=`<button type="button" class="secondary" data-act="waitlist-accept">J'accepte la place</button>`;
 const followup=waitState==='offered'
  ?`<p class="sprint97-wait" role="status">L'équipe t'a proposé une place.</p><div class="sprint97-actions">${accept}${leave}</div>`
  :waitState==='waiting'
   ?`<p class="sprint97-wait" role="status">Tu es inscrit sur la liste d'attente.</p>${leave}`
   :waitState==='accepted'
    ?`<p class="sprint97-wait" role="status">Tu as accepté la place.</p>`
    :'';
 return `<section class="card sprint97-card" data-card="suite"><p class="kicker">TA SUITE</p><h2>La suite de ton Sprint</h2><p>Ton Sprint a installé le L. L'Accelerator, offre de groupe de 3 mois (20 à 30 clients), installe le reste de ton système L.I.S.T. L'Expansion 1:1 est l'accompagnement individuel de 3 mois.</p><div class="sprint97-actions">${accelerator}${waitState==='none'||waitState==='waiting'?join:''}</div>${followup}</section>`;
}
export function sprint97Cards({offer,tags,links,waitlist,clientId}){
 if(offerKey(offer)!=='97')return {resources:'',suite:''};
 return {
  resources:resourcesCardHtml(visibleAddons(tags,links)),
  suite:suiteCardHtml({visible:suiteReady(tags),acceleratorUrl:links?.[LINK_KEYS.accelerator]||null,waitState:suiteWaitState(waitlist,clientId)})
 };
}
export function supportCardHtml({tickets=[],result=null}={}){
 const items=(tickets||[]).map(ticket=>{
  const written=ticket.reply?`<p>${h(ticket.reply)}</p>`:`<p>${h(HANDOFF_PHRASE)}</p>`;
  return `<li class="task"><div><h3>${h(ticket.question)}</h3>${written}<p class="small muted">${h(TICKET_STATUS_LABELS[ticket.status]||ticket.status)}</p></div></li>`;
 }).join('');
 return `<section class="card sprint97-card" data-card="support" id="poser-une-question"><p class="kicker">SUPPORT</p><h2>Poser une question</h2><p>Un assistant te répond en quelques minutes avec tes données de campagne. S'il ne sait pas, l'équipe te répond ici par écrit en 48 h ouvrables. On ne fait pas de support par texto ni en privé.</p><form id="support-ask"><label>Ta question<textarea name="question" maxlength="2000" required></textarea></label><button class="primary" type="submit">Poser ma question</button></form><div id="support-answer">${resultHtml(result)}</div>${items?`<ul class="list sprint97-tickets">${items}</ul>`:''}</section>`;
}
const supportFormLink=()=>`<a class="secondary-link" href="${h(GHL_LINKS.support)}" target="_blank" rel="noopener noreferrer">Ouvrir le formulaire</a>`;
function resultHtml(result){
 if(!result)return '';
 if(result.saved)return `<div class="support-answer" role="status"><p>${h(HANDOFF_PHRASE)}</p><p>La réponse sera écrite ici, dans le portail.</p>${supportFormLink()}</div>`;
 if(result.error)return `<div class="support-answer" role="alert"><p>${h(result.error)}</p></div>`;
 const answer=result.answer?`<p>${h(result.answer)}</p>`:`<p>Je n'ai pas cette réponse dans la FAQ.</p>`;
 const kind=result.handoff&&!result.answer?'primary':'secondary';
 return `<div class="support-answer">${answer}<button type="button" class="${kind}" data-act="support-handoff">Envoyer ma question à l'équipe</button>${supportFormLink()}</div>`;
}

const STOP=new Set('les des une aux dans pour par sur avec sans que qui quoi elle nous vous mon mes ton tes cet cette ces sont pas plus moins tres tres comme quand comment pourquoi quel quelle quels quelles suis avez fait faire vais aller avoir etre ete du au et ou en un je tu il on ma ta se te me ne ni sa y dont'.split(' '));
const fold=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/['’]/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
const tokens=value=>fold(value).split(' ').filter(word=>word.length>2&&!STOP.has(word));
function forceHandoff(value){
 const text=fold(value);
 if(/rembours|annul|resili/.test(text))return 'argent';
 if(/\b(facture|facturation)\b/.test(text)||/conditions generales|termes et conditions/.test(text))return 'argent';
 if(/desactiv|restreint|compte bloque|pub rejet|publicite rejet/.test(text))return 'meta';
 if(/mecontent|pas content|inacceptable|arnaque|plainte/.test(text))return 'insatisfaction';
 if(/(changer|modifier|change).{0,24}(pub|formulaire|visuel|texte)/.test(text))return 'campagne';
 return null;
}
function scoreEntry(query,entry){
 const folded=fold(query),words=tokens(query);
 const doc=new Set([...tokens(entry.question),...tokens((entry.aliases||[]).join(' '))]);
 let hits=0;
 for(const word of words)if(doc.has(word))hits+=1;
 let phrase=0;
 for(const alias of [entry.question,...(entry.aliases||[])]){
  const text=fold(alias);
  if(text.length>=8&&(folded===text||folded.includes(text)))phrase=4;
 }
 return {hits,phrase,score:hits+phrase};
}

export const FAQ=[
 {id:1,handoff:false,question:'Par où je commence?',aliases:['etape 0','par ou commencer','demarrage'],answer:"Par l'étape 0 : donner l'accès à ta page et à ton compte publicitaire, et ajouter ton moyen de paiement. Le guide et la vidéo de 3 min sont dans ton portail. Ensuite : la vidéo de bienvenue, puis ta fiche (objectif + 3 réponses)."},
 {id:2,handoff:false,question:'Pourquoi rien ne bouge dans mon dossier?',aliases:['rien ne bouge','dossier bloque','en attente'],answer:"Rien ne se monte tant que l'accès n'est pas validé. Regarde la carte « Étape 0 » de ton portail : elle dit ce qui manque."},
 {id:3,handoff:false,question:'Vous voulez mon mot de passe?',aliases:['mot de passe','password','identifiant facebook'],answer:"Jamais. Tu nous donnes un accès partenaire à partir de ton Business Manager, avec notre Business ID 1689491525029937. Tu peux le retirer en tout temps."},
 {id:4,handoff:false,question:'Est-ce que je dois partager mon pixel ou mon dataset?',aliases:['pixel','dataset','site web'],answer:"Seulement si ta campagne envoie les gens vers ton site web. Pour un formulaire instantané Facebook (le cas normal du Sprint), non."},
 {id:5,handoff:false,question:'Qui paie la publicité?',aliases:['qui paie','budget pub','carte meta','moyen de paiement pub'],answer:"Toi, directement à Meta, avec ton moyen de paiement dans ton compte publicitaire. Le 97 $ couvre l'installation, pas le budget pub. Courtier Growth ne voit pas ta carte."},
 {id:6,handoff:false,question:'Je bloque sur l\'accès. Qu\'est-ce que je fais?',aliases:['bloque sur l acces','setup technique meta','aide acces'],answer:"Dis-moi ce que tu vois à l'écran et je te guide. Sinon, le Setup technique Meta (47 $) : 15 min en partage d'écran avec l'équipe. Si tu l'as ajouté à ton paiement, réserve ton créneau dans ton portail ; sinon, le lien d'achat est dans ton portail."},
 {id:7,handoff:false,question:'Ma page est dans le Business Manager de mon agence.',aliases:['page agence','business manager agence'],answer:"L'administrateur de l'agence doit partager la page avec Courtier Growth (Business ID 1689491525029937) ou te donner le contrôle total. Si ce n'est pas possible, on peut utiliser ta page professionnelle à toi, si tu en as une."},
 {id:8,handoff:false,question:'Mon compte publicitaire n\'apparaît pas dans mon Business Manager.',aliases:['compte personnel','compte pub invisible','ajouter compte publicitaire'],answer:"Il est probablement « personnel » (créé depuis ton profil). Dans Paramètres → Comptes → Comptes publicitaires → Ajouter, ajoute-le à ton Business Manager, puis partage-le avec nous."},
 {id:9,handoff:false,question:'J\'ai partagé, mais vous dites que ce n\'est pas reçu.',aliases:['pas recu','business id','partenaires'],answer:"Trois causes fréquentes : le Business ID a une erreur (copie-colle 1689491525029937) ; l'accès a été donné à une personne au lieu du partenaire (passe par Utilisateurs → Partenaires) ; tu as choisi le mauvais Business Manager (en haut à gauche)."},
 {id:10,handoff:false,question:'Vous dites que mon accès est partiel.',aliases:['acces partiel','autorisation manquante','prospects'],answer:"Il manque une autorisation. Page : Publicités, Statistiques et Prospects (sinon on ne voit pas les leads). Compte pub : Gérer les campagnes. Modifie les autorisations du partenaire et coche ce qui manque."},
 {id:11,handoff:false,question:'Mon paiement est refusé ou j\'ai un solde impayé.',aliases:['paiement refuse','solde impaye','carte refusee meta'],answer:"Va dans Facturation et paiements de ton compte pub, mets ta carte à jour et règle le solde. Ta campagne ne peut pas diffuser tant que le paiement n'est pas réglé."},
 {id:12,handoff:'always',question:'Mon compte publicitaire est désactivé ou restreint.',aliases:['compte desactive','compte restreint','centre de qualite'],answer:"Demande une révision dans le Centre de qualité du compte de Meta. On ne monte rien avant la réactivation."},
 {id:13,handoff:false,question:'Je ne suis pas administrateur de la page.',aliases:['pas administrateur','controle total page'],answer:"Demande à l'administrateur actuel de te donner le contrôle total, puis refais l'étape 0."},
 {id:14,handoff:false,question:'Facebook me demande la double authentification.',aliases:['double authentification','2fa','code facebook'],answer:"Active-la sur ton profil Facebook (Paramètres → Sécurité), puis recommence. Fais-le sur un ordinateur : les menus d'accès sont incomplets sur le cell."},
 {id:15,handoff:'always',question:'Mon compte publicitaire n\'est pas en dollars canadiens.',aliases:['devise','dollars canadiens','usd','compte cad'],answer:"La devise ne se change pas. Il faut créer un nouveau compte publicitaire en CAD dans ton Business Manager."},
 {id:16,handoff:false,question:'Quand ma campagne va-t-elle commencer?',aliases:['quand ca commence','date de lancement','delai lancement'],answer:"Après la validation de l'accès, de ta fiche et l'approbation de tes aperçus dans le portail. Le délai de lancement ne compte qu'à partir de la validation de l'accès."},
 {id:17,handoff:false,question:'Combien de demandes je vais avoir?',aliases:['combien de leads','volume','predictions','combien de prospects'],answer:"On ne peut pas le prédire. Ça dépend de ton secteur, de ton offre, du budget et de la période. Ce que je peux te donner, ce sont tes chiffres réels à date."},
 {id:18,handoff:false,question:'Où sont mes leads?',aliases:['ou sont mes prospects','formulaires instantanes','trouver mes leads'],answer:"Dans Meta Business Suite, section Formulaires instantanés / Prospects (et dans les avis que tu as choisis dans ta fiche). Le lead test fait au lancement te montre où les trouver."},
 {id:19,handoff:false,question:'Un lead ne répond pas. C\'est la campagne qui est mauvaise?',aliases:['lead ne repond pas','pas de reponse','campagne mauvaise'],answer:"Pas forcément. Une seule tentative, ce n'est pas un suivi : vise plusieurs tentatives sur quelques jours, à des heures différentes. Note ce qui se passe ; on le regarde à J7, J14 et au bilan."},
 {id:20,handoff:false,question:'Un numéro est invalide.',aliases:['numero invalide','mauvais numero','faux numero'],answer:"Note-le dans ta feuille J7. Quelques invalides, c'est normal. Si ça devient fréquent, l'équipe revoit le formulaire."},
 {id:21,handoff:false,question:'Le lead voulait seulement le guide ou la liste.',aliases:['seulement le guide','seulement la liste','pas un courtier'],answer:"C'est normal : il a demandé quelque chose d'utile, pas un courtier. Livre exactement ce qui a été promis, puis ouvre la conversation sur son projet. Un lead, ce n'est pas un mandat."},
 {id:22,handoff:false,question:'Je peux changer ma pub ou mon budget?',aliases:['changer mon budget','modifier le budget','changer la pub'],answer:"Le budget, oui, dans ton compte pub (tu en gardes le contrôle). Pour changer la pub ou le formulaire : je transfère ta demande à l'équipe."},
 {id:23,handoff:false,question:'Je peux vous texter ou vous appeler?',aliases:['texto','texter','appeler','support prive','message prive'],answer:"Non : tout le support passe par ici, pour que rien ne se perde. Je réponds en quelques minutes ; l'équipe, en 48 h ouvrables quand c'est nécessaire. Si tu veux un accompagnement personnel, il y a l'appel stratégie 1:1 dans ton portail (jusqu'à J21)."},
 {id:24,handoff:false,question:'Comment se passe le bilan?',aliases:['bilan','appel de 20 min','reserver le bilan'],answer:"Un appel de 20 min en direct, pour tous les clients, autour de J21. Tu le réserves avec le lien du message de J18 et tu remplis ta fiche bilan avant. On regarde ton objectif, tes chiffres, ce qui bloque, et une prochaine action."},
 {id:25,handoff:false,question:'Qu\'est-ce qui arrive à ma campagne après J21?',aliases:['apres j21','campagne apres','garder la campagne','retirer les acces'],answer:"Elle est dans ton compte, elle t'appartient. Tu choisis de la garder active, de la mettre en pause ou de la faire évoluer. Tu choisis aussi de garder ou de retirer nos accès."},
 {id:26,handoff:false,question:'C\'est quoi la suite après le Sprint?',aliases:['accelerator','expansion','quelle suite','apres le sprint'],answer:"La suite naturelle, c'est l'Accelerator : une offre de groupe de 3 mois, avec 20 à 30 clients, qui installe avec toi le reste du système L.I.S.T. (Accelerator : prix version fondateur de 2 000 $ au lieu de 3 000 $ (prix régulier), soit 1 000 $ de rabais). L'Expansion 1:1, c'est l'accompagnement individuel de 3 mois : le même système, en un à un (4 500 $ pour 3 mois), qui fonctionne sur liste d'attente : tu peux t'y inscrire après ton bilan. On en parle à ton bilan, avec tes chiffres. Les liens d'application sont dans ton portail."},
 {id:27,handoff:'always',question:'Je veux un remboursement ou annuler.',aliases:['remboursement','annuler','annulation'],answer:"Je transfère ta demande à l'équipe, qui te répond en 48 h ouvrables selon les conditions. La seule garantie du Sprint : 20 leads en 21 jours après le lancement (conditions dans tes T&C) ; il n'y a aucune autre promesse de rendement."},
 {id:28,handoff:false,question:'Est-ce que ce que j\'ai payé pour le Sprint compte si je continue?',aliases:['credit','ce que j ai paye','rabais accelerator','compte sur accelerator'],answer:"Oui, si tu achètes l'Accelerator ou l'Expansion 1:1 dans les 7 jours suivant ton bilan : tout ce que tu as payé pour ton Sprint (le Sprint, tes ajouts et l'appel 197 $, s'il y a lieu) est crédité au complet. La date limite est dans le récap de ton bilan. Après cette date, le crédit ne s'applique plus. L'inscription seule à la liste d'attente de l'Expansion 1:1 ne déclenche pas le crédit."}
];

export function answerQuestion(question,context={}){
 const text=String(question||'').trim();
 if(text.length<2)return {matched:null,answer:null,handoff:false};
 const force=forceHandoff(text);
 const ranked=FAQ.map(entry=>({entry,...scoreEntry(text,entry)})).sort((a,b)=>b.score-a.score||b.hits-a.hits||a.entry.id-b.entry.id);
 const [best,second]=ranked;
 const confident=!!best&&(best.phrase>=4||best.hits>=2)&&best.score>=2&&(!second||best.score>second.score||best.phrase>second.phrase);
 let entry=confident?best.entry:null;
 if(force==='argent'){const refund=ranked.find(row=>row.entry.id===27);if(refund&&(refund.hits>=1||refund.phrase))entry=refund.entry}
 const folded=fold(text);
 let handoff=!!force||!entry||entry.handoff==='always';
 if(entry?.id===22&&/\b(pub|formulaire|visuel|texte)\b/.test(folded))handoff=true;
 if(entry?.id===20&&/beaucoup|frequent|souvent|25/.test(folded))handoff=true;
 if(entry?.id===28&&/pas d accord|contest|incorrect|faux montant|mauvaise date/.test(folded))handoff=true;
 let answer=entry?.answer||null;
 if(entry?.id===17&&answer){
  const bits=[];
  if(context.leads!=null&&Number.isFinite(Number(context.leads)))bits.push(`${Number(context.leads)} demande${Number(context.leads)>1?'s':''}`);
  if(context.spend!=null&&Number.isFinite(Number(context.spend)))bits.push(`${Number(context.spend)} $ dépensés`);
  if(bits.length)answer+=` Tes chiffres réels à date : ${bits.join(', ')}. Aucune projection.`;
 }
 return {matched:entry?.id??null,answer,handoff};
}

export function tableMissing(error){
 if(!error)return false;
 const code=String(error.code||'');
 const message=String(error.message||'');
 return code==='42P01'||code==='PGRST205'||/does not exist|schema cache|could not find the table|relation .* does not exist/i.test(message);
}
export function formatToronto(value){
 if(!value)return '';
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return '';
 return new Intl.DateTimeFormat('fr-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Toronto'}).format(date);
}
