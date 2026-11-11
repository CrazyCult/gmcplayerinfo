# Publication

## Worker GMC Companion existant

1. Se connecter avec `pnpm dlx wrangler login` puis identifier la base existante avec `pnpm dlx wrangler d1 list`.
2. Copier `wrangler.example.jsonc` en `wrangler.jsonc` (ignoré par Git). Renseigner le nom et l’identifiant de la **base existante**, ainsi que l’account_id si plusieurs comptes existent. Préserver les bindings et routes existants. Aucun effacement n’est nécessaire : le site lit `clubs`, et les tables de la base du jeu (`db_players`, `db_prices`, `db_pages`, `db_meta`) sont créées automatiquement au premier appel.
3. Générer un token aléatoire et le conserver hors du dépôt. Configurer le secret `SITE_TOKEN` avec `pnpm dlx wrangler secret put SITE_TOKEN --config wrangler.jsonc`.
4. Déployer avec `pnpm dlx wrangler deploy --config wrangler.jsonc --keep-vars`. `PUBLIC_KEY_JWK`, les autres secrets de licence et les réglages Companion existants doivent être conservés. Ne jamais recopier une clé privée dans ce projet.
5. Vérifier `/privacy`, une requête site sans token (401), puis `/v1/site/players` avec le token et une fiche de joueur. Vérifier que les routes Companion existantes fonctionnent encore.

`worker.js` + `worker.d1.js` (Turso) sont **la version à déployer** : il contient les routes de l’extension (dont `/v1/db/*` pour GMC Companion 2.30) et celles du site. Les routes site sont `GET /v1/site/players?q=&position=&avail=&sort=&page=`, `GET /v1/site/search?q=` et `GET /v1/site/player/:id`. Elles passent avant le contrôle de licence, restent en lecture seule et refusent l’accès si `SITE_TOKEN` est absent. Le binding de limitation de débit est configuré dans l’exemple Wrangler ; vérifier que son namespace n’entre pas en conflit avec un binding existant.

## Base de données : Turso

Le Worker garde les données dans Turso (SQLite hébergé). Offre gratuite : 5 Go, 500 millions de lignes lues et 10 millions écrites par mois. `worker.js` est un adaptateur : il donne à Turso l'interface de Cloudflare D1, et toute la logique reste dans `worker.d1.js` (catalogue indexé, écritures conditionnelles, budget d'écritures journalier `DAILY_WRITE_BUDGET`). Sans `TURSO_URL`, le Worker utilise le binding D1 `DB` comme avant.

1. Créer un compte sur turso.tech, puis une base (région la plus proche, par exemple Frankfurt).
2. Copier l'URL de la base (`libsql://nom-organisation.turso.io`) et créer un jeton en lecture-écriture, sans expiration.
3. Dans `wrangler.jsonc`, mettre l'URL dans `vars.TURSO_URL`, puis `npx wrangler secret put TURSO_TOKEN` et coller le jeton.
4. `npx wrangler deploy`. Le schéma est créé automatiquement au premier appel.

Les données se remplissent d'elles-mêmes : chaque extension renvoie au serveur les effectifs qu'il n'a pas (contrôle au démarrage puis toutes les heures), et la base du jeu est relue par les extensions 2.30+.

## Compte lecteur (base du jeu lue par le serveur, sans extension)

Depuis le 09/11/2026, `/api/players/database?availability=all` renvoie tous les joueurs du jeu (63 000+), mais uniquement avec une session GameChase. Un compte de jeu dédié, en lecture seule, permet au Worker de lire la base lui-même, 24h/24 (`worker.bot.js`). Il réserve les pages comme une extension (`/v1/db/assign`), les lit dans le jeu, puis les enregistre avec les mêmes contrôles (`/v1/db/players`).

1. Créer le compte de jeu dédié (adresse e-mail à part), finir l'inscription jusqu'au club. Ne jamais l'utiliser pour des échanges avec un autre compte.
2. Secrets (jamais dans le dépôt) : `npx wrangler secret put GC_BOT_EMAIL`, puis `npx wrangler secret put GC_BOT_PASSWORD`.
3. Variables (`vars` de `wrangler.jsonc`, ou Réglages → Variables du Worker) : `GC_SUPABASE_URL` = `https://teffakezggfkrlcdlaox.supabase.co` et `GC_SUPABASE_ANON` = la clé publique « anon » du jeu (visible dans son code, relevée le 09/11/2026). Facultatif : `READER_PAGES` (pages par minute, 4 par défaut).
4. Déclencheur Cron du Worker : **chaque minute** (`* * * * *`). Le rattrapage existant ne tourne qu'une minute sur cinq.
5. `npx wrangler deploy`. L'état apparaît dans `/v1/db/stats` → `reader` (`ok`, `error`, `pagesToday`, `pausedUntil`) ; la session n'y figure jamais.

Priorité : à chaque passage, il sert d'abord les demandes du site (fiche joueur demandée, « Mon effectif » d'un utilisateur, jusqu'à 2 par minute), puis consacre le reste de ses pages à la base. `reader.requestsToday` compte les demandes servies dans la journée. Les journaux du Worker (Observabilité) affichent une ligne `compte lecteur : {…}` à chaque passage.

Alerte du jeu vers Discord (facultatif) : connecte-toi au jeu avec le compte lecteur, arme une recherche dans Transferts, puis ajoute au Worker le secret `ALERT_DISCORD_WEBHOOK` (adresse d'un webhook de salon) ou les secrets `ALERT_DISCORD_BOT_TOKEN` + `ALERT_DISCORD_USER_ID` (message privé). Chaque minute, le compte lecteur relit `/api/notifications` et envoie sur Discord les nouveaux joueurs signalés (`transfer_search_match`), avec leur lien. `/v1/db/stats` → `reader.alerts` donne l'heure de la dernière lecture, le nombre envoyé dans la journée et l'erreur éventuelle.

Le compte lecteur ne fait que des lectures (GET). Il se met en pause tout seul : 6 h si la session est refusée, 1 h si le jeu demande de ralentir (429), 24 h sur 403 (compte bloqué ?), 1 h si la connexion échoue. Sans les secrets, il reste désactivé et seules les extensions alimentent la base.

## Projet Vercel

Importer le dépôt public `CrazyCult/gmcplayerinfo` comme projet Next.js ou utiliser `pnpm dlx vercel login` puis `pnpm dlx vercel link`. Le gestionnaire et le lockfile sont pnpm.

Configurer pour Production et Preview :

| Variable               | Valeur                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| `GMC_INDEX_URL`        | URL du Worker Companion existant                                 |
| `GMC_SITE_TOKEN`       | Secret identique à `SITE_TOKEN`, côté serveur uniquement         |
| `NEXT_SITE_URL`        | URL canonique de production du site                              |
| `GOOGLE_CLIENT_ID`     | ID client OAuth Google (connexion « Mon effectif »)              |
| `GOOGLE_CLIENT_SECRET` | Code secret du client OAuth Google, côté serveur uniquement      |
| `AUTH_SECRET`          | Chaîne aléatoire d’au moins 32 caractères qui signe les sessions |

### Connexion Google (« Mon effectif »)

Sans ces trois variables, la page « Mon effectif » fonctionne sans compte (recherche de club, lien depuis l’extension, import de fichier).

1. Sur https://console.cloud.google.com, créer un projet, puis **API et services → Écran de consentement OAuth** : type « Externe », nom « GMC Player Info », portée `openid` et `profile` seulement, puis **Publier l’application**.
2. **Identifiants → Créer des identifiants → ID client OAuth** : type « Application Web », URI de redirection autorisé `https://gmcplayerinfo.vercel.app/api/auth/callback` (et `http://localhost:3000/api/auth/callback` pour le développement).
3. Copier l’ID client et le code secret dans Vercel (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), ajouter `AUTH_SECRET` (par exemple le résultat de `openssl rand -base64 32`), puis redéployer.

Le serveur d’index ne reçoit jamais l’identifiant Google : seulement une empreinte HMAC calculée avec `AUTH_SECRET` (changer ce secret détache donc tous les clubs rattachés).

Publier avec `pnpm dlx vercel deploy --prod`. Après ajout ou modification des variables, redéployer pour mettre à jour les pages précompilées. L’interface ne contacte jamais GameChase directement.

Vérifier sur l’URL de production : total du catalogue, plusieurs pages, filtre, recherche, fiche, simulateur, comparaison et import local. Un dépôt poussé ou un build local réussi n’est pas une preuve de déploiement.

Documentation : [déploiement Vercel CLI](https://vercel.com/docs/projects/deploy-from-cli), [variables Vercel](https://vercel.com/docs/cli/env), [configuration Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/), [limitation de débit Worker](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

### Modules réservés

`PREMIUM_ACCOUNT_KEYS` : clés de compte autorisées, séparées par des virgules. Chaque utilisateur trouve la sienne sur la page « Mon compte » (clic sur son prénom en haut à droite, une fois connecté avec Google). Ces comptes voient, dans « Tous les joueurs », les tris « Gain d’OVR en changeant de poste » et « Affaires » avec les colonnes Valeur et Poste +, et dans « Mon effectif » les colonnes Poste +, +1 OVR le moins cher et Revente +1. Changer `AUTH_SECRET` change toutes les clés.
