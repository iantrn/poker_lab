# PokerLab V2 — migration checkpoint · 17 novembre 2026

> **Branche de travail :** feat/v2-ts-rust-migration. Ne rien fusionner ou déployer
> dans main sans validation explicite. **Avancement estimatif ≈ 80 %** :
> ce pourcentage n'est pas une mesure ni une autorisation de mise en production.
> Avant de reprendre, comparer le HEAD actuel et le dernier GitHub Actions.

## Terminé ou intégré dans la branche V2

- React/Vite et TypeScript strict, PWA offline-first, Dexie/IndexedDB en miroir.
- Deck, règles, évaluateur, moteur de jeu, profils et décisions des bots, rendu
  des cartes et de la table, navigation et modules d'entraînement heads-up/6-max.
- Ranges préflop, matrice React, leçons, exercices tactiques, historique et
  analyse des mains, UI de la modale du solveur et réglages en TypeScript.
- Les pages d'accueil, tactiques, Game Review, leçons et paramètres sont
  désormais des composants React (le contenu métier dynamique reste piloté
  par les API TS afin de préserver l'ensemble des ancrages et événements V1).
- Contrat versionné du solveur et protection des cartes privées ; extraction
  des ranges, bloqueurs, conditionnement des actions et chance-sampling typés.
- Arbre postflop abstrait, stratégie CFR+ range-vs-range, fréquences, EV et
  NashConv en TypeScript avec tests de parité déterministes contre la V1.
- Rust/WASM : classement 5–7 cartes, équité connue et pondérée, histogrammes,
  CFR+ à matrice, CFR+ sur arbre et session persistante conservant les regrets
  entre les échantillons. **L'orchestrateur stratégique complet reste en TS ;
  la session Rust n'y est pas encore substituée pour le calcul utilisateur.**
- Le Worker postflop ES module exécute le solveur TypeScript et accélère
  le scoring par Rust/WASM. Il est maintenant privilégié par le pré-calcul
  de l'interface, avec repli vers le Worker classique en cas d'échec.

## Tests disponibles

Le workflow .github/workflows/v2-migration.yml comprend :
- Cargo + wasm-pack navigateur/Node, anciens tests V1, parité TS/V1 et 12 000
  mains de comparaison JS/WASM, tests de ranges pondérées et de CFR+.
- Compilation TypeScript stricte, bundle Vite, contrôles PWA/offline et
  tests Chromium des pages React, 2/6 joueurs, navigation, leçons, tactiques,
  Game Review et calculs réels en Workers.
- Parité de solveur chance-sampled avec graine : fréquences, EV, NashConv.
- Vérification du repli automatique sur le Worker classique, de la
  cancellation, du cache et de l'utilisation du Worker typé.
- Benchmark indicatif de **l'évaluateur** : 1 200 évaluations de 7 cartes,
  179,31 ms JS contre 8,50 ms Rust/WASM, soit ~21,1x sur ce runner.
  **Ce n'est pas une mesure du temps de résolution postflop complet.**

## Travaux bloquants restants

1. Intégrer la session Rust CFR+ persistante au pipeline postflop complet
   avec les mêmes informations sets, poids de chances, ranges et abstractions.
   Comparer sorties et performances sur river, turn et flop, y compris
   EV/NashConv et variance, puis conserver un rollback documenté.
2. Finir les composants React des écrans d'entraînement et du tapis :
   éviter les doubles listeners et garantir les IDs, data-attributes,
   événements et interactions historiques.
3. Approfondir les tests : side pots, all-in, manches enchaînées, cartes
   privées, service-worker et mise à jour hors ligne, annulation en cours de
   calcul, limite mémoire sur mobile et Safari iOS réel.
4. Ne modifier l'autorité de sauvegarde localStorage / IndexedDB qu'après
   tests de migration, intégrité, réversibilité et conservation des données.
5. Réaliser la revue de production et demander l'accord explicite
   avant toute fusion dans main.

## Reprise

Vérifier le HEAD de la branche et son run Actions (un ancien run vert ne
suffit pas). Réparer d'abord les régressions, travailler en commits atomiques,
conserver les sources V1 comme oracles de parité et préserver la PWA
100 % hors connexion. Un solveur CFR+ abstrait ne certifie pas le GTO complet.
