# Pipeline de données préflop

## Objectif

Le pipeline sépare l'import brut, la normalisation, la validation et l'exploitation par l'application.

```text
Archive / fichiers source
        |
        v
Import local (non versionné)
        |
        v
convert-artgto.mjs
        |
        v
JSON normalisé (combos physiques + agrégat 169 classes)
        |
        v
validate-range.mjs + tests
        |
        v
catalog/index.json
        |
        v
PokerLabRangesData (runtime navigateur)
        |
        v
Matrice RANGES / sélection du spot depuis l'historique du coup
```

## Importer tout un dossier organisé par position

```bash
node tools/ranges/import-directory.mjs \
  --input-dir ./private-source/ranges \
  --output-dir ./private-ranges \
  --source-id artgto-personal-archive
```

Le script crée `normalized/<position>/*.json` et `catalog/index.json`. Les entrées sont `pending-review` : elles ne sont pas sélectionnables par le runtime tant que les métadonnées du spot n'ont pas été vérifiées et passées à `ready`. `private-ranges/` doit rester hors du dépôt public.

## Convertir un fichier

```bash
node tools/ranges/convert-artgto.mjs \
  --input ./private-source/utg/UTG_RFI.txt \
  --output ./data/ranges/preflop/normalized/utg-rfi.json \
  --folder-position utg \
  --source-id artgto-personal-archive
```

Les options `--format`, `--table-size` et `--effective-stack-bb` peuvent renseigner les hypothèses lorsqu'elles sont réellement connues. Sinon elles restent `unknown` / `null`.

## Valider un JSON

```bash
node tools/ranges/validate-range.mjs ./data/ranges/preflop/normalized/utg-rfi.json
node --test tests/ranges/*.test.mjs
```

## Conventions de conversion observées dans les TXT ART/GTO

- `[x.xx]combo1, combo2[/x.xx]` : chacue combo du bloc reçoit `x.xx %`.
- Les combos listés hors bloc sont interprétés à `100 %` par le convertisseur.
- Un fichier vide produit une range vide (aucun combo listé), pas une range inconnue.
- Une combinaison physique est une paire de cartes distinctes, par exemple `AsKh`.
- La fréquence est stockée en fraction dans le JSON (`0.25` = 25 %).
- Les combos absents sont stockés implicitement à 0 ; les 169 classes sont agrégées sur leurs 4, 6 ou 12 combos possibles, y compris les combos absents.
- Le convertisseur refuse les combos invalides, les doublons et les fréquences incohérentes.

**Hypothèse à confirmer avec la documentation de la source :** les combos non encadrés représentent bien 100 % et les combos absents 0 %. Le convertisseur conserve cette convention dans ses métadonnées afin qu'elle ne soit pas silencieuse.

## Interprétation des spots

Le nom du fichier est conservé intégralement. `actorCode` et `actionCode` sont extraits de façon conservatrice depuis le préfixe, mais les tokens restants ne sont pas transformés automatiquement en arbre d'actions. Une couche de mapping explicite sera nécessaire pour relier chaque spot au format de l'historique PokerLab.

Les noms ART/GTO (`MP`, `BU`) et ceux éventuellement utilisés par PokerLab (`HJ`, `BTN`) ne doivent pas être fusionnés sans règle de mapping validée.

## Séparation des données et des droits

Ne pas ajouter les archives ART/GTO | ce dépôt public. Le code du convertisseur est générique ; les données source et les JSON issus de ces données restent exclus du dépôt tant que l'usage dans le logiciel et le mode de déploiement ne sont pas confirmés par écrit. Le passage à un dépôt privé ne remplace pas une autorisation du titulaire des droits.