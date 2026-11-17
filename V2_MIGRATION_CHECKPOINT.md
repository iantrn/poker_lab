# PokerLab V2 — état et retrait de la V1

> **Statut :** déploiement V2 en place sur GitHub Pages ; retrait V1 proposé dans la PR [#24](https://github.com/iantrn/poker_lab/pull/24) depuis `chore/remove-v1`. Ce document décrit la branche de travail et ne signifie pas que la PR a été fusionnée.

## Chaîne de migration et sauvegarde

- Dernier commit V1 pure : `96d0cb2029ffe83a80c5de435a094b95580f1b45`.
- Copie figée `v1-backup` : le seul ajout est `README_V1_BACKUP.md`. Aucune suppression ni modification de la V1 historique.
- PR de déploiement [#23](https://github.com/iantrn/poker_lab/pull/23) fusionnée sur `main` (`6f4fd65dd51e4edbd9b736c394190837e39ee467`). Publication du seul `dist/` Vite.
- À la demande du propriétaire, le repli externe sur les Workers JavaScript classiques est retiré ; le repli **Rust CFR+ → TypeScript** interne au Worker V2 est conservé.
- La suppression est portée par la PR #24, **sans modification directe de `main`**.

## Éléments retirés de la branche de travail

1. `.github/workflows/postflop-solver.yml` : CI V1 redondante ; CI Rust/TypeScript/PWA V2 conservée.
2. Tests historiques V1 en `tests/*.test.js` et tests `tests/v2-typescript/*parity*` qui chargeaient directement des fichiers `js/`. Les validations V2 conservées sont les tests TypeScript autonomes, les invariants CFR/multiway, Rust/WASM, le stockage, les ranges, les contrats PWA et les scénarios navigateur.
3. Les deux Workers JavaScript classiques `pokerlab-solver-worker.js` et `pokerlab-solver-worker-v2.js`, ainsi que leurs cinq modules JavaScript importés : `js/core/evaluator.js`, `js/bots/bot-profiles.js`, `js/modules/postflop-solver.js`, `js/modules/cfr-core.js`, `js/modules/postflop-strategy.js`.
4. Les autres sources `js/`, le bootstrap V1 `index.html` racine, son `manifest.json` et `service-worker.js`, et le benchmark historique `tools/solver-performance-bench.cjs`. Ils n'étaient plus utilisés par le site V2 déployé.
5. `css/style.css` et `css/utilities.css` ont été **déplacés sans modification de contenu** sous `frontend/src/styles/` et sont toujours importés dans le même ordre par `frontend/src/main.tsx`.

Le plugin Vite ne copie plus de Worker ou de shim V1. `dist/` contient uniquement l'application V2 compilée, son Service Worker Workbox, le manifest PWA, Rust/WASM et les ressources statiques/ranges. Les workflows de CI et de déploiement vérifient notamment l'absence de `dist/js/` et des anciens Workers.

## Références et validation

Les recherches `git grep`, les résultats de tests avant/après et les contrôles de build sont documentés dans [`docs/V1_REMOVAL_AUDIT.md`](docs/V1_REMOVAL_AUDIT.md).

**Avant retrait :**
- `cargo test --manifest-path engine/Cargo.toml` : 41 tests réussis.
- `node --test tests/*.test.js tests/*.test.mjs tests/ranges/*.test.mjs` après génération de `pkg-node` : 153 tests réussis.
- `node --experimental-strip-types --test tests/v2-typescript/*.test.mjs` : 127 tests réussis.
- `npm ci --prefix frontend && npm run build --prefix frontend` : réussi.

**Après retrait :** la PR exige une CI entièrement verte avec Rust, les tests TypeScript et WASM autonomes, les tests navigateur Chromium/WebKit, et l'inspection de `dist/`. Les nombres exacts figurent dans les runs de PR ; aucune réussite future n'est prétendue ici.

## Éléments volontairement conservés

- `v1-backup` intacte, jamais supprimable.
- `assets/`, `data/ranges/preflop/matrix/` et toutes les données statiques (sans modification).
- `frontend/src/legacy/loader.ts`, `range-adapter.tsx` et `LegacyApplication.tsx` : **code TypeScript/React actif de la V2**, conservé pour leurs API et points d'accroche ; leur nom historique ne signifie pas qu'ils exécutent la V1.
- Le calcul TypeScript autonome du solveur et le backend Rust/WASM.
- Le Service Worker **généré dans `dist/`**, indispensable au mode hors ligne.
- Les tests V2 autonomes et leurs scénarios de récupération des sauvegardes V1 vers IndexedDB, nécessaires pour les PWA déjà installées.

## Risques restants

- **Choix explicite :** si le Worker TypeScript lui-même ne démarre pas, le solveur postflop signale une erreur ; il ne peut plus être relancé sur un Worker classique indépendant. Le reste de l'application doit rester fonctionnel.
- Le déploiement issu du merge de #24 doit être vérifié sur iPhone/Safari et hors ligne, y compris mise à jour de la PWA déjà installée et sauvegardes.
- Les fréquences CFR+ d'arbres abstraits et NashConv ne certifient pas une solution GTO universelle.
- Le nettoyage des branches distantes reste l'objectif D, **suspendu à une validation séparée de la liste intégrale des branches à supprimer**.
