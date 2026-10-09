# Navigation et chargement

## Correction du 9 octobre 2026

Les mesures HTTP initiales du site public ont montré une première lecture du
catalogue à 2,4 s, puis 0,18 s après réutilisation du cache ; l’effectif explicite
prenait environ 0,55 s à chaque lecture, et la première ouverture mesurée dans
Chrome atteignait 2,4 s. Ce sont des mesures sans session Google, depuis une
seule machine ; elles ne garantissent pas la même durée sur tous les appareils.

Le worker mémorise désormais la version du schéma dans la base. Un nouvel
isolat vérifie cette version en une lecture au lieu de renvoyer tout le schéma
et cinq ALTER déjà appliqués. Les initialisations concurrentes partagent une
promesse ; une migration interrompue n’est pas marquée comme terminée et reste
réessayable. Toute future migration doit changer `SCHEMA_VERSION`.

Les lectures indépendantes d’une fiche sont regroupées en pipelines Turso :
3 échanges pour la fiche complète, contre 7 auparavant. Le catalogue utilise
1 échange contre 2. L’effectif complet, son nom et les fiches individuelles
plus récentes sont lus dans une seule requête, bornée à l’effectif du club.
Les filtres, limites, attributs et protections de collecte restent vérifiés.

Les navigations sur Mon effectif utilisent un cache Next révalidé après 30 s,
avec une balise propre à chaque club. « Actualiser depuis GMC Companion » le
contourne toujours, vérifie l’instantané récent puis invalide les balises du
club et de tous ses joueurs. Les droits du compte et son rattachement ne sont
pas mis en cache. Les collectes automatiques peuvent apparaître avec un court
délai de revalidation ; le bouton permet de demander immédiatement la dernière
version. Aucune nouvelle version de l’extension n’est requise pour ces corrections.

Vérification : 70 tests ciblés, TypeScript, ESLint, compilation de production,
parcours navigateur local d’une actualisation après mise en cache. Un profil
fictif de 40 joueurs a demandé environ 100 ms de calcul en exécution isolée
(environ 240 ms pendant les contrôles parallèles), sans blocage de plusieurs
secondes dans les navigations publiques observées.

La navigation affiche désormais un état de chargement, sans attendre les
réponses de l’index. Les fiches légères chargent leur statut de demande côté
client via l’API existante, après affichage de la fiche. Le bouton reste
indisponible pendant cette vérification ; une panne du statut permet ensuite
de demander une lecture manuellement. Les lectures restent sans cache.

Lorsqu’un club est explicite dans l’URL, sa récupération commence en parallèle
de la recherche du club rattaché au compte. Cette dernière est conservée pour
les boutons de rattachement et de changement de club, avec les mêmes droits.

Les leviers d’OVR sont calculés à la première ouverture du panneau et leur
contenu reste monté après fermeture. Les variantes du simulateur sont
calculées à sa première ouverture ; le plan principal reste disponible pour
le résumé du panneau. Les formules ne changent pas.

Pour diagnostiquer le délai restant entre le site et l’index, activer
`GMC_PERF_LOGS=1` côté serveur. Les entrées `GMC_INDEX_TIMING` donnent une
catégorie de route, un statut HTTP et une durée en millisecondes, sans
identifiant de joueur/compte, recherche ni jeton. Elles mesurent l’appel
complet à l’index, pas séparément son accès à la base. Désactivé par défaut.

## Vérification du 8 octobre 2026

- Compilation de production, TypeScript et ESLint : réussis.
- Tests existants : 63 réussis, 23 échecs, 3 ignorés. Le code original au
  commit 8ee3bed donne exactement les mêmes résultats sous Node 22.16.
  Les échecs concernent les tests de worker SQLite/Turso et un fichier
  d’import de référence absent ; aucun de ces fichiers n’est modifié.
- Navigateur local avec un index fictif : état de chargement visible,
  fiche légère disponible avant son statut retardé de 4 secondes,
  demande existante correctement affichée, leviers et variantes disponibles
  à l’ouverture, réglages du simulateur fonctionnels.

La mesure locale ne garantit pas une durée identique en production. Les
attentes du worker ou de sa base persistent ; le site n’attend plus le statut
secondaire pour afficher une fiche légère.
