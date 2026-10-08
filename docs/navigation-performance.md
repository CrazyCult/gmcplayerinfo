# Navigation et chargement

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
