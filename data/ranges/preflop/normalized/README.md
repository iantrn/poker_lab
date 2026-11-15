# Données normalisées

Ce dossier accueillera les nœuds JSON convertis, un fichier par spot préflop.

- Format : `schema/range-node.schema.json` (schemaVersion 2).
- Index : `catalog/index.json`.
- Une entrée conserve les fréquences des combos physiques (jusqu'à 1 326).
- Les 169 classes sont des agrégats calculés pour l'affichage matriciel.
- Une fréquence absente dans un fichier sparse vaut 0, conformément au format d'import documenté ; cette convention doit être confirmée pour toute nouvelle source.

Aucun fichier ART/GTO source ou converti n'est actuellement stocké ici. Le statut du catalogue reste volontairement vide tant que les conditions d'utilisation et le périmètre de déploiement ne sont pas validés.
