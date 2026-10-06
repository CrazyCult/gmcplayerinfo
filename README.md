# GameChase Player Info

Réalisation suivant [SPEC.md](SPEC.md). Interface française, aucune requête au jeu, aucun secret côté client.

Site public : **https://gmcplayerinfo.vercel.app** · [Catalogue GMC Companion](https://gmcplayerinfo.vercel.app/players).

Mis en ligne le 6 octobre 2026 sur Vercel, relié au dépôt public `CrazyCult/gmcplayerinfo` et au Worker existant. Vérification de l’index réel : 42 023 joueurs uniques, 841 pages, profils et recherche accessibles ; les nouvelles collectes apparaissent après expiration du cache serveur (15 minutes).

## Interface et index communautaire

- Stats résumées, OVR entier champ/gardien, adéquation estimée des postes.
- Catalogue complet, coachs, gains selon l’âge, plafonds, coût par palier, coût attendu.
- Séance manuelle pure, plan automatique, jalons, recharges de forme, variantes coachs 5 et anniversaire, leviers d’OVR.
- Agrégation des salaires, reconstruction historique, projection estimée par les matchs.
- Cas Pasero vérifié : 20 séances, 4 400 000 GMC2, −160 de forme.
- Worker étendu avec une API de lecture dédiée au site, indépendante des licences de l’extension.
- Catalogue `/players` : tous les joueurs présents dans les collectes Companion, recherche, filtre par poste et pagination de 50 joueurs.
- Lecture directe de la table D1 `clubs` existante : aucun réimport requis, collectes anciennes incluses, un joueur transféré apparaît dans sa collecte la plus récente.
- Recherche communautaire, fiches distantes, entraînement et comparaison. Cache serveur de 15 minutes ; date de collecte affichée.
- Politique `/privacy` adaptée au site public ; liste blanche des champs, aucun manager, contributeur, identifiant d’installation ou licence exposé.
- Validation Zod et normalisation de l’effectif réel (53 joueurs), trois formats d’import, avertissements d’attributs manquants.
- Next.js 16, React 19, Tailwind v4 et Manrope servie localement par `next/font`.
- Accueil et recherche dans l’effectif, import JSON par fichier/dépôt/texte, stockage IndexedDB, tableau filtrable et triable.
- Fiches `local:`, attributs dépliables, notes par poste, simulateur manuel/auto, annulation, plans et export CSV.
- Comparaison locale : stats, sous-attributs, étoiles, notes par famille et coût jusqu’au maximum atteignable.
- Vérification dans le navigateur : import des 53 joueurs, fiche GK, application du plan, comparaison et suppression du paramètre d’un joueur effacé ; fiche contrôlée à 375 px sans débordement.

## Vérification

```sh
pnpm install
pnpm lint
pnpm test
pnpm build
pnpm dev
```

`build` compile le site Next.js en production et vérifie TypeScript. `pnpm dev` démarre l’interface sur http://localhost:3000. `pnpm typecheck` lance TypeScript seul. Ne jamais placer `GMC_SITE_TOKEN` dans une variable `NEXT_PUBLIC_*`.

Le test SQL du Worker utilise Python 3 et sa bibliothèque SQLite standard. Les fixtures brutes sont locales et ignorées par Git.

## Mise en ligne Vercel et Cloudflare

Voir [DEPLOYMENT.md](DEPLOYMENT.md). Le dépôt GitHub ne contient aucun secret ni export brut. Le site passe en mode communautaire lorsque `GMC_SITE_TOKEN` est configuré. Ce token doit être identique au secret `SITE_TOKEN` du Worker. Sans token, l’import local reste disponible.

Le catalogue couvre les joueurs **déjà collectés par GMC Companion**, pas les joueurs du jeu jamais consultés par l’extension. Les prochaines collectes apparaissent automatiquement. L’API lit les snapshots de clubs avec SQLite JSON et dédoublonnage ; si le volume augmente fortement, matérialiser une table de joueurs indexée permettra de réduire le coût des requêtes. L’historique n’est pas inventé à partir d’un snapshot unique.

## Validation encore requise

Les deux exports sont maintenant intégrés localement. Sur les 4 184 joueurs : **OVR champ 98,17 % (3 692 / 3 761), OVR gardiens 98,82 % (418 / 423)**. Pasero reste exact.

**Le contrôle de stats à 100 % échoue** : 13 écarts sur 25 104 stats, concernant 8 joueurs. Les formules et l’export sont préservés, sans exclusions. L’utilisateur a autorisé la poursuite avec ces écarts documentés. Le rapport [reports/VALIDATION.md](reports/VALIDATION.md) décrit les cas. La suite exécute le contrôle en échec attendu (`it.fails`) ; `pnpm test:dataset:strict` le relance sans cette exception et échoue. Aucun test du dataset n’est ignoré quand l’export est présent.

Les fixtures brutes sont exclues de Git ; les tests d’import réel nécessitent leur présence locale.

Le moteur de valeur et ses règles détaillées « identiques à MFL » nécessitent aussi les fichiers et tests MFL cités par la spécification pour être repris fidèlement (seuils de confiance, régression, filtrage des prix suspects). Ils ne sont pas présents.

Les stats incomplètes renvoient `undefined` ; elles ne sont jamais remplacées par zéro. La projection des matchs suppose un prochain anniversaire dans 40 jours quand sa date exacte est inconnue. Les plans comptent les séances réussies, avec recharges de forme nécessaires ; une séance manuelle est bloquée sous 35 de forme.

## Suite de la réalisation

Restent hors de cette livraison : historique quotidien persistant, collecte des ventes et contrats comparables, moteur de valeur MFL, partage PNG/OG et PWA. L’URL officielle du joueur n’est pas affichée tant qu’elle n’est pas vérifiée.
