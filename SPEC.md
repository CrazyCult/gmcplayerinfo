# Spécification complète — « GameChase Player Info »

Site web d'analyse des joueurs de **GameChase** (gamechase.io), construit sur le modèle de **MFL Player Info**
(même stack, même structure de fiche, même recherche, même comparateur, même carte partageable),
avec la couche de données et les formules propres à GameChase, et un **simulateur d'entraînement exact**
que MFL n'a pas.

> Ce document remplace `gamechase-player-site-SPEC.md` (v1). Il est autoportant : Claude Code n'a besoin
> de rien d'autre, à part les fichiers de référence cités au §24 (jeux de test).

---

## Sommaire

0. Ce qui vient de MFL, ce qui change, ce qui s'ajoute
1. Vue d'ensemble produit
2. Stack technique et dépendances
3. Arborescence du projet
4. Variables d'environnement
5. Couche d'adaptation GameChase (sources de données)
6. Évolutions du serveur d'index GMC (Cloudflare Worker + D1)
7. Modèle de données (types)
8. Accès aux données, cache, routes internes
9. Pages et routage
10. Composants — page joueur
11. Composants — comparaison
12. Recherche
13. Moteur de stats et d'OVR (formules exactes)
14. Notes par poste
15. Moteur d'entraînement et simulateur
16. Progression par les matchs
17. Valeur marchande (GMC2)
18. Infos contrat / salaire
19. Courbe de progression
20. Images générées (OG, carte partageable)
21. Design system
22. SEO, métadonnées, PWA
23. Leçons de MFL : bugs à ne pas recopier
24. Tests obligatoires
25. Plan de réalisation pas à pas
26. Interdits et conformité
27. Prompt prêt à coller dans Claude Code

---

## 0. Ce qui vient de MFL, ce qui change, ce qui s'ajoute

| Sujet | MFL Player Info | GameChase Player Info |
|---|---|---|
| Stack | Next.js App Router, React 19, TS, Tailwind v4, Headless UI, Heroicons, sonner, next/og | **Repris tel quel** (+ zod, vitest) |
| Données | API publique du jeu avec token serveur | **Pas d'API publique** (cookies de session + CORS) → lecture via le **serveur d'index GMC** (token de site, serveur uniquement) + **import JSON** |
| Identifiant joueur | entier | **chaîne** (UUID ou id du jeu) |
| Attributs | 6 + goalkeeping | **6 stats résumées + 30 sous-attributs** (champ) / **6 stats + 7 sous-attributs** (gardien) |
| OVR par poste | pondération décimale + `Math.round` | **pondération entière exacte**, `floor((Σ w%·stat + 50)/100)` ; gardien à part |
| Familiarité | matrice −5/−8/−20 + poste secondaire −1 | **Adéquation de poste** ×1 / ×0,95 / ×0,90 / ×0,85 (coefficients confirmés, proximités à affiner) ; un seul poste par joueur |
| Capitaine | +2 / bonus de ligne | **Supprimé** (effet non vérifié dans GameChase) |
| Mode entraînement | `+`/`−` de 1 sur les 6 stats, plafond 99 | **Au niveau des sous-attributs**, pas = gain réel de la séance selon l'âge, **plafond = potentiel**, coût et forme cumulés (corrige le bug MFL n°9) |
| Simulateur d'entraînement | — | **Nouveau** : coachs, niveau requis, coût par palier d'OVR, réussite, forme, plan optimal jusqu'à l'OVR max |
| Progression par les matchs | — | **Nouveau** (règles du manuel, affichage informatif) |
| Valeur marchande | EMA / robuste / régression sur ventes conclues | **Même moteur**, alimenté par les annonces relevées par l'extension (prix en **GMC2**) ; repli = `value` du jeu |
| Stats de contrat | part de revenus par division | **Salaire et demande de contrat** de joueurs similaires, par ligue si connue |
| Courbe de progression | historique d'expérience de l'API | **Instantanés quotidiens** enregistrés par le serveur d'index |
| Stats de carrière | compétitions | `matches_played`, buts, passes, clean sheets, forme (champs de l'effectif) |
| Tiers de couleur | ≥95/85/75/65/55 | **Repris** ; ajout d'un tier « ≥ 100 » (les sous-attributs dépassent 99) et des couleurs de **rareté** GameChase |
| Carte partage / OG | PNG 600×800, OG 1200×630 | **Repris**, contenu adapté (OVR jeu, POT, coût jusqu'au max) |
| Code mort, scripts `fix_*.py` | présents | **Interdits** |

---

## 1. Vue d'ensemble produit

Site web sans compte utilisateur :

| Fonction | Description |
|---|---|
| **Recherche** | Barre centrale : par **ID** (navigation directe) ou par **nom** (≥ 3 caractères, liste avec miniature du portrait). |
| **Fiche joueur** `/player/[id]` | Portrait, club, « en vente », infos de base, valeur estimée (fourchette + confiance), stats de carrière, **attributs** (6 stats + sous-attributs dépliables), **notes aux 15 postes**, **leviers d'OVR**, **simulateur d'entraînement**, **progression** (courbe + projection), **infos contrat**. |
| **Simulateur** `/player/[id]/training` | Version pleine page du simulateur (mode manuel + plan automatique, réglages coachs/centre/âge). |
| **Comparaison** `/compare?player1=&player2=` | Deux fiches côte à côte, étoile au meilleur sur chaque stat **et chaque sous-attribut**, notes par poste, coût jusqu'au max. |
| **Effectif importé** `/squad` | Import d'un JSON d'effectif (fichier ou collé) ; tableau triable : poste, OVR, POT, écart, coût et séances jusqu'à l'OVR max. Données gardées dans le navigateur (IndexedDB), rien n'est envoyé. |
| **Partage** | Bouton qui copie une image PNG 600×800 ; images OG/Twitter dynamiques par joueur et par comparaison. |
| **Liens externes** | Fiche du joueur sur gamechase.io (lien simple, aucune requête). |

Principes (repris de MFL) :
- **Server Components par défaut**, client uniquement pour l'interactif (recherche, toggles, accordéons, simulateur).
- **Le token du serveur d'index ne quitte jamais le serveur** : le navigateur n'appelle que les routes `/api/*` du site.
- **Streaming** : chaque bloc lent (valeur, progression, contrats) dans un `<Suspense>` avec spinner.
- **Moteur de calcul pur** dans `src/engine/` (aucun import React/Next), entièrement testé.

---

## 2. Stack technique et dépendances

| Domaine | Choix |
|---|---|
| Framework | Next.js App Router (`next 16`), Turbopack en dev |
| UI | React 19, TypeScript 5.8 strict |
| CSS | Tailwind CSS v4 (`@tailwindcss/postcss`), container queries natives |
| Headless | `@headlessui/react` (Combobox, Switch, Popover, Disclosure, Tabs) |
| Icônes | `@heroicons/react` |
| Bouton | `@radix-ui/react-slot` + `class-variance-authority` ; `clsx` + `tailwind-merge` (`cn`) |
| Debounce | `usehooks-ts` (`useDebounceValue`) |
| Toasts | `sonner` |
| Validation | `zod` (réponses du serveur d'index et imports JSON) |
| Stockage local | `idb-keyval` (effectifs importés, réglages du simulateur) |
| Images OG | `next/og` (`ImageResponse`, runtime edge) |
| Garde serveur | `server-only` |
| Tests | `vitest` (+ `@testing-library/react` pour 2–3 composants clés) |
| Qualité | ESLint 9 + `eslint-config-next`, Prettier + `prettier-plugin-tailwindcss` |

Pas de base de données côté site : les données viennent du serveur d'index GMC (§5–6), mises en cache par le Data Cache de Next.
Gestionnaire : pnpm. Scripts : `dev`, `build`, `start`, `lint`, `test`.
Hébergement : Vercel **ou** Cloudflare (via `@opennextjs/cloudflare`, même compte que le Worker). Ne pas utiliser `@vercel/analytics` si Cloudflare.

`next.config.ts` : `images.remotePatterns` = hôte des `portrait_url` / `card_url` GameChase (à relever sur un joueur réel),
`minimumCacheTTL: 2592000`, `logging.fetches.fullUrl: true`.

---

## 3. Arborescence du projet

```
src/
├── app/
│   ├── layout.tsx                 # Header + <main max-w-7xl> + Footer + Toaster
│   ├── page.tsx                   # Accueil : recherche + raccourcis (import d'effectif)
│   ├── globals.css                # Tokens (thème GMC sombre par défaut) — §21
│   ├── shared-meta.ts, sitemap.ts, robots.ts, manifest.ts, not-found.tsx
│   ├── player/[id]/
│   │   ├── layout.tsx             # Recherche pré-remplie + children
│   │   ├── page.tsx               # generateMetadata + <Player>
│   │   ├── training/page.tsx      # Simulateur pleine page
│   │   ├── not-found.tsx
│   │   ├── opengraph-image.tsx    # 1200×630, edge
│   │   └── twitter-image.tsx      # 1200×600, edge
│   ├── compare/
│   │   ├── page.tsx
│   │   └── og-image/route.tsx
│   ├── squad/page.tsx             # Import local d'effectif (client)
│   └── api/
│       ├── player-card/route.tsx  # PNG 600×800
│       └── players/
│           ├── search/route.ts
│           ├── history/route.ts
│           ├── similar/route.ts   # contrats / salaires
│           └── sales/route.ts     # annonces comparables (valeur)
├── components/
│   ├── Header/ Footer/ Logo/ Spinner/ UI/Button.tsx
│   ├── Search/   SearchComboBox.tsx, ComboSearch.tsx, ComparePlayerSearch.tsx
│   ├── Player/   index.tsx, ImageCard, ClubBadge, ForSale, BasicInfo, TraitBadges,
│   │             CareerStats, AttributesTable, SubAttributeBars, GoalkeeperAttributes,
│   │             StyledRatingValue, PositionRatings, PositionFitBadge, OvrLevers,
│   │             TrainingSimulator/, PlayerProgression, MatchProgression,
│   │             MarketValue, ContractInfo, ShareCardButton, OvrMismatchBadge
│   ├── Compare/  PlayerComparison, PlayerCard, AttributesComparison, PositionRatingsComparison
│   └── Squad/    SquadImport, SquadTable
├── engine/                        # PUR, sans React — cœur testé
│   ├── tables.ts                  # sous-attributs, poids, exercices, coachs (§13–15)
│   ├── stats.ts                   # stats résumées
│   ├── ovr.ts                     # OVR exact par famille de poste
│   ├── positionFit.ts             # adéquation de poste (§14)
│   ├── training.ts                # gain, prix, réussite, disponibilité
│   ├── planner.ts                 # plan jusqu'à l'OVR max, leviers
│   ├── matchProgression.ts
│   ├── marketValue/ (ema.ts, statistics.ts, regression.ts, estimate.ts, index.ts)
│   ├── contracts.ts               # agrégation (une seule implémentation)
│   └── progression.ts             # reconstruction de la courbe
├── data/                          # server-only
│   ├── gmc-index.ts               # client du serveur d'index (§5)
│   └── players.ts                 # fonctions métier + cache
├── lib/  cache.ts, cn.ts, format.ts (GMC2, %), rarity.ts
├── schemas/ player.ts (zod)       # validation + normalisation
└── types/ index.ts
tests/ engine/*.test.ts, fixtures/*.json
```

Alias `@/*` → `src/*`.

---

## 4. Variables d'environnement

`.env.example` :
```
NEXT_SITE_URL=http://localhost:3000
# Serveur d'index GMC (serveur uniquement, jamais NEXT_PUBLIC_)
GMC_INDEX_URL=https://gmc-companion-index.florian-chevalier68.workers.dev
GMC_SITE_TOKEN=
```

| Variable | Usage |
|---|---|
| `NEXT_SITE_URL` | `metadataBase`, canoniques, police et placeholder des routes OG. |
| `GMC_INDEX_URL` | Base des appels au serveur d'index. |
| `GMC_SITE_TOKEN` | Envoyé en `Authorization: Bearer <token>` sur les routes `/v1/site/*` (§6). Absent → mode **import seul** (la recherche serveur est masquée, `/squad` reste disponible). |

**Jamais** dans le dépôt ni dans l'environnement du site : clé privée de licence, code de licence, identifiant d'installation, cookies GameChase.

---

## 5. Couche d'adaptation GameChase (sources de données)

### 5.1 Pourquoi pas l'API du jeu
L'API de gamechase.io fonctionne avec les cookies de session du joueur et refuse les autres origines. Le site **n'appelle jamais gamechase.io**.
Les données viennent de deux sources :

1. **Serveur d'index GMC** (Cloudflare Worker + D1) : il reçoit déjà les effectifs lus par les utilisateurs de l'extension GMC Companion.
   On lui ajoute des routes de lecture réservées au site (§6).
2. **Import JSON local** (`/squad`) : l'utilisateur colle la réponse de `/api/players/squad` ou l'export de l'explorateur GMC ;
   tout reste dans son navigateur. Une fiche importée s'ouvre en `/player/local:<id>` (rendu client, mêmes composants).

### 5.2 Constantes GameChase

| Constante | Valeur |
|---|---|
| Image joueur | `player.portrait_url` (ou `card_url` s'il existe) ; repli `public/assets/placeholder.png` |
| Lien fiche officielle | `https://gamechase.io/gamev2/players/{id}` — **à vérifier** sur le jeu ; sinon pas de lien |
| Monnaie | **GMC2** (afficher `1 234 567 GMC2`, abréviation `1,23 M` en compact) |
| Postes (15) | `GK, RB, LB, CB, RWB, LWB, CDM, RM, LM, CM, CAM, RW, LW, CF, ST` (ordre d'affichage repris de MFL) |
| Rareté | `common, uncommon, rare, epic, legendary, galactico` |
| Phase de carrière | `youth, talent, prime, decline, retired` |
| Divisions / ligues | Nom de ligue si présent dans les données, sinon section masquée |

### 5.3 Correspondance des besoins MFL → GameChase

| # | Besoin (MFL) | Source GameChase | Si absent |
|---|---|---|---|
| E1 | Joueur par ID (+ annonce) | `GET /v1/site/player/:id` | 404 |
| E2 | Recherche par nom | `GET /v1/site/search?q=` | recherche masquée (mode import seul) |
| E3 | Joueurs similaires (contrats) | `GET /v1/site/similar?position=&ageMin=&ageMax=&ovrMin=&ovrMax=` | section « Contrat » masquée |
| E4 | Stats de carrière | champs du joueur (`matches_played`, `goals`, `assists`, `clean_sheets`, `form`) | bloc masqué |
| E5 | Historique | `GET /v1/site/history/:id` (instantanés quotidiens) | courbe masquée, projection seule |
| E6 | Ventes comparables | `GET /v1/site/sales?position=&ageMin=&ageMax=&ovrMin=&ovrMax=&days=60` | repli §17.6 |
| E7 | Flux global de ventes | `GET /v1/site/sales?days=60&limit=2000` | pas de régression |

### 5.4 Module adaptateur (`src/data/gmc-index.ts`, `server-only`)

```ts
import 'server-only';
export async function indexFetch(path: string, init?: RequestInit & { next?: NextFetchRequestConfig }): Promise<Response>;
// Le reste de l'app n'appelle QUE ces fonctions (réponses validées par zod puis normalisées) :
export async function fetchPlayer(id: string): Promise<{ player: Player; listing?: Listing; fetchedAt: number } | null>;
export async function searchPlayers(q: string): Promise<PlayerSummary[]>;
export async function fetchSimilarPlayers(q: SimilarQuery): Promise<Player[]>;
export async function fetchHistory(id: string): Promise<HistoryEntry[]>;
export async function fetchSales(q: SalesQuery): Promise<Sale[]>;
export function playerImageUrl(p: Player): string;
export function officialPlayerUrl(id: string): string | null;
```

Erreurs typées : 401 → « token du site invalide », 429 → « trop de requêtes », 5xx → « serveur d'index indisponible ».
Chaque fiche affiche **« Données relevées le {date} »** (`fetchedAt`) : les données datent de la dernière lecture par un utilisateur de l'extension.

---

## 6. Évolutions du serveur d'index GMC (Cloudflare Worker + D1)

À faire **dans le Worker existant** (`worker.js`, base D1 `gmc-index`), sans casser les routes de l'extension
(`POST/GET /v1/clubs`, `GET /v1/index`, `POST /v1/assign`, `GET /v1/stats`, `GET /privacy`).

### 6.1 Nouvelles tables
```sql
-- Index dénormalisé, mis à jour à chaque POST /v1/clubs accepté
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL, name_norm TEXT NOT NULL,
  position TEXT, age INTEGER, overall INTEGER, potential INTEGER, value INTEGER,
  fetched_at INTEGER NOT NULL, data TEXT NOT NULL            -- JSON complet du joueur
);
CREATE INDEX IF NOT EXISTS players_name ON players(name_norm);
CREATE INDEX IF NOT EXISTS players_bucket ON players(position, age, overall);

-- Un point par joueur et par jour (courbe de progression)
CREATE TABLE IF NOT EXISTS player_history (
  player_id TEXT NOT NULL, day TEXT NOT NULL,                -- 'YYYY-MM-DD' UTC
  age INTEGER, overall INTEGER, potential INTEGER, value INTEGER,
  PRIMARY KEY (player_id, day)
);

-- Annonces de transfert relevées par l'extension (phase 2, voir §17)
CREATE TABLE IF NOT EXISTS sales (
  listing_id TEXT PRIMARY KEY, player_id TEXT, position TEXT, age INTEGER, overall INTEGER, potential INTEGER,
  price_gmc2 INTEGER NOT NULL, status TEXT, listed_at INTEGER, seen_at INTEGER NOT NULL, sold_at INTEGER
);
```
`name_norm` = minuscules sans accents. Dans `POST /v1/clubs`, après l'upsert du club : upsert de chaque joueur dans `players`
(si `fetched_at` plus récent) et `INSERT OR REPLACE` dans `player_history` pour le jour courant. Script de rattrapage unique
qui remplit `players` et `player_history` depuis la table `clubs` existante.

### 6.2 Routes de lecture du site
Toutes en `GET`, authentifiées par `Authorization: Bearer ${env.SITE_TOKEN}` (secret Wrangler), **hors** vérification de licence,
lecture seule, jamais de `contributor` ni d'identifiant d'installation dans les réponses.

| Route | Réponse |
|---|---|
| `/v1/site/player/:id` | `{ player, fetchedAt, teamId, listing? }` |
| `/v1/site/search?q=` (≥ 3 car.) | 10 résultats max, triés par OVR desc : `{ id, name, position, age, overall, potential, portrait_url }` |
| `/v1/site/similar?position&ageMin&ageMax&ovrMin&ovrMax&limit≤500` | joueurs complets |
| `/v1/site/history/:id` | `[{ day, age, overall, potential, value }]` triés par jour |
| `/v1/site/sales?…&days≤90&limit≤2000` | annonces/ventes comparables |

Limite : 60 requêtes/min par IP côté Worker (réponse 429).

### 6.3 Collecte des annonces (phase 2, côté extension)
Quand l'utilisateur ouvre le marché, l'extension envoie les annonces vues (`/api/transfers/listings` : `id, player_id, price_gmc2, status, listed_at` + snapshot âge/poste/OVR/POT)
à `POST /v1/listings` (licence requise, même validation stricte que `/v1/clubs`). Une annonce qui disparaît alors qu'elle était
`active` n'est **pas** une vente : seul un `status` explicite « sold/bought » (ou les « ventes récentes » de `/api/transfers/market-summary`) compte comme vente.
Tant que la phase 2 n'existe pas, `/v1/site/sales` renvoie `[]` et la valeur bascule sur le repli.

### 6.4 Confidentialité
La page `/privacy` du Worker dit aujourd'hui que les effectifs sont partagés **entre utilisateurs de l'extension**.
Un site public élargit cette diffusion : **mettre à jour `/privacy`** (données de joueurs du jeu publiées sur le site, aucune donnée de manager ni d'utilisateur)
**avant** la mise en ligne, ou garder le site réservé (variable `SITE_ACCESS=licence` : saisie d'un code GMC valide, vérifié côté serveur du site avec la **clé publique** seulement).

---

## 7. Modèle de données (types)

`src/types/index.ts` — sortie normalisée du schéma zod (`src/schemas/player.ts`), qui accepte les variantes de champs de GameChase
(`salary`/`wage`, `contract_end`/`contract.end`, etc.).

```ts
export type Position = 'GK'|'RB'|'LB'|'CB'|'RWB'|'LWB'|'CDM'|'RM'|'LM'|'CM'|'CAM'|'RW'|'LW'|'CF'|'ST';
export type Rarity = 'common'|'uncommon'|'rare'|'epic'|'legendary'|'galactico';
export type CareerPhase = 'youth'|'talent'|'prime'|'decline'|'retired';

export interface Player {
  id: string; name: string; position: Position;
  age: number; overall: number; potential: number;
  nationality?: string; flagCode?: string; rarity?: Rarity; careerPhase?: CareerPhase | null;
  traits: string[]; playingStyle?: string; preferredFoot?: 'left'|'right'|'both';
  value?: number; wage?: number; contractEnd?: string; contractDemand?: number;
  fitness?: number; morale?: string; form?: number[];
  matchesPlayed?: number; goals?: number; assists?: number; cleanSheets?: number;
  injured?: boolean; onLoan?: boolean; youthProduct?: boolean;
  portraitUrl?: string; cardUrl?: string;
  club?: { teamId: string; name?: string; logoUrl?: string; league?: string };
  attributes: Attributes;
}

export const FIELD_SUBS = ['acceleration','sprintSpeed','finishing','shotPower','longShots','volleys','penalties',
  'attackingPositioning','vision','crossing','fkAccuracy','shortPassing','longPassing','curve','agility','balance',
  'reactions','ballControl','dribblingSub','composure','firstTouch','interceptions','headingAccuracy',
  'defensiveAwareness','standingTackle','slidingTackle','jumping','stamina','strength','aggression'] as const;
export const GK_SUBS = ['gkDiving','gkHandling','gkKicking','gkReflexes','gkPositioningSub','gkSprintSpeed','gkAcceleration'] as const;
export type FieldSub = typeof FIELD_SUBS[number]; export type GkSub = typeof GK_SUBS[number];
export type SubKey = FieldSub | GkSub;

export interface Attributes {
  pac: number; sho: number; pas: number; dri: number; def: number; phy: number;   // stats résumées de champ (du jeu)
  div?: number; han?: number; kic?: number; ref?: number; pos?: number; spe?: number; // gardien
  subs: Partial<Record<SubKey, number>>;
}

export interface Listing { id: string; priceGmc2: number; listedAt?: number; expiresAt?: number; allowNegotiation?: boolean }
export interface Sale { id: string; priceGmc2: number; at: number; age: number; overall: number; position: Position; sold: boolean }
export interface HistoryEntry { day: string; age?: number; overall?: number; potential?: number; value?: number }
export interface PositionRating { position: Position; raw: number; fit: number; tier: FitTier; difference: number }
export type FitTier = 'natural'|'good'|'okay'|'poor';
```

Règles d'import : sous-attribut manquant → valeur `undefined`, affichage « — » et **avertissement visible** ; les calculs qui en dépendent
sont marqués « incomplet ». Ne jamais remplacer silencieusement par 0.

**Ordre d'affichage des stats** : `PAC SHO PAS DRI DEF PHY` (ordre du jeu, différent de MFL). Gardien : `DIV HAN KIC REF POS SPE`.

---

## 8. Accès aux données, cache, routes internes

### 8.1 Fonctions (`src/data/players.ts`, `server-only`)

| Fonction | Appel | Cache |
|---|---|---|
| `getPlayerById(id)` | E1 | `revalidate 900`, tag `player/{id}` — **une seule requête par rendu** (`React.cache`) |
| `getHistory(id)` | E5 | 3600 s, tag `history/{id}` |
| `getSimilarPlayers(p)` | E3 : même poste, âge ±2, OVR ±2, limit 500 | 3600 s |
| `getMarketValue(p)` | E6/E7 + moteur §17 | `unstable_cache` 3600 s, clé `market-value-{id}` — **calculée une fois par page** (bug MFL #1) |
| `getRegressionModel()` | E7 → entraînement | `unstable_cache` 6 h, clé `price-model` (jamais par requête) |

### 8.2 Routes internes (proxy)
Toutes `GET`, JSON, `[]` + statut d'origine si le serveur d'index échoue, état « réessayer » côté UI sur 429.

| Route | Query | Relaie |
|---|---|---|
| `/api/players/search` | `q` | E2, revalidate 30 s |
| `/api/players/history` | `id` | E5 |
| `/api/players/similar` | `position, ageMin, ageMax, ovrMin, ovrMax` | E3 |
| `/api/players/sales` | idem + `days` | E6 |
| `/api/player-card` | `id` | E1 → PNG |

---

## 9. Pages et routage

### 9.1 Layout racine
Police **Inter** (ou **Manrope**, plus proche de l'extension) via `next/font`. `<Header/>` → `<main class="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8">` → `<Footer/>` → `<Toaster richColors/>`.
`themeColor` `#101521`. Thème **sombre par défaut** (palette de l'extension), clair via `prefers-color-scheme: light`.

### 9.2 Accueil `/`
`<ComboSearch autofocus/>` centré, dessous deux liens : « Importer mon effectif » (`/squad`) et « Comparer deux joueurs ». Mention « données relevées par la communauté GMC Companion ».

### 9.3 Joueur `/player/[id]`
- `layout.tsx` : recherche pré-remplie + enfants.
- `generateMetadata` → `"{Nom} | {Poste} {OVR} → {POT} | GameChase Player Info"`, canonical, OG/Twitter.
- `id` commençant par `local:` → rendu client depuis IndexedDB (mêmes composants, pas d'OG, pas de partage serveur ; le partage génère l'image côté client).

### 9.4 Simulateur `/player/[id]/training`
Pleine page du composant `<TrainingSimulator>` (§15.6), réglages mémorisés en IndexedDB.

### 9.5 Comparaison `/compare?player1=&player2=`
Comme MFL : 2 joueurs chargés en parallèle, titre `"{Nom1} v {Nom2} | Comparaison | GameChase Player Info"`, OG dédiée, `key` incluant les 2 IDs. Effacer un champ **supprime** le paramètre (bug MFL #11).

### 9.6 Effectif `/squad`
Zone de dépôt + textarea « coller le JSON ». Formats acceptés : tableau de joueurs, `{ players: [...] }`, `{ data: { players } }`, export JSON/CSV de l'explorateur GMC.
Tableau (§10.11). Rien n'est envoyé au serveur.

---

## 10. Composants — page joueur

### 10.1 Conteneur `<Player>` (serveur)
```
div#player-share-card  .bg-card .rounded-[20px] .shadow-2xl .max-w-3xl .p-4/6/8  @container/main
├── grid 1 col → 3 cols à @sm/main
│   ├── <ImageCard>                        (col 1)
│   ├── <BasicInfo>                        (cols 2-3)
│   └── <CareerStats>                      (pleine largeur)
├── GK ? <GoalkeeperAttributes> : <AttributesTable>      (+ sous-attributs dépliables)
├── <PositionRatings>                      (champ ; gardien : une seule ligne GK + note de champ indicative masquée par défaut)
├── <OvrLevers>                            (accordéon)
├── <TrainingSimulator compact>            (accordéon ouvert par défaut ; lien « plein écran »)
├── <Suspense> <ProgressionLoader>  → <PlayerProgression> + <MatchProgression>
└── <Suspense> <ContractInfoLoader> → <ContractInfo>
```
Même logique « Loader serveur → accordéon client avec données prêtes » que MFL.

### 10.2 `<ImageCard>`
- Portrait (`portraitUrl`), cadre coloré selon la **rareté** (§21.3), `max-w-[200px]` mobile.
- Dessous : `<ClubBadge>` + `<Suspense><ForSale>`.
- 3 boutons `sm` : **Comparer** (`/compare?player1={id}&player2=`), **Partager**, **Simulateur** (`/player/{id}/training`). Lien « Voir sur GameChase » en texte si l'URL est confirmée.

### 10.3 `<ClubBadge>`
Libre → pastille grise « Libre » ; prêté → pastille « Prêté » ; produit du centre (`youthProduct`) → pastille jaune « Formé au club » ; sinon logo 14 px + nom du club. `text-[10px]`.

### 10.4 `<ForSale>`
Si `listing` : badge accent « En vente », tooltip « {prix} GMC2 · négociable oui/non · expire le … ».

### 10.5 `<BasicInfo>` (`<dl>` divisée, comme MFL)

| Label | Valeur |
|---|---|
| Nom | lien `/player/{id}` + drapeau |
| Âge | âge + badge **phase** : youth (vert « +6/séance »), talent (bleu « +4 »), prime (gris « +2 »), decline (orange « mental seul »), retired (rouge) — la phase vient du jeu ; si absente, déduite de l'âge (§15.1) |
| Poste | poste + style de jeu |
| OVR | OVR du jeu ; si l'OVR calculé (§13) diffère → `<OvrMismatchBadge>` ⚠ « formule : {n} » |
| POT | potentiel + écart `+{POT−OVR}` |
| Pied | gauche / droit / ambidextre |
| Forme / moral / fitness | barres compactes |
| Valeur | ⓘ + `<Suspense><MarketValue>` |
| Salaire | `{wage} GMC2` / match ou / jour (unité du jeu à confirmer) |
| Contrat | fin + demande de renouvellement si connue |
| Traits | `<TraitBadges>` (pastilles `--gc2-trait`) |
| Relevé | « données du {fetchedAt} » |

### 10.6 `<CareerStats>`
Depuis les champs du joueur : MJ, buts, passes, B+P, clean sheets (gardien), moyenne des 5 dernières notes de `form`.
`matchesPlayed === 0` → « Aucun match joué ». Divisions par zéro testées explicitement (bug MFL #8).

### 10.7 `<AttributesTable>` (champ)
- Ligne 1 : 6 stats `PAC SHO PAS DRI DEF PHY` en `<StyledRatingValue>`.
- Chaque stat est un `Disclosure` qui déplie ses sous-attributs (§13.1) en barres : valeur, plafond (= POT) en trait vertical,
  et au survol : exercice qui l'entraîne, coach requis et niveau (§15.3).
- `firstTouch` affiché à part, grisé : « n'entre dans aucune stat ».
- **Mode entraînement** (switch dans le popover de §10.8, partagé) : sous chaque sous-attribut, boutons `−` / `+`.
  - `+` ajoute **le gain réel d'une séance** pour l'âge (§15.1), plafonné au potentiel ; désactivé si l'exercice n'est pas disponible avec les niveaux de coach choisis (icône 🔒 + niveau requis) ou si le gain est nul.
  - `−` annule la dernière séance de ce sous-attribut (jamais sous la valeur d'origine).
  - Les 6 stats, l'OVR et **toutes les notes par poste** se recalculent en direct ; un bandeau résume : séances, coût total (prix recalculé à chaque séance selon l'OVR du moment), forme consommée, OVR avant → après. Lien **Réinitialiser**.

### 10.8 `<GoalkeeperAttributes>`
6 stats `DIV HAN KIC REF POS SPE`, `SPE` dépliable en `gkSprintSpeed` + `gkAcceleration`. Mêmes règles de mode entraînement.
Les sous-attributs de champ d'un gardien sont repliés dans « Attributs de champ (n'affectent pas l'OVR gardien) ».

### 10.9 `<PositionRatings>` (client) — calculs au §14
- Titre « Notes par poste » + bouton engrenage → Popover : switch **Entraînement**, switch **Adéquation au poste** (défaut **on**), sélecteur **Âge simulé**.
- **Adéquation ON** : une ligne par poste (15, GK masqué pour un joueur de champ), triée par note ajustée décroissante :
  `[poste + <PositionFitBadge>] … [écart vs OVR] [note ajustée]` et la note brute en petit gris.
- **Adéquation OFF** : 8 familles (`GK`, `CB`, `LB/RB/LWB/RWB`, `CDM`, `CM`, `CAM`, `LM/RM`, `LW/RW`, `ST/CF`) avec la note brute exacte.
- Option « terrain » : schéma 4-4-2 neutre avec la note à chaque poste (couleur §21.2).
- IDs uniques pour chaque switch (bug MFL #10).

### 10.10 `<PositionFitBadge>`
| Tier | Texte | Couleur |
|---|---|---|
| natural | P | `bg-green-700` |
| good | B (bon) | `bg-lime-700` |
| okay | A (acceptable) | `bg-yellow-600` |
| poor | M (mauvais) | `bg-red-700` |
Style MFL : `rounded-sm px-2 py-1 text-[10px] leading-none text-white`. Tooltip « ×0,95 (estimé) » etc.

### 10.11 `<OvrLevers>` et `<SquadTable>`
- **Leviers** : pour chaque sous-attribut disponible, nombre exact de séances pour **+1 OVR** en ne travaillant que lui, coût, coach ; trié du moins cher ; verrouillés grisés avec niveau requis.
- **Tableau d'effectif** (`/squad`) : colonnes Poste, Nom, Âge, OVR, POT, Écart, Séances → max, Coût → max, Forme ; tri sur chaque colonne (défaut : écart desc), filtres poste/âge/phase ; clic → fiche `local:`.

### 10.12 `<ShareCardButton>`
Comme MFL : `fetch('/api/player-card?id=')` → blob → `ClipboardItem` → ✓ 2 s ; repli « Télécharger » si le presse-papier image n'est pas pris en charge (mobile).

---

## 11. Composants — comparaison

- `<PlayerComparison>` (serveur) : `<PlayerCard>` (ImageCard + BasicInfo + CareerStats) par joueur, ou `<NotFound>`.
- `<AttributesComparison>` : `[val J1 ★?] [nom] [★? val J2]` pour les 6 stats, puis sous-attributs dépliables, étoile du côté du plus haut. Gardien vs champ : stats de gardien et de champ dans deux blocs, masqués si sans objet.
- `<PositionRatingsComparison>` : familles **non triées** (ordre fixe pour aligner), `[note J1 | Δ] [badge · poste · badge] [Δ | note J2]`, switch Adéquation (défaut off ici).
- Ligne **« Jusqu'à l'OVR max »** : séances, coût, OVR atteint pour chacun (§15.5, niveaux de coach par défaut 5/5/5/5/5, modifiable).

---

## 12. Recherche

`<SearchComboBox>` repris de MFL :
- Placeholder « Nom ou ID du joueur… », champ `h-12`/`sm:h-16`, loupe, spinner.
- Debounce **300 ms**. Sur la valeur débouncée : vide → rien ; **ressemble à un ID** (UUID ou motif d'ID GameChase) → navigation directe ; **≥ 3 caractères** → `/api/players/search?q=` ; sinon rien.
- Options : portrait 32 px + nom + `poste · OVR→POT · âge` ; coche sur le joueur courant ; « Aucun joueur trouvé ».
- Mode import seul (`GMC_SITE_TOKEN` absent) : la recherche cherche dans les effectifs importés (IndexedDB).
- `<ComboSearch>` : `router.push` dans `useTransition`. `<ComparePlayerSearch>` : 2 champs, `params.delete` si vide.

---

## 13. Moteur de stats et d'OVR (formules exactes)

Retrouvées par ingénierie inverse (code client du jeu + vérification sur **4 184 joueurs**). **Arithmétique entière, à reproduire à l'identique.**
`round(x) = Math.floor(x + 0.5)`.

### 13.1 Stats résumées (exact à 100 %)
Chaque stat = `round(moyenne de ses sous-attributs)` :

| Stat | Sous-attributs |
|---|---|
| PAC | acceleration, sprintSpeed |
| SHO | finishing, shotPower, longShots, volleys, penalties, attackingPositioning |
| PAS | vision, crossing, fkAccuracy, shortPassing, longPassing, curve |
| DRI | agility, balance, reactions, ballControl, dribblingSub, composure |
| DEF | interceptions, headingAccuracy, defensiveAwareness, standingTackle, slidingTackle |
| PHY | jumping, stamina, strength, aggression |
| DIV / HAN / KIC / REF / POS | gkDiving / gkHandling / gkKicking / gkReflexes / gkPositioningSub |
| SPE | gkSprintSpeed, gkAcceleration |

`firstTouch` n'entre dans **aucune** stat. Les sous-attributs peuvent dépasser 99 (jusqu'au potentiel).

### 13.2 OVR de champ (exact pour 98,2 % des joueurs)
`OVR = floor((Σ poids% × stat + 50) / 100)` — poids entiers, ordre `PAC SHO PAS DRI DEF PHY` :

| Famille | Postes | PAC | SHO | PAS | DRI | DEF | PHY |
|---|---|---|---|---|---|---|---|
| CB | CB | 11 | 3 | 13 | 4 | 37 | 32 |
| FB | LB, RB, LWB, RWB | 25 | 5 | 15 | 15 | 25 | 15 |
| CDM | CDM | 10 | 5 | 25 | 10 | 30 | 20 |
| CM | CM | 13 | 13 | 27 | 17 | 17 | 13 |
| CAM | CAM | 13 | 18 | 27 | 24 | 9 | 9 |
| WM | LM, RM | 24 | 13 | 20 | 24 | 10 | 9 |
| W | LW, RW | 28 | 19 | 14 | 28 | 5 | 6 |
| ST | ST, CF | 25 | 30 | 10 | 20 | 3 | 12 |

Chaque ligne somme à 100.

### 13.3 OVR gardien
`OVR = floor((2 × (DIV + HAN + KIC + REF + POS + SPE) + 6) / 12)` (moyenne arrondie des 6 stats).
Les attributs de champ **n'interviennent pas** (vérifié : corrélation nulle sur 423 gardiens).

### 13.4 Écarts
~1,8 % des joueurs ont un OVR affiché différent de la formule (valeur fixée côté serveur : forge, passage d'âge).
**Afficher l'OVR du jeu**, l'OVR calculé en ⚠ s'il diffère ; **toutes les simulations partent de l'OVR calculé** et le signalent.

### 13.5 API du moteur
```ts
summaryStats(subs): Record<'pac'|'sho'|'pas'|'dri'|'def'|'phy', number>
gkStats(subs): Record<'div'|'han'|'kic'|'ref'|'pos'|'spe', number>
ovrForFamily(family, stats): number          // §13.2
gkOvr(gk): number                            // §13.3
modelOvr(player, subsOverride?): number      // au poste du joueur
familyOf(position): Family
```
Un seul module, utilisé partout (fiche, carte PNG, OG, comparaison, simulateur) — pas de copie (bug MFL #3).

---

## 14. Notes par poste

- **Note brute** au poste X = `ovrForFamily(familyOf(X), stats du joueur)` — **exacte**.
- **Note ajustée** = `floor(brute × coef)` avec coef selon l'adéquation (règle de l'Optimiser du jeu) :
  naturel ×1,00 · bon ×0,95 · acceptable ×0,90 · mauvais ×0,85. Coefficients **confirmés** ; arrondi **à confirmer** (étiqueter « estimé »).
- **Proximités** (`positionFit.ts`, un seul helper `getFit(natural, target)` — bug MFL #2), symétriques, **à affiner** :

| Bon (×0,95) | Acceptable (×0,90) |
|---|---|
| LB↔LWB, RB↔RWB, CDM↔CM, CM↔CAM, LM↔LW, RM↔RW, CAM↔ST, CF↔ST | CB↔CDM, LW↔RW, LM↔RM |

  Tout le reste = mauvais (×0,85) ; GK ↔ champ = mauvais. Le tableau est une **donnée** (`tables.ts`), modifiable sans toucher au code.
- Pas de bonus capitaine ni de pénalité « poste secondaire » (GameChase n'a qu'un poste par joueur).
- Ordre d'application : stats (éventuellement simulées) → note brute → coefficient → arrondi.

---

## 15. Moteur d'entraînement et simulateur

Reproduit la fenêtre « Entraîner un joueur » du jeu. **1 exercice = 1 sous-attribut.**

### 15.1 Gain par séance
`gain = 2 × multiplicateur d'âge`, **plafonné au potentiel** (le potentiel est le plafond de chaque sous-attribut) :

| Âge | Phase | Multiplicateur | Gain / séance |
|---|---|---|---|
| < 18 | youth | ×3 | +6 |
| 18–24 | talent | ×2 | +4 |
| 25–30 | prime | ×1 | +2 |
| ≥ 31 | decline | exercices **mentaux** seulement (vision, composure, aggression) | +2 |

Gain effectif = `min(gain, potentiel − valeur)` (peut être 0 → séance inutile).

### 15.2 Prix, réussite, forme, durée
- **Prix** = `round(coût de base × m)`, `m` selon l'OVR **au moment de la séance** : ≥ 96 → ×25 ; ≥ 91 → ×10 ; ≥ 86 → ×4 ; ≥ 81 → ×2 ; sinon ×1.
- **Réussite** = `min(1, 0,8 × (1 + 0,05 × niveau du centre d'entraînement))` (niv. 4 → 96 %, niv. 5 → 100 %). Coût attendu = prix / réussite (affiché à part ; le plan reste en séances réussies).
- **Forme** : −8 par séance ; exercices bloqués sous 35. Le simulateur signale quand une pause est nécessaire (nombre de « recharges » de forme).
- **Durée** : poste 1 h, physique 2 h, mental 45 min.
- Gardien : `acceleration`, `sprintSpeed`, `agility` (de champ) ne lui sont pas proposés.

### 15.3 Catalogue des exercices (nom exact, coût de base)

| Sous-attribut | Exercice | Base | | Sous-attribut | Exercice | Base |
|---|---|---|---|---|---|---|
| finishing | Finishing Drills | 5 000 | | acceleration | Acceleration Sprints | 9 000 |
| shotPower | Power Shot Training | 5 000 | | sprintSpeed | Top Speed Training | 9 000 |
| longShots | Long Range Shooting | 5 000 | | stamina | Endurance Run | 9 000 |
| volleys | Volley Practice | 5 000 | | strength | Strength & Conditioning | 9 000 |
| penalties | Penalty Kick Practice | 5 000 | | jumping | Jump Training | 9 000 |
| attackingPositioning | Attacking Positioning | 5 000 | | agility | Agility Drills | 9 000 |
| shortPassing | Short Passing | 5 000 | | balance | Balance & Core Work | 9 000 |
| longPassing | Long Ball Drills | 5 000 | | reactions | Reaction Speed Drills | 9 000 |
| crossing | Crossing Accuracy | 5 000 | | vision | Vision & Awareness | 4 000 |
| fkAccuracy | Free Kick Precision | 5 000 | | composure | Composure Under Pressure | 4 000 |
| curve | Curve & Swerve Training | 5 000 | | aggression | Controlled Aggression | 4 000 |
| dribblingSub | Dribbling Drills | 5 000 | | gkDiving | Diving Practice | 5 000 |
| ballControl | First Touch Training | 5 000 | | gkHandling | Handling Drills | 5 000 |
| standingTackle | Standing Tackle Drills | 5 000 | | gkKicking | Kicking Improvement | 5 000 |
| slidingTackle | Sliding Tackle Practice | 5 000 | | gkPositioningSub | Positioning Mastery | 5 000 |
| interceptions | Reading the Game | 5 000 | | gkReflexes | Goalkeeper Reflexes | 5 000 |
| headingAccuracy | Heading Practice | 5 000 | | gkAcceleration | Goalkeeper Acceleration | 9 000 |
| defensiveAwareness | Defensive Awareness | 5 000 | | gkSprintSpeed | Goalkeeper Top Speed | 9 000 |

### 15.4 Coachs : postes couverts et niveau requis
Un exercice est disponible si un coach **couvre le poste** du joueur **et** a un niveau ≥ niveau requis. Niveaux 1–5 saisis par l'utilisateur (défaut 1, préréglage « tous à 5 »).

| Coach | Postes | Exercices (niveau requis) |
|---|---|---|
| Offensif `att` | LW, RW, ST | finishing 1, attackingPositioning 1, shotPower 2, penalties 2, volleys 3, longShots 3, ballControl 1, dribblingSub 2, composure 4, shortPassing 2, longPassing 3, curve 4, vision 5, headingAccuracy 4 |
| Milieu `mid` | CDM, CM, CAM, LM, RM | shortPassing 1, longPassing 2, crossing 2, curve 3, fkAccuracy 4, vision 2, ballControl 1, dribblingSub 2, composure 3, longShots 3, finishing 4, shotPower 4, volleys 5, penalties 5, standingTackle 2, interceptions 3, defensiveAwareness 4, headingAccuracy 5 |
| Défensif `def` | LB, CB, RB, LWB, RWB | standingTackle 1, defensiveAwareness 1, interceptions 2, slidingTackle 3, headingAccuracy 3, strength 2, aggression 3, reactions 4, shortPassing 2, longPassing 3, crossing 4, ballControl 3, dribblingSub 5, composure 4 |
| Gardiens `gk` | GK | gkDiving 1, gkHandling 1, gkPositioningSub 2, gkKicking 2, gkReflexes 3, reactions 3, jumping 4, strength 4, gkAcceleration 5, gkSprintSpeed 5, balance 5 |
| Physio `physio` | tous | stamina 1, acceleration 2, sprintSpeed 2, agility 3, balance 3, jumping 4, strength 4, reactions 5, aggression 5 |

> CF n'apparaît chez aucun coach de poste : un CF n'a accès qu'au physio. Garder ce comportement (c'est celui du jeu) et l'indiquer dans l'UI.

### 15.5 Planificateur « jusqu'à l'OVR max » (`planner.ts`)
Simulation séance par séance, en entiers :
1. Candidats = exercices disponibles (§15.4) dont le sous-attribut est < potentiel et dont le gain d'âge > 0.
2. À chaque étape, choisir la séance qui maximise `(poids de la stat / nb de sous-attributs de la stat) × gain effectif / prix`
   (poids §13.2 ; gardien : 1/6 par stat). Appliquer, recalculer l'OVR exact, prix suivant au nouvel OVR.
3. Arrêt à OVR = potentiel, ou quand plus aucun candidat ne progresse ; **retirer les séances finales qui n'ont pas fait monter l'OVR**. Garde-fou : 400 séances.
4. Sortie : `{ from, to, cap, sessions, cost, expectedCost, fitness, drills: {exercice: n}, milestones: [{ovr, sessions, cost}] }`.
5. Variante **« 🔒 coachs niveau 5 »** calculée en parallèle, affichée si elle va plus loin.
6. Variante **« après anniversaire »** : même calcul avec l'âge +1 quand le joueur change de tranche (24→25, 30→31) — montre ce que coûte d'attendre.

### 15.6 `<TrainingSimulator>` (UI)
- **Réglages** : niveaux des 5 coachs (sélecteurs 1–5), niveau du centre (1–5), âge simulé, fitness de départ. Mémorisés (IndexedDB), préremplis par l'import `/api/training/coaches` si l'utilisateur colle ce JSON.
- **Mode manuel** : liste des exercices disponibles (verrouillés grisés avec le niveau requis) ; bouton « +1 séance » par exercice ; historique annulable ; OVR, stats, notes par poste, coût cumulé et forme mis à jour en direct (même état que le mode entraînement du §10.7).
- **Mode auto** : plan §15.5 ; frise des jalons OVR par OVR (séances et coût cumulés) ; détail par exercice ; boutons « appliquer le plan en mode manuel » et « exporter » (CSV + image).
- Message honnête quand rien n'est faisable : « Aucun exercice disponible ne fait progresser l'OVR avec ces coachs » + ce que débloque chaque niveau de coach.

---

## 16. Progression par les matchs (informatif)

Règles du manuel du jeu :
- Série de matchs officiels (≥ 45 min). En fin de série, gain selon la note moyenne : ≥ 6,60 → +1, ≥ 7,00 → +2, ≥ 7,40 → +3 (plafond = potentiel).

| Âge | Matchs par série (OVR < 90) | (OVR ≥ 90) |
|---|---|---|
| ≤ 20 | 8 | 16 |
| 21–24 | 12 | 24 |
| 25–28 | 16 | 32 |
| 29–30 | 20 | 40 |
| ≥ 31 | aucune progression | |

- Vieillissement : +1 an tous les **40 jours**.
- `<MatchProgression>` : curseur « note moyenne attendue » et « matchs par semaine » → projection OVR par date jusqu'au potentiel ou à 31 ans, superposée à la courbe réelle (§19). Étiquette « projection ».

---

## 17. Valeur marchande (GMC2)

Moteur de MFL **repris** (mêmes fichiers, mêmes tests), avec ces adaptations :

### 17.1 Données
Ventes/annonces comparables de `/v1/site/sales` (§6.3). Tant qu'il n'y a pas de ventes conclues, utiliser les **prix demandés** des annonces actives
comme borne haute indicative et l'afficher comme tel (« prix demandés », pas « ventes »).

### 17.2 Collecte des comparables
Comme MFL §14.1 : âge ±1/±2/±3 et OVR ±1/±2/±3 jusqu'à 5 ventes, même poste ; exclure à ±50 % de la médiane.
Seuil de prix minimal : **à calibrer** sur les données (constante `MIN_PRICE_BY_OVR` dans `tables.ts`, initialement 0).
Ajouter le **potentiel** comme critère secondaire (écart POT−OVR ±3), propre à GameChase.

### 17.3 Arbre de décision, EMA, statistiques robustes, fourchette
Identiques à MFL : ≥ 5 ventes → EMA (alpha 0,3, 60 jours, poids `e^(−0,05·jours)`) ; 2–4 → moyenne robuste (prix suspects, IQR, moyenne tronquée 10 %) ;
0–1 → régression ; erreur → estimation. Fourchette centrée (±15/20/25/30/35/50 % selon n et CV). Confiance high/medium/low avec les mêmes règles.
« Prix suspects » : multiples de 1 000 GMC2 (au lieu de 50/100 $).

### 17.4 Régression
Features : `[overall, potential, age, pac, sho, pas, dri, def, phy, gkOvr, posEncoding, rarityRank]`. Encodage de poste repris de MFL.
`inverse()` renvoie `null` si matrice singulière → repli (bug MFL #7). Modèle entraîné **au plus une fois toutes les 6 h** (§8.1).

### 17.5 Repli
Sans vente ni modèle : **`player.value` fourni par le jeu**, confiance « valeur du jeu », fourchette ±30 %.
Pas de formule inventée par poste tant que la valeur du jeu existe.

### 17.6 Affichage `<MarketValue>`
Comme MFL : badge de confiance + `~{valeur} GMC2`, « Fourchette : bas – haut », popover « Ventes récentes (N) » (date · âge · OVR → prix).
Afficher aussi la **valeur du jeu** pour comparaison.

---

## 18. Infos contrat / salaire

Remplace les « Contract Stats » de MFL (part de revenus par division) :
```
joueurs = E3(même poste, âge ±2, OVR ±2, limit 500), salaire > 0
grouper par ligue si connue, sinon un seul groupe « Tous »
pour chaque groupe : trier par salaire ; si n ≥ 5 retirer max(1, floor(n×0,1)) de chaque côté ; min, moyenne, max, total
```
Une seule fonction `aggregateContracts()` partagée serveur/client (bug MFL #4).
Accordéon « Salaires comparables » : tableau `[Groupe (n)] Min Moy Max` en GMC2 + ligne « ce joueur » (salaire actuel, demande de renouvellement).
Rappel affiché : **budget contrats ≈ 4 % de la valeur** (règle vérifiée sur l'extension) si la demande du jeu n'est pas connue — étiqueté « estimation ».
« Pas assez de données » si vide.

---

## 19. Courbe de progression

Données `/v1/site/history/:id` (un point par jour). Reconstruction reprise de MFL, mais par **jour** puis regroupée par âge :
un point par âge = dernière valeur connue à cet âge ; option « par date ».
Rendu SVG fait main (`viewBox 0 0 500 110`, hauteur 160 px) : OVR (ligne pleine accent), POT (pointillés), aire en dégradé ;
grille min/milieu/max ; projection §16 en pointillés clairs. « Pas encore d'historique » si < 2 points (l'historique commence à la mise en service du §6).

---

## 20. Images générées

### 20.1 OG / Twitter joueur (1200×630 / 1200×600, edge)
Fond `#101521`. Gauche : logo + « GameChase Player Info », Nom, Âge · Poste, **OVR → POT**, 6 pastilles de stats (couleurs §21.2 — utiliser la bonne clé pour chaque stat, bug MFL #5), « Jusqu'au max : N séances · X GMC2 » (coachs 5).
Droite : portrait 384 px, cadre de rareté. Police chargée depuis `NEXT_SITE_URL/assets/fonts/`.

### 20.2 OG comparaison
Repris de MFL : deux portraits séparés par « v », « ??? » + placeholder si absent.

### 20.3 Carte partageable `/api/player-card` (PNG 600×800)
Fond `#182033`, bord `#2e3c5a`, rayon 20 :
1. Haut : portrait 120×160 + OVR (40 px) + POT + pastille de poste + nom + âge/phase, pied, nationalité.
2. 6 stats en cases 40×40 colorées.
3. Notes par poste (8 meilleures, badges §10.10).
4. Bloc « Entraînement jusqu'au max » (séances, coût, forme).
5. Pied : « GAMECHASE PLAYER INFO » / `{domaine}/player/{id}` (domaine canonique réel, bug MFL #14) + « Non affilié à GameChase ».
Utilise les fonctions du moteur (aucune copie de calcul).

---

## 21. Design system

### 21.1 Tokens (`globals.css`) — palette de l'extension GMC Companion
Sombre par défaut, exposés via `@theme inline { --color-*: var(--*) }` comme MFL :

| Token | Sombre (défaut) | Clair |
|---|---|---|
| background | `#101521` | `#f5f7fb` |
| card | `#182033` | `#ffffff` |
| secondary / chip | `#1c2740` | `#eef2f8` |
| border | `#2e3c5a` | `#dbe2ee` |
| line (séparateurs) | `#243049` | `#e6ebf3` |
| foreground | `#eaf0fa` | `#1b2430` |
| muted-foreground | `#8ea2bf` | `#5b6b82` |
| primary (accent) | `#ff9142` | `#e0661b` |
| primary-foreground | `#241206` | `#ffffff` |
| success | `#4ade80` | `#16a34a` |
| warning | `#ffb4a2` | `#c2410c` |
| trait | `#ffd9a0` | `#9a5b00` |
| radius | `20px` (cartes), `12px` (boutons), `999px` (pastilles) | |

### 21.2 Tiers de note (`getRatingClassNames`) — repris de MFL + un tier
| Note | Classes | Hex (PNG) |
|---|---|---|
| ≥ 100 | `bg-gradient-to-br from-amber-300 to-orange-500 text-black` | `#fbbf24` / `#000` |
| ≥ 95 | `bg-black text-yellow-400 outline-1 outline-yellow-400` | `#000` / `#facc15` |
| ≥ 85 | `bg-fuchsia-500 text-fuchsia-50` | `#a21caf` / `#fdf4ff` |
| ≥ 75 | `bg-blue-500 text-blue-50` | `#3b82f6` / `#eff6ff` |
| ≥ 65 | `bg-lime-500 text-lime-950` | `#84cc16` / `#1a2e05` |
| ≥ 55 | `bg-yellow-400 text-yellow-950` | `#facc15` / `#422006` |
| < 55 | `bg-slate-600 text-slate-50` (sombre) | `#475569` / `#f8fafc` |

`<StyledRatingValue>` repris (`w-10 sm:w-12 rounded-lg py-1.5 font-medium tabular-nums text-center`).

### 21.3 Rareté (cadre du portrait, badges)
common `#9ca3af` · uncommon `#4ade80` · rare `#60a5fa` · epic `#c084fc` · legendary `#fbbf24` · galactico dégradé `#f472b6 → #ff9142`.

### 21.4 Conventions (reprises de MFL)
- Cartes `bg-card rounded-[20px] shadow-2xl outline-1 outline-border -outline-offset-1`.
- Titres de section `text-2xl sm:text-3xl font-bold tracking-tight`.
- **Container queries** (`@container/main`, `@sm/main`) pour réutiliser la fiche en pleine page et en demi-colonne de comparaison.
- Bouton shadcn (variants default/outline/secondary/ghost/link, tailles sm/default/lg/icon, `asChild`).
- Nombres en `tabular-nums`, format FR (`Intl.NumberFormat('fr-FR')`), interface en **français** (textes centralisés dans `src/lib/i18n.ts` pour un anglais plus tard).
- Mobile 375 px impeccable ; cibles tactiles ≥ 40 px ; accessibilité : focus visibles, `aria-label` sur les boutons icônes.

### 21.5 Header / Footer
Header : logo GMC + séparateur + « Player Info ». Footer : « Site non officiel, non affilié à GameChase · données relevées par la communauté GMC Companion · par CrazyCult (L'Icaunique) ».

---

## 22. SEO, métadonnées, PWA
- Titre par défaut « GameChase Player Info | Notes, potentiel et simulateur d'entraînement ».
- Description « Fiche complète, notes à chaque poste et coût exact d'entraînement jusqu'au potentiel pour les joueurs GameChase. »
- `shared-meta.ts`, canonical par page, `sitemap.ts` (accueil + `/squad`), `robots.ts` ; `/player/local:*` en `noindex`.
- `manifest.ts` : nom « GameChase Player Info », `display: standalone`, icônes 192/512 maskable (bug MFL #14).

---

## 23. Leçons de MFL : bugs à ne pas recopier

| # MFL | Problème | Ici |
|---|---|---|
| 1 | Valeur calculée 2× par page, régression réentraînée à chaque requête | `unstable_cache` dès le départ (§8.1) |
| 2 | Sens de lecture de la matrice de familiarité incohérent | helper unique `getFit(natural, target)` |
| 3 | Calcul de note dupliqué dans la carte PNG | moteur unique `src/engine` |
| 4 | Agrégation des contrats dupliquée | `aggregateContracts()` unique |
| 5 | OG : couleur PAS prise sur DRI | test sur les 6 clés |
| 7 | `inverse()` silencieux si singulière | renvoie `null` → repli |
| 8 | `NaN` sur 0/0 | tests explicites |
| 9 | Mode entraînement sans plafond | plafond = potentiel, gain réel par âge |
| 10 | IDs de switch dupliqués | `useId()` |
| 11 | Effacer un champ de comparaison ne retire pas le paramètre | `params.delete` |
| 12–13 | Code mort, scripts `fix_*.py` | interdits (lint `no-unused`, revue) |
| 14 | Manifest générique, domaine de la carte faux | vrais noms |
| 15 | Pas de gestion du 429 | état « réessayer » + message |

---

## 24. Tests obligatoires (vitest)

Fixtures à placer dans `tests/fixtures/` (fournies par l'utilisateur) :
`ovr-dataset.json` (export de 4 184 joueurs `gmc-ovr-dataset-complet.json`), `squad-sample.json` (réponse `/api/players/squad`).

- **Stats résumées** : 100 % exactes sur `ovr-dataset.json`.
- **OVR** : ≥ 98 % exacts (champ et gardiens séparément) ; le test affiche la liste des écarts.
- **Gardien** : modifier les attributs de champ ne change pas l'OVR.
- **Cas de référence « Pasero »** (GK, 23 ans, OVR 96, POT 103) — gkDiving 103, gkHandling 102, gkKicking 103, gkReflexes 103, gkPositioningSub 103, gkSprintSpeed 64, gkAcceleration 60 ; coach gardiens 5 :
  plan = **20 séances, 4 400 000 GMC2, forme −160** (Goalkeeper Acceleration ×10, Goalkeeper Top Speed ×9, Handling Drills ×1), jalons 97 → 103.
  Coach gardiens 4 : aucun gain, variante 🔒 = 103.
- **Séance isolée** : pour Pasero, Top Speed 64 → 68 seul ne change pas l'OVR (reste 96).
- **Multiplicateurs** : même joueur à 17, 21, 27, 32 ans → gains 6 / 4 / 2 / mental seul.
- **Prix** : seuils 81/86/91/96 → ×2/×4/×10/×25 ; prix recalculé après chaque séance.
- **Plafond** : aucun sous-attribut ne dépasse le potentiel ; séances finales sans gain d'OVR retirées.
- **Disponibilité** : CF → physio seul ; GK → pas d'acceleration/sprintSpeed/agility de champ.
- **Notes par poste** : note brute au poste naturel = OVR calculé (100 %) ; coefficients 1/0,95/0,90/0,85 appliqués.
- **Valeur** (repris de MFL) : EMA, moyenne tronquée, IQR, fourchette centrée, `inverse()` singulière → `null`.
- **Contrats** : `aggregateContracts` (trim, groupes).
- **Progression** : reconstruction de la courbe ; projection par les matchs (tranches d'âge, seuils 6,60/7,00/7,40).
- **Import** : les 3 formats JSON acceptés ; sous-attribut manquant → avertissement, pas de 0 silencieux.

---

## 25. Plan de réalisation pas à pas

1. **Moteur d'abord** : `src/engine/*` + tests §24 (aucune UI). Ne pas continuer tant que l'OVR n'est pas ≥ 98 % et Pasero exact.
2. **Initialiser** Next.js (TS, App Router, Tailwind v4, `src/`, `@/*`), dépendances §2, thème §21, layout, Header/Footer/Button/Spinner.
3. **Import local** : schéma zod, `/squad`, IndexedDB, fiche `local:` → permet de tester toute l'UI **sans serveur**.
4. **Fiche joueur** dans l'ordre : ImageCard/ClubBadge → BasicInfo → CareerStats → AttributesTable/GoalkeeperAttributes (+ sous-attributs) → PositionRatings (+ popover) → OvrLevers → TrainingSimulator → MatchProgression.
5. **Serveur d'index** (§6) : tables, upserts dans `POST /v1/clubs`, script de rattrapage, routes `/v1/site/*`, secret `SITE_TOKEN`, mise à jour de `/privacy`. Déployer avec `wrangler`.
6. **Adaptateur** `src/data/gmc-index.ts` + routes `/api/players/*` ; recherche (`SearchComboBox`) ; pages serveur `/player/[id]`.
7. **Comparaison**.
8. **Progression** (historique) et **Salaires comparables**.
9. **Valeur marchande** : moteur repris de MFL (`statistics → ema → estimate → regression → index`) avec cache ; repli `value` du jeu.
10. **Images** : OG/Twitter, OG comparaison, `/api/player-card`, `ShareCardButton`.
11. **SEO/PWA**.
12. **Déploiement** (Vercel ou Cloudflare) + variables d'environnement.
13. **Vérifications** : joueur inexistant, gardien, CF, joueur ≥ 31 ans, joueur au potentiel, OVR ≠ formule, sous-attribut manquant, mode import seul (sans token), mobile 375 px, thème clair.

Après chaque étape : `pnpm lint && pnpm test && pnpm build`.

---

## 26. Interdits et conformité

- **Aucune requête à gamechase.io** (ni depuis le site, ni depuis le serveur du site) ; aucune automatisation d'action dans le jeu. Le site lit et calcule, il n'agit jamais.
- Aucun secret dans le dépôt ni dans le bundle : clé privée de licence, codes de licence, identifiants d'installation, cookies, `GMC_SITE_TOKEN`.
- Ne jamais renvoyer `contributor` ni aucune donnée d'utilisateur de l'extension ; aucune donnée de manager au-delà du nom de club.
- Ne pas présenter comme exact ce qui ne l'est pas : proximités de poste, arrondi de la note ajustée, progression par les matchs, valeur marchande → étiquette « estimé » / « projection ».
- Mettre à jour la politique de confidentialité du serveur d'index avant d'ouvrir le site au public (§6.4).
- Pied de page : « Site non officiel, non affilié à GameChase ».

---

## 27. Prompt prêt à coller dans Claude Code

```
Tu vas créer "GameChase Player Info", un site Next.js (App Router, TypeScript strict,
Tailwind v4) sur le modèle de MFL Player Info, pour le jeu GameChase.
La spécification complète est dans SPEC.md à la racine : lis-la entièrement avant de coder.

Contraintes :
- Commence par le moteur (src/engine, fonctions pures) et ses tests vitest (§24).
  Les formules du §13 et §15 sont exactes : reproduis-les à l'identique, en entiers,
  sans "amélioration". Le test Pasero (20 séances, 4 400 000, forme −160) doit passer
  avant toute UI. Les fixtures sont dans tests/fixtures/.
- Aucune requête vers gamechase.io. Les données viennent du serveur d'index GMC via
  src/data/gmc-index.ts (server-only, token GMC_SITE_TOKEN jamais exposé au client)
  et de l'import JSON local (/squad, IndexedDB). Sans token, le site fonctionne en
  mode import seul.
- Les évolutions du Worker (§6) sont dans worker.js (fourni) : ajoute les tables,
  les upserts et les routes /v1/site/* sans casser les routes existantes de
  l'extension, et mets à jour /privacy.
- Un seul module de calcul utilisé partout (fiche, comparaison, carte PNG, OG).
- Corrige d'emblée tous les points du §23. Pas de code mort.
- Interface en français, thème sombre GMC (§21), mobile 375 px impeccable.
- Ce qui n'est pas vérifié (proximités de poste, progression par les matchs,
  valeur marchande) est étiqueté "estimé" dans l'UI.
- Suis le plan du §25 ; après chaque étape lance pnpm lint, pnpm test, pnpm build,
  corrige, puis montre-moi le résultat avant de passer à la suivante.
```