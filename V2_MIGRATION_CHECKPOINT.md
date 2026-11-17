# PokerLab V2 — jalon de migration du code · 17 novembre 2026

> **Branche :** `feat/v2-ts-rust-migration`.
> **État : migration technique React/TypeScript/Rust-WASM intégrée sur la branche.**
> Cela ne vaut **ni certification GTO, ni validation de production iOS, ni
> autorisation de fusion/déploiement dans `main`**. La branche `main` doit
> rester inchangée jusqu'à validation explicite.

## Architecture et fonctionnalités migrées

- V2 React/Vite/TypeScript strict, avec shell et pages React : accueil,
  entraînement, tactiques, leçons, analyse des parties, paramètres et ranges.
  Les contrôleurs de table et contenus dynamiques sont en TypeScript
  et possèdent volontairement leurs nœuds DOM pour éviter des listeners
  React/native concurrents. L'intégrité des IDs, data-hooks et événements
  historiques est testée.
- Le bootstrap V2 installe **les 22 modules typés dans l'ordre d'origine**
  sans charger de scripts JS classiques sur le thread principal. Les
  anciennes sources sont conservées comme oracles de parité, Worker de
  secours et point de restauration V1, pas comme architecture active.
- Moteur de poker 2–6 joueurs, règles, positions HU, blinds, bots,
  cartes, séquences de manches, side pots et all-in migrés avec
  tests de parité et de conservation des jetons.
- Ranges préflop (2 606 spots), matrice React 13×13, entraînement,
  leçons, tactiques, historiques et Game Review préservés.
- Solveur postflop : range-vs-range, chance sampling pondéré, bloqueurs,
  CFR+ abstrait, stratégie moyenne, fréquences d'actions, EV et NashConv.
  L'orchestrateur et les clés d'information sets sont en TypeScript.
- Rust/WASM : évaluateur 5–7 cartes, comparaison de showdown à neuf
  cartes en une seule opération, équité pondérée/Monte Carlo, CFR+
  matriciel, arbre extensif et session persistante inter-échantillons.
  **Rust CFR+ est le backend automatique du Worker V2 lorsque WASM
  est chargé**, avec repli complet sur le solveur TypeScript en cas
  d'erreur et circuit breaker pour éviter une boucle de défaillances.
  L'option `experimentalRustCfr:false` force le comparateur TypeScript ;
  `true` exige Rust et expose ses erreurs à des fins de diagnostic.
- Performance : distributions de ranges et bloqueurs préparés une fois,
  tirage cumulatif O(log n), cache adversaire borné, suppression des
  allocations/mélanges inutiles river tout en gardant le flux RNG V1,
  arbre public réutilisé sur toutes les streets, mémorisation des
  identifiants privés/board/état et buffers Rust CFR+ réutilisés.
- PWA entièrement statique et hors ligne : Workbox pré-cache ressources,
  Worker typé, WASM et données de ranges. Les sauvegardes `localStorage`
  restent **intentionnellement** l'autorité synchrone compatible V1 ;
  Dexie/IndexedDB est un miroir ordonné avec tests de conservation,
  backfill et suppression. Aucun basculement asynchrone destructif n'est
  requis pour terminer la migration du code.

## Nettoyage pré-fusion sur la branche de migration

Audit de l'arbre Git réalisé avant toute suppression ; aucun dossier
`node_modules`, `dist`, `target` ou WASM généré n'était versionné.
Les fichiers suivants étaient réellement redondants ou obsolètes :

- **2 606 JSON de spots préflop individuels** sous
  `data/ranges/preflop/matrix/{bb,bu,co,mp,sb,utg}/`.
  Chaque identifiant est présent dans `matrix/index.json` **et** dans
  `matrix/ranges.json` (contrôle exhaustif 2 606/2 606).
  Le visualiseur TypeScript et le module V1 résiduel chargent le bundle
  unique, sans requête de repli vers un JSON individuel. En cas d'erreur
  de chargement, une nouvelle tentative reste possible.
- **6 anciens placeholders cash-6max** (manifest et 5 ranges vides
  `pending-source`), sans source ni données utilisables.
- **1 duplication HTML** `frontend/src/ui/legacy-shell.html` :
  les tests utilisent le `index.html` V1 de référence directement.
- **1 déclaration de module `*.html?raw`** non utilisée après la
  disparition du bootstrap HTML injecté.

Le générateur de ranges n'émet désormais que l'index et le bundle.
Le `.gitignore` empêche de recommitter les sorties individuelles et
les artefacts temporaires. Des tests garantissent l'absence de copies et
l'intégrité des **2 606 spots conservés**.

Le build Vite ne distribue plus la totalité du dossier `js/` ou les
CSS bruts en double : il compile la V2, copie les assets et les données
et retient uniquement les **cinq modules V1 requis par les Workers de
secours**. Les fichiers sources JS V1, les Workers de repli, le
`index.html` historique, les schémas de données, les tests et les
workflows de validation sont conservés dans Git pour la réversibilité.
Aucune suppression de l'application V1 sur `main` n'a eu lieu.

## Validation automatisée

`.github/workflows/v2-migration.yml` valide les étapes suivantes :

1. Tests Cargo et construction WASM navigateur/Node, parités de
   l'évaluateur et du showdown sur des milliers de mains distinctes,
   tests de la session Rust persistante.
2. Tests historiques V1 et parité TS/V1 sur deck, règles, bots,
   session, table, ranges, leçons, tactiques, historique, échantillonnage
   pondéré et solveur intégral sur **flop, turn et river**.
3. Parité TypeScript/Rust sur les trois streets, notamment fréquences,
   EV, NashConv et poids des chances, puis compilation TypeScript
   stricte et bundle Vite.
4. Tests de navigateur réels sur **Chromium et WebKit Linux** : React,
   navigation, HUD, parties HU/6-max, Worker postflop, backend Rust
   automatique, backend TS forcé, WebAssembly, PWA et rechargement hors
   ligne. Tests Chromium additionnels de migration localStorage/IndexedDB.
5. Vérification du rollback du backend CFR+ sans modification du code
   et des rechargements/annulations des Workers.

Les benchmarks de référence restent **indicatifs**, mesurés sur
80 échantillons et de petits arbres abstraits : V2 TypeScript a été
observé ~4–6x plus rapide que V1 selon la street sur CI Node.
Sur des runs Chromium/WebKit, Rust CFR+ complet n'était qu'environ
1,02–1,08x plus rapide que TypeScript pour le test river.
La comparaison de showdown en un seul appel WASM vise à réduire
les coûts de transfert, mais **aucune accélération générale chiffrée
sur iPhone n'est revendiquée**.

## Restauration et branche principale

La branche V1 `main` n'est pas modifiée. Sur la V2, forcer
temporairement le backend TypeScript :

```js
localStorage.setItem("pokerlab_v2_cfr_backend", "typescript");
location.reload();
```

Pour restaurer le backend automatique Rust puis TypeScript en repli :

```js
localStorage.removeItem("pokerlab_v2_cfr_backend");
location.reload();
```

## Garde-fous avant fusion ou déploiement

Ces points sont des **validations de production** hors migration
technique du code et ne sont pas présentés comme déjà réalisés :

- Essais sur un **vrai iPhone/Safari**, notamment mémoire disponible,
  durée des résolutions longues, reprise après interruption et UI tactile.
- Simulation de mise à jour PWA installée d'une ancienne version vers
  la V2, sans perte d'historique ni de préférences.
- Mesures de stabilité, vitesse et mémoire avec budgets élevés,
  ranges plus larges et plusieurs appareils, puis décision de
  mise en production.
- Validation explicite de fusion `main` et de publication GitHub Pages.

**Limite du modèle :** le CFR+ concerne une abstraction des mises ;
il ne prouve pas un GTO du poker sans limite complet. Le livrable V2
n'est pas une certification stratégique complète.
