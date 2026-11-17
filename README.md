# PokerLab

**PokerLab** est une PWA d'entraînement au **Texas Hold'em No-Limit**, utilisable sans compte, sans argent réel, sans serveur applicatif et **hors connexion après installation et mise en cache initiales**.

La version V2 est construite avec **React, TypeScript strict et Rust/WebAssembly**. La version JavaScript historique (V1) est conservée dans le dépôt pour la compatibilité, les tests de parité et la possibilité de revenir en arrière.

## Fonctionnalités

- **Jouer :** parties 6-max et heads-up contre des bots aux profils et difficultés variés ; blinds, positions, relances, all-in, showdown et pots secondaires.
- **Apprendre :** six leçons interactives en français, progression locale et **2 606 spots** de ranges préflop affichés dans une matrice 13 × 13.
- **S'entraîner :** huit puzzles tactiques filtrables avec correction et explication.
- **Revoir :** historique local des mains et module Game Review.
- **Analyser :** calculs d'équité Monte-Carlo et solveur postflop heads-up **CFR+ range-vs-range** ; fréquences d'actions, valeurs espérées (EV) et diagnostics d'exploitabilité estimée (NashConv).
- **Hors connexion :** interface, ressources, Workers, moteur WASM et bundle préflop précachés via le Service Worker pour les sessions ultérieures.

Le solveur représente un **arbre de mises abstrait** : ses résultats sont des estimations utiles pour progresser, pas une certification d'une stratégie GTO parfaite sur l'ensemble du poker.

## Architecture V2

| Couche | Technologie | Rôle |
|---|---|---|
| Interface | React 19, TypeScript strict, CSS / Tailwind | Navigation responsive, écran de jeu, matrice, cours et analyse |
| Règles et entraînement | TypeScript | Moteur 2–6 joueurs, bots, actions, ranges, sessions et historique |
| Analyse stratégique | TypeScript et Web Workers | Sampling pondéré, bloqueurs, CFR+ abstrait, EV et NashConv |
| Calcul numérique | Rust → WebAssembly | Évaluation 5–7 cartes, showdown, Monte-Carlo, ranges et session CFR+ persistante |
| Persistance | `localStorage` + Dexie/IndexedDB | Sauvegarde V1-compatible ; miroir IndexedDB non destructif |
| PWA | Vite + Workbox | Build statique, manifeste installable et fonctionnement offline |

Le **Worker postflop V2** utilise automatiquement la session **Rust CFR+** si WASM est disponible. Il revient au moteur TypeScript en cas d'erreur ; les Workers V1 sont conservés comme repli supplémentaire. Les composants React ne réévaluent pas la logique poker : les modules TypeScript continuent de gérer les événements fonctionnels.

### Organisation

```text
frontend/                     Interface V2 React/Vite et modules TypeScript
  src/ui/                     Pages et composants React
  src/core/, src/bots/        Règles, évaluateur et adversaires
  src/training/, src/ranges/  Entraînement, leçons et ranges
  src/solver/, src/workers/   CFR+, équité et Workers
  src/storage/                Réplication locale IndexedDB
engine/                       Moteur Rust et code WebAssembly
shared/                       Types et contrats partagés
data/lessons/, data/puzzles/  Contenus pédagogiques
data/ranges/preflop/matrix/   index.json et ranges.json (2 606 spots)
assets/icons/                 Icônes PWA
css/                          Styles sources intégrés au build Vite
js/                           Sources V1 conservées pour parité/repli
tests/                        Tests V1, V2, Rust/WASM et navigateurs
tools/ranges/                  Import, validation et génération des ranges
frontend/README.md            Détails techniques V2 et mécanisme de rollback
```

Les 2 606 fichiers JSON de ranges individuels ont été **remplacés par le bundle unique `ranges.json`**, sans perte de spot. Les anciens modèles de ranges vides ont également été retirés.

## Démarrage en local

Prérequis pour la V2 : **Node.js 22+**, **Rust** avec la cible `wasm32-unknown-unknown` et **wasm-pack**. Après avoir cloné le dépôt :

```sh
rustup target add wasm32-unknown-unknown
cd engine
cargo test
wasm-pack build --release --target web --out-dir pkg
wasm-pack build --release --target nodejs --out-dir pkg-node
cd ../frontend
npm install --no-audit --no-fund
npm run dev
```

Ouvrir l'adresse locale indiquée par Vite (sous le préfixe `/poker_lab/` par défaut). Les ressources WASM doivent être construites **avant** de tester l'accélération Rust. Sans WASM, la stratégie TypeScript reste disponible.

Pour construire la version statique depuis `frontend/` :

```sh
npm run build
npm run preview
```

Le résultat se trouve dans `dist/` à la racine du dépôt. Il inclut l'interface V2, le Service Worker, les données et les ressources nécessaires au fonctionnement offline. Le préfixe de déploiement est `/poker_lab/` par défaut ; il se configure via `POKERLAB_BASE`.

**Distinction importante :** le fichier `index.html` à la racine est conservé comme point d'entrée V1 et référence de tests. La **V2 est construite depuis `frontend/index.html`**. Fusionner le code dans `main` ne suffit pas à remplacer automatiquement la page GitHub Pages existante par `dist/` : le déploiement statique V2 est une étape distincte.

## Tests et qualité

Le workflow `.github/workflows/v2-migration.yml` vérifie les tests Rust, les parités V1 ↔ TypeScript et Rust/WASM, TypeScript strict, le build Vite, les ranges, le stockage local, les scénarios de jeu et les navigateurs **Chromium et WebKit Linux**, y compris le mode hors connexion.

Depuis la racine (une fois le build WASM réalisé et les dépendances installées) :

```sh
node --test tests/*.test.js tests/*.test.mjs tests/ranges/*.test.mjs
node --experimental-strip-types --test tests/v2-typescript/*.test.mjs
node --test tests/v2-wasm-parity.test.mjs tests/v2-wasm-range-equity.test.mjs tests/v2-wasm-tree.test.mjs tests/v2-wasm-session.test.mjs
npm run build --prefix frontend
```

Les tests navigateurs s'exécutent dans GitHub Actions avec Playwright et les ressources Vite compilées. Un passage sur **un véritable iPhone/Safari**, notamment pour les contraintes de mémoire et les mises à jour d'une PWA déjà installée, reste une validation de production à réaliser : WebKit Linux ne le remplace pas.

## Données personnelles, sauvegardes et fonctionnement offline

Les paramètres, la progression et l'historique sont conservés **dans le navigateur**. `localStorage` reste la source de vérité compatible avec la V1 et Dexie/IndexedDB maintient un miroir ; aucun backend ni compte n'est requis. Supprimer les données du site peut entraîner la perte des sauvegardes.

Après un premier chargement HTTPS réussi et l'installation du Service Worker, PokerLab peut fonctionner en mode avion. Les modifications de version nécessitent une reconnexion pour télécharger les nouveaux assets.

## Repli du solveur CFR+

Sur une V2, pour forcer le solveur TypeScript via la console du navigateur :

```js
localStorage.setItem("pokerlab_v2_cfr_backend", "typescript");
location.reload();
```

Pour rétablir la sélection automatique Rust/WASM avec repli TypeScript :

```js
localStorage.removeItem("pokerlab_v2_cfr_backend");
location.reload();
```

La valeur `"rust"` force Rust sans fallback applicatif et doit rester réservée aux diagnostics.

## Documentation complémentaire

- [Architecture, commandes et rollback V2](frontend/README.md)
- [Schémas et structure des ranges](data/ranges/preflop/README.md)
- [Outils d'import des ranges](tools/ranges/README.md)
- [Checkpoint de la migration V2](V2_MIGRATION_CHECKPOINT.md)

PokerLab est un logiciel pédagogique : les résultats stratégiques sont indicatifs et ne constituent pas un conseil de jeu d'argent.
