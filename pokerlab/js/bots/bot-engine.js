
/* =========================================================
   POKERLAB - BOT ENGINE
   Version : 1.1.0
   Description : Moteur décisionnel des adversaires
   ========================================================= */

(function () {
    "use strict";

    const DEFAULT_PROFILE = "balanced";
    const DEFAULT_DIFFICULTY = "medium";

    /* =====================================================
       1. OUTILS GÉNÉRAUX
       ===================================================== */

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    function toNumber(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number)
            ? number
            : fallback;
    }

    /* =====================================================
       2. ÉVALUATION PRÉFLOP
       ===================================================== */

    function evaluatePreflop(cards) {
        if (!Array.isArray(cards) || cards.length !== 2) {
            return 0;
        }

        const first = cards[0];
        const second = cards[1];

        if (
            !first ||
            !second ||
            !Number.isFinite(first.value) ||
            !Number.isFinite(second.value)
        ) {
            return 0;
        }

        const high = Math.max(first.value, second.value);
        const low = Math.min(first.value, second.value);

        const pair = high === low;
        const suited = first.suit === second.suit;
        const gap = high - low;

        if (pair) {
            return clamp(
                0.48 + (high - 2) * 0.035,
                0,
                0.92
            );
        }

        let strength =
            (high / 14) * 0.34 +
            (low / 14) * 0.24;

        if (suited) {
            strength += 0.07;
        }

        if (gap === 1) {
            strength += 0.08;
        } else if (gap === 2) {
            strength += 0.045;
        } else if (gap === 3) {
            strength += 0.015;
        } else if (gap >= 5) {
            strength -= 0.06;
        }

        if (high >= 12 && low >= 10) {
            strength += 0.08;
        }

        if (high === 14) {
            strength += 0.035;
        }

        return clamp(strength, 0.05, 0.90);
    }

    /* =====================================================
       3. ÉVALUATION POSTFLOP
       ===================================================== */

    function extractCategory(result) {
        if (typeof result === "number") {
            return result;
        }

        if (Array.isArray(result)) {
            return typeof result[0] === "number"
                ? result[0]
                : null;
        }

        if (!result || typeof result !== "object") {
            return null;
        }

        // L'évaluateur PokerLab retourne normalement
        // un score dont le premier élément représente
        // la catégorie de combinaison.

        if (
            Array.isArray(result.score) &&
            typeof result.score[0] === "number"
        ) {
            return result.score[0];
        }

        const possibleKeys = [
            "category",
            "rank",
            "handRank",
            "type",
            "value"
        ];

        for (const key of possibleKeys) {
            const value = result[key];

            if (typeof value === "number") {
                return value;
            }

            if (
                Array.isArray(value) &&
                typeof value[0] === "number"
            ) {
                return value[0];
            }
        }

        return null;
    }

    function evaluatePostflop(holeCards, communityCards) {
        const allCards = [
            ...holeCards,
            ...communityCards
        ];

        if (allCards.length < 5) {
            return evaluatePreflop(holeCards);
        }

        const evaluator = window.PokerLabHandEvaluator;

        if (
            !evaluator ||
            typeof evaluator.evaluate !== "function"
        ) {
            return evaluatePreflop(holeCards);
        }

        try {
            const result = evaluator.evaluate(allCards);
            const category = extractCategory(result);

            if (
                category === null ||
                category < 0 ||
                category > 9
            ) {
                return evaluatePreflop(holeCards);
            }

            /*
             * Estimation simplifiée de la force.
             *
             * Les catégories sont ordonnées de 0 à 9 :
             * 0 : carte haute
             * 1 : paire
             * 2 : double paire
             * 3 : brelan
             * 4 : quinte
             * 5 : couleur
             * 6 : full
             * 7 : carré
             * 8 : quinte flush
             * 9 : quinte flush royale
             *
             * Cette estimation n'est pas une équité GTO.
             */

            const categoryStrength = [
                0.24,
                0.40,
                0.56,
                0.68,
                0.78,
                0.84,
                0.91,
                0.96,
                0.985,
                0.995
            ];

            let strength = categoryStrength[category];

            // Petite prise en compte des kickers.
            // Leur poids reste limité afin de ne pas
            // surestimer leur influence.

            if (
                result &&
                Array.isArray(result.score) &&
                result.score.length > 1
            ) {
                const kickerValues =
                    result.score.slice(1);

                const kickerSum = kickerValues.reduce(
                    (total, value) => {
                        return total +
                            (Number.isFinite(value) ? value : 0);
                    },
                    0
                );

                const kickerAdjustment = clamp(
                    kickerSum / 1000,
                    0,
                    0.025
                );

                strength += kickerAdjustment;
            }

            return clamp(strength, 0.05, 0.995);

        } catch (error) {
            console.warn(
                "[PokerLab Bot] Évaluation postflop impossible :",
                error
            );

            return evaluatePreflop(holeCards);
        }
    }

    function evaluateHand(holeCards, communityCards) {
        if (
            !Array.isArray(holeCards) ||
            holeCards.length !== 2
        ) {
            return 0;
        }

        if (!Array.isArray(communityCards)) {
            communityCards = [];
        }

        if (communityCards.length < 3) {
            return evaluatePreflop(holeCards);
        }

        return evaluatePostflop(
            holeCards,
            communityCards
        );
    }

    /* =====================================================
       4. BLUFF
       ===================================================== */

    function shouldBluff(profile, difficulty, context) {
        const baseFrequency =
            toNumber(profile.stats.bluffFrequency) / 100;

        const adjustment =
            toNumber(difficulty.bluffAdjustment) / 100;

        let frequency =
            baseFrequency + adjustment;

        if (context.opponentsRemaining > 2) {
            frequency *= 0.65;
        }

        if (context.street === "river") {
            frequency *= 0.8;
        }

        return Math.random() <
            clamp(frequency, 0, 0.60);
    }

    /* =====================================================
       5. CALCUL DES MISES
       ===================================================== */

    function calculateBetSize(context, strength, difficulty) {
        const pot = Math.max(0, context.pot);
        const availableStack = Math.max(0, context.stack);

        if (availableStack <= 0) {
            return 0;
        }

        let multiplier = 0.50;

        if (strength >= 0.80) {
            multiplier = 0.75;
        } else if (strength >= 0.65) {
            multiplier = 0.60;
        }

        const difficultyFactor =
            difficulty.id === "hard" ? 1.05 : 1;

        const calculatedAmount = Math.round(
            pot * multiplier * difficultyFactor
        );

        const minimum = Math.max(
            1,
            toNumber(context.minRaise, 1)
        );

        return Math.min(
            availableStack,
            Math.max(minimum, calculatedAmount)
        );
    }

    /* =====================================================
       6. CRÉATION DES DÉCISIONS
       ===================================================== */

    function createDecision(
        action,
        amount,
        reason,
        extra = {}
    ) {
        return {
            action,
            amount: Math.max(0, Math.round(amount)),
            reason,
            ...extra
        };
    }

    /* =====================================================
       7. DÉCISION PRINCIPALE
       ===================================================== */

    function decide(context = {}) {
        const profiles = window.PokerLabBotProfiles;

        if (!profiles) {
            throw new Error(
                "PokerLabBotProfiles est introuvable. " +
                "Vérifie le chargement de bot-profiles.js."
            );
        }

        const profileId =
            context.profile || DEFAULT_PROFILE;

        const difficultyId =
            context.difficulty || DEFAULT_DIFFICULTY;

        const profile =
            profiles.getProfile(profileId);

        const difficulty =
            profiles.getDifficulty(difficultyId);

        if (!profile || !difficulty) {
            throw new Error(
                "Profil ou difficulté de bot invalide."
            );
        }

        const holeCards = context.holeCards || [];
        const communityCards = context.communityCards || [];

        if (
            !Array.isArray(holeCards) ||
            holeCards.length !== 2 ||
            !Array.isArray(communityCards) ||
            communityCards.length > 5
        ) {
            throw new Error(
                "Les cartes fournies au bot sont invalides."
            );
        }

        if (
            communityCards.length !== 0 &&
            communityCards.length !== 3 &&
            communityCards.length !== 4 &&
            communityCards.length !== 5
        ) {
            throw new Error(
                "Le nombre de cartes communes est invalide."
            );
        }

        const pot = Math.max(
            0,
            toNumber(context.pot)
        );

        const stack = Math.max(
            0,
            toNumber(context.stack)
        );

        const callAmount = Math.max(
            0,
            toNumber(context.callAmount)
        );

        const currentBet = Math.max(
            0,
            toNumber(context.currentBet)
        );

        const currentContribution = Math.max(
            0,
            toNumber(context.currentContribution)
        );

        const minRaise = Math.max(
            1,
            toNumber(context.minRaise, 1)
        );

        const opponentsRemaining = Math.max(
            1,
            toNumber(context.opponentsRemaining, 1)
        );

        const canRaise =
            context.canRaise !== false;

        const street =
            context.street || "preflop";

        if (stack === 0) {
            return createDecision(
                "check",
                0,
                "Le bot ne possède plus de jetons."
            );
        }

        // Vérification de cohérence des montants.

        const expectedCallAmount = Math.max(
            0,
            currentBet - currentContribution
        );

        const effectiveCallAmount =
            context.callAmount !== undefined
                ? Math.min(callAmount, stack)
                : Math.min(expectedCallAmount, stack);

        // -------------------------------------------------
        // FORCE DE LA MAIN
        // -------------------------------------------------

        const rawStrength = evaluateHand(
            holeCards,
            communityCards
        );

        const noise =
            toNumber(difficulty.decisionNoise) / 100;

        const adjustedStrength = clamp(
            rawStrength +
                randomBetween(-noise, noise),
            0,
            1
        );

        const makesMistake =
            Math.random() <
            toNumber(difficulty.mistakeRate) / 100;

        const bluff = shouldBluff(
            profile,
            difficulty,
            {
                street,
                opponentsRemaining
            }
        );

        const strength = makesMistake
            ? clamp(
                adjustedStrength +
                    randomBetween(-0.25, 0.25),
                0,
                1
            )
            : adjustedStrength;

        const canCheck =
            effectiveCallAmount === 0;

        // =================================================
        // CAS 1 : AUCUNE MISE À PAYER
        // =================================================

        if (canCheck) {
            const shouldBet =
                strength >= 0.58 ||
                (bluff && strength < 0.58);

            if (!shouldBet) {
                return createDecision(
                    "check",
                    0,
                    "La force de la main ne justifie pas une mise."
                );
            }

            const betAmount = calculateBetSize(
                {
                    pot,
                    stack,
                    minRaise
                },
                strength,
                difficulty
            );

            if (betAmount >= stack) {
                return createDecision(
                    "all-in",
                    stack,
                    "Le bot engage son tapis.",
                    {
                        allIn: true
                    }
                );
            }

            return createDecision(
                "bet",
                betAmount,
                bluff
                    ? "Le bot tente un bluff."
                    : "Le bot mise pour valoriser sa main."
            );
        }

        // =================================================
        // CAS 2 : LE BOT DOIT FAIRE FACE À UNE MISE
        // =================================================

        const effectiveCall = Math.min(
            effectiveCallAmount,
            stack
        );

        const potOdds =
            effectiveCall /
            Math.max(1, pot + effectiveCall);

        const continueThreshold = clamp(
            potOdds + 0.08,
            0.12,
            0.75
        );

        // Le stack ne permet pas de suivre entièrement.

        if (stack <= effectiveCall) {
            if (
                strength >= continueThreshold ||
                bluff
            ) {
                return createDecision(
                    "call",
                    stack,
                    "Le bot suit en engageant son tapis.",
                    {
                        allIn: true
                    }
                );
            }

            return createDecision(
                "fold",
                0,
                "Le bot abandonne face à la mise."
            );
        }

        // Main insuffisante.

        if (
            strength < continueThreshold &&
            !bluff
        ) {
            return createDecision(
                "fold",
                0,
                "La main ne présente pas une rentabilité suffisante."
            );
        }

        // =================================================
        // CAS 3 : RELANCE
        // =================================================

        const shouldRaise =
            strength >= 0.78 ||
            (
                bluff &&
                strength >= 0.40
            );

        // Le bot ne peut pas relancer si son droit
        // de relance n'a pas été rouvert.

        if (shouldRaise && canRaise) {
            const stackAfterCall =
                stack - effectiveCall;

            const raiseIncrement = calculateBetSize(
                {
                    pot: pot + effectiveCall,
                    stack: stackAfterCall,
                    minRaise
                },
                strength,
                difficulty
            );

            const minimumFullRaise =
                minRaise;

            // Le montant supplémentaire nécessaire
            // pour réaliser une relance complète.

            if (
                stackAfterCall >= minimumFullRaise &&
                raiseIncrement >= minimumFullRaise
            ) {
                const actualRaiseIncrement = Math.min(
                    raiseIncrement,
                    stackAfterCall
                );

                const totalCommitment =
                    effectiveCall + actualRaiseIncrement;

                const totalRaiseTo =
                    currentBet + actualRaiseIncrement;

                if (totalCommitment >= stack) {
                    return createDecision(
                        "all-in",
                        stack,
                        "Le bot engage son tapis en relançant.",
                        {
                            allIn: true,
                            raiseTo: currentBet + stackAfterCall
                        }
                    );
                }

                return createDecision(
                    "raise",
                    totalCommitment,
                    bluff
                        ? "Le bot tente une relance en bluff."
                        : "Le bot relance pour valoriser sa main.",
                    {
                        raiseTo: totalRaiseTo
                    }
                );
            }

            // Le stack restant ne permet qu'une relance
            // inférieure au minimum : seul le tapis est permis.

            if (stackAfterCall > 0) {
                return createDecision(
                    "all-in",
                    stack,
                    "Le bot engage son tapis avec une relance courte.",
                    {
                        allIn: true,
                        raiseTo: currentBet + stackAfterCall
                    }
                );
            }
        }

        // =================================================
        // CAS 4 : SUIVI
        // =================================================

        return createDecision(
            "call",
            effectiveCall,
            canRaise
                ? "Le bot suit avec une main suffisamment intéressante."
                : "Le droit de relance n'est pas ouvert : le bot suit."
        );
    }

    /* =====================================================
       8. API PUBLIQUE
       ===================================================== */

    window.PokerLabBotEngine = {
        decide,
        evaluateHand,
        evaluatePreflop,
        evaluatePostflop
    };

})();
