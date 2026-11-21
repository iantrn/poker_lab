# PokerLab — Refonte structurelle (Minuit Cuivre)

## Pourquoi ce chantier

La première livraison « Minuit Cuivre » utilisait surtout une surcharge CSS,
sans remplacer la composition de l'application. Cette branche met en œuvre
une reconstruction effective des vues React et de la géométrie de la table
avec des points d'intégration conservés.

## Architecture visuelle

| Vue | Ancienne structure | Nouvelle structure | Contrat préservé |
| --- | --- | --- | --- |
| Application | Entête horizontal + un contenu pleine largeur | Rail latéral dès 1380px, entête compact en dessous, barre mobile | Tous les \`data-page\`, \`data-module\`, IDs de navigation |
| Accueil | Liste de liens dans une grille | Hero éditorial scindé, aperçu de table HTML/CSS local, modules hiérarchisés | Navigation par \`PokerLabNavigation\` |
| Jouer (configuration) | Quatre champs puis informations | Formulaire de session + panneau de préparation séparés | \`data-training-setting\` et \`data-training-action\` |
| Jouer (partie) | Table + commandes sous la table | Table et commandes côte à côte desktop/tablette paysage | \`#training-table\`, \`#training-actions\`, solveur |
| Tapis et joueurs | Deux rangées horizontales | Répartition elliptique : 3 en haut, 2 sur les côtés, héros en bas | Moteur, ordre des positions, blinds, mise, états et cartes inchangés |
| Exercice | Filtres au-dessus des questions | Barre de sélection à gauche + zone d'exercice | \`data-puzzle-*\` |
| Apprentissage | Catalogue, détail et ranges empilés | Catalogue à gauche, lecteur à droite, ranges en section autonome | \`data-lessons-*\`, \`data-ranges-viewer\` |
| Game Review | Historique / détail en colonnes génériques | Rail d'historique défilant + espace d'analyse large | \`data-review-history\`, \`data-review-detail\` |
| Paramètres | Message statique | Vue d'information + véritable conteneur de préférences | \`#settings-content\`; aucune option fictive |

## Tableau de protection fonctionnelle

| Domaine | Source métier conservée | Test |
| --- | --- | --- |
| Règles NLH, bots, mise/all-in, pots et showdown | \`frontend/src/core\`, \`frontend/src/training/session.ts\` | suites TypeScript, navigateur, Rust |
| Cartes natives et animations flop/turn/river | \`frontend/src/components/table.ts\` (présentation seulement) | contrat source et smoke Chromium/WebKit |
| Solveur et Worker multi-street | \`frontend/src/solver\`, \`frontend/src/workers\`, \`engine\` | parités WASM, benchmarks, tests Worker |
| Config et actions | \`frontend/src/training/session.ts\` | champs/commandes dans browser smoke |
| Exercices et progression | \`frontend/src/training/puzzles.ts\` | source contract, browser smoke |
| Leçons et matrices | \`frontend/src/training/lessons.ts\`, \`frontend/src/ranges\` | range tests, browser smoke |
| Game Review / persistance | \`frontend/src/training/game-review.ts\` | browser smoke, stockage |
| Installation PWA, hors ligne | VitePWA/Workbox, ressources locales | tests PWA, browser offline |

## Contrôles QA

- Largeurs 320, 390, 768, 1024, 1080, 1180, 1365, 1600 et 1920
  (la couverture automatique valide principalement 320, 390, 768, 1024,
  1080, 1180 et 1365, captures additionnelles à 1600).
- Assertions géométriques : capsules non superposées, tapis, cartes, indices
  d'état Fold, main, solveur, absence de scroll horizontal.
- Contrôles comportementaux : actions réelles, showdown, exercices,
  matrices, stockage, mode hors ligne et navigation.
- Tests WebKit pour les contraintes Safari/iPad.
- La capture d'écran valide le rendu dans le viewport capturé seulement,
  pas toutes les tailles ni toutes les situations possibles.

Les fonctionnalités métier existantes n'ont pas été retirées ; ce document
ne prétend pas certifier la stratégie GTO ni l'accessibilité exhaustive.

## Déploiement

Branche isolée : \`feature/pokerlab-structural-redesign\`.
PR en brouillon. **Ne pas fusionner dans \`main\` avant autorisation explicite.**
