# Jeux de référence

`pasero.ts` reprend uniquement le cas de référence du §24 de SPEC.md. Ce n’est pas un export de joueurs réels.

Exports fournis et intégrés localement :

- `ovr-dataset.json` : export complet des 4 184 joueurs, dont les gardiens.
- `squad-sample.json` : réponse réelle de l’effectif, pour développer et vérifier la normalisation d’import.

Le dataset compte 4 184 joueurs anonymisés : pas de nom ni d’ID. Le schéma `calculationPlayerSchema` valide les données nécessaires au calcul sans inventer d’identité. Les sous-attributs de `attributes` sont normalisés dans `attributes.subs`.

L’effectif de 53 joueurs valide le schéma d’import `playerSchema`, qui exige un ID et un nom réels. Les enveloppes tableau, `{ players }`, et `{ data: { players } }` sont acceptées. La forme accepte une valeur numérique ou une liste de notes numériques/chaînes.

Le test dataset contrôle tous les joueurs, sans exclusions, et écrit `reports/dataset-validation.json`. Le contrôle stats à 100 % est actuellement en échec sur 13 stats de 8 joueurs ; les deux contrôles OVR ≥98 % passent. Ne pas modifier les données attendues pour masquer les écarts.
