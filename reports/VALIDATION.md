# Validation des exports réels — 6 octobre 2026

Le seuil d’OVR du §24 est atteint pour les deux groupes. Le cas Pasero est exact. L’exigence « stats résumées 100 % exactes » ne passe pas sur l’export fourni.

| Contrôle | Résultat |
|---|---|
| Dataset | 4 184 joueurs, aucun exclu |
| OVR champ | 3 692 / 3 761 = 98,1654 % |
| OVR gardiens | 418 / 423 = 98,8180 % |
| Stats pertinentes comparées | 25 104 |
| Stats exactes | 25 091 = 99,9482 % |
| Écarts de stats | 13 sur 8 joueurs |
| Pasero | 20 séances, 4 400 000 GMC2, forme −160 |
| Effectif importé | 53 joueurs, aucun sous-attribut pertinent manquant |

Les numéros de ligne ci-dessous désignent les entrées du tableau JSON, à partir de 1. Ils ne sont pas des IDs de joueur.

| Entrée | Poste | Stat | Export | Formule |
|---|---|---|---|---|
| 713 | CM | PAS | 88 | 89 |
| 796 | CM | DEF | 54 | 53 |
| 796 | CM | PHY | 52 | 51 |
| 810 | CM | PHY | 54 | 55 |
| 1919 | CM | DRI | 88 | 87 |
| 1982 | CM | PAC | 82 | 83 |
| 1982 | CM | SHO | 74 | 73 |
| 1982 | CM | DRI | 75 | 76 |
| 3167 | CM | PAC | 76 | 75 |
| 3167 | CM | DEF | 63 | 62 |
| 709 | GK | REF | 95 | 94 |
| 709 | GK | SPE | 78 | 77 |
| 2350 | GK | DIV | 71 | 70 |

Le cas DIV de l’entrée 2350 démontre une incohérence avec la règle DIV = gkDiving : le sous-attribut vaut 70 et la stat exportée 71. De même, REF de l’entrée 709 vaut 95 pour gkReflexes = 94. Un changement d’arrondi ne peut pas expliquer ces deux cas.

Deux joueurs concernés portent un `forge_key`, mais cela ne suffit pas à établir la cause des écarts. Les autres causes (stat non recalculée après progression, données transitoires, etc.) ne sont pas vérifiées.

Les calculs reproduisent la spécification. Les exports ne sont pas corrigés et aucun joueur n’est filtré. L’utilisateur a autorisé la poursuite de l’interface avec ces écarts documentés. Dans la suite courante, le contrôle stats à 100 % est marqué `it.fails` : l’assertion reste exécutée et son échec est attendu, ce n’est pas une validation à 100 %. Le détail des 74 écarts d’OVR et des 13 écarts de stats figure dans `dataset-validation.json`, généré par les tests.

`pnpm test:dataset:strict` exécute le même contrôle sans échec attendu et sort avec un statut d’erreur tant que les 13 écarts persistent.
