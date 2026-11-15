# Données normalisées

Ce dossier accueillera les nœuds JSON convertis, un fichier par spot préflop.

- Format : `schema/range-node.schema.json` (schemaVersion 2).
- Index : `catalog/index.json`.
- Une entrée conserve les fréquences des combos physiques (jusqu'à 1 326).
- Les 169 classes sont des agrégats calculés pour l'affichage matriciel.
- Une fréquence absente dans un fichier sparse vaut 0, conformément au format d'import documenté ; cette convention doit être confirmée pour toute nouvelle source.

Les JSON normalisés complets (environ 85 Mo) ne sont pas versionnés : ils sont générés dans `private-ranges/` (ignoré par git). L'application utilise la version compacte du dossier `../matrix/` (voir `../README.md`).
