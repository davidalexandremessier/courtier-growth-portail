# Pilote « Démarrer ici »

Parcours guidé pour préparer un sous-compte GoHighLevel avant l’appel technique. Français du Québec, une étape à la fois, progression enregistrée par sous-compte.

Le pilote ne modifie aucun compte client. Il n’achète aucun numéro, n’envoie aucun message et n’écrit rien dans GoHighLevel.

## Où l’ouvrir

- Parcours : `/demarrer-ici?location_id={{location.id}}`
- Suivi agence : `/demarrer-ici/agence` (session administrateur du portail, déjà ouverte dans le même navigateur)

Lien de menu personnalisé, **iframe**, assigné seulement au sous-compte de test :

`https://portail.courtiergrowth.com/demarrer-ici?location_id={{location.id}}`

Sous-compte autorisé : **TEMPLATE GHL**, `DsPXZp1SUaWntQvf0OTU`. Tout autre identifiant reçoit la même réponse « parcours non disponible », sans dire si le compte existe.

## Ce que fait chaque étape

| Étape | Bouton | Où ça mène |
|---|---|---|
| 1. Infos du courtier | Enregistrer mes informations | Formulaire dans le portail. Aucun mot de passe. Si les champs sont complets, la vérification serveur pose **Validé**. |
| 2. Préparation du compte | Voir les automatisations | `…/automation/workflows` |
| 3. Numéro | Ouvrir les numéros | `…/settings/phone_system?tab=manage` (chemin vu dans TEMPLATE) |
| 4. Facebook et Instagram | Ouvrir les intégrations | `…/settings/integrations` (chemin vu dans TEMPLATE) |
| 5. Google Agenda | Ouvrir les calendriers | `…/calendars` (chemin vu dans TEMPLATE). La connexion Google n’est pas lisible par l’API. |
| 6. Sous-domaine | Ouvrir les domaines | `…/settings/domain` |
| 7. Ancienne liste (facultative) | Ouvrir l’import des contacts | `…/contacts/import` |
| 8. LeadConnector | App Store et Google Play | Magasins officiels. Les consignes sont du texte, pas un faux bouton. |
| 9. Validation finale | Demander la validation | Met l’étape **En attente**. Seule l’agence peut poser **Validé**. |

Les liens GoHighLevel s’ouvrent dans un nouvel onglet (`target="_blank"`), sinon la page GHL reste coincée dans l’iframe.

Un clic « J’ai terminé cette étape » met **En attente**. Il ne met jamais **Validé**. Il n’envoie aucun courriel, texto ou message GoHighLevel. Il écrit seulement le statut dans la progression du portail. L’agence le voit dans `/demarrer-ici/agence`.

## Boutons

| Bouton | Effet | Message envoyé |
|---|---|---|
| Bouton principal de l’étape (ouvrir une page GoHighLevel, le formulaire, ou un magasin) | Ouvre la page, ou enregistre le formulaire | Aucun |
| J’ai terminé cette étape | Statut **En attente** pour l’étape affichée | Aucun courriel, texto ou notification |
| Cette étape ne me concerne pas | Statut **Non applicable**, ancienne liste seulement | Aucun |
| Lancer la vérification | Un seul bouton, en bas de page. Lectures serveur, puis mise à jour des statuts | Aucun |
| Besoin d’aide, puis Envoyer à l’agence | Note enregistrée sur **l’étape affichée**, statut **Besoin d’aide** | Aucun. Personne n’est prévenu automatiquement. L’agence lit la note dans le suivi |
| Effacer la progression | Réservé à l’administrateur. Remet le sous-compte de test à zéro | Aucun |

Le pilote n’envoie aucun courriel ni texto.

## Vérifications automatiques

Lectures GET seulement, vers `services.leadconnectorhq.com`, avec `GHL_PILOT_LOCATION_TOKEN` s’il est posé. Ce jeton doit être une intégration privée **du sous-compte TEMPLATE**, pas `GHL_CENTRAL_TOKEN` (sous-compte Courtier Growth) ni `GHL_DANIEL_TOKEN`.

Sans ce jeton, ou si la lecture est refusée, l’étape reste en **vérification manuelle par l’agence**. Le jeton n’apparaît ni dans la page, ni dans les réponses, ni dans les journaux.

| Étape | Lecture | Validé automatique |
|---|---|---|
| 1 | Champs du formulaire | Oui, si le formulaire est complet |
| 2 | `GET /locations/:id`, `GET /workflows/?locationId=` | Oui, si un snapshot est chargé, les doublons sont refusés et chaque workflow publié est dans `WORKFLOWS_PUBLISHED_ALLOWED` (`src/demarrer-ici/workflows.mjs`). Tout autre workflow publié doit rester en brouillon. Le suivi agence liste les workflows publiés. |
| 3 | Numéros actifs, canal SMS | Non. Aucun numéro, ou HTTP 404 « No Twilio account found », laisse l’étape **À faire** : « Aucun numéro / téléphonie pas encore configurée ». Un numéro canadien SMS et voix passe à **En attente** : l’identité et l’indicatif vérifié ne sont pas lisibles. |
| 4 | Comptes du planificateur social | Non. Page Facebook active : **En attente**. Le mapping des formulaires reste manuel |
| 5 | Calendriers | Non. La connexion Google n’a pas d’API |
| 6 | Funnels, puis HTTPS si l’hôte est `*.courtiergrowth.com` | Oui, seulement si ce sous-domaine répond en HTTPS |
| 7, 8, 9 | Aucune | Non |

Les portées utiles du jeton : `locations.readonly`, `workflows.readonly`, `phonenumbers.read`, `socialplanner/account.readonly`, `calendars.readonly`, `funnels/funnel.readonly`.

### Canaux SMS et courriel

La lecture est `GET /locations/:locationId/conversationChannels/SMS` et `GET /locations/:locationId/conversationChannels/Email` (le type est en majuscules).

La portée exacte est **`locations.readonly`**. C’est la portée déclarée par l’opération HighLevel « Get Conversation Channel ». Elle est déjà sur l’intégration pilote. `conversations.readonly` lit les fils de conversation, pas ce réglage de canal. `phonenumbers.read` lit la liste des numéros.

Un HTTP 404 dont le message est « No Twilio account found » veut dire que le sous-compte n’a pas de compte téléphonie. L’étape 3 reste **À faire**. Ce n’est pas une portée manquante. « Lecture impossible pour le moment » reste réservé à un délai, un HTTP 5xx ou une réponse illisible. Un 401 ou un 403 reste « Lecture refusée ».

### Workflows publiés

La liste des exceptions se modifie dans `src/demarrer-ici/workflows.mjs`, constante `WORKFLOWS_PUBLISHED_ALLOWED`. Aujourd’hui : Reply STOP, les rappels et rendez-vous, et les changements de pipeline liés à un appel découverte ou pitch déjà réservé. Listing actif, visites, outbound call et anciens clients à fidéliser n’en font pas partie : s’ils sont publiés, l’étape 2 reste **À faire**. Le suivi agence affiche chaque workflow publié, autorisé ou à remettre en brouillon.

## Sauvegarde

Table `public.demarrer_ici_progress`, migration `migrations/20261102_demarrer_ici.sql`. `anon` et `authenticated` n’ont aucun droit. L’API utilise `SUPABASE_URL` et `SUPABASE_ARCHIVE_SECRET_KEY`, après la liste blanche ou `is_admin()`.

L’administrateur efface la progression d’un sous-compte depuis le suivi, bouton « Effacer la progression ». Ça remet le formulaire et les statuts à zéro. Aucun message n’est envoyé.

## Avant un vrai client : SSO Marketplace

`{{location.id}}` dans l’URL n’est pas une preuve d’identité. Il se copie, se journalise et se devine. Le pilote compense par une liste blanche d’un seul sous-compte de test.

Avant d’ouvrir le parcours à un courtier :

1. Créer une application Marketplace (pas seulement un lien de menu).
2. Garder le secret partagé sur le serveur. Ne jamais l’envoyer au navigateur.
3. Demander le contexte utilisateur (`REQUEST_USER_DATA` / SSO décrit dans la doc HighLevel « User Context in Marketplace Apps »).
4. Déchiffrer ce contexte côté serveur et ne faire confiance qu’au `locationId` qu’il contient, pas à celui de la query.
5. Retirer la liste blanche de test, ou la remplacer par les sous-comptes réellement liés à un dossier du portail.
6. Ajouter le domaine blanc de l’agence à `frame-ancestors` si l’application n’est pas servie depuis `app.gohighlevel.com`.

Doc : https://marketplace.gohighlevel.com/docs/other/user-context-marketplace-apps

## Iframe et aperçu Vercel

La page `/demarrer-ici` remplace `frame-ancestors 'none'` et `X-Frame-Options: DENY` pour autoriser l’affichage dans GoHighLevel. Le reste du portail reste non intégrable.

Un aperçu Vercel protégé par Vercel Authentication bloque l’iframe : GoHighLevel ne peut pas se connecter à la protection. Il faut un déploiement dont cette route est publique, ou désactiver la protection sur l’aperçu, avant de coller l’URL dans le menu.
