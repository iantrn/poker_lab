# PokerLab V2 — frontend React, TypeScript et Rust/WASM

L'interface de production est construite depuis `frontend/index.html`, avec Vite et TypeScript strict. Les pages React partagent des modules de logique typés et des Workers ES module ; aucun ancien fichier source JavaScript V1 n'est chargé ou copié dans le bundle.

## Installation et exécution

Depuis la racine du dépôt, compiler le WebAssembly navigateur avec :

```bash
cd engine
wasm-pack build --release --target web --out-dir pkg
cd ..
npm ci --prefix frontend
npm run build --prefix frontend
npm run dev --prefix frontend
```

Le répertoire de sortie est `dist/` à la racine, avec `base: "/poker_lab/"`. Les styles originaux ont été **déplacés à l'identique** vers `frontend/src/styles/` et restent intégrés aux ressources CSS du bundle Vite.

`vite-plugin-pwa` génère `dist/manifest.webmanifest` et `dist/service-worker.js` ; l'orchestrateur TypeScript les enregistre pour le mode hors ligne. Le plugin `staticResources` copie les données `data/`, les icônes et ressources `assets/`, et `engine/pkg/` vers `dist/wasm/`.

## Solveur

`src/workers/postflop.worker.ts` est le seul Worker postflop de production. Le calcul Rust/WASM est choisi automatiquement quand il est disponible et le chemin TypeScript sert de repli algorithmique **dans le même Worker**. Les deux anciens Workers classiques et les cinq modules JavaScript qu'ils importaient ont été supprimés.

Un échec de chargement du Worker typé est signalé : aucun ancien Worker externe n'est démarré à sa place.

Pour forcer temporairement le backend TypeScript dans la console du navigateur :

```js
localStorage.setItem("pokerlab_v2_cfr_backend", "typescript");
location.reload();
```

Pour rétablir la sélection automatique :

```js
localStorage.removeItem("pokerlab_v2_cfr_backend");
location.reload();
```

## Tests et limites

Les tests TypeScript autonomes, les tests Rust/WASM, et les scénarios navigateur Chromium/WebKit (hors ligne et Workers compris) sont exécutés dans la CI V2. La sauvegarde historique se trouve dans la branche `v1-backup`, pas dans `main`.

Ce solveur CFR+ repose sur une abstraction et n'est **pas** un certificat GTO pour tous les coups de Texas Hold'em No-Limit. La validation sur WebKit Linux ne remplace pas un test sur un vrai iPhone/Safari.
