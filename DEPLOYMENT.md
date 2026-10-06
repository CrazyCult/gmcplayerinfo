# Publication

## Worker GMC Companion existant

1. Se connecter avec `pnpm dlx wrangler login` puis identifier la base existante avec `pnpm dlx wrangler d1 list`.
2. Copier `wrangler.example.jsonc` en `wrangler.jsonc` (ignoré par Git). Renseigner le nom et l’identifiant de la **base existante**, ainsi que l’account_id si plusieurs comptes existent. Préserver les bindings et routes existants. Aucun effacement n’est nécessaire : le site lit `clubs`, et les tables de la base du jeu (`db_players`, `db_prices`, `db_pages`, `db_meta`) sont créées automatiquement au premier appel.
3. Générer un token aléatoire et le conserver hors du dépôt. Configurer le secret `SITE_TOKEN` avec `pnpm dlx wrangler secret put SITE_TOKEN --config wrangler.jsonc`.
4. Déployer avec `pnpm dlx wrangler deploy --config wrangler.jsonc --keep-vars`. `PUBLIC_KEY_JWK`, les autres secrets de licence et les réglages Companion existants doivent être conservés. Ne jamais recopier une clé privée dans ce projet.
5. Vérifier `/privacy`, une requête site sans token (401), puis `/v1/site/players` avec le token et une fiche de joueur. Vérifier que les routes Companion existantes fonctionnent encore.

Ce `worker.js` est **la seule version à déployer** : il contient les routes de l’extension (dont `/v1/db/*` pour GMC Companion 2.30) et celles du site. Les routes site sont `GET /v1/site/players?q=&position=&avail=&sort=&page=`, `GET /v1/site/search?q=` et `GET /v1/site/player/:id`. Elles passent avant le contrôle de licence, restent en lecture seule et refusent l’accès si `SITE_TOKEN` est absent. Le binding de limitation de débit est configuré dans l’exemple Wrangler ; vérifier que son namespace n’entre pas en conflit avec un binding existant.

## Projet Vercel

Importer le dépôt public `CrazyCult/gmcplayerinfo` comme projet Next.js ou utiliser `pnpm dlx vercel login` puis `pnpm dlx vercel link`. Le gestionnaire et le lockfile sont pnpm.

Configurer pour Production et Preview :

| Variable         | Valeur                                                   |
| ---------------- | -------------------------------------------------------- |
| `GMC_INDEX_URL`  | URL du Worker Companion existant                         |
| `GMC_SITE_TOKEN` | Secret identique à `SITE_TOKEN`, côté serveur uniquement |
| `NEXT_SITE_URL`  | URL canonique de production du site                      |

Publier avec `pnpm dlx vercel deploy --prod`. Après ajout ou modification des variables, redéployer pour mettre à jour les pages précompilées. L’interface ne contacte jamais GameChase directement.

Vérifier sur l’URL de production : total du catalogue, plusieurs pages, filtre, recherche, fiche, simulateur, comparaison et import local. Un dépôt poussé ou un build local réussi n’est pas une preuve de déploiement.

Documentation : [déploiement Vercel CLI](https://vercel.com/docs/projects/deploy-from-cli), [variables Vercel](https://vercel.com/docs/cli/env), [configuration Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/), [limitation de débit Worker](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
