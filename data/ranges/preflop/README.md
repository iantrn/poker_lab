# Ranges préflop PokerLab

Ce dossier contiendra les matrices d'ouverture préflop pré-calculées utilisées par le bouton **RANGES** dans Training.

## Périmètre initial

- Format : cash game 6-max
- Spot : first-in open (personne n'a encore limpé ou relancé)
- Profondeur initiale : 100 BB
- Positions : UTG, HJ, CO, BTN et SB
- La BB est exclue des ranges d'ouverture : sa stratégie de défense sera traitée dans un dataset séparé.

## Structure

- `schema.json` : format commun des fichiers.
- `cash-6max/manifest.json` : index des jeux de données.
- `cash-6max/100bb/*.json` : une matrice par position.

## Format des fréquences

Chaque clé de `hands` représente une main abstraite parmi les 169 classes :

- paire : `AA`, `77`, `22`
- suited : `AKs`, `76s`
- offsuit : `AKo`, `QJo`

La valeur est une fréquence comprise entre 0 et 1 (par exemple `0.75` = open 75 % du temps).

## Important : données non encore intégrées

Les fichiers de position sont volontairement des squelettes avec `status: "pending-source"` et un objet `hands` vide. **Ils ne constituent pas des ranges jouables et ne doivent pas être présentés comme des solutions GTO.**

Aucune matrice externe ne sera copiée dans ce dépôt avant vérification de sa provenance, de ses hypothèses (rake, sizing, ante éventuel, profondeur) et de l'autorisation explicite de redistribution dans un dépôt public.

## Ajout d'une nouvelle profondeur

Créer un dossier sous `cash-6max/` (par exemple `50bb/`), puis les cinq fichiers de position conformes à `schema.json`. Ajouter ensuite la profondeur dans `manifest.json`.
