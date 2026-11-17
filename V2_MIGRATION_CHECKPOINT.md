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
- La session Rust CFR+ persistante est exécutable de bout en bout dans le
  Worker typé via `experimentalRustCfr`, **sur demande uniquement**.
  Le mode par défaut reste TypeScript : la validation de parité n'est pas
  une preuve de gain de performances.
- Optimisations vérifiées du solveur TS : distribution pondérée et candidats
  filtrés préparés une fois par résolution, tirage cumulatif O(log n), cache
  borné des ranges adverses, suppression du mélange de cartes inutile à la
  river (avec conservation exacte du flux RNG de la V1), **arbre de mises
  public construit une seule fois** sur flop/turn/river, cache par deal des
  mains privées, préfixes de board et suffixes d'information sets.
  Le board des nœuds sert de gabarit : les clés d'information des calculs
  multi-runouts doivent impérativement utiliser le board du deal courant.
- Le sérialiseur Rust réutilise le même arbre public, et la session WASM
  réutilise ses buffers de travail entre échantillons.

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
- Parité **complète du pipeline stratégique TS/Rust** sur flop, turn et river :
  fréquences, EV, NashConv, à graine et échantillons identiques.
  Invariance testée de la topologie de mises par rapport aux futures cartes.
- Benchmark indicatif à **80 échantillons CFR+ avec petits arbres abstraits**,
  run CI Node.js du 17/11/2026 (non bloquant) :
  river V1 296,0 ms / V2 TS 72,5 ms (~4,08x) ;
  turn V1 324,8 ms / V2 TS 71,2 ms (~4,56x) ;
  flop V1 379,4 ms / V2 TS 73,7 ms (~5,15x).
  Ces chiffres varient selon l'environnement et ne représentent pas
  les performances iOS ni les grands budgets.
- Benchmark navigateur Chromium, 80 échantillons river : le calcul complet
  Rust persisté est actuellement seulement ~1,05x plus rapide que le solveur
  TypeScript (runner du 17/11/2026, non bloquant). **Ne pas activer Rust
  par défaut sans gain démontré sur des scénarios représentatifs**.
- L'accélération de l'évaluateur de mains JS/WASM ne permet pas d'inférer
  directement l'accélération du solveur complet.

## Travaux bloquants restants

1. Finaliser l'optimisation du CFR+ Rust persistant, déjà utilisable en
   expérimental et validé en parité sur les trois streets. Profiler le
   calcul **end-to-end** (sampling, scoring, construction de clés, traversées,
   EV et NashConv), mesurer les grands budgets, la variance et la mémoire
   navigateur/mobile, puis décider du backend par défaut avec rollback explicite.
   Le gain Rust vs TypeScript reste limité dans le benchmark de référence.
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
