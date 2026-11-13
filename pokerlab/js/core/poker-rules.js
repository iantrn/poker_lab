
/* =========================================================
   POKERLAB - POKER RULES
   Version : 1.0.0
   Description : Règles du Texas Hold'em No-Limit
   ========================================================= */

"use strict";


/* =========================================================
   1. CONSTANTES GÉNÉRALES
   ========================================================= */

const POKER_RULES = {

    // Nombre de cartes dans un paquet standard.

    deckSize: 52,

    // Nombre de cartes privatives par joueur.

    holeCardsPerPlayer: 2,

    // Nombre de cartes communes.

    communityCards: 5,

    // Nombre maximum de joueurs en 6-max.

    maxPlayers: 6,

    // Nombre minimum de joueurs pour une partie classique.

    minPlayers: 2,

    // Phases successives d'une main.

    streets: [
        "preflop",
        "flop",
        "turn",
        "river",
        "showdown"
    ],

    // Nombre de cartes communes distribuées à chaque phase.

    communityCardsByStreet: {

        preflop: 0,

        flop: 3,

        turn: 1,

        river: 1,

        showdown: 0

    },

    // Configuration des blinds par défaut.

    defaultBlinds: {

        smallBlind: 1,

        bigBlind: 2

    },

    // Formats de jeu disponibles.

    formats: {

        headsUp: {
            name: "Heads-up",
            minPlayers: 2,
            maxPlayers: 2
        },

        sixMax: {
            name: "6-Max",
            minPlayers: 2,
            maxPlayers: 6
        }

    }

};


/* =========================================================
   2. GESTION DES PHASES DE JEU
   ========================================================= */

const PokerLabStreets = {

    getAll() {

        return [...POKER_RULES.streets];

    },


    isValid(street) {

        return POKER_RULES.streets.includes(street);

    },


    getNext(street) {

        const currentIndex =
            POKER_RULES.streets.indexOf(street);

        if (currentIndex === -1) {

            throw new Error(
                "Phase de jeu inconnue : " + street
            );

        }

        if (currentIndex >= POKER_RULES.streets.length - 1) {

            return null;

        }

        return POKER_RULES.streets[currentIndex + 1];

    },


    getCommunityCardCount(street) {

        if (!this.isValid(street)) {

            throw new Error(
                "Phase de jeu inconnue : " + street
            );

        }

        return POKER_RULES.communityCardsByStreet[street];

    },


    getTotalCommunityCards(street) {

        const streetIndex =
            POKER_RULES.streets.indexOf(street);

        if (streetIndex === -1) {

            throw new Error(
                "Phase de jeu inconnue : " + street
            );

        }

        let total = 0;

        for (let i = 0; i <= streetIndex; i++) {

            total +=
                POKER_RULES.communityCardsByStreet[
                    POKER_RULES.streets[i]
                ];

        }

        return total;

    }

};


/* =========================================================
   3. VALIDATION DES FORMATS DE JEU
   ========================================================= */

const PokerLabFormats = {

    get(format) {

        const selectedFormat =
            POKER_RULES.formats[format];

        if (!selectedFormat) {

            throw new Error(
                "Format de poker inconnu : " + format
            );

        }

        return { ...selectedFormat };

    },


    isValid(format) {

        return Object.prototype.hasOwnProperty.call(
            POKER_RULES.formats,
            format
        );

    },


    validatePlayerCount(count, format = "sixMax") {

        if (!Number.isInteger(count)) {

            return false;

        }

        if (!this.isValid(format)) {

            return false;

        }

        const selectedFormat =
            POKER_RULES.formats[format];

        return (
            count >= selectedFormat.minPlayers &&
            count <= selectedFormat.maxPlayers
        );

    }

};


/* =========================================================
   4. GESTION DES POSITIONS À LA TABLE
   ========================================================= */

const PokerLabPositions = {

    // Retourne les positions en fonction du nombre de joueurs.

    getPositionNames(playerCount) {

        if (
            !Number.isInteger(playerCount) ||
            playerCount < 2 ||
            playerCount > 6
        ) {

            throw new Error(
                "Le nombre de joueurs doit être compris entre 2 et 6."
            );

        }

        const positionsByPlayerCount = {

            2: [
                "BTN/SB",
                "BB"
            ],

            3: [
                "BTN",
                "SB",
                "BB"
            ],

            4: [
                "BTN",
                "SB",
                "BB",
                "CO"
            ],

            5: [
                "BTN",
                "SB",
                "BB",
                "UTG",
                "CO"
            ],

            6: [
                "BTN",
                "SB",
                "BB",
                "UTG",
                "HJ",
                "CO"
            ]

        };

        return [
            ...positionsByPlayerCount[playerCount]
        ];

    },


    // Calcule la position de chaque siège.
    // Le dealerIndex représente le siège du bouton.

    getTablePositions(playerCount, dealerIndex = 0) {

        if (
            !Number.isInteger(dealerIndex) ||
            dealerIndex < 0 ||
            dealerIndex >= playerCount
        ) {

            throw new Error(
                "Index du bouton invalide."
            );

        }

        const positionNames =
            this.getPositionNames(playerCount);

        const positions = [];

        for (let i = 0; i < playerCount; i++) {

            const seatIndex =
                (dealerIndex + i) % playerCount;

            positions.push({

                seatIndex,

                position: positionNames[i],

                isDealer: i === 0,

                isSmallBlind:
                    positionNames[i] === "SB" ||
                    positionNames[i] === "BTN/SB",

                isBigBlind:
                    positionNames[i] === "BB"

            });

        }

        return positions;

    },


    // Retourne la position d'un joueur précis.

    getPlayerPosition(
        playerIndex,
        playerCount,
        dealerIndex = 0
    ) {

        if (
            !Number.isInteger(playerIndex) ||
            playerIndex < 0 ||
            playerIndex >= playerCount
        ) {

            throw new Error(
                "Index du joueur invalide."
            );

        }

        const positions =
            this.getTablePositions(
                playerCount,
                dealerIndex
            );

        return positions.find(
            (item) => item.seatIndex === playerIndex
        );

    },


    // Retourne les sièges dans le sens horaire.

    getClockwiseOrder(startIndex, playerCount) {

        if (
            !Number.isInteger(playerCount) ||
            playerCount < 2 ||
            playerCount > 6
        ) {

            throw new Error(
                "Nombre de joueurs invalide."
            );

        }

        if (
            !Number.isInteger(startIndex) ||
            startIndex < 0 ||
            startIndex >= playerCount
        ) {

            throw new Error(
                "Index de départ invalide."
            );

        }

        const order = [];

        for (let i = 0; i < playerCount; i++) {

            order.push(
                (startIndex + i) % playerCount
            );

        }

        return order;

    }

};


/* =========================================================
   5. ORDRE DE PAROLE
   ========================================================= */

const PokerLabActionOrder = {

    // Ordre de parole préflop.
    // En heads-up, le bouton parle en premier.

    getPreflopOrder(
        playerCount,
        dealerIndex = 0,
        activeSeats = null
    ) {

        const positions =
            PokerLabPositions.getTablePositions(
                playerCount,
                dealerIndex
            );

        let startIndex;

        if (playerCount === 2) {

            // Heads-up : le bouton est aussi petite blind.

            startIndex = dealerIndex;

        } else {

            // En 3-max et plus : UTG parle en premier.

            const bigBlind = positions.find(
                (item) => item.isBigBlind
            );

            startIndex =
                (bigBlind.seatIndex + 1) % playerCount;

        }

        return this.filterActiveSeats(
            PokerLabPositions.getClockwiseOrder(
                startIndex,
                playerCount
            ),
            activeSeats
        );

    },


    // Ordre de parole après le flop.
    // Le premier joueur actif après le bouton parle en premier.

    getPostflopOrder(
        playerCount,
        dealerIndex = 0,
        activeSeats = null
    ) {

        const startIndex =
            (dealerIndex + 1) % playerCount;

        return this.filterActiveSeats(
            PokerLabPositions.getClockwiseOrder(
                startIndex,
                playerCount
            ),
            activeSeats
        );

    },


    // Permet d'exclure les joueurs couchés ou éliminés.

    filterActiveSeats(order, activeSeats) {

        if (!activeSeats) {

            return [...order];

        }

        const activeSet = new Set(activeSeats);

        return order.filter(
            (seatIndex) => activeSet.has(seatIndex)
        );

    }

};


/* =========================================================
   6. GESTION DES BLINDS
   ========================================================= */

const PokerLabBlinds = {

    getDefault() {

        return {
            ...POKER_RULES.defaultBlinds
        };

    },


    validate(smallBlind, bigBlind) {

        return (

            Number.isFinite(smallBlind) &&

            Number.isFinite(bigBlind) &&

            smallBlind > 0 &&

            bigBlind > 0 &&

            smallBlind < bigBlind

        );

    },


    create(smallBlind = 1, bigBlind = 2) {

        if (!this.validate(smallBlind, bigBlind)) {

            throw new Error(
                "Configuration des blinds invalide."
            );

        }

        return {

            smallBlind,

            bigBlind

        };

    }

};


/* =========================================================
   7. RÈGLES DES MISES
   ========================================================= */

const PokerLabBettingRules = {

    // Vérifie si un montant de mise est valide.

    isValidAmount(amount) {

        return (
            Number.isFinite(amount) &&
            amount >= 0
        );

    },


    // Retourne le montant minimum d'une ouverture
    // lorsque personne n'a encore misé volontairement.

    getMinimumOpeningBet(bigBlind) {

        if (
            !Number.isFinite(bigBlind) ||
            bigBlind <= 0
        ) {

            throw new Error(
                "Montant de big blind invalide."
            );

        }

        return bigBlind;

    },


    // Calcule le montant minimum total à atteindre
    // pour effectuer une relance complète.
    //
    // currentBet : mise totale actuelle à égaler.
    // lastFullRaise : taille de la dernière relance complète.

    getMinimumRaiseTo(currentBet, lastFullRaise) {

        if (
            !this.isValidAmount(currentBet) ||
            !Number.isFinite(lastFullRaise) ||
            lastFullRaise <= 0
        ) {

            throw new Error(
                "Paramètres de relance invalides."
            );

        }

        return currentBet + lastFullRaise;

    },


    // Calcule le montant que le joueur doit ajouter
    // pour égaliser la mise actuelle.

    getAmountToCall(currentBet, playerBet) {

        if (
            !this.isValidAmount(currentBet) ||
            !this.isValidAmount(playerBet)
        ) {

            throw new Error(
                "Montants de mise invalides."
            );

        }

        return Math.max(
            0,
            currentBet - playerBet
        );

    },


    // Vérifie si une relance est suffisamment importante
    // pour constituer une relance complète.
    //
    // raiseTo : montant total que le joueur aura misé.
    // currentBet : mise totale actuelle.
    // lastFullRaise : taille de la dernière relance complète.

    isFullRaise(
        raiseTo,
        currentBet,
        lastFullRaise
    ) {

        if (
            !this.isValidAmount(raiseTo) ||
            !this.isValidAmount(currentBet) ||
            !Number.isFinite(lastFullRaise) ||
            lastFullRaise <= 0
        ) {

            return false;

        }

        const raiseSize =
            raiseTo - currentBet;

        return raiseSize >= lastFullRaise;

    },


    // Vérifie si une action est autorisée par rapport
    // à la mise actuelle et au minimum de relance.
    //
    // Cette fonction vérifie uniquement les montants.
    // La disponibilité des jetons et les tapis sont
    // contrôlés par le moteur de jeu.

    validateRaise(
        raiseTo,
        currentBet,
        lastFullRaise
    ) {

        if (
            !this.isValidAmount(raiseTo) ||
            !this.isValidAmount(currentBet) ||
            !Number.isFinite(lastFullRaise) ||
            lastFullRaise <= 0
        ) {

            return false;

        }

        const minimumRaiseTo =
            this.getMinimumRaiseTo(
                currentBet,
                lastFullRaise
            );

        return raiseTo >= minimumRaiseTo;

    }

};


/* =========================================================
   8. RÈGLES DE DISTRIBUTION
   ========================================================= */

const PokerLabDealingRules = {

    getHoleCardsPerPlayer() {

        return POKER_RULES.holeCardsPerPlayer;

    },


    getCommunityCards(street) {

        return PokerLabStreets.getCommunityCardCount(
            street
        );

    },


    getTotalCommunityCards(street) {

        return PokerLabStreets.getTotalCommunityCards(
            street
        );

    },


    getRequiredCards(playerCount) {

        if (
            !Number.isInteger(playerCount) ||
            playerCount < 2 ||
            playerCount > 6
        ) {

            throw new Error(
                "Nombre de joueurs invalide."
            );

        }

        // Deux cartes privatives par joueur.
        // Cinq cartes communes.
        // Trois cartes brûlées : flop, turn et river.

        return (
            playerCount * 2 +
            5 +
            3
        );

    },


    canDeal(playerCount) {

        return (
            this.getRequiredCards(playerCount) <=
            POKER_RULES.deckSize
        );

    }

};


/* =========================================================
   9. INFORMATIONS GÉNÉRALES
   ========================================================= */

const PokerLabRulesInfo = {

    getSummary() {

        return {

            game: "Texas Hold'em No-Limit",

            deckSize: POKER_RULES.deckSize,

            holeCardsPerPlayer:
                POKER_RULES.holeCardsPerPlayer,

            communityCards:
                POKER_RULES.communityCards,

            minimumPlayers:
                POKER_RULES.minPlayers,

            maximumPlayers:
                POKER_RULES.maxPlayers,

            streets: PokerLabStreets.getAll(),

            defaultBlinds:
                PokerLabBlinds.getDefault()

        };

    }

};


/* =========================================================
   10. EXPORT DES MODULES
   ========================================================= */

window.PokerLabRules = {

    constants: POKER_RULES,

    streets: PokerLabStreets,

    formats: PokerLabFormats,

    positions: PokerLabPositions,

    actionOrder: PokerLabActionOrder,

    blinds: PokerLabBlinds,

    betting: PokerLabBettingRules,

    dealing: PokerLabDealingRules,

    info: PokerLabRulesInfo

};
