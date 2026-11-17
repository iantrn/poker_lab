# Audit de retrait V1 — PokerLab V2

**Portée :** branche `chore/remove-v1`, pull request [#24](https://github.com/iantrn/poker_lab/pull/24), sans commit direct sur `main`.

## Protection de la V1

La branche pérenne [`v1-backup`](https://github.com/iantrn/poker_lab/tree/v1-backup) pointe vers le dernier état V1 pur `96d0cb2` suivi uniquement d'un README de sauvegarde. Elle contient l'ancien HTML, le JS, les CSS, le Service Worker, le manifest, les Workers et les tests. **Ne jamais supprimer ni réécrire cette branche.**

## Audit initial — références `git grep`

L'audit GitHub Actions de départ a inspecté le dépôt entier par `git grep -n -E`. Les références actives les plus importantes étaient :

| Emplacement avant retrait | Référence | Mesure effectuée |
|---|---|---|
| `frontend/src/solver/precompute.ts` | `pokerlab-solver-worker-v2.js` et `retryWithClassicWorker` | Suppression de la logique de Worker classique, tests d'erreurs du Worker typé |
| `frontend/vite.config.ts` | `workerSources` (5 JS) et `topFiles` (2 Workers) | Retrait des copies de ces ressources dans `dist/` |
| `tests/v2-browser-smoke.mjs` | `index.html` V1 et anciens Workers | Contrats DOM React et tests du Worker TypeScript autonomes |
| `frontend/src/main.tsx` | `../../css/utilities.css`, `../../css/style.css` | Déplacement octet pour octet de leurs contenus dans `frontend/src/styles/` et mise à jour des imports |
| `frontend/src/legacy/loader.ts` | Libellés `js/*.js` dans la séquence d'initialisation | Conservation du **même ordre** des 22 installateurs TypeScript, sans libellés JS |
| `tests/v2-typescript/*parity*`, `tests/*.test.js` | Chargement direct des fichiers V1 | Suppression après adaptation des contrats autonomes V2 et maintien des tests navigateur et Rust |
| `tests/v2-wasm-*.test.mjs` | Ancien évaluateur et CFR JS | Remplacement de la référence par les implémentations TypeScript V2 |
| `.github/workflows/postflop-solver.yml` | Vérifications exclusivement V1 | Retrait du workflow redondant après audit |

**Référence avant :** [run d'audit initial](https://github.com/iantrn/poker_lab/actions/runs/44107368186). Extrait de l'ancien `git grep` :

```text
frontend/src/main.tsx:3:import "../../css/utilities.css";
frontend/src/main.tsx:4:import "../../css/style.css";
frontend/src/solver/precompute.ts:95:  const WORKER_URL = "./pokerlab-solver-worker-v2.js";
frontend/vite.config.ts:22:const topFiles = ["pokerlab-solver-worker.js", "pokerlab-solver-worker-v2.js"] as const;
tests/v2-browser-smoke.mjs:85:    const originalIndex=readFileSync(path.resolve(root,"..","index.html"),"utf8");
```

## Inventaire des suppressions

- Ancienne CI : `.github/workflows/postflop-solver.yml`.
- **Deux Workers :** `pokerlab-solver-worker.js`, `pokerlab-solver-worker-v2.js`.
- **Cinq imports des Workers :** `js/core/evaluator.js`, `js/bots/bot-profiles.js`, `js/modules/postflop-solver.js`, `js/modules/cfr-core.js`, `js/modules/postflop-strategy.js`.
- **Autres sources V1 :** `js/app.js`, `js/bots/bot-engine.js`, `js/components/cards.js`, `js/components/navigation.js`, `js/components/range-matrix.js`, `js/components/table.js`, `js/core/deck.js`, `js/core/game-engine.js`, `js/core/poker-rules.js`, `js/modules/game-review.js`, `js/modules/lessons.js`, `js/modules/postflop-solver-ui.js`, `js/modules/puzzles.js`, `js/modules/ranges-data.js`, `js/modules/ranges-viewer.js`, `js/modules/solver-precompute.js`, `js/modules/training.js`.
- Bootstrap hors production : `index.html` racine, `manifest.json` racine, `service-worker.js` racine.
- CSS sources déplacés : `css/style.css` et `css/utilities.css` ; les **mêmes octets** existent désormais dans `frontend/src/styles/`.
- Ancien benchmark chargeant la V1 : `tools/solver-performance-bench.cjs`, uniquement utilisé par l'ancien workflow.
- **Huit** tests `tests/*.test.js` dépendant de la V1.
- **Vingt-sept** tests de parité `tests/v2-typescript/*parity*.test.mjs` qui lisaient réellement les sources V1 ; ne sont pas concernés les tests aux noms similaires qui ne chargent aucune source V1. Le cycle de vie et les erreurs du Worker ont des suites V2 indépendantes.

Tous les chemins `js/`, `css/` et les points d'entrée racine cités sont désormais absents de l'arbre de la branche de travail.

## Preuve négative reproductible

Ces commandes sont **gâtées par la CI V2** et doivent rester vertes. En particulier, `git grep` doit retourner **aucune occurrence** dans les sources runtime V2. Les chaînes désignant les fichiers supprimés peuvent encore apparaître dans une **assertion négative de CI**, dans la documentation ou dans le test qui vérifie précisément leur absence ; cela ne constitue pas un consommateur runtime.

```bash
# Aucun fichier de l'arbre V1 historique
test -z "$(git ls-files js css)"
for file in index.html service-worker.js manifest.json \
  pokerlab-solver-worker.js pokerlab-solver-worker-v2.js \
  .github/workflows/postflop-solver.yml; do
  ! git ls-files --error-unmatch "$file" >/dev/null 2>&1
done

# Aucun import ni URL de repli classique dans la V2 active
! git grep -n -E \
  'pokerlab-solver-worker|js/(core|bots|modules|components)/|[.][.]/[.][.]/css/' \
  -- frontend/src frontend/vite.config.ts

# Après wasm-pack + npm ci + build Vite
test -s dist/index.html
test -s dist/service-worker.js
test -s dist/manifest.webmanifest
test -s dist/wasm/pokerlab_engine_bg.wasm
test -s dist/data/ranges/preflop/matrix/ranges.json
test ! -d dist/js
test ! -e dist/pokerlab-solver-worker.js
test ! -e dist/pokerlab-solver-worker-v2.js
test ! -e dist/css/style.css
```

**Validation après retrait des sources :** [audit CI](https://github.com/iantrn/poker_lab/actions/runs/44112173486) et [validation complète V2](https://github.com/iantrn/poker_lab/actions/runs/44112173576) terminés avec succès, y compris compilation Vite et navigateur Chromium/WebKit. Les tests avant nettoyage comptaient 41 Rust, 153 Node et 127 TypeScript ; après élimination des suites V1, l'audit dénombre 41 Rust, 16 contrats Node/PWA/ranges et 73 TypeScript, auxquels s'ajoutent les tests Rust/WASM individuels et navigateurs de la CI V2. Des tests de gameplay TypeScript indépendants sont ajoutés pour compléter la couverture du moteur.

## Ce qui reste volontairement

- `v1-backup` figée.
- `assets/`, `data/` et en particulier `data/ranges/preflop/matrix/` **non modifiés**.
- `frontend/src/legacy/loader.ts`, `range-adapter.tsx` et `LegacyApplication.tsx` : fichiers **TypeScript/React actifs de la V2**, leur nom reflète un contrat public historique, pas une exécution de l'ancienne application.
- Le Web Worker TypeScript V2, les modules `frontend/src/solver/`, et le fallback **Rust CFR+ → TypeScript** interne au Worker.
- Le manifest et le Service Worker Workbox **générés** dans `dist/` ; ils sont indispensables à la PWA.
- Les scénarios autonomes V2, les données et les tests de migration locale des sauvegardes.

## Risques résiduels

L'utilisateur a explicitement autorisé le retrait du secours JS externe : si le Worker TypeScript ne peut pas démarrer, le solveur ne peut plus reprendre via un Worker classique. La compatibilité lors de la mise à jour d'une PWA **déjà installée sur iPhone/Safari réel** et le risque de rafraîchissement de Service Worker doivent être revérifiés après fusion. Les tests WebKit Linux ne valent pas une validation matérielle iOS.

La PR n'effectue aucune suppression de branche distante et aucun tag d'archivage (objectif D séparé).
