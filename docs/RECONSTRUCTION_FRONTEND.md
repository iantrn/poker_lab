# Reconstruction du frontend de PokerLab

La base fonctionnelle est Nocturne, commit `288fdd3`. Elle contient les 53 commits postérieurs à `main` (`23a1dbf`). Les deux références sont figées dans le test de comparaison.

| Parcours | Nouvelle composition | Liaison fonctionnelle et contrôle |
| --- | --- | --- |
| Navigation et accueil | Barre horizontale sur grand écran, navigation inférieure sur téléphone. L’accueil donne accès à la configuration, puis à trois activités d’étude. | Liens par hash, indication de la page active, rechargement d’un lien direct. |
| Jouer | Configuration en ligne, notes sur les blinds en dessous. La scène utilise des points d’ancrage calculés selon les sièges occupés. Les options de table sont accessibles dans l’angle supérieur droit. | Démarrage de sessions à deux et six, positions de deux à six joueurs, mises en BB, actions autorisées et passage à la main suivante. |
| Décision et résultat | Board au-dessus du pot, état du tour dans l’en-tête, mise supplémentaire et total de relance près du curseur. Commandes à côté du tapis sur iPad paysage. | Valeurs issues de l’état moteur, visibilité des cartes, pots partagés et distribution vérifiés par les tests navigateur. |
| Exercices | Choix de la catégorie et du niveau à côté de l’énoncé, réponses puis explication dans le même espace. | Les trois versions ouvrent le même exercice AQs au bouton et sélectionnent la même ouverture. |
| Leçons | Sommaire avec titres activables et statut de progression, lecteur dédié, raccourci clavier et tactile vers les ranges. | Ouverture et complétion par le module pédagogique existant. |
| Ranges | Choix du spot avant la matrice. La main sélectionnée apparaît dans son en-tête. | Matrice de 169 mains et fréquences fournies par le modèle existant. Sélection au toucher et indication accessible. |
| Solveur | Stratégie et équité dans la même zone de résultat. Les détails du calcul se déplient dans le dialogue. | L’analyse part du tour réel du héros après le flop et utilise le worker habituel. |
| Historique | Index des mains, board et chronologie de la décision. L’effectif et les stacks se déplient à la demande. | Le test navigateur rejoint la main précédemment jouée depuis son historique local. |
| Paramètres | Réglage des animations puis informations de l’application. | Préférence locale, rechargement hors ligne et respect de la réduction des mouvements du système. |

## Architecture

`main.tsx` monte les vues React. `AppShell` fournit les destinations et les six points de montage. Les contrôleurs de session, de cours, de tactiques et d’historique alimentent les vues à travers les attributs `data-*`. Le rendu de table projette les sièges, les cartes et les mises depuis l’état de la partie. Les modules de ranges et de solveur affichent les résultats de leurs modèles.

## Reproduire la revue

Le job de validation construit trois versions de production et les sert sous le même chemin que GitHub Pages. Dans l’archive **pokerlab-ui-review**, ouvrir **comparaison/index.html**. Les colonnes suivent l’ordre main, Nocturne, reconstruction. Cliquer sur une capture pour lire les montants à pleine résolution et cocher « Niveaux de gris » pour comparer la hiérarchie.

Les vues comparées comprennent l’accueil, la configuration, les options de table, la table à six, l’exercice après réponse, le résultat du solveur et ses détails. Les trois formats comparatifs sont 1366 × 768, 1080 × 810 et 390 × 844. Le test fixe le tirage uniquement dans le navigateur de comparaison et vérifie le board, la main du héros, les stacks et les mises avant d’accepter les captures. Les positions et les montants proviennent du moteur.

Le test de mise à jour installe chaque ancienne PWA sur une origine locale, sert la reconstruction sur cette même origine, actualise le service worker puis recharge hors ligne. Les tests Chromium et WebKit couvrent les parcours, les dimensions de table et le stockage. Les essais sur tablette et téléphone utilisent des fenêtres émulées.
