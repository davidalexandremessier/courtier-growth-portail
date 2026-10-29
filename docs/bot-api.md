# API serveur des bots

Cette API permet à un bot du propriétaire de lire les dossiers clients et de modifier un petit nombre de champs. Elle est réservée aux appels serveur à serveur. Elle n’envoie aucun en-tête CORS et refuse toute requête qui porte un en-tête `Origin` (403).

L’authentification utilise la variable d’environnement `BOT_API_KEYS`. Ce n’est pas un secret à commiter : c’est un objet JSON dont chaque valeur est l’empreinte SHA-256 hexadécimale du jeton, jamais le jeton lui-même.

## Lire

```bash
curl --silent --show-error \
  --header "Authorization: Bearer LE_JETON" \
  "https://VOTRE_PORTAIL/api/bot-clients"
```

```bash
curl --silent --show-error \
  --header "Authorization: Bearer LE_JETON" \
  "https://VOTRE_PORTAIL/api/bot-clients?id=00000000-0000-4000-8000-000000000001"
```

La liste répond `{ "clients": [ ... ] }`. Un dossier répond `{ "client": { ... } }`. Les colonnes renvoyées sont : `id`, `name`, `email`, `offer`, `status`, `sector`, `main_constraint`, `launch_date`, `work_mode`, `support_start`, `support_end`, `crm_url`, `meta_ad_account_id`, `ghl_location_id`, `created_at`.

## Modifier

```bash
curl --silent --show-error \
  --request PATCH \
  --header "Authorization: Bearer LE_JETON" \
  --header "Content-Type: application/json" \
  --data '{"changes":{"status":"Actif","main_constraint":"Relancer les suivis"},"reason":"Point hebdomadaire"}' \
  "https://VOTRE_PORTAIL/api/bot-clients?id=00000000-0000-4000-8000-000000000001"
```

`reason` est obligatoire (500 caractères maximum). Seuls ces champs peuvent entrer dans `changes` :

| Champ | Valeurs acceptées |
| --- | --- |
| `status` | `Onboarding`, `Actif`, `En pause`, `Terminé` |
| `work_mode` | `Solo`, `Équipe` |
| `main_constraint` | texte, 1000 caractères maximum |
| `sector` | texte, 120 caractères maximum |
| `launch_date`, `support_start`, `support_end` | `AAAA-MM-JJ` ; la fin doit être le même jour ou après le début lorsque les deux sont envoyés |
| `crm_url` | chaîne vide ou URL `https://` sans espace |

`offer`, `email`, `name`, `id`, `meta_ad_account_id`, `ghl_location_id` et `created_at` sont lisibles et refusés en écriture (400). Une valeur qui ressemble à un secret (`password`, `mot de passe`, `mdp`, `token`, `api key`, `sk_`, ou `EAA` suivi d’une longue chaîne alphanumérique) est refusée (400).

`GET` et `PATCH` sont les seules méthodes acceptées. Les autres répondent 405. Un jeton absent ou inconnu répond 401. Une variable `BOT_API_KEYS` absente ou illisible répond 503.

## Journal

Chaque liste, lecture et refus d’authentification écrit une ligne dans `bot_audit_log`. L’acteur d’un appel accepté est le nom du bot. Un refus est enregistré avec l’acteur `refus` et la raison `jeton absent` ou `jeton refusé`, sans le jeton ni son empreinte. La mise à jour passe par la fonction `bot_update_client`, qui revérifie la liste des champs et écrit elle-même la ligne `update`. Seuls les administrateurs peuvent lire ce journal. Cette API ne le renvoie pas.

Ne nommez pas un bot `refus` : ce nom est réservé au journal des refus.

## Ajouter un bot

1. Générez un jeton long, par exemple `openssl rand -base64 32`.
2. Calculez son empreinte sans laisser le jeton dans la liste des processus :

```bash
printf '%s' 'LE_JETON' | node --input-type=module -e "import {createHash} from 'node:crypto'; import {readFileSync} from 'node:fs'; console.log(createHash('sha256').update(readFileSync(0,'utf8')).digest('hex'))"
```

3. Ajoutez le nom du bot et cette empreinte dans `BOT_API_KEYS`, dans les variables d’environnement de l’hébergement (pas dans le dépôt) :

```json
{"coach":"<empreinte hexadécimale de 64 caractères>"}
```

4. Transmettez le jeton en clair au bot une seule fois, par un canal sûr. Le portail n’en garde pas de copie.

## Rotation

1. Générez un nouveau jeton et son empreinte.
2. Remplacez l’empreinte du bot, ou ajoutez un second nom le temps du basculement.
3. Mettez à jour la variable d’environnement, puis configurez le bot avec le nouveau jeton.
4. Retirez l’ancienne entrée une fois le bot basculé.

Remplacer l’empreinte coupe l’ancien jeton dès le prochain déploiement de la variable. Pour retirer un bot, supprimez sa clé de l’objet JSON.
