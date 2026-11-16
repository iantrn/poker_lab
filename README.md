# PokerLab

PokerLab est une application web progressive (PWA) de pratique et d'apprentissage du Texas Hold'em No-Limit. Le projet fonctionne côté navigateur, sans serveur applicatif ni base de données distante.

L'application permet de jouer contre des adversaires automatisés, de consulter des ranges préflop et d'accéder à plusieurs espaces d'entraînement.

## Fonctionnalités

- Parties de Texas Hold'em No-Limit contre des bots.
- Formats 6-max et heads-up.
- Profils de bots variés et niveaux de difficulté.
- Gestion des blinds, des mises, des relances, des tapis et des pots secondaires, avec détail des pots au résultat.
- Évaluation des mains et détermination des gagnants.
- Historique des actions d'une main.
- Consultation des ranges préflop depuis le module Apprentissage.
- Analyse d'équité postflop Monte-Carlo en heads-up.
- Analyse stratégique postflop expérimentale par CFR+ avec rééchantillonnage des mains adverses et des runouts à chaque itération, arbre de décisions simplifié et estimation des EV par action.
- Mise en cache des ressources et des ranges pour une utilisation hors connexion après le premier chargement.
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

Les fichiers présents dans `assets/icons/` sont actuellement des emplacements réservés vides. Ils doivent être remplacés par de véritables images PNG avant de considérer les icônes PWA comme finalisées.

## Organisation du dépôt

```text
.
├── assets/
│   └── icons/                 Icônes PWA (emplacements réservés)
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
│   ├── modules/               Entraînement, ranges, leçons, puzzles et review
│   └── utils/                 Utilitaires partagés
├── tests/
│   └── ranges/                Tests des outils de conversion des ranges
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
- `js/modules/training.js` gère la configuration des parties, les actions du joueur et l'enchaînement des tours des bots.
- `js/components/navigation.js` gère la navigation entre les sections.
- `js/modules/ranges-viewer.js` et `js/modules/ranges-data.js` gèrent la consultation des ranges préflop.
- `js/modules/postflop-solver.js` estime l'équité contre une range adverse, utilise les matrices préflop lorsqu'un spot exact est disponible et ajuste heuristiquement les poids à partir des actions postflop observées et de leurs sizings. En l'absence du bundle, il conserve une range uniforme.
- `js/modules/cfr-core.js` contient le noyau CFR+ générique : regret matching+, pondération de stratégie moyenne, traversées contrefactuelles et contrôle de la signature ordonnée (type, label et sizing) des actions de chaque information set. Il est testé séparément sur Kuhn Poker et Matching Pennies, deux jeux à information imparfaite dont les propriétés d'équilibre sont connues.
- `js/modules/postflop-strategy.js` construit un arbre de décisions abstrait sur le flop, le turn et la river. Le moteur CFR+ échantillonne les ranges préflop des deux joueurs, conditionnées par leurs actions observées. La main réelle du héros est suréchantillonnée pour garantir l'apprentissage de son information set racine. Les ranges uniformes de secours restent indépendantes de sa main privée ; les bloqueurs sont appliqués après l'échantillonnage conjoint. Une pondération d'importance corrige ce biais et tient également compte du nombre pondéré de combinaisons adverses restantes après application des bloqueurs, afin de conserver la distribution jointe des deux ranges. L'effectif efficace des échantillons pondérés est reporté dans les détails du solveur. Les runouts sont rééchantillonnés à chaque itération. Le moteur valide la cohérence des montants, des contributions et des options d'action avec l'état de la partie, respecte les incréments de 0,5 jeton ainsi que la dernière relance complète et modélise jusqu'à quatre relances dans les réponses futures, tout en conservant les actions légales à la racine. Une seed optionnelle permet de reproduire exactement un calcul. Les EV sont évaluées sur un second jeu d'échantillons indépendants, avec erreur standard et intervalle de confiance à 95 % conditionnels à la stratégie apprise.
- `js/modules/postflop-solver-ui.js` construit un instantané versionné et expurgé des cartes adverses, transmis aux deux moteurs. La modale affiche les fréquences d'action et réserve les EV et les limites du modèle aux détails. L'historique transmet aussi les montants avant/après chaque action (pot, mise courante, contribution totale et stack), ainsi que les tailles exactes des mises et relances.

### Données de ranges

Les données de ranges préflop sont documentées dans [data/ranges/preflop/README.md](data/ranges/preflop/README.md). Le bundle compact utilisé par l'application est généré avec les outils de `tools/ranges/`.

Les sources privées ou archives personnelles ne doivent pas être ajoutées au dépôt. Les règles d'exclusion sont définies dans `.gitignore`.

## Tests et maintenance

Node.js est nécessaire pour exécuter les tests et les outils de données.

Lancer les tests existants :

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

Les tests couvrent les données de ranges, le moteur de jeu, les décisions et l'intégration des bots, l'historique des actions, les pots principal et secondaires, la conservation des jetons, le contrat d'entrée du solveur, l'isolation des cartes adverses, l'ajustement heuristique des ranges, le fallback hors ligne, les contraintes de mises et le moteur CFR+ (dont la reproductibilité par seed).

Lancer les tests du solveur postflop :

```powershell
node --test tests/game-engine.test.js tests/bot-engine.test.js tests/postflop-solver.test.js tests/postflop-strategy.test.js tests/cfr-core.test.js
```

La suite stratégique vérifie notamment les actions légales de l'arbre, les contraintes de tapis, les mises non couvertes, les transitions flop-turn-river, la normalisation des fréquences CFR+ et la convergence du noyau sur Kuhn Poker et Matching Pennies.

## Données locales et confidentialité

Les paramètres de l'application sont conservés dans le stockage local du navigateur. Les parties ne nécessitent pas de compte utilisateur ni de service distant.

Les cartes privatives des adversaires ne doivent pas être exposées à l'état public de la partie avant un showdown valide. Les cartes des joueurs ayant passé restent masquées.

## État du projet

PokerLab est en développement. Certaines sections de l'interface, notamment les tactiques, les leçons et la Game Review, peuvent encore contenir des espaces réservés ou des fonctionnalités incomplètes.

Le module SOLVE est intégré à la branche de développement. Son moteur stratégique reste expérimental : heads-up uniquement, tailles de mises abstraites (33 % et 75 % du pot, relance à 50 % du pot et tapis effectif), jusqu'à quatre relances dans les réponses modélisées par street (la racine respecte les droits réels du moteur) et nombre limité d'itérations/scénarios échantillonnés. Il ne calcule pas encore un équilibre GTO certifié et son exploitabilité n'est pas mesurée. Les résultats doivent être interprétés comme une approximation d'entraînement, pas comme une stratégie optimale garantie. La validation manuelle dans un navigateur et sur une session réelle reste nécessaire.
