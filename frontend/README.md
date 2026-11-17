# PokerLab V2 — application React / TypeScript / Rust-WASM

**Branche :** `feat/v2-ts-rust-migration`. Le site V1 sur `main` demeure
inchangé. Toute fusion et tout déploiement nécessitent une décision explicite.

## Architecture

- Le point d'entrée V2 est `frontend/index.html` et le shell est rendu en
  React. Les pages d'accueil, jeu, tactiques, leçons, Game Review et paramètres
  préservent les identifiants et attributs fonctionnels hérités du V1.
- L'initialisation de la page n'injecte **aucun script V1** : les modules de
  règles, bots, sessions, table, ranges, leçons, puzzles, historique, solveur
  et navigation sont des implémentations TypeScript chargées dans l'ordre
  de leurs dépendances. Les contrôleurs TypeScript conservent la gestion du
  DOM dynamique de la table pour éviter des listeners concurrents avec React.
- Le Worker postflop ES module TypeScript calcule l'équité et la stratégie.
  Les routines Rust/WASM couvrent l'évaluation 5–7 cartes, la comparaison
  directe des showdowns, les ranges pondérées, Monte Carlo, CFR+ matriciel
  et une session CFR+ persistante sur arbre avec regrets inter-échantillons.
  L'orchestration du sampling et les clés d'information sets restent typées
  en TypeScript.
- Avec WASM disponible, la session Rust CFR+ est le **backend automatique**
  du Worker typé. En cas d'échec, un circuit breaker relance la résolution
  depuis le début en TypeScript. Sans WASM, TypeScript reste disponible.
  L'ancien Worker classique subsiste uniquement comme fallback indépendant
  et oracle de parité, pas comme bootstrap de la nouvelle application.
- La PWA est offline-first ; Workbox pré-cache les ressources et les ranges
  préflop. Aucun serveur applicatif n'est nécessaire. `localStorage` demeure
  volontairement la source de vérité pour les sauvegardes historiques, avec
  réplication ordonnée vers Dexie/IndexedDB. Ce choix protège les données
  existantes et est indépendant de la migration du moteur de calcul.

## Assets conservés après le nettoyage de branche

Le référentiel garde les sources JavaScript V1 comme **oracle de tests et
repli historique** (la branche `main` utilise encore le point d'entrée
classique). En revanche, le bundle V2 `dist/` n'embarque plus leur copie
complète : seulement les **cinq modules** nécessaires aux deux Workers
de secours et les scripts de ces Workers sont copiés. Les styles CSS
applicatifs sont compilés dans les assets Vite, sans doubles feuilles brutes.

Les **2 606 matrices individuelles** `data/ranges/preflop/matrix/*/*.json`
ont été supprimées, après vérification exhaustive de leur présence dans
`index.json` et `ranges.json`. Le runtime, y compris le visualiseur V1
de repli, utilise maintenant ce bundle unique. Les six squelettes
`cash-6max` vides et la copie HTML de l'ancien shell ont été retirés.
Le contrat des ancres de la page React est vérifié directement contre
le `index.html` historique.

## Build et tests

```sh
cd engine
cargo test
wasm-pack build --release --target web --out-dir pkg
wasm-pack build --release --target nodejs --out-dir pkg-node
cd ..
node --test tests/*.test.js tests/*.test.mjs tests/ranges/*.test.mjs
node --experimental-strip-types --test tests/v2-typescript/*.test.mjs
node --test tests/v2-wasm-parity.test.mjs
cd frontend
npm install --no-audit --no-fund
npm run build
npm run dev
```

`dist/` est prêt pour une prévisualisation statique sous
`POKERLAB_BASE=/poker_lab/` par défaut ; cela **ne déploie pas** sur GitHub
Pages. Les 2 606 spots préflop, données de leçons, puzzles et historique
restent disponibles. Le workflow `.github/workflows/v2-migration.yml`
construit Rust, Node-WASM et Web-WASM, compare les sorties V1/V2,
vérifie TypeScript strict, le bundle offline, le stockage, les sessions de
jeu et exécute le test de navigation/solveur sur **Chromium et WebKit Linux**.
WebKit Linux est une couverture de compatibilité, **pas un test sur iPhone**.

## Repli immédiat du solveur vers TypeScript

Dans la console du navigateur sur la V2 :

```js
localStorage.setItem("pokerlab_v2_cfr_backend", "typescript");
location.reload();
```

Ce réglage force le solveur TypeScript même lorsque Rust/WASM est disponible.
Pour rétablir la sélection automatique, effacer la préférence et recharger :

```js
localStorage.removeItem("pokerlab_v2_cfr_backend");
location.reload();
```

La valeur `"rust"` force explicitement la session Rust et fait remonter
ses erreurs au lieu de les masquer ; à réserver aux diagnostics.

## Limites et validation avant production

Le solveur est un CFR+ **sur un arbre de mises abstrait** ; ses fréquences,
EV et NashConv ne certifient pas un équilibre GTO du Texas Hold'em complet.
Les benchmarks varient avec le spot, le budget et le navigateur.
Une campagne sur un **véritable iPhone/Safari**, avec mémoire limitée,
mise à jour du Service Worker, conservation des données et manches longues,
demeure nécessaire avant une validation de déploiement. Ne pas fusionner
la branche dans `main` sans cette revue et l'accord explicite.
