# PokerLab V2 — migration checkpoint · 17 novembre 2026

> **Branche de développement exclusivement :** `feat/v2-ts-rust-migration`.
> **Ne pas fusionner ni déployer dans `main` sans validation explicite.**
> Avancement global **estimatif ≈ 75 %** ; il ne s'agit ni d'un indicateur mesuré,
> ni d'une validation de mise en production.

## Fonctionnalités déjà portées ou fonctionnelles

- Frontend React/Vite avec TypeScript strict, PWA offline-first et Dexie/IndexedDB.
- Règles, deck, évaluateur, moteur de jeu, bots, profils, rendu des cartes et de
  la table, navigation, visualiseur de ranges et matrice React.
- Gestion de l'entraînement, sessions heads-up/6-max, choix des bots, commandes
  de mise, historique, Leçons, Tactiques et Game Review en TypeScript.
- Contrat de données du solveur versionné et protecteur des cartes adverses ;
  création et normalisation des snapshots portées en TypeScript.
- Rust/WASM avec Worker séparé : classement des mains 5–7 cartes, équité
  Monte-Carlo à mains connues, histogramme de ranges et primitive CFR+ matricielle.
- Équité postflop d'une main connue contre une **range adverse pondérée** :
  filtrage des bloqueurs, poids normalisés, énumération exacte à la river,
  échantillonnage reproductible au flop/à la turn ; adaptateur TypeScript
  `createRangeEquityRequest` et méthode `SolverScheduler.calculateRangeEquity`.
- Le **Worker réel du solveur** (`pokerlab-solver-worker-v2.js`) utilise
  l'évaluateur Rust/WASM pour le hot-path Monte-Carlo/CFR+ avec fallback JS
  explicite. **L'algorithme complet CFR+ postflop est toujours en JavaScript.**

## Vérifications GitHub Actions

`.github/workflows/v2-migration.yml` doit être **vert sur le HEAD courant** :

1. Tests Rust + compilation wasm-pack navigateur/Node.
2. Suite JavaScript V1, parité des modules TypeScript et parité de 12 000 mains
   évaluées entre JS et Rust.
3. Parité d'équité pondérée : 120 boards de river, ranges comportant des
   bloqueurs, résultats comparés à l'évaluateur V1.
4. Compilation TypeScript stricte et bundle Vite.
5. Tests Chromium : React, PWA hors ligne, range matrix, leçons, tactiques,
   Game Review, entraînement 6-max et heads-up, Workers WASM, démarrage du
   Worker postflop réel, et adaptateur TS des ranges.
6. Archive de prévisualisation V2 uniquement ; **aucun déploiement de production**.

**Benchmark déjà mesuré :** 1 200 évaluations de sept cartes, 179,31 ms en
JS contre 8,50 ms en Rust/WASM, soit 21,1× sur cette charge et ce runner.
**Ce n'est pas une mesure du temps de résolution CFR+ complet.**

## À faire pour la migration intégrale (ordre de priorité)

1. Migrer `js/modules/postflop-solver.js` (récupération, conditionnement,
   échantillonnage des ranges et recommandation) vers TypeScript/Rust. Son
   contrat d'entrée est déjà typé, mais le corps métier reste en JS.
2. Migrer l'arbre complet de `js/modules/postflop-strategy.js` et le CFR+
   range-vs-range : infosets, regrets, stratégies moyennes, utilités,
   meilleur-réponse/exploitabilité, échantillonnage et abstractions de mises.
   **La primitive Rust CFR+ matricielle ne remplace pas le solveur existant.**
3. Migrer le Worker postflop réel vers le pipeline Rust/WASM et supprimer la
   dépendance runtime aux scripts classiques uniquement **après validation de
   parité statistique et fonctionnelle**, conserver rollback pendant transition.
4. Refaire les pages React en composants TSX (l'application affiche encore un
   shell HTML V1). Préserver IDs, sélecteurs, événements et accessibilité.
5. Consolider la persistance IndexedDB (miroir actuellement non autoritaire),
   tests migration/rollback et Safari iOS.
6. Couvrir les scénarios complets d'actions, pots annexes, historiques,
   cartes privées et manches enchaînées ; benchmarker **le solveur complet**
   sur flop, turn et river, avec contrôle de la convergence et de la variance.

## Reprise autonome

Lire le HEAD de branche et le dernier run Actions avant toute modification ;
si le run courant échoue, corriger d'abord ce blocage. Commit atomique,
tests/parité systématiques, ne jamais éditer `main` ni déclarer la migration
finie avant la réécriture complète, validation navigateur/iOS et revue finale.
