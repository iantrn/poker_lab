# PokerLab — sauvegarde figée de la V1

Cette branche `v1-backup` conserve la **V1 historique (HTML, CSS et JavaScript natif)** de PokerLab, avant la migration vers React/TypeScript et Rust/WASM.

## Provenance et politique de conservation

- Point de départ exact : commit `96d0cb2029ffe83a80c5de435a094b95580f1b45` (dernière V1 pure).
- Seul ajout sur ce commit : ce document `README_V1_BACKUP.md`.
- **Branche figée : ne pas fusionner dans `main`, ne pas ajouter de commits et ne jamais supprimer cette branche.**
- La V2 et son déploiement GitHub Pages évoluent indépendamment sur `main`.
- Cette sauvegarde permet de consulter le comportement historique, de restaurer la V1 et de retrouver les tests V1.

## Retrouver la V1

Sur GitHub : https://github.com/iantrn/poker_lab/tree/v1-backup

Dans un nouveau dossier local :

```bash
git clone https://github.com/iantrn/poker_lab.git
cd poker_lab
git switch v1-backup
```

Pour revenir ponctuellement à cette version depuis un clone existant, exécuter `git fetch origin` puis `git switch v1-backup` (s'assurer d'abord de ne pas perdre les changements locaux).

## Servir la V1 localement

La V1 ne nécessite **aucune installation npm** pour être utilisée. Il faut en revanche un serveur HTTP ; ne pas ouvrir `index.html` en `file://`.

Depuis la racine du dépôt sur la branche `v1-backup` :

```bash
npx serve .
```

Ouvrir l'adresse locale indiquée par la commande (souvent `http://localhost:3000`).

Autre solution sans `npx`, si Python est installé :

```bash
python3 -m http.server 8000
```

Ouvrir alors `http://localhost:8000/`.

## Vérifier les tests V1

Depuis la racine, avec Node.js installé :

```bash
node --test tests/*.test.js tests/*.test.mjs tests/ranges/*.test.mjs
```

Les résultats dépendent de l'environnement d'exécution ; ce README ne prétend pas qu'ils ont été exécutés au moment de sa création.

## Repères

- Application : `index.html`, `js/`, `css/`.
- Hors ligne : `service-worker.js`, `manifest.json`, `assets/`.
- Solveur V1 : `pokerlab-solver-worker.js`, `pokerlab-solver-worker-v2.js` (si présent à ce commit), `js/modules/`.
- Tests : `tests/`.
- Ranges : `data/ranges/`.

Pour restaurer la V1, partir de cette branche dans une **nouvelle branche de travail et une pull request** ; ne jamais modifier directement `main` ni `v1-backup`.
