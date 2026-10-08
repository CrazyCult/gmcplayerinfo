# Skin Manga — recette locale

## Proposition actuelle : interface Manga (v3)

Après le retour de l'utilisateur, l'interface a été entièrement reprise dans `manga.css` : papier crème tramé, panneaux et contrôles aux contours encrés, ombres franches, titres sportifs condensés, étiquettes de poste, tableaux et résumés de progression assortis. La direction est celle d'un manga de football ; l'illustration est une vignette encadrée sur l'accueil. Le ballon et ses lignes de vitesse dans `football-burst.svg` sont un dessin vectoriel original.

Manga utilise désormais une palette claire propre, avec les mêmes familles de couleurs de rareté et d'attributs rendues plus sombres pour la lisibilité. La préférence Manga reste distincte de Jour : les variables sont uniquement appliquées sous `data-skin="manga"`. Le marqueur technique `data-theme="dark"` conservé pour la compatibilité du stockage ne définit pas cette palette.

Build réussi pour cette révision. 42 contrôles sur sept pages (accueil, catalogue, effectif, comparaison, fiche, entraînement et compte) de 320 à 1920 px : aucun débordement global ; les filtres du catalogue restent contenus. Bascule Jour/Nuit/Manga et filtre de l'effectif vérifiés dans le navigateur. Captures actuelles : `home-manga-v3.jpg`, `squad-manga-v3.jpg`, `squad-mobile-v3.jpg` ; mesures `responsive-v3.json`. Les captures v1/v2 documentent les propositions précédentes, remplacées par cette version.

Le troisième choix « Manga » s'ajoute à Jour et Nuit dans le sélecteur d'apparence du site. Les textes, liens, calculs et le logo GMC existants sont conservés. `config.js` de l'extension n'a pas été modifié. Aucun déploiement ni push n'a été effectué.

## Utilisation

L'aperçu est disponible sur http://localhost:3211. Choisir Manga dans le sélecteur du bandeau. Le choix est conservé sur cet appareil ; dans Mon compte, sélectionner le thème de référence puis cliquer « Enregistrer sur mon compte » pour le retrouver après connexion sur un autre appareil. Le bouton de suppression efface uniquement cette préférence.

Pour tester cette sauvegarde sans toucher à Google ni aux données publiques : ouvrir http://localhost:4211/__test/login/A (compte fictif premium), puis http://localhost:4211/__test/login/B (autre compte fictif). Ces sessions sont créées par un serveur de recette séparé, uniquement local. Les joueurs et clubs de cet aperçu sont fictifs. La vraie connexion OAuth Google n'est pas vérifiée dans cet environnement.

Pour relancer depuis la racine du dépôt, avec Node 22 compatible `node:sqlite` et pnpm :

```powershell
pnpm install --frozen-lockfile
$env:GMC_SITE_TOKEN = 'local-only'
$env:GMC_INDEX_URL = 'http://localhost:4211'
pnpm build
node scripts/preview-skin.cjs
```

Le lanceur utilise les ports 3211 et 4211, une base SQLite dans `.tmp/skin-local.sqlite`, et des secrets fictifs réservés à la recette. Il n'est pas une route de l'application déployée. Fermer avec Ctrl+C avant de le relancer.

## Modifications

- `src/lib/appearance.ts`, `appearance-store.ts`, `ThemeToggle.tsx`, `layout.tsx` : trois apparences, stockage local, application avant peinture, écoute des changements et protection contre une réponse de compte tardive.
- `src/app/manga.css`, `page.tsx`, `players/page.tsx` : habillage Manga et correction responsive des filtres du catalogue, du bandeau et des contrôles.
- `AccountAppearance.tsx`, `compte/page.tsx`, `api/preferences/appearance/route.ts`, `src/data/gmc-index.ts` : préférence du compte authentifié, contrôle de l'origine des écritures, validation stricte, réponses sans cache.
- `worker.d1.js` : table additive `site_preferences` et endpoint privé GET/PUT, indépendant de l'association du club. La clé du compte vient de la session existante côté serveur.
- `public/skins/manga/` : deux illustrations WebP optimisées (182 Ko bureau, 53 Ko mobile), SVG tactique et entraînement, provenance documentée.
- Tests d'apparence, d'API et du worker ; correction des adaptateurs SQLite des tests pour les paramètres SQL numérotés D1 ; alias Vitest ; lanceur de recette locale.

Avant une future publication, déployer le worker avec le nouvel endpoint puis le site. L'authentification Google existante n'a pas été remplacée. Sur un appareil neuf, la référence du compte arrive après la lecture asynchrone ; sur un appareil déjà utilisé, la préférence locale est appliquée avant peinture.

## Visuel

L'image a été créée avec imagegen : footballeur original vu de dos à gauche, numéro 10, stade de nuit à droite, ciel central sombre libre pour les vrais contenus du site. Aucun personnage ou asset d'Olive et Tom n'est repris. La composition s'inspire de la référence fournie, sans chercher une reproduction pixel par pixel : illustration originale différente, vrai badge GMC conservé, pas de fausse barre de navigateur, cartes faites en CSS et SVG.

Les modes Jour et Nuit gardent leurs couleurs sémantiques. L'illustration de l'accueil n'est chargée que dans Manga ; les autres pages portent le style Manga par leurs panneaux, titres et contrôles.

### Révision après retour visuel

Le fond est maintenant fixe sur toutes les pages Manga, avec un voile uniquement en bas. L'accueil réserve 32 % de sa largeur au joueur sur ordinateur et une zone d'illustration sur mobile. Les panneaux deviennent translucides et adoptent une bordure orange, des angles alternés et une ombre franche. Les captures `manga-desktop-v2.jpg` et `manga-mobile-v2.jpg` montrent cette révision, les anciennes captures restent celles de la première proposition.

Build de cette révision réussi. 14 nouveaux contrôles sur l'accueil et le catalogue, de 320 à 1920 px : aucun débordement, tous les filtres restent dans la largeur disponible. Mesures dans `responsive-v2.json`.

## Résultats

- Installation, lint, typecheck et build : réussis.
- Vitest : 124 tests réussis, 3 ignorés ; une suite d'import ne peut pas s'exécuter car le fichier privé préexistant `tests/fixtures/squad-sample.json` manque. Aucun test n'a été affaibli pour masquer cette absence.
- 88 contrôles responsive, de 320 à 1920 px : aucun débordement global. Catalogue testé dans les trois apparences, avec les options premium longues ; pages effectif, comparaison, fiche complète, entraînement et compte testées en Manga.
- Recherche, navigation vers la fiche, soumission des filtres et choix du thème au clavier : vérifiés dans le navigateur.
- Sauvegarde, rechargement et isolation entre deux comptes fictifs : vérifiés avec le worker réel sur SQLite locale ; adaptateur HTTP Turso couvert par les tests.
- Aucune erreur d'hydratation relevée. Le zoom natif 200 % n'a pas été testé ; les petites largeurs ont été testées explicitement.

Captures et mesures : `reports/skin-manga/` (bureau, mobile, Jour, Nuit, catalogue, fiche et compte ; matrices JSON des largeurs).
