# Minuit Cuivre — design system et périmètre de la refonte

## Identité validée
Palette utilisateur : **Minuit Cuivre**.
Base #101015, fond secondaire #1C1B23, surface #26232A, tapis #242B3A,
primaire cuivre #CBA46B, accent clair #E7BD82, texte #F8F0E4.
Le cuivre est réservé au focus, à l'action principale et à la hiérarchie ;
les couleurs Fold/Check/Call/Raise/All-in conservent des libellés textuels.

## Architecture de présentation
Le fichier \`frontend/src/styles/minuit-cuivre.css\` est l'unique couche
de design de la refonte, importée en dernier par \`main.tsx\`. Il prend
le pas sur les feuilles héritées sans retoucher les composants et modules
qui portent le comportement métier. Les anciens fichiers de styles sont
conservés durant cette phase pour faciliter la comparaison et les tests de
caractérisation ; ils ne constituent **pas** la référence visuelle finale.

## Contrats fonctionnels préservés
| Fonctionnalité | Point d'intégration conservé | Contrôle |
|---|---|---|
| Navigation | AppShell \`data-page\` / \`data-module\` | navigation React, hashes |
| Parties 2 à 6 | \`#training-table\` / engine TS | smoke tests, invariants |
| Config, départ, reset, arrêt | \`data-training-*\` | source-contract et browser |
| Cartes, stacks, fold, positions, mises | \`components/table.ts\` | browser-smoke et cartes |
| Flop/turn/river/showdown | animation du rendu TS conservée | smoke tests |
| Solveur multi-street, Worker, Rust/WASM | \`solver/\`, \`workers/\` | parity/CI |
| Exercices | \`data-puzzle-*\` | source-contract/browser |
| Leçons, progrès, ranges | \`data-lessons-*\`, \`data-ranges-viewer\` | source-contract |
| Game Review, historique | \`data-review-*\` | source-contract |
| Paramètres et stockage | \`#settings-content\`, \`storage/\` | storage tests |
| PWA, cache, installation | \`vite.config.ts\`, manifeste, Workbox | PWA/offline smoke |

La page des paramètres conserve son texte actuel : aucun contrôle
factice n'est ajouté pour embellir l'interface.

## Règles UI
- Aucune pile de jetons, publicité, monnaie virtuelle, chat ou microtransaction.
- Pas de nouvelles propriétés métier ni de résultats GTO simulés.
- Table desktop/tablette à hauteur bornée, actions accessibles après la table.
- Responsive 320px+, 375, 390, 768/1024, 1366 et 1920 ; vérifications
  de rendu réel impératives avant d'affirmer qu'aucun élément ne chevauche.
- Animations existantes préservées, réglage système reduced motion honoré.
- WCAG 2.2 : focus visible, contraste texte à vérifier sur chaque état,
  actions lisibles sans s'appuyer exclusivement sur la couleur.
- Hors ligne : aucune nouvelle police, icône ou ressource CDN.
- \`main\` ne doit jamais être modifiée par ce chantier avant autorisation.

## Vérifications
Le CI de la branche \`feature/pokerlab-complete-ui-redesign\` lance
Rust, parités WASM, tests TypeScript, build Vite, PWA, Chromium/WebKit,
et les captures de revue. Si GitHub Actions n'aboutit pas, indiquer
explicitement les tests non validés. Les captures exigent examen visuel :
un test statique ne prouve pas un rendu responsive correct.

## Identité installable
Les icônes PWA `assets/icons/icon-192.png`, `icon-512.png` et
`apple-touch-icon.png` ont été recréées en cuivre et anthracite pour
s'accorder avec la marque SVG. Elles sont rasterisées et intégrées aux
ressources locales, sans CDN ni modification de la logique d'installation.
