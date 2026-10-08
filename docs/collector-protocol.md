# Compatibilité de la collecte — protocole 2

Le déploiement du 8 octobre 2026 à 21:13 UTC contenait les anciennes routes de collecte. Elles renvoyaient des tâches sans `taskId` et un accusé d'envoi sans `status` / `pageAcknowledged`. L'extension 2.38 attend ces champs, d'où « Mise à jour du serveur requise ». L'export tactique utilise les API du jeu et reste indépendant de cette panne.

Le worker conserve les routes et les données existantes et ajoute des réservations individuelles : jeton aléatoire, installation propriétaire et expiration après dix minutes. Une attribution concurrente utilise un UPDATE conditionnel et ne retourne que les réservations obtenues. Le protocole 2 contrôle le nombre brut, les doublons, le total de la page, les bornes de tranche, le marché, la date de lecture et la réservation. Les écritures de confirmation sont aussi protégées par l'horloge de SQLite pour une réservation expirant pendant l'envoi. Une grande tranche peut être subdivisée, avec un reçu distinct ; sa page parent n'est pas certifiée.

Les observations passives peuvent enrichir les joueurs mais ne certifient aucune page. Les anciennes routes restent compatibles avec les clients historiques ; leurs horodatages ne constituent pas des confirmations du protocole 2. Les statistiques ignorent l'ancien cache et distinguent pages confirmées, anciennes et sans confirmation. La couverture globale reste explicitement non vérifiable. Les anciennes données de joueurs ne sont pas effacées. Le nombre affiché de pages confirmées peut donc diminuer au passage à ce format.

GMC Companion 2.38.8 remplace les files locales dépourvues de jetons avant de lire le jeu. Un serveur encore incompatible déclenche une pause de cinq minutes, avec suppression de cette file ; les pauses liées au jeu, limites horaires, licence et interrupteurs restent inchangés. Après mise à jour : recharger l'extension puis GameChase.

`GET /health` expose uniquement `{ "ok": true, "collectorProtocol": 2 }`, sans accès à la base ou aux secrets. La publication utilise Wrangler et conserve les variables et secrets existants. `config.js` n'est pas modifié.

Vérification : réservations concurrentes, accusés complets, pages vides / finales, observations passives, mauvais propriétaire, jetons obsolètes, expiration, doublons, mauvaise tranche, subdivision, budget et ancien cache. Tests de régression du site, des préférences et de l'adaptateur Turso. Le cycle réel connecté à GameChase reste à vérifier après rechargement du navigateur de l'utilisateur.
