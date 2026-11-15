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

## Format utilisé par l'application

L'application ne charge pas les 1 326 combos de `normalized/` (environ 85 Mo). Elle lit des fichiers compacts générés depuis ces JSON :

- `matrix/index.json` : liste des spots (`id`, position du héros `p`, action `a`, séquence `s`, % de mains jouées `r`).
- `matrix/ranges.json` : bundle unique contenant les matrices compactes de tous les spots, indexées par identifiant (`position/spot`). C'est ce fichier léger qui est précaché par le Service Worker pour garantir l'accès offline à toutes les ranges.
- `matrix/<position>/<spot>.json` : fichiers individuels conservés pour compatibilité et dépannage ; pourcentages par classe de main (`{"AA": 100, "AKs": 62.5}`), les mains absentes valent 0.

Régénération :

```bash
node tools/ranges/import-directory.mjs --input-dir ./private-source/ranges --output-dir ./private-ranges --source-id artgto-personal-archive
node tools/ranges/build-matrix.mjs --input-dir ./private-ranges/normalized --output-dir ./data/ranges/preflop/matrix
```

Le module `js/modules/ranges-viewer.js` affiche ces données dans l'onglet Apprentissage (choix de la position, de l'action, recherche d'un spot, matrice 13 x 13).

## État actuel

2 606 spots ART/GTO (UTG 319, MP 348, CO 388, BU 556, SB 535, BB 460) sont disponibles dans `matrix/`. Le propriétaire du dépôt indique avoir l'accord de ART/GTO pour cet usage (voir `sources.json`). Les JSON complets `normalized/` restent dans `private-ranges/`, hors dépôt.

Le catalogue `catalog/index.json` et les entrées `pending-review` concernent le format v2 complet ; le mapping vers l'historique des mains PokerLab reste à écrire. Le dossier `cash-6max/100bb/` contient encore les anciens squelettes v1 (placeholders).
