# PokerLab V2

PokerLab est une **PWA Texas Hold'em No-Limit**, utilisable hors ligne et sans serveur applicatif. Elle propose des parties contre des bots, l'étude de ranges préflop, des leçons, des tactiques, un historique des mains et un solveur postflop expérimental.

**Application en production :** https://iantrn.github.io/poker_lab/

## Architecture de `main`

| Dossier | Rôle |
|---|---|
| `frontend/` | Interface React, Vite, TypeScript strict, Web Workers ESM et styles |
| `engine/` | Moteur Rust compilé en WebAssembly |
| `shared/` | Modèles et contrats partagés |
| `data/` | Ranges, leçons et exercices |
| `assets/` | Icônes et autres ressources statiques |
| `tests/` | Tests autonomes TypeScript, Rust/WASM, PWA, navigateur et données |

Le point d'entrée est **`frontend/index.html`**. Le build Vite produit **`dist/` à la racine du dépôt** sous le chemin de base `/poker_lab/`.

L'application utilise un Worker TypeScript compilé par Vite. Lorsque Rust/WASM échoue pendant une résolution compatible, le Worker conserve un **repli algorithmique interne vers TypeScript**. Les anciens Workers JavaScript classiques ne sont plus distribués ; si le Worker TypeScript lui-même ne démarre pas, le solveur indique une erreur plutôt que de démarrer un ancien moteur.

Le fichier `service-worker.js` **n'existe pas dans les sources racine** : il est généré dans `dist/` par `vite-plugin-pwa` / Workbox avec le manifest `manifest.webmanifest`. Les données de ranges et les modules WASM nécessaires à l'utilisation hors connexion sont inclus dans les artefacts statiques.

## Développer et construire

Prérequis : Node.js 22, npm, Rust avec la cible `wasm32-unknown-unknown`, et `wasm-pack`.

```bash
rustup target add wasm32-unknown-unknown
cargo test --manifest-path engine/Cargo.toml

cd engine
wasm-pack build --release --target web --out-dir pkg
wasm-pack build --release --target nodejs --out-dir pkg-node
cd ..

npm ci --prefix frontend
npm run build --prefix frontend
```

Le build est généré dans `dist/`. Pour travailler localement :

```bash
npm run dev --prefix frontend
```

Consulter l'URL affichée par Vite (la base du projet est `/poker_lab/`). Pour tester la distribution :

```bash
npm run preview --prefix frontend
```

## Tests et intégrité

Après avoir construit `engine/pkg-node` avec `wasm-pack` :

```bash
node --test tests/v2-source-contract.test.mjs tests/pwa-assets.test.mjs tests/ranges/*.test.mjs
node --experimental-strip-types --test tests/v2-typescript/*.test.mjs
node --test tests/v2-wasm-*.test.mjs
```

Les workflows sous `.github/workflows/` valident Rust, TypeScript, Vite, les ressources `dist/` et les tests navigateur Chromium/WebKit. Les essais WebKit CI ne remplacent pas les essais sur **iPhone/Safari réel**, en particulier pour le cache et les mises à jour PWA.

## Déploiement GitHub Pages

`.github/workflows/deploy-pages.yml` construit Rust → WASM → Vite et déploie **uniquement `dist/`** avec GitHub Actions lors d'un push sur `main` (ou d'un déclenchement manuel depuis `main`). Dans **Settings → Pages → Build and deployment**, choisir **GitHub Actions**.

Les modifications passent par des branches et des pull requests ; aucun commit direct sur `main`.

## Retrouver la V1 intacte

La V1 HTML/CSS/JavaScript native est sauvegardée et **figée** sur la branche permanente [`v1-backup`](https://github.com/iantrn/poker_lab/tree/v1-backup), créée depuis le commit `96d0cb2029ffe83a80c5de435a094b95580f1b45`. Elle ne doit jamais être supprimée.

```bash
git clone --branch v1-backup https://github.com/iantrn/poker_lab.git pokerlab-v1
cd pokerlab-v1
npx serve .
```

Ne pas fusionner `v1-backup` dans `main` pour consulter la V1. L'historique des retraits et les preuves de non-dépendance figurent dans `V2_MIGRATION_CHECKPOINT.md` et `docs/V1_REMOVAL_AUDIT.md`.

## Limite stratégique

Les stratégies CFR+ sont calculées sur des **arbres de mises abstraits**, avec échantillonnage et contraintes de budget. Leur NashConv et leurs fréquences constituent des diagnostics internes ; ce moteur **n'est pas une solution GTO certifiée pour l'intégralité du poker No-Limit**.
