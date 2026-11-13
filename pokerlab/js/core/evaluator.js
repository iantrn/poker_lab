
/* =========================================================
   POKERLAB - HAND EVALUATOR
   Version : 1.0.0
   Description : Évaluation et comparaison des mains
   Texas Hold'em No-Limit
   ========================================================= */

"use strict";


/* =========================================================
   1. CATÉGORIES DE MAINS
   ========================================================= */

const POKER_HAND_CATEGORIES = [

    {
        value: 0,
        key: "high_card",
        label: "Carte haute"
    },

    {
        value: 1,
        key: "one_pair",
        label: "Paire"
    },

    {
        value: 2,
        key: "two_pair",
        label: "Double paire"
    },

    {
        value: 3,
        key: "three_of_a_kind",
        label: "Brelan"
    },

    {
        value: 4,
        key: "straight",
        label: "Quinte"
    },

    {
        value: 5,
        key: "flush",
        label: "Couleur"
    },

    {
        value: 6,
        key: "full_house",
        label: "Full"
    },

    {
        value: 7,
        key: "four_of_a_kind",
        label: "Carré"
    },

    {
        value: 8,
        key: "straight_flush",
        label: "Quinte flush"
    },

    {
        value: 9,
        key: "royal_flush",
        label: "Quinte flush royale"
    }

];


/* =========================================================
   2. OUTILS DE VALIDATION
   ========================================================= */

const PokerLabHandEvaluator = {


    validateCards(cards) {

        if (!Array.isArray(cards)) {

            throw new Error(
                "Les cartes doivent être fournies sous forme de tableau."
            );

        }

        if (cards.length < 5 || cards.length > 7) {

            throw new Error(
                "Une main doit contenir entre 5 et 7 cartes."
            );

        }

        const validSuits = [
            "clubs",
            "diamonds",
            "hearts",
            "spades"
        ];

        const identifiers = new Set();

        for (const card of cards) {

            if (!card || typeof card !== "object") {

                throw new Error(
                    "Une carte fournie est invalide."
                );

            }

            if (
                !Number.isInteger(card.value) ||
                card.value < 2 ||
                card.value > 14
            ) {

                throw new Error(
                    "Valeur de carte invalide."
                );

            }

            if (!validSuits.includes(card.suit)) {

                throw new Error(
                    "Couleur de carte invalide."
                );

            }

            const identifier =
                `${card.value}_${card.suit}`;

            if (identifiers.has(identifier)) {

                throw new Error(
                    "La main contient une carte en double."
                );

            }

            identifiers.add(identifier);

        }

        return true;

    },


    getCategory(value) {

        return POKER_HAND_CATEGORIES.find(
            (category) => category.value === value
        );

    },


    getRankLabel(value) {

        const labels = {

            14: "As",
            13: "Roi",
            12: "Dame",
            11: "Valet",
            10: "Dix",
            9: "Neuf",
            8: "Huit",
            7: "Sept",
            6: "Six",
            5: "Cinq",
            4: "Quatre",
            3: "Trois",
            2: "Deux"

        };

        return labels[value] || "Inconnue";

    },


    sortCardsDescending(cards) {

        return [...cards].sort(
            (a, b) => b.value - a.value
        );

    },


    /* =====================================================
       3. RECHERCHE DES QUINTES
       ===================================================== */

    findStraight(values) {

        const uniqueValues = [
            ...new Set(values)
        ].sort(
            (a, b) => b - a
        );

        // L'As peut également servir de carte basse.

        if (uniqueValues.includes(14)) {

            uniqueValues.push(1);

        }

        let consecutiveCount = 1;

        for (
            let i = 0;
            i < uniqueValues.length - 1;
            i++
        ) {

            if (
                uniqueValues[i] - 1 ===
                uniqueValues[i + 1]
            ) {

                consecutiveCount++;

                if (consecutiveCount === 5) {

                    // La première valeur est la carte haute.

                    return uniqueValues[i - 3];

                }

            } else {

                consecutiveCount = 1;

            }

        }

        return null;

    },


    /* =====================================================
       4. ÉVALUATION D'UNE COMBINAISON DE 5 CARTES
       ===================================================== */

    evaluateFiveCards(cards) {

        if (cards.length !== 5) {

            throw new Error(
                "Cette fonction nécessite exactement 5 cartes."
            );

        }

        const sortedCards =
            this.sortCardsDescending(cards);

        const values = sortedCards.map(
            (card) => card.value
        );

        // Comptage des occurrences de chaque valeur.

        const counts = new Map();

        for (const value of values) {

            counts.set(
                value,
                (counts.get(value) || 0) + 1
            );

        }

        // Classement des groupes :
        // d'abord par nombre d'occurrences,
        // puis par valeur décroissante.

        const groups = [...counts.entries()].sort(
            (a, b) => {

                return (
                    b[1] - a[1] ||
                    b[0] - a[0]
                );

            }
        );

        const isFlush = sortedCards.every(
            (card) => card.suit === sortedCards[0].suit
        );

        const straightHighCard =
            this.findStraight(values);

        const isStraight =
            straightHighCard !== null;


        // 1. QUINTE FLUSH ROYALE

        if (
            isFlush &&
            isStraight &&
            straightHighCard === 14
        ) {

            return {

                category: 9,

                score: [9, 14],

                cards: sortedCards

            };

        }


        // 2. QUINTE FLUSH

        if (isFlush && isStraight) {

            return {

                category: 8,

                score: [8, straightHighCard],

                cards: sortedCards

            };

        }


        // 3. CARRÉ

        if (groups[0][1] === 4) {

            const fourValue = groups[0][0];

            const kicker = groups[1][0];

            return {

                category: 7,

                score: [
                    7,
                    fourValue,
                    kicker
                ],

                cards: sortedCards

            };

        }


        // 4. FULL

        if (
            groups[0][1] === 3 &&
            groups[1][1] === 2
        ) {

            return {

                category: 6,

                score: [
                    6,
                    groups[0][0],
                    groups[1][0]
                ],

                cards: sortedCards

            };

        }


        // 5. COULEUR

        if (isFlush) {

            return {

                category: 5,

                score: [
                    5,
                    ...values
                ],

                cards: sortedCards

            };

        }


        // 6. QUINTE

        if (isStraight) {

            return {

                category: 4,

                score: [
                    4,
                    straightHighCard
                ],

                cards: sortedCards

            };

        }


        // 7. BRELAN

        if (groups[0][1] === 3) {

            const kickers = groups
                .slice(1)
                .map((group) => group[0])
                .sort((a, b) => b - a);

            return {

                category: 3,

                score: [
                    3,
                    groups[0][0],
                    ...kickers
                ],

                cards: sortedCards

            };

        }


        // 8. DOUBLE PAIRE

        if (
            groups[0][1] === 2 &&
            groups[1][1] === 2
        ) {

            const highPair = Math.max(
                groups[0][0],
                groups[1][0]
            );

            const lowPair = Math.min(
                groups[0][0],
                groups[1][0]
            );

            const kicker = groups[2][0];

            return {

                category: 2,

                score: [
                    2,
                    highPair,
                    lowPair,
                    kicker
                ],

                cards: sortedCards

            };

        }


        // 9. PAIRE

        if (groups[0][1] === 2) {

            const kickers = groups
                .slice(1)
                .map((group) => group[0])
                .sort((a, b) => b - a);

            return {

                category: 1,

                score: [
                    1,
                    groups[0][0],
                    ...kickers
                ],

                cards: sortedCards

            };

        }


        // 10. CARTE HAUTE

        return {

            category: 0,

            score: [
                0,
                ...values
            ],

            cards: sortedCards

        };

    },


    /* =====================================================
       5. GÉNÉRATION DES COMBINAISONS DE 5 CARTES
       ===================================================== */

    generateCombinations(cards, combinationSize = 5) {

        const combinations = [];

        function generate(startIndex, currentCombination) {

            if (
                currentCombination.length === combinationSize
            ) {

                combinations.push([
                    ...currentCombination
                ]);

                return;

            }

            const missingCards =
                combinationSize - currentCombination.length;

            for (
                let i = startIndex;
                i <= cards.length - missingCards;
                i++
            ) {

                currentCombination.push(cards[i]);

                generate(
                    i + 1,
                    currentCombination
                );

                currentCombination.pop();

            }

        }

        generate(0, []);

        return combinations;

    },


    /* =====================================================
       6. COMPARAISON DES SCORES
       ===================================================== */

    compareScores(scoreA, scoreB) {

        const maxLength = Math.max(
            scoreA.length,
            scoreB.length
        );

        for (let i = 0; i < maxLength; i++) {

            const valueA = scoreA[i] ?? 0;

            const valueB = scoreB[i] ?? 0;

            if (valueA > valueB) {
                return 1;
            }

            if (valueA < valueB) {
                return -1;
            }

        }

        return 0;

    },


    /* =====================================================
       7. ÉVALUATION COMPLÈTE DE 5 À 7 CARTES
       ===================================================== */

    evaluate(cards) {

        this.validateCards(cards);

        const combinations =
            this.generateCombinations(cards, 5);

        let bestResult = null;

        for (const combination of combinations) {

            const result =
                this.evaluateFiveCards(combination);

            if (
                bestResult === null ||
                this.compareScores(
                    result.score,
                    bestResult.score
                ) > 0
            ) {

                bestResult = result;

            }

        }

        const category =
            this.getCategory(bestResult.category);

        return {

            category: bestResult.category,

            categoryKey: category.key,

            categoryLabel: category.label,

            score: [...bestResult.score],

            bestFiveCards: [
                ...bestResult.cards
            ],

            description:
                this.getDescription(bestResult)

        };

    },


    /* =====================================================
       8. DESCRIPTION LISIBLE D'UNE MAIN
       ===================================================== */

    getDescription(result) {

        const category = result.category;

        const score = result.score;

        const rankName = (value) => {

            return this.getRankLabel(value);

        };


        switch (category) {

            case 9:
                return "Quinte flush royale";

            case 8:
                return (
                    "Quinte flush au " +
                    rankName(score[1])
                );

            case 7:
                return (
                    "Carré de " +
                    rankName(score[1]) +
                    "s"
                );

            case 6:
                return (
                    "Full aux " +
                    rankName(score[1]) +
                    "s par les " +
                    rankName(score[2]) +
                    "s"
                );

            case 5:
                return (
                    "Couleur au " +
                    rankName(score[1])
                );

            case 4:
                return (
                    "Quinte au " +
                    rankName(score[1])
                );

            case 3:
                return (
                    "Brelan de " +
                    rankName(score[1]) +
                    "s"
                );

            case 2:
                return (
                    "Deux paires : " +
                    rankName(score[1]) +
                    "s et " +
                    rankName(score[2]) +
                    "s"
                );

            case 1:
                return (
                    "Paire de " +
                    rankName(score[1]) +
                    "s"
                );

            default:
                return (
                    "Carte haute : " +
                    rankName(score[1])
                );

        }

    },


    /* =====================================================
       9. COMPARAISON DE DEUX MAINS
       ===================================================== */

    compareHands(handA, handB) {

        const resultA = Array.isArray(handA)
            ? this.evaluate(handA)
            : handA;

        const resultB = Array.isArray(handB)
            ? this.evaluate(handB)
            : handB;

        if (
            !resultA ||
            !Array.isArray(resultA.score) ||
            !resultB ||
            !Array.isArray(resultB.score)
        ) {

            throw new Error(
                "Impossible de comparer ces mains."
            );

        }

        return this.compareScores(
            resultA.score,
            resultB.score
        );

    },


    /* =====================================================
       10. IDENTIFICATION DU GAGNANT
       ===================================================== */

    findWinners(players) {

        if (
            !Array.isArray(players) ||
            players.length === 0
        ) {

            throw new Error(
                "La liste des joueurs est vide ou invalide."
            );

        }

        const evaluatedPlayers = players.map(
            (player) => {

                if (!player || !Array.isArray(player.cards)) {

                    throw new Error(
                        "Un joueur possède une main invalide."
                    );

                }

                return {

                    player,

                    evaluation: this.evaluate(
                        player.cards
                    )

                };

            }
        );

        let bestScore = null;

        const winners = [];

        for (const item of evaluatedPlayers) {

            const comparison = bestScore === null
                ? 1
                : this.compareScores(
                    item.evaluation.score,
                    bestScore
                );

            if (comparison > 0) {

                bestScore = item.evaluation.score;

                winners.length = 0;

                winners.push(item);

            } else if (comparison === 0) {

                winners.push(item);

            }

        }

        return {

            winners,

            isTie: winners.length > 1,

            winningScore: [...bestScore],

            evaluations: evaluatedPlayers

        };

    }

};


/* =========================================================
   11. EXPORT DU MODULE
   ========================================================= */

window.PokerLabHandEvaluator = PokerLabHandEvaluator;
