# Export tactique

La vue dédiée du onze a été remplacée par des boutons CSV et JSON dans Mon effectif. `/squad/lineup` redirige vers `/squad`. Le skin manga reste disponible avec Jour et Nuit, comme demandé. Cette modification ne publie rien.

`SquadExport` reçoit les joueurs du club affiché ou de l’import local. Sans composition disponible, `tactics` vaut null et la colonne CSV `groupe` vaut `inconnu`. Un import JSON explicite remplace la source des exports sans fusionner différents effectifs. Cet import est gardé en mémoire, pas sur le serveur ni dans le compte Google.

GMC Companion 2.38.6 propose directement les deux formats. Il lit l’effectif et les tactiques actuelles, exporte tous les joueurs, et conserve la distinction titulaire / banc / réserve avec l’ordre, le poste et le rôle des slots. Le JSON conserve également les consignes, routines, capitaine et tireurs connus du jeu. Les anciens JSON version 1 sont acceptés, avec les limites de leur contenu (seulement le onze et le banc).

Les matchs joués, buts, passes décisives et clean sheets sont repris des champs disponibles, sans inventer une période de statistiques. Toute donnée absente reste vide. Les attributs sont identifiés par les clés techniques communes du jeu. CSV UTF-8 avec BOM, séparateur point-virgule, guillemets échappés et protection contre les formules tableur dans les textes. JSON structuré version 2. La date de lecture n’est pas remplacée par la date d’export lorsque la première est inconnue.

Vérification : 5 tests du site et 5 tests d’export extension, TypeScript, ESLint et compilation Next.js. Les exports réels de GameChase restent à vérifier sur le compte de l’utilisateur ; les tests contrôlent les formes déjà utilisées dans les modules existants. `config.js` reste inchangé. Aucun worker ou site déployé.

