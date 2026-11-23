# PokerLab — Nocturne / reconstruction de la présentation

Palette approuvée : Nocturne A. Base de comparaison : `main` à `23a1dbfbf6ca82abe022662ca557b44d1d7a90d9`. Branche isolée : `feature/pokerlab-complete-ui-redesign`. Pull request #39 en brouillon : aucune fusion autorisée avant accord explicite.

## Nouvelle architecture

- React : AppShell, six vues, primitives, iconographie et RangeMatrix réécrits.
- Présentation : `nocturne.css` (structure et tokens), `nocturne-controls.css` (champs, menus, exercices, cours, historique, matrices, dialogues), `nocturne-table.css` (géométrie, sièges, cartes, mises, commandes, animations).
- Ponts existants : data-module/data-page, data-training-*, data-puzzle-*, data-lessons-*, data-ranges-viewer, data-review-*, IDs de la table et dock du solveur.
- Moteurs : core, bots, solver, workers, engine Rust/WASM, stockage et données consommés sans changement d'algorithme.
- Modules TypeScript mêlant présentation et métier : modifications limitées aux fonctions de rendu, attributs sémantiques et composition du DOM.
- PWA : mêmes mécanismes d'installation, Workbox, scope, ressources locales et manifeste ; uniquement le fond visuel et les quatre marques graphiques changent.

## Cartographie

| Vue / composant | Avant | Après | Contrat préservé |
|---|---|---|---|
| Coque | Entête + rail selon largeur | Rail Nocturne permanent, rail compact, navigation mobile | Navigation par hash et événements existants |
| Accueil | Grille de cartes et aperçu de table | Composition éditoriale et liste de destinations ordonnée | Accès aux six modules |
| Jouer | Ancien cockpit, styles superposés | Config native, scène à géométrie calculée, commandes séparées | 2–6 joueurs, mode, niveau, stacks, actions, mise |
| Cartes et avatars | Deck et pictogrammes historiques | Nouveau deck, dos à monogramme, avatar redessiné | Visibilité légale des cartes, valeurs, suits, labels |
| Résultats | Modal historique | Nouveau traitement du dialogue natif et des gains | Pots, split, jetons impairs, prochaine main |
| Tactiques | Colonne de filtres et choix plats | Barre de filtres, décisions numérotées et résultat | Données, filtrage, réponses, statistiques |
| Cours | Anciennes cartes et détail | Lecteur éditorial et catalogue indépendant | Progression, ouverture, complétion |
| Ranges | Ancienne matrice et filtres | Matrice et sélection distinctes, cellules à remplissage réel | 169 mains, fréquence, focus, préférences |
| Solveur | Liste de taux et détails | Équité mise en évidence, fréquences d'action et détails | Résultats réels, pré-calculs, invalidation d'état |
| Review | Ancien panneau et texte brut | Timeline de décisions, cartes communes, historique | Sauvegarde, accès aux mains, analyse existante |
| Paramètres | Panneau dans l'ancien layout | Liste de sections sobre ; pas d'options fictives | Conteneur de préférences existant |
| Marque | Logo et icônes précédents | Nouveau monogramme Nocturne, PNG 180/192/512 | Dimensions PWA et fichiers locaux |

## Retrait des styles

Supprimés : `style.css`, `design-system.css`, `poker-table.css`, `poker-table-immersive.css`, `minuit-cuivre.css`, `structural-redesign.css`. Les utilitaires neutres et Tailwind namespacé restent disponibles pour les contrats techniques ; leurs couleurs de base suivent les tokens Nocturne. Les anciens styles ne sont pas importés.

## Protection fonctionnelle et QA

Les cas de test existants concernant les actions, les fréquences, les montants, le showdown, les cartes cachées, les transitions de streets, les NAV, les données et le PWA sont conservés. Les tests de contrat qui exigeaient les anciens fichiers CSS ou des dimensions historiques sont adaptés à la nouvelle architecture. Les tests navigateur couvrent en supplément les projections de 2 à 6 joueurs aux résolutions 1920×1080, 1366×768, 1024×768, 768×1024, 390×844 et 375×667 ; le scénario 320 px est aussi conservé.

Le statut réel des validations est fourni par les runs GitHub Actions de la PR #39 (Rust, TypeScript, WASM, parité, Chromium, WebKit, persistance et mode hors ligne). Une capture n'est pas une preuve de fonctionnement complet, et aucune certification GTO n'est revendiquée. Ne pas fusionner avant réussite des contrôles et validation finale explicite.
