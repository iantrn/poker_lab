# PokerLab

**PokerLab** est une PWA d'entraînement au **Texas Hold'em No-Limit**, utilisable sans compte, sans argent réel, sans serveur applicatif et **hors connexion après installation et mise en cache initiales**.

La version V2 est construite avec **React, TypeScript strict et Rust/WebAssembly**. La version JavaScript historique (V1) est conservée dans le dépôt pour la compatibilité, les tests de parité et la possibilité de revenir en arrière.

## Fonctionnalités

- **Jouer :** parties 6-max et heads-up contre des bots aux profils et difficultés variés ; blinds, positions, relances, all-in, showdown et pots secondaires.
- **Apprendre :** six leçons interactives en français, progression locale et **2 606 spots** de ranges préflop affichés dans une matrice 13 × 13.
- **S'entraîner :** huit puzzles tactiques filtrables avec correction et explication.
- **Revoir :** historique local des mains et module Game Review.
- **Analyser :** équité Monte-Carlo et **CFR+ heads-up range-vs-range** avec EV et NashConv estimé ; nouveau mode **multiway 3 à 6 joueurs actifs** avec stratégies échantillonnées, bloqueurs, positions et pots secondaires (abstraction d'une street, sans garantie GTO ni NashConv multiway).
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

Le solveur CFR+ Rust peut préparer et valider une topologie publique une seule fois par session, puis mettre à jour les informations sets et utilités terminales à chaque échantillon. Le cache de topologies est borné pour respecter les contraintes mémoire ; la méthode historique `step()` reste disponible et constitue un repli en cas de budget dépassé ou d'ancienne version WASM. Le chemin Rust peut également regrouper jusqu'à huit échantillons CFR+ en un seul transfert WASM, avec validation atomique des entrées du lot, un tampon d'au plus 2 Mio et un retour au traitement séquentiel si le batch n'est pas disponible ou dépasse ce budget. Les lots sont exécutés dans le Worker et vidés avant chaque point de coopération. Cette optimisation ne modifie ni le sampling, ni le nombre ou l'ordre des mises à jour CFR+. Les tests de parité et les benchmarks non bloquants sont exécutés par `tests/v2-wasm-prepared-tree.test.mjs` et les tests TypeScript du solveur.

**Indexation des information sets (TS → Rust) :** le solveur réutilise désormais un préfixe canonique par échantillon, joueur et street (`actor | main | board`) et un suffixe immuable par état de mises/historique. Un index à deux niveaux retrouve directement l'ID numérique stable d'un information set déjà vu, sans reconstruire sa clé textuelle à chaque visite. Les clés complètes restent la source de vérité pour l'EV, NashConv, les signatures d'actions et le mode de repli TypeScript. Toute création d'ID vérifie l'égalité `préfixe + suffixe === clé canonique`, les rejets de lots suppriment les références numériques invalides, et le cache accélérateur est limité à **512 préfixes** (éviction FIFO sans perte de stratégie). Pour comparer avec le chemin textuel, le pont Rust accepte l'option de diagnostic `numericInformationIndex:false`. Les benchmarks correspondants sont non bloquants et varient selon les arbres et les appareils.

**Expérience non activée par défaut :** une variante de « terminal payout compilation » précompile dans Rust les utilités de fold/showdown, puis ne transfère que le résultat du showdown avec les IDs et les poids. Elle est réservée au diagnostic via l'option interne `experimentalCompiledPayoffs: true`, car le benchmark river de bout en bout (3 répétitions, même seed) l'a mesurée à **15,35 ms** médian contre **13,26 ms** avec le batching Rust standard. Les sorties EV/fréquences/NashConv restent équivalentes. Ce test ne permet pas de conclure pour les arbres plus grands ou d'autres appareils ; aucun gain n'est revendiqué. Aucun gain général de performance n'est présumé sans résultats mesurés.

**Progression et actualisation en partie :** `strategy.ts` peut publier des checkpoints CFR+ bornés avec des fréquences de décisions **provisoires** (`provisional:true`) et une progression séparant entraînement, estimation indépendante des EV et diagnostics de meilleure réponse. Les messages Worker sont associés à un identifiant de requête ; `solver/precompute.ts` ignore les messages de versions obsolètes et termine le Worker en cas de changement d'état. Quand la modale est ouverte et qu'un nouvel état postflop éligible (heads-up ou multiway 3–6 joueurs) arrive, l'analyse est automatiquement relancée, sans réutiliser les regrets de l'ancien sous-jeu. Le résultat final précise `quality:"sampled_estimate"` : il ne certifie pas un équilibre exact du No-Limit.

**État stratégique canonique :** `frontend/src/solver/strategic-state.ts` expose `createStrategicGameState` pour 2 à 6 sièges, l'ordre des événements et les `raiseTo` explicites, les contributions par street, la structure des pots secondaires, les décisions légales rapportées par le moteur et les cartes publiques/privées autorisées. L'état est immuable, réanonymise les cartes adverses même si un snapshot lui est fourni avec des cartes cachées et marque `unavailable` toute situation non prise en charge. Le contrôleur de pré-calcul expose `getStrategicState()`. Le Worker valide ce contrat, active le solveur heads-up pour 2 joueurs actifs et le noyau multiway indépendant pour 3 à 6 joueurs actifs. Préflop, résolution exacte du No-Limit et traitement intégral des actions hors arbre ne sont pas implémentés.

**Multiway postflop 3–6 joueurs — première version utilisable, mais approximative :**
- `engine/src/cfr/multiway.rs` fournit une session CFR+ distincte à utilités vectorielles nettes de **tous les sièges**, avec regrets propres à chaque joueur, information sets persistants (maximum **65 536**, budget mémoire mobile), validation atomique des arbres, profondeur/nombre de nœuds bornés et API WASM.
- `frontend/src/solver/multiway-tree.ts` construit, à partir de l'état public et des actions réellement légales à la racine, un arbre de mises **multi-street à horizon adaptatif** (flop → turn → river quand le budget le permet). Chaque fin de street réinitialise les mises, conserve stacks/contributions, réinitialise les droits de relance et remet la parole à gauche du bouton. Les *information sets* de chaque décision n'utilisent que **les cartes déjà visibles** : le turn ne fuit jamais vers un nœud flop. L'abstraction autorise au plus une ouverture/relance agressive par street, avec mises d'environ 50 % du pot et, sur la street initiale à 3 sièges, une option pot. Pour **5–6 sièges**, les futures streets utilisent une abstraction plus étroite (premier joueur autorisé à ouvrir, pas de relance) afin d'éviter l'explosion combinatoire. Si le graphe dépasse **12 000 nœuds** ou le budget prévisionnel de **60 000 information sets**, la durée du lookahead et/ou le nombre de samples diminuent ; les streets non modélisées sont alors *checkées*. Il reste donc une **approximation du NLHE**, non une stratégie GTO complète.
- `frontend/src/solver/multiway.ts` utilise des ranges adverses par siège dérivées de l'historique et de la matrice préflop avec un fallback uniforme explicite. Les mains cachées sont échantillonnées **sans collision de cartes**, les cartes futures sont partagées correctement et les combinaisons sont proposées séquentiellement puis **corrigées par pondération d'importance** pour viser la distribution jointe conditionnée par les bloqueurs (sans énumérer exhaustivement les combinaisons). L'EV est estimée sur des tirages indépendants, avec **taille efficace d'échantillon (ESS de Kish)** et intervalle 95 % indicatif ; l'équité affichée est la part moyenne **pondérée** du pot auquel le héros est éligible, pots secondaires compris. Un ESS faible implique une faible précision, et ne valide pas une convergence GTO.
- `postflop.worker.ts` active automatiquement le noyau multiway Rust/WASM à partir de trois joueurs actifs, dans le Worker existant et avec les mêmes annulations/recalculs sur chaque nouvel état. Les résultats et fréquences provisoires portent `quality:"sampled_estimate"` et `provisional:true`. **Aucun NashConv ni exploitabilité ne sont annoncés en multiway** : les garanties classiques du heads-up zéro-somme ne s'appliquent pas directement à trois joueurs ou plus. Si WASM manque, le mode multiway signale une indisponibilité ; le fallback historique TypeScript est préservé pour le heads-up.
- Tests Rust (3–6 joueurs, zero-sum, incohérences), tests de pots secondaires/égalités/validité des actions, simulations de river/flop/turn et smoke tests dans les **vrais Workers** sous Chromium et WebKit. Les benchmarks ne sont pas représentatifs du matériel iPhone réel.

**Optimisation de la topologie multi-street :** la structure de l'arbre ne dépend pas des cartes futures d'un tirage ; elle est compilée **une seule fois par solve**, avec signatures d'actions et buffers typés réutilisés à chaque chance sample. Le noyau Rust `MultiwayCfrSession.prepare_tree(...)` valide la structure une seule fois, puis `step_prepared(ids, payoffs, weight)` transmet seulement les IDs d'information et les utilités terminales qui changent ; l'ancien `step(...)` reste disponible en repli. Les tests vérifient l'identité exacte des fréquences, EV et erreurs entre les deux chemins ainsi que la non-mutation après un sample invalide. Le nombre de streets réellement modélisées, les itérations effectives et `preparedTopology` sont rapportés ; aucun gain général de vitesse sur iPhone réel n'est revendiqué sans mesure matérielle.

**Limitations restantes :** pas de solveur préflop multijoueur, pas de continuation **non abstraite** de toutes les actions sur toutes les streets pour toutes les tailles de table, pas d'énumération exhaustive de la distribution jointe des ranges conditionnelles, ni de garantie de convergence GTO en multiway. Lorsque le budget mobile réduit l'horizon, le reste est un *checkdown* explicite. L'objectif final reste une stratégie continuellement réactualisée avec une abstraction progressivement enrichie et mesurée.

**Export allégé :** `CfrSession.strategy_for_info_set(id)` lit uniquement les fréquences d'un information set, typiquement à la racine pendant les checkpoints, sans exporter toute la table des stratégies Rust à chaque fois. La synchronisation complète est conservée pour l'EV et NashConv. Les anciens modules WASM dépourvus de cette méthode utilisent le chemin historique. Les tests de parité contrôlent les fréquences, les EV et le NashConv, y compris après annulation et sur des états de table successifs. Ces changements ne constituent pas une certification de vitesse ou de mémoire sur un iPhone réel.

Le **Worker postflop V2** utilise automatiquement la session **Rust CFR+** si WASM est disponible. Il revient au moteur TypeScript en cas d'erreur ; les Workers V1 sont conservés comme repli supplémentaire. Les composants React ne réévaluent pas la logique poker : les modules TypeScript continuent de gérer les événements fonctionnels.

## Vérification GTO : portée exacte des certificats

La seule définition exploitable d'un **certificat d'équilibre** est un jeu entièrement défini, un profil de stratégies complet, puis une borne explicite du gain de chaque déviation unilatérale : `d_i = BR_i(σ_-i) − u_i(σ)`. Le profil est un **ε-Nash** seulement si `max_i(d_i) ≤ ε`. Un faible *NashConv* estimé sur quelques deals, une qualité de jeu élevée ou un grand nombre d'itérations CFR+ **ne sont pas une preuve**.

**Nouveau vérificateur indépendant :** `frontend/src/solver/finite-nash-certificate.ts` fournit `certifyFiniteNash(game, epsilon)` pour un **jeu extensif fini entièrement énuméré, avec 2 à 6 joueurs et mémoire parfaite**. Probabilités de chance, stratégies et utilités sont toutes des fractions rationnelles exactes (BigInt) : pas de seuil flottant ni d'incertitude Monte-Carlo dans la preuve. Le vérificateur valide l'arbre, les profils normalisés, les utilités zéro-somme et la mémoire parfaite ; il calcule pour **chaque acteur** une vraie meilleure réponse en imposant une décision identique dans tous les états de son information set (pas de connaissance abusive des cartes cachées). Les valeurs du profil, les valeurs de meilleure réponse, tous les gains individuels, le NashConv et la certification ε-Nash sont renvoyés sous forme de fractions exactes.

Le champ de portée est **obligatoirement** `scope:"explicit_finite_game_only"`, et `fullNoLimitHoldemCertified:false`, **même si le vérificateur démontre exactement un équilibre du jeu fourni**. Un utilisateur peut fournir un jeu jouet exhaustif ou une petite abstraction entièrement spécifiée : ce certificat ne concerne **que ce jeu**, et ne s'étend ni au No-Limit complet ni à des tirages de chances partiels. Les tests couvrent des équilibres 2–6 joueurs, le refus d'une stratégie exploitable, l'impossibilité de tricher en connaissant une carte future et les erreurs de mémoire parfaite. Le solveur CFR+ existant reste marqué `fullGameGtoCertified:false`, et l'interface affiche sans ambiguïté « GTO intégral non certifié ».

**Conditions NON satisfaites pour une certification GTO de PokerLab complet :** stratégies définies pour toutes les mains privées et tous les historiques, tailles de mises légales non abstraites, transitions et cartes futures exhaustives, démonstration quantitative du gain de **toute** déviation adversaire (pas seulement sur un échantillon), et vérification indépendante des règles, de la distribution de chance et de l'erreur numérique. En multiway 3–6, CFR+ n'a pas de garantie générale de convergence vers un Nash. Un certificat exact pour un sous-jeu abstrait n'implique donc **jamais** un certificat pour le Texas Hold'em complet. La mémoire/CPU nécessaires à une telle preuve exhaustive ne sont pas supposées disponibles sur iPhone.

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
