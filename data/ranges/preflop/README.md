# Architecture des ranges préflop PokerLab

Ce dossier sépare les données de référence, leur normalisation et leur exploitation par l'application.

## Organisation

- `schema.json` : ancien format v1, limité aux matrices d'ouverture 169 classes ; conservé pour compatibilité avec les squelettes déjà créés.
- `schema/range-node.schema.json` : format v2 générique pour un nœud de stratégie préflop.
- `catalog/schema.json` et `catalog/index.json` : registre des nœuds disponibles et de leurs métadonnées.
- `normalized/` : destination des JSON normalisés (un fichier par spot).
- `sources.json` : provenance et état des droits d'utilisation.

## Modèle de données v2

Chaque nœud conserve les fréquences au niveau des combinaisons physiques de deux cartes (jusqu'à 1 326 combos). Les 169 classes (AA, AKs, AKo, etc.) sont des agrégats calculés pour l'affichage dans la matrice.

Les fréquences sont stockées comme fractions entre 0 et 1. Les combinaisons absentes sont représentées implicitement par la fréquence par défaut du nœud, initialement 0. Les fichiers sources doivent être analysés avant d'appliquer cette convention.

## Traitement

Voir [tools/ranges/README.md](../../../tools/ranges/README.md) pour importer un dossier de fichiers texte, convertir un fichier isolé et valider les JSON.

Les spots sont indexés avec leur nom de fichier d'origine. Leur séquence d'actions doit être mappée explicitement avant de pouvoir sélectionner automatiquement un nœud depuis l'historique d'une main PokerLab. Les codes de positions ART/GTO (MP, BU) ne sont pas automatiquement assimilés à ceux de PokerLab.

## État actuel

Le catalogue est volontairement vide. Aucun fichier de range ART/GTO brut ou converti n'est ajouté à ce dépôt public. La licence fournie autorise l'étude et le jeu personnels, mais ne confirme pas explicitement l'intégration dans un logiciel personnel ; l'utilisation et le déploiement doivent être clarifiés avant d'activer ces données.

Le dossier `cash-6max/100bb/` contient encore les anciens squelettes v1. Ils sont des placeholders, pas des ranges exploitables.
