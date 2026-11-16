
/* =========================================================
   POKERLAB - POKER RULES
   Version : 2.0.0
   Description : Règles du Texas Hold'em No-Limit
   ========================================================= */

"use strict";


/* =========================================================
   1. CONSTANTES GÉNÉRALES
   ========================================================= */

const POKER_RULES: {
  deckSize: number; holeCardsPerPlayer: number; communityCards: number;
  maxPlayers: number; minPlayers: number; chipUnit: number;
  streets: string[]; communityCardsByStreet: Record<string, number>;
  defaultBlinds: {smallBlind: number;bigBlind: number};
  formats: Record<string, {name: string;minPlayers:number;maxPlayers:number}>;
} = {

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

    // Plus petite unité monétaire autorisée.

    chipUnit: 0.5,

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
    // 1 BB = 1 jeton.

    defaultBlinds: {

        smallBlind: 0.5,

        bigBlind: 1

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
   2. OUTILS DE VALIDATION
   ========================================================= */

const PokerLabValidation = {

    isFiniteNumber(value: unknown): value is number {

        return (
            typeof value === "number" &&
            Number.isFinite(value)
        );

    },


    isNonNegativeAmount(value: unknown): value is number {

        return (
            this.isFiniteNumber(value: unknown): value is number &&
            value >= 0
        );

    },


    // Vérifie qu'un montant respecte l'unité minimale
    // de 0,5 jeton.

    isChipAmount(value: unknown): value is number {

        if (
            !this.isNonNegativeAmount(value: unknown): value is number
        ) {
            return false;
        }

        const units =
            value / POKER_RULES.chipUnit;

        return Math.abs(
            units - Math.round(units)
        ) < 0.000001;

    },


    // Arrondit un montant à la plus petite unité autorisée.

    roundChipAmount(value: number) {

        if (!this.isFiniteNumber(value: unknown): value is number) {
            throw new Error(
                "Le montant doit être un nombre valide."
            );
        }

        const unit = POKER_RULES.chipUnit;

        return Math.round(value / unit) * unit;

    }

};


/* =========================================================
   3. GESTION DES PHASES DE JEU
   ========================================================= */

const PokerLabStreets = {

    getAll() {

        return [...POKER_RULES.streets];

    },


    isValid(street: string) {

        return POKER_RULES.streets.includes(street);

    },


    getNext(street: string) {

        const currentIndex =
            POKER_RULES.streets.indexOf(street);

        if (currentIndex === -1) {

            throw new Error(
                "Phase de jeu inconnue : " + street
            );

        }

        if (
            currentIndex >=
            POKER_RULES.streets.length - 1
        ) {

            return null;

        }

        return POKER_RULES.streets[
            currentIndex + 1
        ]!;

    },


    getCommunityCardCount(street: string) {

        if (!this.isValid(street: string)) {

            throw new Error(
                "Phase de jeu inconnue : " + street
            );

        }

        return POKER_RULES.communityCardsByStreet[street]!;

    },


    getTotalCommunityCards(street: string) {

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
                    POKER_RULES.streets[i]!
                ]!;

        }

        return total;

    }

};


/* =========================================================
   4. VALIDATION DES FORMATS DE JEU
   ========================================================= */

const PokerLabFormats = {

    get(format: string) {

        const selectedFormat =
            POKER_RULES.formats[format];

        if (!selectedFormat) {

            throw new Error(
                "Format de poker inconnu : " + format
            );

        }

        return { ...selectedFormat! };

    },


    isValid(format: string) {

        return Object.prototype.hasOwnProperty.call(
            POKER_RULES.formats,
            format
        );

    },


    validatePlayerCount(count: number, format = "sixMax") {

        if (!Number.isInteger(count)) {
            return false;
        }

        if (!this.isValid(format: string)) {
            return false;
        }

        const selectedFormat =
            POKER_RULES.formats[format];

        return (
            count >= selectedFormat!.minPlayers &&
            count <= selectedFormat!.maxPlayers
        );

    }

};


/* =========================================================
   5. GESTION DES POSITIONS À LA TABLE
   ========================================================= */

const PokerLabPositions = {

    // Retourne les positions en fonction du nombre de joueurs.

    getPositionNames(playerCount: number) {

        if (
            !Number.isInteger(playerCount) ||
            playerCount < 2 ||
            playerCount > 6
        ) {

            throw new Error(
                "Le nombre de joueurs doit être compris entre 2 et 6."
            );

        }

        const positionsByPlayerCount: Record<number, string[]> = {

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
            ...positionsByPlayerCount[playerCount]!
        ];

    },


    // Calcule la position de chaque siège.
    // Le dealerIndex représente le siège du bouton.

    getTablePositions(playerCount: number, dealerIndex = 0) {

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
            !Number.isInteger(dealerIndex) ||
            dealerIndex < 0 ||
            dealerIndex >= playerCount
        ) {

            throw new Error(
                "Index du bouton invalide."
            );

        }

        const positionNames =
            this.getPositionNames(playerCount: number);

        const positions: Array<{seatIndex:number;position:string;isDealer:boolean;isSmallBlind:boolean;isBigBlind:boolean}> = [];

        for (let i = 0; i < playerCount; i++) {

            const seatIndex =
                (dealerIndex + i) % playerCount;

            positions.push({

                seatIndex,

                position: positionNames[i]!,

                isDealer: i === 0,

                isSmallBlind:
                    positionNames[i]! === "SB" ||
                    positionNames[i]! === "BTN/SB",

                isBigBlind:
                    positionNames[i]! === "BB"

            });

        }

        return positions;

    },


    // Retourne la position d'un joueur précis.

    getPlayerPosition(playerIndex: number, playerCount: number, dealerIndex = 0) {

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

    getClockwiseOrder(startIndex: number, playerCount: number) {

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
   6. ORDRE DE PAROLE
   ========================================================= */

const PokerLabActionOrder = {

    // Ordre de parole préflop.
    // En heads-up, le bouton parle en premier.

    getPreflopOrder(playerCount: number, dealerIndex = 0, activeSeats: readonly number[] | null = null) {

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
                (bigBlind!.seatIndex + 1) % playerCount;

        }

        return this.filterActiveSeats(
            PokerLabPositions.getClockwiseOrder(startIndex: number, playerCount: number),
            activeSeats
        );

    },


    // Ordre de parole après le flop.
    // Le premier joueur actif après le bouton parle en premier.

    getPostflopOrder(playerCount: number, dealerIndex = 0, activeSeats: readonly number[] | null = null) {

        const startIndex =
            (dealerIndex + 1) % playerCount;

        return this.filterActiveSeats(
            PokerLabPositions.getClockwiseOrder(startIndex: number, playerCount: number),
            activeSeats
        );

    },


    // Permet d'exclure les joueurs couchés ou éliminés.

    filterActiveSeats(order: number[], activeSeats: readonly number[] | null) {

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
   7. GESTION DES BLINDS
   ========================================================= */

const PokerLabBlinds = {

    getDefault() {

        return {
            ...POKER_RULES.defaultBlinds
        };

    },


    validate(smallBlind: number, bigBlind: number) {

        return (

            PokerLabValidation.isChipAmount(
                smallBlind
            ) &&

            PokerLabValidation.isChipAmount(
                bigBlind
            ) &&

            smallBlind > 0 &&

            bigBlind > 0 &&

            smallBlind < bigBlind

        );

    },


    create(smallBlind = 0.5, bigBlind = 1) {

        if (
            !this.validate(smallBlind: number, bigBlind: number)
        ) {

            throw new Error(
                "Configuration des blinds invalide. " +
                "La petite blind doit être positive, " +
                "la big blind doit être supérieure, " +
                "et les montants doivent respecter des incréments de 0,5."
            );

        }

        return {

            smallBlind,

            bigBlind

        };

    }

};


/* =========================================================
   8. RÈGLES DES MISES
   ========================================================= */

const PokerLabBettingRules = {

    // Vérifie si un montant est valide.
    // Les montants doivent respecter l'unité de 0,5 jeton.

    isValidAmount(amount: unknown) {

        return PokerLabValidation.isChipAmount(
            amount
        );

    },


    // Retourne le montant minimum d'une ouverture
    // lorsque personne n'a encore misé volontairement.

    getMinimumOpeningBet(bigBlind: number) {

        if (
            !PokerLabValidation.isChipAmount(bigBlind) ||
            bigBlind <= 0
        ) {

            throw new Error(
                "Montant de big blind invalide."
            );

        }

        return bigBlind;

    },


    // Calcule le montant minimum total à atteindre
    // pour effectuer une relance.
    //
    // currentBet : mise totale actuelle à égaler.
    // lastFullRaise : taille de la dernière relance complète.

    getMinimumRaiseTo(currentBet: number, lastFullRaise: number) {

        if (
            !PokerLabValidation.isChipAmount(currentBet) ||
            !PokerLabValidation.isChipAmount(lastFullRaise) ||
            lastFullRaise <= 0
        ) {

            throw new Error(
                "Paramètres de relance invalides."
            );

        }

        return PokerLabValidation.roundChipAmount(
            currentBet + lastFullRaise
        );

    },


    // Calcule le montant que le joueur doit ajouter
    // pour égaliser la mise actuelle.

    getAmountToCall(currentBet: number, playerBet: number) {

        if (
            !PokerLabValidation.isChipAmount(currentBet) ||
            !PokerLabValidation.isChipAmount(playerBet)
        ) {

            throw new Error(
                "Montants de mise invalides."
            );

        }

        return PokerLabValidation.roundChipAmount(
            Math.max(
                0,
                currentBet - playerBet
            )
        );

    },


    // Vérifie si une relance est suffisamment importante
    // pour constituer une relance complète.

    isFullRaise(raiseTo: number, currentBet: number, lastFullRaise: number) {

        if (
            !PokerLabValidation.isChipAmount(raiseTo) ||
            !PokerLabValidation.isChipAmount(currentBet) ||
            !PokerLabValidation.isChipAmount(lastFullRaise) ||
            lastFullRaise <= 0
        ) {

            return false;

        }

        const raiseSize =
            raiseTo - currentBet;

        return (
            raiseSize >= lastFullRaise - 0.000001
        );

    },


    // Vérifie si une relance respecte le minimum.
    //
    // raiseTo : montant total que le joueur aura misé.
    // currentBet : mise totale actuelle.
    // lastFullRaise : taille de la dernière relance complète.

    validateRaise(raiseTo: number, currentBet: number, lastFullRaise: number) {

        if (
            !PokerLabValidation.isChipAmount(raiseTo) ||
            !PokerLabValidation.isChipAmount(currentBet) ||
            !PokerLabValidation.isChipAmount(lastFullRaise) ||
            lastFullRaise <= 0
        ) {

            return false;

        }

        const minimumRaiseTo =
            this.getMinimumRaiseTo(currentBet: number, lastFullRaise: number);

        return (
            raiseTo >= minimumRaiseTo - 0.000001
        );

    }

};


/* =========================================================
   9. RÈGLES DE DISTRIBUTION
   ========================================================= */

const PokerLabDealingRules = {

    getHoleCardsPerPlayer() {

        return POKER_RULES.holeCardsPerPlayer;

    },


    getCommunityCards(street: string) {

        return PokerLabStreets.getCommunityCardCount(
            street
        );

    },


    getTotalCommunityCards(street: string) {

        return PokerLabStreets.getTotalCommunityCards(
            street
        );

    },


    getRequiredCards(playerCount: number) {

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


    canDeal(playerCount: number) {

        return (
            this.getRequiredCards(playerCount: number) <=
            POKER_RULES.deckSize
        );

    }

};


/* =========================================================
   10. INFORMATIONS GÉNÉRALES
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

            chipUnit:
                POKER_RULES.chipUnit,

            streets:
                PokerLabStreets.getAll(),

            defaultBlinds:
                PokerLabBlinds.getDefault()

        };

    }

};


/* =========================================================
   11. EXPORT DES MODULES
   ========================================================= */

const pokerLabRules = {

    constants: POKER_RULES,

    validation: PokerLabValidation,

    streets: PokerLabStreets,

    formats: PokerLabFormats,

    positions: PokerLabPositions,

    actionOrder: PokerLabActionOrder,

    blinds: PokerLabBlinds,

    betting: PokerLabBettingRules,

    dealing: PokerLabDealingRules,

    info: PokerLabRulesInfo

};


export type PokerLabRulesApi = typeof pokerLabRules;
export function installPokerRules(): PokerLabRulesApi {
  (window as Window & { PokerLabRules?: PokerLabRulesApi }).PokerLabRules = pokerLabRules;
  return pokerLabRules;
}
