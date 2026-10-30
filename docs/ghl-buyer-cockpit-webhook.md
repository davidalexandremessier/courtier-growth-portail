# Webhook GHL — cockpit acheteur

Ce point d’entrée reçoit, depuis un sous-compte GoHighLevel, un coup de cœur ou l’ouverture du lien portail d’un contact. Il enregistre l’événement dans le dossier du courtier et renvoie un lien stable que GHL peut écrire dans un champ personnalisé du contact.

Le courtier connecté voit tous ses acheteurs sur `/?page=acheteurs`. L’acheteur ouvre seulement son lien, sans compte, et ne voit que ses propres coups de cœur.

La migration `migrations/20261030_buyer_cockpit.sql` est dans le dépôt. Elle n’est pas appliquée automatiquement : la base est partagée avec la production.

## Requête

`POST /api/ghl-webhook/buyer-cockpit`

En-tête obligatoire :

```http
Content-Type: application/json
x-cg-webhook-token: LE_JETON
```

Le jeton est comparé à `GHL_BUYER_WEBHOOK_TOKEN` de façon indépendante du temps d’exécution. Il n’est jamais journalisé, ni renvoyé dans une erreur. Corps JSON, 16 Ko maximum.

### Champs

| Champ | Obligatoire | Règle |
| --- | --- | --- |
| `event` | oui | `coup_de_coeur` ou `portal_link` |
| `location_id` | oui | identifiant du sous-compte GHL, texte, 80 caractères maximum |
| `contact_id` | oui | texte, 120 caractères maximum |
| `occurred_at` | oui | date ISO 8601, entre 2000 et 2100, par exemple `2026-10-30T18:42:00Z` |
| `contact_email` | non | courriel, 200 caractères maximum |
| `contact_name` | non | texte, 200 caractères maximum |
| `note` | non | texte, 2 000 caractères maximum |
| `property` | non | objet `{ centris_id, address, price, url }` |
| `property.centris_id` | si coup de cœur sans URL | texte, 40 caractères maximum |
| `property.address` | non | texte, 300 caractères maximum |
| `property.price` | non | nombre, pas une chaîne |
| `property.url` | si coup de cœur sans Centris | URL `https://`, 2 000 caractères maximum |

Pour `coup_de_coeur`, `property.centris_id` ou `property.url` est obligatoire. Les champs inconnus sont refusés.

### Exemple

```bash
curl --silent --show-error \
  --request POST \
  --header "Content-Type: application/json" \
  --header "x-cg-webhook-token: LE_JETON" \
  --data '{
    "event": "coup_de_coeur",
    "location_id": "loc_courtiera",
    "contact_id": "contact_alex",
    "occurred_at": "2026-10-30T18:42:00Z",
    "contact_email": "alex@example.com",
    "contact_name": "Alex Martin",
    "note": "Beaucoup de lumière.",
    "property": {
      "centris_id": "24589001",
      "address": "123 rue des Érables, Québec",
      "price": 489000,
      "url": "https://www.centris.ca/fr/maison~a-vendre~quebec/24589001"
    }
  }' \
  "https://portail.courtiergrowth.com/api/ghl-webhook/buyer-cockpit"
```

## Réponses

| Code | Corps | Quand |
| --- | --- | --- |
| 200 | `{ "ok": true, "portal_url": "https://…/?acheteur=…" }` | Événement accepté, y compris s’il était déjà enregistré |
| 400 | `{ "error": "Requête invalide.", "fields": ["event", "property.price"] }` | Validation. `fields` liste les champs en cause. Un JSON illisible ou un corps au-dessus de 16 Ko utilise `fields: ["body"]` |
| 401 | `{ "error": "Jeton webhook refusé." }` | En-tête absent ou différent |
| 404 | `{ "error": "Sous-compte GHL inconnu : aucun dossier du portail ne correspond à ce location_id." }` | Aucun dossier avec ce `ghl_location_id`. Rien n’est enregistré |
| 409 | `{ "error": "Plusieurs dossiers du portail portent ce location_id. Rien n’a été enregistré." }` | Correspondance ambiguë |
| 429 | `{ "error": "Trop de requêtes pour ce sous-compte. Réessayez dans un moment." }` | Plus de 30 requêtes par minute pour un `location_id`, ou 120 au total, sur une instance |
| 503 | `{ "error": "Configuration serveur indisponible." }` | Variable manquante ou trop courte, ou base inaccessible |
| 502 | `{ "error": "Enregistrement impossible." }` | Échec d’écriture. L’appel peut être renvoyé : il est idempotent |

`GET`, `POST` sont les seules méthodes. Les autres répondent 405.

## Idempotence

Un second envoi identique ne crée pas une deuxième ligne. La clé est :

`ghl_location_id` + `contact_id` + `event` + identité du bien + `occurred_at`

L’identité du bien est `property.centris_id` lorsqu’il est présent, sinon `property.url`. Deux horodatages qui désignent le même instant (décalage horaire compris) comptent pour un seul événement. La note et le nom ne font pas partie de la clé : la première écriture est conservée.

## Lien acheteur

`portal_url` est stable pour le couple dossier + contact. C’est un jeton signé (`HMAC-SHA256` avec `GHL_BUYER_PORTAL_SECRET`), non devinable. Seule son empreinte SHA-256 est stockée dans `buyer_portal_access`.

L’acheteur ouvre ce lien sans compte. `GET /api/ghl-webhook/buyer-cockpit?token=` renvoie uniquement ses `coup_de_coeur`, du plus récent au plus ancien :

```json
{
  "ok": true,
  "broker_name": "Camille Courtier",
  "contact_name": "Alex Martin",
  "coups_de_coeur": [
    {
      "occurred_at": "2026-10-30T18:42:00.000Z",
      "note": "Beaucoup de lumière.",
      "property": {
        "centris_id": "24589001",
        "address": "123 rue des Érables, Québec",
        "price": 489000,
        "url": "https://www.centris.ca/fr/maison~a-vendre~quebec/24589001"
      }
    }
  ]
}
```

Un jeton absent répond 401 `{ "error": "Lien requis." }`. Un jeton inconnu ou révoqué répond 404 `{ "error": "Lien introuvable." }`. La page est en français et en lecture seule.

Pour révoquer le lien, un administrateur met `revoked_at` sur la ligne `buyer_portal_access` du contact (bouton « Révoquer le lien » sur la page Acheteurs). Le même URL redevient actif si `revoked_at` est remis à vide. Changer `GHL_BUYER_PORTAL_SECRET` invalide les liens déjà émis.

## Visibilité

| Qui | Voit |
| --- | --- |
| Acheteur, via `portal_url` | Seulement ses coups de cœur. Pas les autres contacts, pas un autre courtier |
| Courtier connecté | Tous les acheteurs de son dossier, `/?page=acheteurs` |
| David (administrateur) | Tous les dossiers |

Le menu du dossier expose Acheteurs. Le courtier ne reçoit pas le jeton brut : GHL le range dans le champ personnalisé du contact.

## Variables d’environnement

À définir dans le projet Vercel, pas dans le dépôt :

| Variable | Rôle |
| --- | --- |
| `GHL_BUYER_WEBHOOK_TOKEN` | Jeton du webhook, 16 caractères minimum |
| `GHL_BUYER_PORTAL_SECRET` | Secret de signature des liens acheteur, 16 caractères minimum, distinct du jeton |
| `APP_URL` | Origine publique du portail, déjà utilisée ailleurs, en `https://` |
| `SUPABASE_URL` | Déjà utilisée |
| `SUPABASE_ARCHIVE_SECRET_KEY` | Clé service role déjà utilisée pour les écritures serveur. Elle contourne le RLS |

Le sous-compte GHL du courtier doit déjà être le `ghl_location_id` de son dossier. La migration ajoute un index unique sur cette colonne lorsqu’elle est renseignée.

## Brancher GHL

1. Appliquer `migrations/20261030_buyer_cockpit.sql` sur la base, après avoir vérifié qu’aucun `ghl_location_id` n’est en double.
2. Renseigner les variables ci-dessus, puis redéployer.
3. Dans le workflow du sous-compte, envoyer le `POST` ci-dessus quand un contact a un coup de cœur, et un `event` `portal_link` si le lien doit être créé sans bien.
4. Écrire `portal_url` dans le champ personnalisé du contact. Le renvoyer tel quel aux appels suivants.
