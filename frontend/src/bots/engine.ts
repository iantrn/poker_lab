/** Strict TypeScript migration of PokerLab bot decisions. The decision mathematics and RNG calls are preserved. */
export interface BotCard {value:number;suit:string}
export interface BotProfile {id:string;stats:Record<string,number>}
export interface BotDifficulty {id:string;decisionNoise:number;mistakeRate:number;bluffAdjustment:number}
export interface BotDecision {action:string;amount:number;reason:string;raiseTo?:number;[field:string]:unknown}
export interface BotContext {
 holeCards?:BotCard[];communityCards?:BotCard[];pot?:number;stack?:number;
 callAmount?:number;currentBet?:number;currentContribution?:number;minRaise?:number;
 bigBlind?:number;opponentsRemaining?:number;canRaise?:boolean;street?:string;
 position?:string|null;profile?:string;difficulty?:string;
}
interface DecisionContext {
 profile:BotProfile;difficulty:BotDifficulty;strength:number;callAmount:number;stack:number;
 currentBet:number;currentContribution:number;minRaise:number;bigBlind:number;canRaise:boolean;
 pot:number;opponentsRemaining:number;street:string;position:string|null|undefined;bluff:boolean;
}
interface BetContext {pot:number;stack:number;minimum?:number}
interface BotHandEvaluation {score:number[]}

/* =========================================================
   POKERLAB - BOT ENGINE
   Version : 2.0.0
   Description : Moteur décisionnel des adversaires
   ========================================================= */

function createBotEngine() {
    "use strict";

    const DEFAULT_PROFILE = "balanced";
    const DEFAULT_DIFFICULTY = "medium";

    const CHIP_UNIT = 0.5;

    /* =====================================================
       1. OUTILS GÉNÉRAUX
       ===================================================== */

    function clamp(value:number,min:number,max:number) {
        return Math.max(min, Math.min(max, value));
    }

    function randomBetween(min:number,max:number) {
        return Math.random() * (max - min) + min;
    }

    function toNumber(value:unknown,fallback=0) {
        const number = Number(value);

        return Number.isFinite(number)
            ? number
            : fallback;
    }

    function roundChips(amount:number) {
        return Math.round(amount / CHIP_UNIT) * CHIP_UNIT;
    }

    function percentage(value:unknown,fallback=0) {
        return clamp(toNumber(value, fallback), 0, 100);
    }

    function getStat(profile:BotProfile|null,name:string,fallback=0) {
        return toNumber(
            profile &&
            profile.stats &&
            profile.stats[name],
            fallback
        );
    }

    /* =====================================================
       2. ÉVALUATION PRÉFLOP
       ===================================================== */

    function evaluatePreflop(cards:BotCard[]|null|undefined) {

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

    function extractCategory(result:unknown) {

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

        if (
            Array.isArray((result as BotHandEvaluation).score) &&
            typeof (result as BotHandEvaluation).score[0] === "number"
        ) {
            return (result as BotHandEvaluation).score[0];
        }

        const possibleKeys: string[] = [
            "category",
            "rank",
            "handRank",
            "type",
            "value"
        ];

        for (const key of possibleKeys) {

            const value = (result as Record<string,unknown>)[key];

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


    function evaluatePostflop(holeCards:BotCard[],communityCards:BotCard[]) {

        const allCards = [
            ...holeCards,
            ...communityCards
        ];

        if (allCards.length < 5) {
            return evaluatePreflop(holeCards);
        }

        const evaluator = (window as Window & {PokerLabHandEvaluator?:{evaluate(cards:BotCard[]):BotHandEvaluation}}).PokerLabHandEvaluator;

        if (
            !evaluator ||
            typeof evaluator.evaluate !== "function"
        ) {
            return evaluatePreflop(holeCards);
        }

        try {

            const result =
                evaluator.evaluate(allCards);

            const category =
                extractCategory(result);

            if (
                category === null ||
                category! < 0 ||
                category! > 9
            ) {
                return evaluatePreflop(holeCards);
            }

            /*
             * Estimation heuristique de la force.
             *
             * Cette valeur représente une approximation
             * de la force de combinaison, pas une équité
             * contre une range adverse.
             *
             * Elle ne constitue pas une stratégie GTO.
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

            let strength =
                categoryStrength[category!]!;

            if (
                result &&
                Array.isArray((result as BotHandEvaluation).score) &&
                (result as BotHandEvaluation).score.length > 1
            ) {

                const kickerValues =
                    (result as BotHandEvaluation).score.slice(1);

                const kickerSum =
                    kickerValues.reduce(
                        (total, value) =>
                            total +
                            (
                                Number.isFinite(value)
                                    ? value
                                    : 0
                            ),
                        0
                    );

                strength += clamp(
                    kickerSum / 1000,
                    0,
                    0.025
                );

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


    function evaluateHand(holeCards:BotCard[]|null|undefined,communityCards:BotCard[]|null|undefined) {

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
       4. PROFILS COMPORTEMENTAUX
       ===================================================== */

    function getPreflopThreshold(profile:BotProfile,position:string|null|undefined) {

        const vpip = getStat(profile, "vpip", 25);
        const pfr = getStat(profile, "pfr", 20);

        /*
         * Plus le VPIP est bas, plus le bot sélectionne
         * rigoureusement ses mains.
         */

        let threshold =
            0.78 - (vpip - 14) * 0.012;

        threshold = clamp(
            threshold,
            0.47,
            0.79
        );

        /*
         * Le PFR influence la propension à entrer
         * agressivement dans le coup.
         */

        threshold += clamp(
            (22 - pfr) * 0.0015,
            -0.015,
            0.025
        );

        /*
         * Adaptation simplifiée à la position.
         */

        const positionAdjustments: Record<string,number> = {

            "BTN": -0.11,
            "BTN/SB": -0.09,
            "CO": -0.07,
            "HJ": -0.035,
            "UTG": 0.045,
            "SB": 0.025,
            "BB": 0

        };

        threshold +=
            positionAdjustments[position ?? ""] ?? 0;

        return clamp(threshold, 0.35, 0.85);

    }


    function getPreflopRaiseThreshold(profile:BotProfile) {

        const pfr = getStat(profile, "pfr", 20);

        return clamp(
            0.72 - (pfr - 11) * 0.006,
            0.57,
            0.76
        );

    }


    function getThreeBetFrequency(profile:BotProfile) {

        return percentage(
            getStat(profile, "threeBet", 8)
        );

    }


    function getAggression(profile:BotProfile) {

        return clamp(
            getStat(profile, "aggression", 3),
            0.5,
            5
        );

    }


    function getFoldToBetFrequency(profile:BotProfile) {

        return percentage(
            getStat(profile, "foldToBet", 45)
        );

    }


    function getFoldToThreeBetFrequency(profile:BotProfile) {

        return percentage(
            getStat(profile, "foldToThreeBet", 58)
        );

    }


    function getContinuationBetFrequency(profile:BotProfile) {

        return percentage(
            getStat(profile, "continuationBet", 68)
        );

    }


    function getShowdownFrequency(profile:BotProfile) {

        return percentage(
            getStat(profile, "showdownFrequency", 27)
        );

    }


    /* =====================================================
       5. BLUFF
       ===================================================== */

    function shouldBluff(profile:BotProfile,difficulty:BotDifficulty,context:{street:string;opponentsRemaining:number}) {

        const baseFrequency =
            getStat(profile, "bluffFrequency", 20) / 100;

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

        if (context.street === "preflop") {
            frequency *= 0.5;
        }

        return Math.random() <
            clamp(frequency, 0, 0.60);

    }


    /* =====================================================
       6. CALCUL DES MISES
       ===================================================== */

    function calculateBetSize(context:BetContext,strength:number,difficulty:BotDifficulty) {

        const pot = Math.max(
            0,
            toNumber(context.pot)
        );

        const availableStack = Math.max(
            0,
            toNumber(context.stack)
        );

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
            difficulty.id === "hard"
                ? 1.05
                : 1;

        const calculatedAmount =
            pot * multiplier * difficultyFactor;

        const minimum =
            Math.max(
                CHIP_UNIT,
                toNumber(context.minimum, 1)
            );

        return roundChips(
            Math.min(
                availableStack,
                Math.max(
                    minimum,
                    calculatedAmount
                )
            )
        );

    }


    /* =====================================================
       7. CRÉATION DES DÉCISIONS
       ===================================================== */

    function createDecision(action:string,amount:number,reason:string,extra:Record<string,unknown>={}) {

        return {

            action,

            amount: Math.max(
                0,
                roundChips(toNumber(amount))
            ),

            reason,

            ...extra

        };

    }


    /* =====================================================
       8. DÉCISION PRÉFLOP
       ===================================================== */

    function decidePreflop(context:DecisionContext) {

        const {
            profile,
            strength,
            callAmount,
            stack,
            currentBet,
            currentContribution,
            minRaise,
            canRaise,
            pot,
            difficulty,
            opponentsRemaining,
            bluff
        } = context;

        const threshold =
            getPreflopThreshold(
                profile,
                context.position
            );

        const raiseThreshold =
            getPreflopRaiseThreshold(profile);

        const facingRaise =
            currentBet > context.bigBlind + 0.000001;

        const facingOpen =
            currentBet > 0 &&
            callAmount > 0 &&
            !facingRaise;

        const threeBetFrequency =
            getThreeBetFrequency(profile);

        const aggression =
            getAggression(profile);

        // -------------------------------------------------
        // AUCUNE MISE À ÉGALISER
        // -------------------------------------------------

        if (callAmount === 0) {

            if (currentBet === 0) {

                if (strength < threshold && !bluff) {

                    return createDecision(
                        "fold",
                        0,
                        "Main trop faible pour entrer dans le coup."
                    );

                }

                const shouldOpenRaise =
                    strength >= raiseThreshold ||
                    (
                        bluff &&
                        strength >= threshold
                    );

                if (!shouldOpenRaise) {

                    return createDecision(
                        "call",
                        0,
                        "Le bot complète la mise."
                    );

                }

                const openingBet =
                    calculateBetSize(
                        {
                            pot,
                            stack,
                            minimum: context.bigBlind
                        },
                        strength,
                        difficulty
                    );

                if (openingBet >= stack) {

                    return createDecision(
                        "all-in",
                        stack,
                        "Le bot engage son tapis préflop.",
                        { allIn: true }
                    );

                }

                return createDecision(
                    "bet",
                    openingBet,
                    "Le bot ouvre le coup préflop."
                );

            }

            // Option de la Big Blind ou absence de mise
            // à égaliser : le bot peut checker ou relancer.

            const shouldRaise =
                canRaise &&
                (
                    strength >= raiseThreshold ||
                    (
                        bluff &&
                        strength >= threshold
                    )
                );

            if (!shouldRaise) {

                return createDecision(
                    "check",
                    0,
                    "Le bot conserve son option de check."
                );

            }

            const raiseIncrement =
                calculateBetSize(
                    {
                        pot,
                        stack,
                        minimum: minRaise
                    },
                    strength,
                    difficulty
                );

            const minimumRaiseTo =
                currentBet + minRaise;

            const maximumRaiseTo =
                currentContribution + stack;

            const raiseTo = Math.min(
                maximumRaiseTo,
                Math.max(
                    minimumRaiseTo,
                    currentBet + raiseIncrement
                )
            );

            if (
                raiseTo >= maximumRaiseTo - 0.000001
            ) {

                return createDecision(
                    "all-in",
                    stack,
                    "Le bot relance à tapis préflop.",
                    {
                        allIn: true,
                        raiseTo
                    }
                );

            }

            return createDecision(
                "raise",
                raiseTo - currentContribution,
                "Le bot relance depuis la Big Blind.",
                { raiseTo }
            );

        }

        // -------------------------------------------------
        // LE BOT FAIT FACE À UNE OUVERTURE
        // -------------------------------------------------

        if (facingOpen) {

            const shouldFold =
                strength < threshold &&
                !bluff;

            if (shouldFold) {

                return createDecision(
                    "fold",
                    0,
                    "Le bot abandonne face à l'ouverture."
                );

            }

            const shouldThreeBet =
                canRaise &&
                strength >= raiseThreshold &&
                Math.random() <
                    clamp(
                        threeBetFrequency / 100 +
                        (aggression - 2.5) * 0.06,
                        0.02,
                        0.85
                    );

            if (shouldThreeBet) {

                const raiseIncrement =
                    calculateBetSize(
                        {
                            pot: pot + callAmount,
                            stack: stack - callAmount,
                            minimum: minRaise
                        },
                        strength,
                        difficulty
                    );

                const maximumRaiseTo =
                    currentContribution + stack;

                const raiseTo = Math.min(
                    maximumRaiseTo,
                    Math.max(
                        currentBet + minRaise,
                        currentBet + raiseIncrement
                    )
                );

                if (
                    raiseTo >= maximumRaiseTo - 0.000001
                ) {

                    return createDecision(
                        "all-in",
                        stack,
                        "Le bot effectue une sur-relance à tapis.",
                        {
                            allIn: true,
                            raiseTo
                        }
                    );

                }

                return createDecision(
                    "raise",
                    raiseTo - currentContribution,
                    "Le bot effectue une sur-relance.",
                    { raiseTo }
                );

            }

            if (stack <= callAmount) {

                return createDecision(
                    "call",
                    stack,
                    "Le bot suit à tapis.",
                    { allIn: true }
                );

            }

            return createDecision(
                "call",
                callAmount,
                "Le bot suit l'ouverture."
            );

        }

        // -------------------------------------------------
        // LE BOT FAIT FACE À UNE RELANCE
        // -------------------------------------------------

        if (facingRaise) {

            const foldFrequency =
                getFoldToThreeBetFrequency(profile);

            const estimatedFold =
                Math.random() <
                foldFrequency / 100;

            const shouldFold =
                strength < threshold ||
                (
                    estimatedFold &&
                    strength < raiseThreshold
                );

            if (shouldFold && !bluff) {

                return createDecision(
                    "fold",
                    0,
                    "Le bot abandonne face à la relance."
                );

            }

            const shouldReraise =
                canRaise &&
                strength >= raiseThreshold + 0.08 &&
                Math.random() <
                    clamp(
                        threeBetFrequency / 100,
                        0.01,
                        0.65
                    );

            if (shouldReraise) {

                const raiseIncrement =
                    calculateBetSize(
                        {
                            pot: pot + callAmount,
                            stack: stack - callAmount,
                            minimum: minRaise
                        },
                        strength,
                        difficulty
                    );

                const maximumRaiseTo =
                    currentContribution + stack;

                const raiseTo = Math.min(
                    maximumRaiseTo,
                    Math.max(
                        currentBet + minRaise,
                        currentBet + raiseIncrement
                    )
                );

                if (
                    raiseTo >= maximumRaiseTo - 0.000001
                ) {

                    return createDecision(
                        "all-in",
                        stack,
                        "Le bot sur-relance à tapis.",
                        {
                            allIn: true,
                            raiseTo
                        }
                    );

                }

                return createDecision(
                    "raise",
                    raiseTo - currentContribution,
                    "Le bot sur-relance.",
                    { raiseTo }
                );

            }

            if (stack <= callAmount) {

                return createDecision(
                    "call",
                    stack,
                    "Le bot suit à tapis.",
                    { allIn: true }
                );

            }

            return createDecision(
                "call",
                callAmount,
                "Le bot suit la relance."
            );

        }

        return createDecision(
            "check",
            0,
            "Le bot ne possède aucune mise à égaliser."
        );

    }


    /* =====================================================
       9. DÉCISION POSTFLOP
       ===================================================== */

    function decidePostflop(context:DecisionContext) {

        const {
            profile,
            strength,
            callAmount,
            stack,
            currentBet,
            currentContribution,
            minRaise,
            canRaise,
            pot,
            difficulty,
            opponentsRemaining,
            bluff
        } = context;

        const aggression =
            getAggression(profile);

        const foldToBet =
            getFoldToBetFrequency(profile);

        const continuationBet =
            getContinuationBetFrequency(profile);

        const showdownFrequency =
            getShowdownFrequency(profile);

        // -------------------------------------------------
        // AUCUNE MISE À ÉGALISER
        // -------------------------------------------------

        if (callAmount === 0) {

            const shouldBet =
                strength >= 0.58 ||
                (
                    bluff &&
                    strength >= 0.30
                );

            if (!shouldBet) {

                return createDecision(
                    "check",
                    0,
                    "Le bot contrôle le pot."
                );

            }

            /*
             * La fréquence de continuation bet et
             * l'agressivité influencent la fréquence
             * d'initiative postflop.
             */

            const bettingFrequency =
                clamp(
                    continuationBet / 100 +
                    (aggression - 2.5) * 0.05,
                    0.15,
                    0.90
                );

            if (
                strength < 0.75 &&
                Math.random() > bettingFrequency &&
                !bluff
            ) {

                return createDecision(
                    "check",
                    0,
                    "Le bot choisit de contrôler le pot."
                );

            }

            const betAmount =
                calculateBetSize(
                    {
                        pot,
                        stack,
                        minimum: context.bigBlind
                    },
                    strength,
                    difficulty
                );

            if (betAmount >= stack) {

                return createDecision(
                    "all-in",
                    stack,
                    "Le bot engage son tapis.",
                    { allIn: true }
                );

            }

            if (currentBet === 0) {

                return createDecision(
                    "bet",
                    betAmount,
                    bluff
                        ? "Le bot tente un bluff."
                        : "Le bot mise pour valoriser sa main."
                );

            }

            // Cas particulier : une mise existe déjà,
            // mais le bot n'a rien à égaliser.
            // Exemple : option de la Big Blind préflop.

            if (!canRaise) {

                return createDecision(
                    "check",
                    0,
                    "Le bot ne peut pas relancer."
                );

            }

            const raiseTo = Math.min(
                currentContribution + stack,
                Math.max(
                    currentBet + minRaise,
                    currentBet + betAmount
                )
            );

            if (
                raiseTo >=
                currentContribution + stack - 0.000001
            ) {

                return createDecision(
                    "all-in",
                    stack,
                    "Le bot relance à tapis.",
                    {
                        allIn: true,
                        raiseTo
                    }
                );

            }

            return createDecision(
                "raise",
                raiseTo - currentContribution,
                "Le bot relance.",
                { raiseTo }
            );

        }

        // -------------------------------------------------
        // LE BOT FAIT FACE À UNE MISE
        // -------------------------------------------------

        const effectiveCall =
            Math.min(callAmount, stack);

        const potOdds =
            effectiveCall /
            Math.max(
                0.5,
                pot + effectiveCall
            );

        /*
         * Estimation heuristique de la fréquence
         * de continuation.
         */

        const showdownAdjustment =
            (showdownFrequency - 27) * 0.001;

        const continueThreshold =
            clamp(
                potOdds +
                0.07 +
                showdownAdjustment,
                0.10,
                0.78
            );

        const profileFoldProbability =
            foldToBet / 100;

        const shouldFold =
            strength < continueThreshold &&
            !bluff;

        if (shouldFold) {

            return createDecision(
                "fold",
                0,
                "La force de la main ne justifie pas de continuer."
            );

        }

        // -------------------------------------------------
        // ALL-IN EN SUIVANT
        // -------------------------------------------------

        if (stack <= effectiveCall) {

            return createDecision(
                "call",
                stack,
                "Le bot suit en engageant son tapis.",
                { allIn: true }
            );

        }

        // -------------------------------------------------
        // RELANCE
        // -------------------------------------------------

        const raiseThreshold =
            clamp(
                0.78 - (aggression - 2.5) * 0.035,
                0.65,
                0.85
            );

        const shouldRaise =
            canRaise &&
            (
                strength >= raiseThreshold ||
                (
                    bluff &&
                    strength >= 0.40
                )
            );

        if (shouldRaise) {

            const stackAfterCall =
                stack - effectiveCall;

            const raiseIncrement =
                calculateBetSize(
                    {
                        pot: pot + effectiveCall,
                        stack: stackAfterCall,
                        minimum: minRaise
                    },
                    strength,
                    difficulty
                );

            const maximumRaiseTo =
                currentContribution + stack;

            const minimumRaiseTo =
                currentBet + minRaise;

            const raiseTo = Math.min(
                maximumRaiseTo,
                Math.max(
                    minimumRaiseTo,
                    currentBet + raiseIncrement
                )
            );

            if (
                raiseTo >=
                maximumRaiseTo - 0.000001
            ) {

                return createDecision(
                    "all-in",
                    stack,
                    "Le bot engage son tapis en relançant.",
                    {
                        allIn: true,
                        raiseTo
                    }
                );

            }

            return createDecision(
                "raise",
                raiseTo - currentContribution,
                bluff
                    ? "Le bot tente une relance en bluff."
                    : "Le bot relance pour valoriser sa main.",
                { raiseTo }
            );

        }

        // -------------------------------------------------
        // SUIVI
        // -------------------------------------------------

        /*
         * Fold-to-bet influence la propension à abandonner.
         * Ici, le seuil de continuation a déjà été franchi.
         * Cette seconde décision introduit une variation
         * comportementale sans contredire le seuil.
         */

        if (
            strength < 0.50 &&
            Math.random() < profileFoldProbability * 0.15 &&
            !bluff
        ) {

            return createDecision(
                "fold",
                0,
                "Le bot abandonne face à la pression."
            );

        }

        return createDecision(
            "call",
            effectiveCall,
            "Le bot suit avec une main suffisamment intéressante."
        );

    }


    /* =====================================================
       10. DÉCISION PRINCIPALE
       ===================================================== */

    function decide(context:BotContext={}) {

        const profiles = (window as unknown as Window & {PokerLabBotProfiles:{getProfile(id:string):BotProfile|null;getDifficulty(id:string):BotDifficulty|null}}).PokerLabBotProfiles;

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

        const holeCards =
            context.holeCards || [];

        const communityCards =
            context.communityCards || [];

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
            CHIP_UNIT,
            toNumber(context.minRaise, 1)
        );

        const bigBlind = Math.max(
            CHIP_UNIT,
            toNumber(context.bigBlind, 1)
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

        if (
            !["preflop", "flop", "turn", "river"].includes(street)
        ) {

            throw new Error(
                "Phase de jeu invalide pour le bot."
            );

        }

        // -------------------------------------------------
        // FORCE DE LA MAIN
        // -------------------------------------------------

        const rawStrength =
            evaluateHand(
                holeCards,
                communityCards
            );

        const noise =
            toNumber(difficulty.decisionNoise) / 100;

        const adjustedStrength =
            clamp(
                rawStrength +
                randomBetween(-noise, noise),
                0,
                1
            );

        const makesMistake =
            Math.random() <
            toNumber(difficulty.mistakeRate) / 100;

        const strength =
            makesMistake
                ? clamp(
                    adjustedStrength +
                    randomBetween(-0.25, 0.25),
                    0,
                    1
                )
                : adjustedStrength;

        const bluff =
            shouldBluff(
                profile,
                difficulty,
                {
                    street,
                    opponentsRemaining
                }
            );

        const effectiveCallAmount =
            Math.min(callAmount, stack);

        const decisionContext = {

            profile,

            difficulty,

            strength,

            callAmount: effectiveCallAmount,

            stack,

            currentBet,

            currentContribution,

            minRaise,

            bigBlind,

            canRaise,

            pot,

            opponentsRemaining,

            street,

            position: context.position,

            bluff

        };

        if (street === "preflop") {

            return decidePreflop(
                decisionContext
            );

        }

        return decidePostflop(
            decisionContext
        );

    }


    /* =====================================================
       11. API PUBLIQUE
       ===================================================== */

    return {

        decide,

        evaluateHand,

        evaluatePreflop,

        evaluatePostflop

    };

}

export type BotEngineApi = ReturnType<typeof createBotEngine>;
export function installBotEngine():BotEngineApi {
  const scope = window as Window & {PokerLabBotEngine?:BotEngineApi};
  if (!scope.PokerLabBotEngine) scope.PokerLabBotEngine = createBotEngine();
  return scope.PokerLabBotEngine;
}
