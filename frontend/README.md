# PokerLab V2 — migration progressive (branche dédiée)

Le point d'entrée V2 est `frontend/index.html`. Le V1 à la racine reste intact
jusqu'à la validation complète et au basculement de GitHub Pages. Le shell
historique est monté par React ; ses scripts globaux sont ensuite chargés dans
leur ordre initial. La matrice 13×13 est rendue par un composant React memoïsé
sous son API historique, sans changer la navigation ni les workflows de jeu.

## Construire

```sh
cd engine
cargo test
wasm-pack build --target web --release --out-dir pkg
wasm-pack build --target nodejs --release --out-dir pkg-node
cd ..
node --test tests/*.test.js tests/*.test.mjs tests/ranges/*.test.mjs
node --test tests/v2-wasm-parity.test.mjs
cd frontend
npm install
npm run build
npm run dev
```

Pour une installation sur GitHub Pages, le build Vite produit `dist/` avec
`POKERLAB_BASE=/poker_lab/` par défaut. Le Service Worker généré par Workbox
porte le nom `service-worker.js`, afin de conserver l'enregistrement déjà
utilisé dans `js/app.js`. Tous les JSON préflop restent précachables. Le bundle
ne nécessite ni API, ni serveur applicatif, ni base de données distante.

## État et garde-fous

Le moteur Rust/WASM fournit une évaluation de mains compatible (test de
parité JS prévu sur 12 000 mains), un noyau Monte Carlo, un histogramme pondéré de
ranges et un CFR+ matriciel. Le solveur postflop complet continue à utiliser
le Worker JS validé ; le remplacement du solveur par Rust nécessite une parité
range-vs-range / game tree avant activation. Les 2 606 spots, données de
leçons, puzzles, historique des parties et paramètres restent disponibles.

`IndexedDB` (Dexie) reçoit un miroir non bloquant des réglages ; `localStorage`
reste la source de vérité pendant la transition. Les quatre tables V2 sont
créées : `settings`, `trainingHistory`, `solverCache`, `spotLibrary`.

La matrice a un adaptateur React conservant les méthodes JS (`render`,
`getAllHands`, `getHandName`, `normalizeRange`) et les sélecteurs d'intégration.

**Ce jalon n'est pas la migration intégrale** de l'ensemble des modules
historiques en TypeScript ou du solveur complet en Rust. Ne pas fusionner dans
`main` avant les validations fonctionnelles sur navigateur et l'achèvement des
migrations restantes.
