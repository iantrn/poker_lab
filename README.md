# PokerLab

PokerLab est une application web progressive (PWA) de pratique et d'apprentissage du Texas Hold'em No-Limit. Le projet fonctionne côté navigateur, sans serveur applicatif ni base de données distante.

L'application permet de jouer contre des adversaires automatisés, de consulter des ranges préflop, de suivre un parcours pédagogique, de résoudre des exercices tactiques et de revoir les mains terminées localement.

## Fonctionnalités

- Parties de Texas Hold'em No-Limit contre des bots.
- Formats 6-max et heads-up.
- Profils de bots variés et niveaux de difficulté.
- Gestion des blinds, des mises, des relances, des tapis et des pots secondaires, avec détail des pots au résultat.
- Évaluation des mains et détermination des gagnants.
- Historique des actions d'une main et sauvegarde locale automatique des mains terminées pour Game Review.
- Parcours de six leçons en français, avec progression persistée localement.
- Huit exercices tactiques avec filtres par catégorie et difficulté, correction et explication.
- Consultation des 2 606 spots de ranges préflop depuis le module Apprentissage.
- Analyse d'équité postflop Monte-Carlo en heads-up.
- Analyse stratégique postflop expérimentale par CFR+ range-vs-range, avec fréquences, EV, intervalle de confiance, ESS et estimation du NashConv sur l'arbre abstrait.
- Mise en cache des ressources, des icônes et du bundle complet des ranges pour une utilisation hors connexion.
- Interface responsive pour ordinateur, tablette et mobile.

## Technologies

- HTML5
- CSS3, avec une feuille de styles applicative et un ensemble de classes utilitaires
- JavaScript natif, sans framework
- Service Worker et Web App Manifest pour les fonctions PWA
- API Web Storage pour les paramètres locaux
- Node.js pour les outils de maintenance et les tests des données de ranges

Aucune installation de dépendances npm n'est nécessaire pour lancer l'application. Le dépôt ne contient pas de fichier `package.json`.

## Lancer PokerLab en local

Le projet doit être servi par un serveur HTTP local. L'ouverture directe du fichier `index.html` avec le protocole `file://` ne permet pas d'utiliser correctement toutes les fonctions, notamment le Service Worker et le chargement des données.

### Avec Python

Depuis le dossier racine du dépôt :

```powershell
py -m http.server 8000
```

Ouvrir ensuite :

```text
http://localhost:8000
```

Pour arrêter le serveur, utiliser `Ctrl+C` dans le terminal.

### Avec Visual Studio Code

Il est également possible d'utiliser une extension de serveur statique, par exemple Live Server, puis d'ouvrir l'adresse locale fournie par l'extension.

## Installation comme application PWA

PokerLab peut être installé depuis un navigateur compatible lorsque le site est servi dans un contexte sécurisé :

- en local via `localhost` ;
- en production via HTTPS.

Le fichier `manifest.json` décrit l'application et `service-worker.js` gère la mise en cache. Après le premier chargement réussi, les ressources précachées et le bundle de ranges permettent de continuer à utiliser les fonctions correspondantes hors connexion.

Les trois icônes PNG sont fournies : `icon-192.png` (192×192), `icon-512.png` (512×512) et `apple-touch-icon.png` (180×180). Elles sont précachées avec le shell applicatif. Le Service Worker utilise le cache `pokerlab-cache-v57` ; à chaque changement de ressource publiée, sa version doit être incrémentée.

## Organisation du dépôt

```text
.
├── assets/
│   └── icons/                 Icônes PWA PNG (192, 512 et 180 px)
├── css/
│   ├── style.css              Styles de l'application et de la table
│   └── utilities.css          Classes utilitaires
├── data/
│   ├── lessons/               Données des leçons
│   ├── puzzles/               Données des exercices
│   └── ranges/
│       └── preflop/           Catalogue, schémas et matrices préflop
├── js/
│   ├── app.js                 Initialisation et services de l'application
│   ├── bots/                  Profils et logique des bots
│   ├── components/            Table, cartes, navigation et matrice de ranges
│   ├── core/                  Paquet de cartes, règles, évaluation et moteur
│   └── modules/               Entraînement, ranges, leçons, puzzles et review
├── tests/
│   │   ├── ranges/             Tests du pipeline et de l'intégrité des ranges
│   │   └── *.test.js           Tests moteur, bots, solveur et modules pédagogiques
├── tools/
│   └── ranges/                Import, conversion, validation et génération
├── index.html                 Point d'entrée de l'application
├── manifest.json              Configuration PWA
└── service-worker.js          Cache et fonctionnement hors connexion
```

## Architecture applicative

Les scripts sont chargés dans `index.html` dans un ordre défini afin de respecter leurs dépendances.

### Moteur de jeu

Le moteur situé dans `js/core/game-engine.js` gère notamment :

- la création des joueurs et la distribution des cartes ;
- les positions et les blinds ;
- le déroulement des tours d'enchères ;
- les actions fold, check, call, bet, raise et all-in ;
- le passage entre préflop, flop, turn et river ;
- le calcul des pots principaux et secondaires ;
- le showdown et la distribution des pots ;
- l'historique et l'état public de la partie.

### Bots

Les profils sont définis dans `js/bots/bot-profiles.js`. La logique de décision se trouve dans `js/bots/bot-engine.js`. Le moteur de jeu orchestre les tours des bots et transmet le contexte nécessaire à leur décision.

### Interface

- `js/components/table.js` affiche la table, les joueurs, les cartes, le pot et le résultat.
- `js/components/cards.js` construit les cartes HTML.
- `js/modules/training.js` gère la configuration des parties, les actions du joueur et l'enchaînement des tours des bots. À la fin d'une main, il transmet à Game Review un instantané validé qui ne contient que les cartes autorisées par l'état public du moteur.
- `js/components/navigation.js` gère la navigation entre les sections et déclenche l'initialisation différée des modules pédagogiques.
- `js/modules/lessons.js` charge `data/lessons/lessons.json`, affiche le catalogue et les leçons et conserve la progression dans le stockage local.
- `js/modules/puzzles.js` charge `data/puzzles/puzzles.json`, valide les exercices, applique les filtres et corrige les réponses.
- `js/modules/game-review.js` conserve jusqu'à 500 mains dans le stockage local, affiche l'historique des actions et permet de sélectionner une main pour la revoir.
- `js/modules/ranges-viewer.js` utilise l'index et le bundle de `data/ranges/preflop/matrix/` pour afficher les 2 606 spots préflop. `js/modules/ranges-data.js` expose séparément l'accès au catalogue normalisé.
- `js/modules/postflop-solver.js` estime l'équité contre une range adverse, utilise les matrices préflop lorsqu'un spot exact est disponible et ajuste les poids à partir des actions postflop et de leurs sizings ; lorsque le profil et la difficulté du bot sont connus, il approxime la vraisemblance de ses décisions à partir de son modèle comportemental (bruit, erreurs, bluff et seuils d'action), sinon il conserve une heuristique générique. En l'absence du bundle, il conserve une range uniforme.
- `js/modules/cfr-core.js` contient le noyau CFR+ générique : regret matching+, pondération de stratégie moyenne, traversées contrefactuelles et contrôle de la signature ordonnée (type, label et sizing) des actions de chaque information set. Il est testé séparément sur Kuhn Poker et Matching Pennies, deux jeux à information imparfaite dont les propriétés d'équilibre sont connues.
- `js/modules/postflop-strategy.js` construit un arbre de décisions abstrait sur le flop, le turn et la river. Le moteur CFR+ échantillonne les ranges préflop des deux joueurs, conditionnées par leurs actions observées. La main réelle du héros est suréchantillonnée pour garantir l'apprentissage de son information set racine. Les ranges uniformes de secours restent indépendantes de sa main privée ; les bloqueurs sont appliqués après l'échantillonnage conjoint. Une pondération d'importance corrige ce biais et tient également compte du nombre pondéré de combinaisons adverses restantes après application des bloqueurs, afin de conserver la distribution jointe des deux ranges. L'effectif efficace des échantillons pondérés est reporté dans les détails du solveur. Les runouts sont rééchantillonnés à chaque itération. Le moteur valide la cohérence des montants, des contributions et des options d'action avec l'état de la partie, respecte les incréments de 0,5 jeton ainsi que la dernière relance complète. À la racine, il propose la relance minimale, un sizing de relance à 50 % du pot après call et le tapis effectif lorsque ces options sont légales ; les réponses futures conservent un sizing plus compact et jusqu'à quatre relances par street. Une seed optionnelle permet de reproduire exactement un calcul. Les EV sont évaluées sur un second jeu d'échantillons indépendants, avec erreur standard et intervalle de confiance à 95 % conditionnels à la stratégie apprise. Un troisième échantillon indépendant estime le NashConv par meilleures réponses sur l'arbre abstrait ; son effectif efficace pondéré (ESS) est affiché pour qualifier la qualité de l'échantillonnage. Cette mesure reste indicative et ne constitue pas une exploitabilité exacte du jeu complet.
- `js/modules/postflop-solver-ui.js` construit un instantané versionné et expurgé des cartes adverses, transmis aux deux moteurs. La modale affiche les fréquences d'action et réserve les EV et les limites du modèle aux détails. L'historique transmet aussi les montants avant/après chaque action (pot, mise courante, contribution totale et stack), ainsi que les tailles exactes des mises et relances.

### Données de ranges

Le runtime actuellement utilisé par le visualiseur et le solveur charge `data/ranges/preflop/matrix/index.json` et le bundle `data/ranges/preflop/matrix/ranges.json`, qui contiennent 2 606 spots. Le Service Worker traite désormais ces deux fichiers comme des ressources essentielles : une installation offline complète ne doit pas publier un cache dépourvu du bundle.

Le catalogue normalisé `data/ranges/preflop/catalog/index.json` et le module `PokerLabRangesData` constituent un pipeline distinct. Le catalogue est encore en état `empty-awaiting-datasets` : aucune source normalisée n'est publiée comme jeu de données validé dans ce format. Les outils d'import et de conversion sont documentés dans [tools/ranges/README.md](tools/ranges/README.md). Les sources privées ou archives personnelles ne doivent pas être ajoutées au dépôt public.

Les sources privées ou archives personnelles ne doivent pas être ajoutées au dépôt. Les règles d'exclusion sont définies dans `.gitignore`.

## Tests et maintenance

Node.js est nécessaire pour exécuter les tests et les outils de données.

Lancer les tests du moteur, des bots, du solveur et des modules pédagogiques :

```powershell
node --test tests/game-engine.test.js tests/bot-engine.test.js tests/postflop-solver.test.js tests/postflop-strategy.test.js tests/cfr-core.test.js tests/learning-modules.test.js tests/pwa-assets.test.mjs
```

Lancer les tests des outils et de l'intégrité des ranges :

```powershell
node --test tests/ranges/*.test.mjs
```

Valider un fichier de range :

```powershell
node tools/ranges/validate-range.mjs chemin/vers/un-fichier.json
```

Générer le bundle compact des matrices :

```powershell
node tools/ranges/build-matrix.mjs --input-dir chemin/vers/les-ranges-normalisees --output-dir ./data/ranges/preflop/matrix
```

Les commandes d'import et de conversion, leurs paramètres et les conventions de données sont détaillés dans [tools/ranges/README.md](tools/ranges/README.md).

Les tests couvrent le moteur de jeu, les décisions et l'intégration des bots, les pots principal et secondaires, la conservation des jetons, le contrat d'entrée du solveur, l'isolation des cartes adverses, le fallback hors ligne, les contraintes de mises, l'échantillonnage range-vs-range avec poids de bloqueurs, les signatures d'information sets, les meilleures réponses, les modules pédagogiques et la cohérence entre l'index des 2 606 spots et leur bundle. Le noyau CFR+ est également testé sur Kuhn Poker, Matching Pennies et un spot river à EV exacte.

Lancer les tests du solveur postflop :

```powershell
node --test tests/game-engine.test.js tests/bot-engine.test.js tests/postflop-solver.test.js tests/postflop-strategy.test.js tests/cfr-core.test.js
```

La suite stratégique vérifie notamment les actions légales de l'arbre, les contraintes de tapis, les mises non couvertes, les transitions flop-turn-river, la normalisation des fréquences CFR+, la cohérence des signatures d'actions, les meilleures réponses et la convergence du noyau sur Kuhn Poker et Matching Pennies.

## Données locales et confidentialité

Les paramètres de l'application sont conservés dans le stockage local du navigateur. Les parties ne nécessitent pas de compte utilisateur ni de service distant.

Les cartes privatives des adversaires ne doivent pas être exposées à l'état public de la partie avant un showdown valide. Les cartes des joueurs ayant passé restent masquées.

## État du projet

Les sections Apprentissage, Tactiques et Game Review sont intégrées à la navigation. Les contenus pédagogiques et tactiques sont fournis en français ; la Game Review enregistre les mains terminées pendant les sessions d'entraînement et les conserve uniquement dans le stockage local du navigateur. Elle présente l'historique et les informations disponibles, mais ne prétend pas fournir une évaluation GTO certifiée de chaque décision.

Le module SOLVE est intégré à la branche de développement. Son moteur stratégique reste expérimental : heads-up uniquement, tailles de mises abstraites (33 % et 75 % du pot, relance à 50 % du pot et tapis effectif), jusqu'à quatre relances dans les réponses modélisées par street (la racine respecte les droits réels du moteur) et nombre limité d'itérations/scénarios échantillonnés. Il ne calcule pas encore un équilibre GTO certifié ; le NashConv affiché est une estimation sur un échantillon de deals et l'arbre abstrait, pas une mesure certifiée de l'exploitabilité globale. Les résultats doivent être interprétés comme une approximation d'entraînement, pas comme une stratégie optimale garantie. La validation manuelle dans un navigateur et sur une session réelle reste nécessaire.
