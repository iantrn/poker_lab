
/* =========================================================
   POKERLAB - GAME ENGINE
   Version : 2.1.0
   Description : Moteur Texas Hold'em No-Limit
   ========================================================= */

"use strict";


class PokerLabGameEngine {

    constructor(options = {}) {

        // Vérification des dépendances.

        if (typeof window.PokerLabDeck !== "function") {
            throw new Error("PokerLabDeck n'est pas chargé.");
        }

        if (!window.PokerLabRules) {
            throw new Error("PokerLabRules n'est pas chargé.");
        }

        if (!window.PokerLabHandEvaluator) {
            throw new Error("PokerLabHandEvaluator n'est pas chargé.");
        }

        if (!Array.isArray(options.players)) {
            throw new Error("La liste des joueurs est invalide.");
        }

        if (options.players.length < 2 || options.players.length > 6) {
            throw new Error("Une partie doit contenir entre 2 et 6 joueurs.");
        }

        // Blinds par défaut : SB = 0,5 / BB = 1.

        this.blinds = window.PokerLabRules.blinds.create(
            options.smallBlind ?? 0.5,
            options.bigBlind ?? 1
        );

        this.players = this.createPlayers(options.players);

        if (this.getPlayersWithChips().length < 2) {
            throw new Error("Il faut au moins deux joueurs avec des jetons.");
        }

        this.dealerIndex = options.dealerIndex ?? 0;

        if (
            !Number.isInteger(this.dealerIndex) ||
            this.dealerIndex < 0 ||
            this.dealerIndex >= this.players.length
        ) {
            throw new Error("Position du bouton invalide.");
        }

        if (this.players[this.dealerIndex].stack <= 0) {
            this.dealerIndex = this.getNextOccupiedSeat(
                (this.dealerIndex + 1) % this.players.length
            );
        }

        // État de la partie.

        this.deck = null;
        this.board = [];
        this.street = "waiting";

        this.currentBet = 0;
        this.lastFullRaise = this.blinds.bigBlind;

        this.pendingPlayers = [];
        this.currentPlayerId = null;

        this.handNumber = 0;
        this.handComplete = true;
        this.handStarted = false;

        this.handHistory = [];
        this.lastResult = null;

        // Sièges et positions figés pendant chaque main.

        this.handSeatIndices = [];
        this.handPositions = [];

    }


    /* =====================================================
       1. GESTION DES DEMI-JETONS
       ===================================================== */

    toChipUnits(amount) {

        if (!Number.isFinite(amount)) {
            throw new Error("Montant de jetons invalide.");
        }

        return Math.round(amount * 2);

    }


    fromChipUnits(units) {

        return units / 2;

    }


    normalizeChips(amount) {

        return this.fromChipUnits(
            this.toChipUnits(amount)
        );

    }


    isValidChipAmount(amount) {

        if (
            !Number.isFinite(amount) ||
            amount < 0
        ) {
            return false;
        }

        return Math.abs(
            amount * 2 - Math.round(amount * 2)
        ) < 0.000001;

    }


    assertValidChipAmount(amount, label = "Montant") {

        if (!this.isValidChipAmount(amount)) {
            throw new Error(
                `${label} : les montants doivent être des multiples de 0,5.`
            );
        }

    }


    /* =====================================================
       2. CRÉATION DES JOUEURS
       ===================================================== */

    createPlayers(players) {

        const identifiers = new Set();

        return players.map((player, index) => {

            if (
                !player ||
                !Number.isFinite(player.stack) ||
                player.stack < 0
            ) {
                throw new Error(
                    `Stack invalide pour le joueur ${index + 1}.`
                );
            }

            this.assertValidChipAmount(
                player.stack,
                `Stack du joueur ${index + 1}`
            );

            const id = player.id ?? `player_${index + 1}`;

            if (identifiers.has(id)) {
                throw new Error(
                    "Deux joueurs possèdent le même identifiant."
                );
            }

            identifiers.add(id);

            return {

                id,

                name: player.name ?? `Joueur ${index + 1}`,

                stack: this.normalizeChips(player.stack),

                isHuman: player.isHuman ?? false,
                isBot: player.isBot ?? false,

                botProfile:
                    player.botProfile ??
                    player.profile ??
                    "balanced",

                botDifficulty:
                    player.botDifficulty ??
                    player.difficulty ??
                    "medium",

                holeCards: [],

                streetBet: 0,
                totalContribution: 0,

                folded: false,
                allIn: false,

                hasActed: false,

                lastActedBet: 0,

                position: null

            };

        });

    }


    /* =====================================================
       3. OUTILS SUR LES JOUEURS
       ===================================================== */

    getPlayer(playerId) {

        const player = this.players.find(
            (item) => item.id === playerId
        );

        if (!player) {
            throw new Error("Joueur introuvable : " + playerId);
        }

        return player;

    }


    getPlayersInHand() {

        return this.players.filter(
            (player) =>
                !player.folded &&
                player.holeCards.length === 2
        );

    }


    getActionablePlayers() {

        return this.players.filter(
            (player) =>
                !player.folded &&
                !player.allIn &&
                player.stack > 0 &&
                player.holeCards.length === 2
        );

    }


    getPlayersWithChips() {

        return this.players.filter(
            (player) => player.stack > 0
        );

    }


    getNextOccupiedSeat(startIndex) {

        for (let i = 0; i < this.players.length; i++) {

            const index =
                (startIndex + i) % this.players.length;

            if (this.players[index].stack > 0) {
                return index;
            }

        }

        return -1;

    }


    getClockwiseOrder(startIndex) {

        const order = [];

        for (let i = 0; i < this.players.length; i++) {

            order.push(
                (startIndex + i) % this.players.length
            );

        }

        return order;

    }


    getActiveSeatIndices() {

        if (this.handSeatIndices.length > 0) {
            return [...this.handSeatIndices];
        }

        return this.players
            .map((player, index) => ({
                player,
                index
            }))
            .filter((item) => item.player.stack > 0)
            .map((item) => item.index);

    }


    /* =====================================================
       4. POSITIONS À LA TABLE
       ===================================================== */

    getActivePositions() {

        if (this.handPositions.length > 0) {

            return this.handPositions.map(
                (position) => ({ ...position })
            );

        }

        const activeSeats = this.getClockwiseOrder(
            this.dealerIndex
        ).filter(
            (seatIndex) => this.players[seatIndex].stack > 0
        );

        if (activeSeats.length < 2) {
            throw new Error("Il faut au moins deux joueurs actifs.");
        }

        const positionNames =
            window.PokerLabRules.positions.getPositionNames(
                activeSeats.length
            );

        if (activeSeats.length === 4) {
            positionNames[3] = "UTG";
        }

        return activeSeats.map((seatIndex, index) => {

            const position = positionNames[index];

            return {

                seatIndex,
                position,

                isDealer: index === 0,

                isSmallBlind:
                    position === "SB" ||
                    position === "BTN/SB",

                isBigBlind: position === "BB"

            };

        });

    }


    /* =====================================================
       5. DÉMARRAGE D'UNE MAIN
       ===================================================== */

    startHand() {

        if (this.getPlayersWithChips().length < 2) {
            throw new Error(
                "Il faut au moins deux joueurs avec des jetons."
            );
        }

        if (this.players[this.dealerIndex].stack <= 0) {

            this.dealerIndex = this.getNextOccupiedSeat(
                (this.dealerIndex + 1) % this.players.length
            );

        }

        if (this.dealerIndex === -1) {
            throw new Error("Aucun joueur ne peut recevoir le bouton.");
        }

        this.handNumber++;

        this.handHistory = [];

        this.deck = new window.PokerLabDeck();

        this.board = [];
        this.street = "preflop";

        this.currentBet = 0;
        this.lastFullRaise = this.blinds.bigBlind;

        this.pendingPlayers = [];
        this.currentPlayerId = null;

        this.handComplete = false;
        this.handStarted = true;

        this.lastResult = null;

        // Réinitialisation des joueurs.

        for (const player of this.players) {

            player.holeCards = [];

            player.streetBet = 0;
            player.totalContribution = 0;

            player.folded = player.stack <= 0;
            player.allIn = false;

            player.hasActed = false;
            player.lastActedBet = 0;

            player.position = null;

        }

        // Fixation des sièges occupés.

        this.handSeatIndices = this.getClockwiseOrder(
            this.dealerIndex
        ).filter(
            (seatIndex) => this.players[seatIndex].stack > 0
        );

        if (this.handSeatIndices.length < 2) {
            throw new Error("Nombre de joueurs actifs insuffisant.");
        }

        // Attribution des positions.

        const positionNames =
            window.PokerLabRules.positions.getPositionNames(
                this.handSeatIndices.length
            );

        if (this.handSeatIndices.length === 4) {
            positionNames[3] = "UTG";
        }

        this.handPositions = this.handSeatIndices.map(
            (seatIndex, index) => {

                const position = positionNames[index];

                return {

                    seatIndex,
                    position,

                    isDealer: index === 0,

                    isSmallBlind:
                        position === "SB" ||
                        position === "BTN/SB",

                    isBigBlind: position === "BB"

                };

            }
        );

        this.dealHoleCards();

        this.postBlinds();

        this.initializePreflopAction();

        this.recordEvent("hand_started", {

            handNumber: this.handNumber,

            dealerIndex: this.dealerIndex,

            blinds: { ...this.blinds },

            positions: this.handPositions.map(
                (item) => ({
                    seatIndex: item.seatIndex,
                    position: item.position
                })
            )

        });

        this.resolveAutomaticProgress();

        return this.getState();

    }


    /* =====================================================
       6. DISTRIBUTION DES CARTES PRIVATIVES
       ===================================================== */

    dealHoleCards() {

        const positions = this.getActivePositions();

        let firstSeat;

        if (positions.length === 2) {

            firstSeat = this.dealerIndex;

        } else {

            const smallBlindPosition = positions.find(
                (position) => position.isSmallBlind
            );

            if (!smallBlindPosition) {
                throw new Error("Petite blind introuvable.");
            }

            firstSeat = smallBlindPosition.seatIndex;

        }

        const order = this.getClockwiseOrder(firstSeat).filter(
            (seatIndex) => this.handSeatIndices.includes(seatIndex)
        );

        for (let round = 0; round < 2; round++) {

            for (const seatIndex of order) {

                this.players[seatIndex].holeCards.push(
                    this.deck.drawOne()
                );

            }

        }

    }


    /* =====================================================
       7. PLACEMENT DES BLINDS
       ===================================================== */

    postBlinds() {

        const positions = this.getActivePositions();

        const smallBlindPosition = positions.find(
            (position) => position.isSmallBlind
        );

        const bigBlindPosition = positions.find(
            (position) => position.isBigBlind
        );

        if (!smallBlindPosition || !bigBlindPosition) {
            throw new Error("Impossible de déterminer les blinds.");
        }

        const smallBlindPlayer =
            this.players[smallBlindPosition.seatIndex];

        const bigBlindPlayer =
            this.players[bigBlindPosition.seatIndex];

        const smallBlindPaid = this.commitChips(
            smallBlindPlayer,
            Math.min(
                this.blinds.smallBlind,
                smallBlindPlayer.stack
            )
        );

        const bigBlindPaid = this.commitChips(
            bigBlindPlayer,
            Math.min(
                this.blinds.bigBlind,
                bigBlindPlayer.stack
            )
        );

        this.currentBet = Math.max(
            smallBlindPlayer.streetBet,
            bigBlindPlayer.streetBet
        );

        this.recordEvent("blinds_posted", {

            smallBlind: smallBlindPlayer.id,
            smallBlindAmount: smallBlindPaid,

            bigBlind: bigBlindPlayer.id,
            bigBlindAmount: bigBlindPaid

        });

    }


    /* =====================================================
       8. ORDRE DE PAROLE PRÉFLOP
       ===================================================== */

    initializePreflopAction() {

        const positions = this.getActivePositions();

        let firstSeat;

        if (positions.length === 2) {

            firstSeat = this.dealerIndex;

        } else {

            const bigBlindPosition = positions.find(
                (position) => position.isBigBlind
            );

            if (!bigBlindPosition) {
                throw new Error("Big Blind introuvable.");
            }

            firstSeat =
                (bigBlindPosition.seatIndex + 1) %
                this.players.length;

        }

        const order = this.getClockwiseOrder(firstSeat);

        this.pendingPlayers = order.filter(
            (seatIndex) => {

                const player = this.players[seatIndex];

                return (
                    this.handSeatIndices.includes(seatIndex) &&
                    !player.folded &&
                    !player.allIn &&
                    player.stack > 0
                );

            }
        );

        this.updateCurrentPlayer();

    }


    /* =====================================================
       9. GESTION DES JETONS
       ===================================================== */

    commitChips(player, amount) {

        this.assertValidChipAmount(amount);

        if (
            amount < 0 ||
            amount > player.stack + 0.000001
        ) {
            throw new Error("Montant de jetons invalide.");
        }

        const paidAmount = this.normalizeChips(amount);

        player.stack = this.normalizeChips(
            player.stack - paidAmount
        );

        player.streetBet = this.normalizeChips(
            player.streetBet + paidAmount
        );

        player.totalContribution = this.normalizeChips(
            player.totalContribution + paidAmount
        );

        if (player.stack === 0) {
            player.allIn = true;
        }

        return paidAmount;

    }


    getPot() {

        const total = this.players.reduce(
            (sum, player) =>
                sum + player.totalContribution,
            0
        );

        return this.normalizeChips(total);

    }


    getAmountToCall(player) {

        return this.normalizeChips(
            Math.max(
                0,
                this.currentBet - player.streetBet
            )
        );

    }


    getMinimumRaiseTo() {

        return this.normalizeChips(
            this.currentBet + this.lastFullRaise
        );

    }


    /* =====================================================
       10. DROIT DE RELANCE
       ===================================================== */

    canPlayerRaise(player) {

        if (
            player.folded ||
            player.allIn ||
            player.stack <= 0
        ) {
            return false;
        }

        const actionablePlayers =
            this.getActionablePlayers();

        if (actionablePlayers.length < 2) {
            return false;
        }

        if (!player.hasActed) {
            return true;
        }

        // Les relances courtes cumulées peuvent rouvrir
        // les enchères pour un joueur ayant déjà agi.

        return (
            this.currentBet - player.lastActedBet >=
            this.lastFullRaise - 0.000001
        );

    }


    getPlayerActionOptions(playerId) {

        const player = this.getPlayer(playerId);

        const callAmount =
            this.getAmountToCall(player);

        const actionablePlayers =
            this.getActionablePlayers();

        const canRaise =
            this.canPlayerRaise(player);

        const canBet =
            this.currentBet === 0 &&
            actionablePlayers.length >= 2;

        const maximumRaiseTo =
            this.normalizeChips(
                player.streetBet + player.stack
            );

        const allInRaises =
            maximumRaiseTo > this.currentBet;

        const allInIsCall =
            maximumRaiseTo <= this.currentBet;

        return {

            canFold: true,

            canCheck: callAmount === 0,

            canCall: callAmount > 0,

            callAmount,

            canBet,

            minimumBet: this.blinds.bigBlind,

            maximumBet: player.stack,

            canRaise,

            minimumRaiseTo: this.getMinimumRaiseTo(),

            maximumRaiseTo,

            // Un tapis est possible si :
            // - il s'agit d'un call à tapis ;
            // - ou le joueur possède le droit de relancer.

            isAllIn:
                player.stack > 0 &&
                (
                    allInIsCall ||
                    (allInRaises && canRaise)
                )

        };

    }


    /* =====================================================
       11. JOUEUR ACTUEL
       ===================================================== */

    updateCurrentPlayer() {

        this.currentPlayerId =
            this.pendingPlayers.length > 0
                ? this.players[this.pendingPlayers[0]].id
                : null;

    }


    requireCurrentPlayer(playerId) {

        if (this.handComplete) {
            throw new Error("La main est terminée.");
        }

        const activeId =
            playerId ?? this.currentPlayerId;

        if (!activeId) {
            throw new Error("Aucun joueur ne peut agir.");
        }

        if (activeId !== this.currentPlayerId) {
            throw new Error("Ce n'est pas le tour de ce joueur.");
        }

        const player = this.getPlayer(activeId);

        if (
            player.folded ||
            player.allIn ||
            player.stack <= 0
        ) {
            throw new Error("Ce joueur ne peut pas agir.");
        }

        return player;

    }


    /* =====================================================
       12. ENREGISTREMENT D'UNE ACTION
       ===================================================== */

    markPlayerActed(player) {

        player.hasActed = true;

        player.lastActedBet = player.streetBet;

    }


    /* =====================================================
       13. EXÉCUTION DES ACTIONS
       ===================================================== */

    act(action, amount = null, playerId = null) {

        const player = this.requireCurrentPlayer(playerId);

        let result;

        switch (action) {

            case "fold":
                result = this.fold(player);
                break;

            case "check":
                result = this.check(player);
                break;

            case "call":
                result = this.call(player);
                break;

            case "bet":
                result = this.bet(player, amount);
                break;

            case "raise":
            case "raiseTo":
                result = this.raiseTo(player, amount);
                break;

            case "allIn":
            case "all-in":
            case "all_in":
                result = this.allIn(player);
                break;

            default:
                throw new Error("Action inconnue : " + action);

        }

        this.resolveAutomaticProgress();

        return result;

    }


    /* =====================================================
       14. FOLD
       ===================================================== */

    fold(player) {

        player.folded = true;

        this.markPlayerActed(player);

        this.removeFromPending(player);

        this.recordAction(player, "fold", 0);

        return {

            action: "fold",

            playerId: player.id

        };

    }


    /* =====================================================
       15. CHECK
       ===================================================== */

    check(player) {

        if (this.getAmountToCall(player) > 0) {
            throw new Error(
                "Impossible de checker : une mise doit être égalisée."
            );
        }

        this.markPlayerActed(player);

        this.removeFromPending(player);

        this.recordAction(player, "check", 0);

        return {

            action: "check",

            playerId: player.id

        };

    }


    /* =====================================================
       16. CALL
       ===================================================== */

    call(player) {

        const amountToCall =
            this.getAmountToCall(player);

        if (amountToCall <= 0) {
            throw new Error(
                "Aucune mise à égaliser. Utilisez check."
            );
        }

        const paidAmount = this.commitChips(
            player,
            Math.min(amountToCall, player.stack)
        );

        this.markPlayerActed(player);

        this.removeFromPending(player);

        this.recordAction(player, "call", paidAmount);

        return {

            action: "call",

            playerId: player.id,

            amount: paidAmount,

            allIn: player.allIn

        };

    }


    /* =====================================================
       17. BET
       ===================================================== */

    bet(player, amount) {

        this.assertValidChipAmount(amount, "Mise");

        if (this.currentBet > 0) {
            throw new Error(
                "Une mise existe déjà : utilisez raiseTo."
            );
        }

        if (
            amount <= 0 ||
            amount > player.stack
        ) {
            throw new Error("Montant de mise invalide.");
        }

        if (this.getActionablePlayers().length < 2) {
            throw new Error(
                "Impossible de miser : aucun adversaire ne peut répondre."
            );
        }

        const isAllIn =
            Math.abs(amount - player.stack) < 0.000001;

        const minimumBet =
            window.PokerLabRules.betting.getMinimumOpeningBet(
                this.blinds.bigBlind
            );

        if (amount < minimumBet && !isAllIn) {
            throw new Error(
                "La mise minimale est égale à une Big Blind."
            );
        }

        const paidAmount =
            this.commitChips(player, amount);

        this.currentBet = player.streetBet;

        const isFullOpening =
            paidAmount >= minimumBet;

        if (isFullOpening) {
            this.lastFullRaise = paidAmount;
        }

        this.markPlayerActed(player);

        this.rebuildPendingAfterAggression(player);

        this.recordAction(
            player,
            isFullOpening ? "bet" : "short_all_in_bet",
            paidAmount
        );

        return {

            action: isFullOpening
                ? "bet"
                : "short_all_in_bet",

            playerId: player.id,

            amount: paidAmount,

            allIn: player.allIn

        };

    }


    /* =====================================================
       18. RAISE TO
       ===================================================== */

    raiseTo(player, raiseToAmount) {

        this.assertValidChipAmount(
            raiseToAmount,
            "Montant de relance"
        );

        if (raiseToAmount <= this.currentBet) {
            throw new Error(
                "Le montant de relance doit dépasser la mise actuelle."
            );
        }

        if (!this.canPlayerRaise(player)) {
            throw new Error(
                "Les enchères ne sont pas réouvertes pour ce joueur."
            );
        }

        const additionalAmount =
            this.normalizeChips(
                raiseToAmount - player.streetBet
            );

        if (additionalAmount > player.stack) {
            throw new Error("Stack insuffisant pour cette relance.");
        }

        if (additionalAmount <= 0) {
            throw new Error("Montant de relance invalide.");
        }

        const isAllIn =
            Math.abs(additionalAmount - player.stack) < 0.000001;

        const raiseSize =
            this.normalizeChips(
                raiseToAmount - this.currentBet
            );

        const isFullRaise =
            raiseSize >= this.lastFullRaise - 0.000001;

        if (!isFullRaise && !isAllIn) {
            throw new Error(
                "Cette relance est inférieure au minimum autorisé."
            );
        }

        const paidAmount = this.commitChips(
            player,
            additionalAmount
        );

        this.currentBet = player.streetBet;

        if (isFullRaise) {
            this.lastFullRaise = raiseSize;
        }

        this.markPlayerActed(player);

        this.rebuildPendingAfterAggression(player);

        this.recordAction(
            player,
            isFullRaise ? "raise" : "short_raise",
            paidAmount
        );

        return {

            action: isFullRaise
                ? "raise"
                : "short_raise",

            playerId: player.id,

            amount: paidAmount,

            raiseTo: player.streetBet,

            raiseSize,

            allIn: player.allIn

        };

    }


    /* =====================================================
       19. ALL-IN
       ===================================================== */

    allIn(player) {

        if (player.stack <= 0) {
            throw new Error(
                "Ce joueur ne possède plus de jetons."
            );
        }

        const amount = player.stack;

        const resultingBet =
            this.normalizeChips(
                player.streetBet + amount
            );

        if (resultingBet > this.currentBet) {

            if (this.currentBet === 0) {
                return this.bet(player, amount);
            }

            if (!this.canPlayerRaise(player)) {
                throw new Error(
                    "Ce joueur ne peut pas effectuer une relance à tapis."
                );
            }

            return this.raiseTo(player, resultingBet);

        }

        // Tapis inférieur ou égal au montant à égaliser.

        const paidAmount = this.commitChips(
            player,
            amount
        );

        this.markPlayerActed(player);

        this.removeFromPending(player);

        this.recordAction(
            player,
            "all_in_call",
            paidAmount
        );

        return {

            action: "all_in_call",

            playerId: player.id,

            amount: paidAmount,

            allIn: true

        };

    }


    /* =====================================================
       20. GESTION DE LA FILE D'ATTENTE
       ===================================================== */

    removeFromPending(player) {

        this.pendingPlayers =
            this.pendingPlayers.filter(
                (seatIndex) =>
                    this.players[seatIndex].id !== player.id
            );

        this.updateCurrentPlayer();

    }


    rebuildPendingAfterAggression(player) {

        const nextSeat =
            (this.players.indexOf(player) + 1) %
            this.players.length;

        const existingPending =
            new Set(this.pendingPlayers);

        const newPending = [];

        for (const seatIndex of this.getClockwiseOrder(nextSeat)) {

            const candidate = this.players[seatIndex];

            if (
                candidate.id === player.id ||
                candidate.folded ||
                candidate.allIn ||
                candidate.stack <= 0 ||
                candidate.holeCards.length !== 2
            ) {
                continue;
            }

            const mustRespond =
                candidate.streetBet < this.currentBet;

            if (
                existingPending.has(seatIndex) ||
                mustRespond
            ) {
                newPending.push(seatIndex);
            }

        }

        this.pendingPlayers = newPending;

        this.updateCurrentPlayer();

    }


    /* =====================================================
       21. RÉSOLUTION AUTOMATIQUE
       ===================================================== */

    resolveAutomaticProgress() {

        if (this.handComplete) {
            return;
        }

        const playersInHand =
            this.getPlayersInHand();

        if (playersInHand.length === 1) {
            this.awardUncontestedPot();
            return;
        }

        const actionablePlayers =
            this.getActionablePlayers();

        if (actionablePlayers.length === 0) {
            this.runoutBoard();
            return;
        }

        // Un seul joueur peut encore agir.
        // Il peut devoir égaliser une mise existante.

        if (actionablePlayers.length === 1) {

            const solePlayer = actionablePlayers[0];

            if (
                this.pendingPlayers.length === 0 ||
                (
                    this.pendingPlayers.length === 1 &&
                    this.getAmountToCall(solePlayer) === 0
                )
            ) {
                this.runoutBoard();
            }

            return;

        }

        if (this.pendingPlayers.length === 0) {
            this.endBettingRound();
        }

    }


    /* =====================================================
       22. FIN D'UN TOUR D'ENCHÈRES
       ===================================================== */

    endBettingRound() {

        if (this.handComplete) {
            return;
        }

        if (this.getActionablePlayers().length <= 1) {
            this.runoutBoard();
            return;
        }

        this.advanceStreet();

    }


    /* =====================================================
       23. PASSAGE À LA PHASE SUIVANTE
       ===================================================== */

    advanceStreet() {

        const nextStreet =
            window.PokerLabRules.streets.getNext(this.street);

        if (!nextStreet || nextStreet === "showdown") {
            this.showdown();
            return;
        }

        this.street = nextStreet;

        this.dealCommunityCards();

        this.currentBet = 0;

        this.lastFullRaise = this.blinds.bigBlind;

        for (const player of this.players) {

            player.streetBet = 0;

            player.hasActed = false;

            player.lastActedBet = 0;

        }

        this.initializePostflopAction();

        this.recordEvent("street_changed", {

            street: this.street,

            board: [...this.board]

        });

        this.resolveAutomaticProgress();

    }


    /* =====================================================
       24. DISTRIBUTION DU BOARD
       ===================================================== */

    dealCommunityCards() {

        if (this.street === "flop") {

            this.deck.drawOne();

            this.board.push(
                ...this.deck.draw(3)
            );

        } else if (
            this.street === "turn" ||
            this.street === "river"
        ) {

            this.deck.drawOne();

            this.board.push(
                this.deck.drawOne()
            );

        }

    }


    /* =====================================================
       25. ORDRE DE PAROLE POSTFLOP
       ===================================================== */

    initializePostflopAction() {

        const nextSeat =
            (this.dealerIndex + 1) %
            this.players.length;

        this.pendingPlayers =
            this.getClockwiseOrder(nextSeat).filter(
                (seatIndex) => {

                    const player = this.players[seatIndex];

                    return (
                        this.handSeatIndices.includes(seatIndex) &&
                        !player.folded &&
                        !player.allIn &&
                        player.stack > 0
                    );

                }
            );

        this.updateCurrentPlayer();

    }


    /* =====================================================
       26. DISTRIBUTION AUTOMATIQUE DU BOARD
       ===================================================== */

    runoutBoard() {

        if (this.handComplete) {
            return;
        }

        while (this.board.length < 5) {

            if (this.street === "preflop") {

                this.street = "flop";

                this.dealCommunityCards();

            } else if (this.street === "flop") {

                this.street = "turn";

                this.dealCommunityCards();

            } else if (this.street === "turn") {

                this.street = "river";

                this.dealCommunityCards();

            } else {

                break;

            }

        }

        this.pendingPlayers = [];

        this.currentPlayerId = null;

        this.showdown();

    }


    /* =====================================================
       27. CONSTRUCTION DES POTS SECONDAIRES
       ===================================================== */

    buildSidePots() {

        const levels = [
            ...new Set(
                this.players
                    .map((player) => player.totalContribution)
                    .filter((amount) => amount > 0)
            )
        ].sort((a, b) => a - b);

        const pots = [];

        let previousLevel = 0;

        for (const level of levels) {

            const contributors = this.players.filter(
                (player) =>
                    player.totalContribution >= level
            );

            const amount =
                this.normalizeChips(
                    (level - previousLevel) *
                    contributors.length
                );

            let eligiblePlayers = contributors.filter(
                (player) => !player.folded
            );

            // Une couche constituée uniquement de contributions
            // de joueurs couchés reste attribuée aux joueurs
            // encore en jeu.

            if (eligiblePlayers.length === 0) {
                eligiblePlayers = this.getPlayersInHand();
            }

            if (amount > 0) {

                if (eligiblePlayers.length === 0) {
                    throw new Error(
                        "Un pot secondaire ne possède aucun joueur éligible."
                    );
                }

                pots.push({

                    amount,

                    lowerLevel: previousLevel,

                    upperLevel: level,

                    eligiblePlayerIds:
                        eligiblePlayers.map(
                            (player) => player.id
                        )

                });

            }

            previousLevel = level;

        }

        return pots;

    }


    /* =====================================================
       28. ÉVALUATION DES JOUEURS
       ===================================================== */

    evaluatePlayer(player) {

        return window.PokerLabHandEvaluator.evaluate([

            ...player.holeCards,

            ...this.board

        ]);

    }


    /* =====================================================
       29. ORDRE DES JETONS IMPAIRS
       ===================================================== */

    getOddChipOrder(winners) {

        const winnerIds = new Set(
            winners.map((player) => player.id)
        );

        const startSeat =
            (this.dealerIndex + 1) %
            this.players.length;

        return this.getClockwiseOrder(startSeat)
            .map((seatIndex) => this.players[seatIndex])
            .filter(
                (player) => winnerIds.has(player.id)
            );

    }


    /* =====================================================
       30. DISTRIBUTION D'UN POT
       ===================================================== */

    distributePot(pot, evaluations) {

        const eligiblePlayers =
            evaluations.filter(
                (item) =>
                    pot.eligiblePlayerIds.includes(
                        item.player.id
                    )
            );

        if (eligiblePlayers.length === 0) {
            throw new Error(
                "Aucun joueur ne peut remporter ce pot."
            );
        }

        let bestScore = null;

        let winners = [];

        for (const item of eligiblePlayers) {

            const comparison = bestScore === null
                ? 1
                : window.PokerLabHandEvaluator.compareScores(
                    item.evaluation.score,
                    bestScore
                );

            if (comparison > 0) {

                bestScore = item.evaluation.score;

                winners = [item.player];

            } else if (comparison === 0) {

                winners.push(item.player);

            }

        }

        // Le pot est converti en unités de 0,5 jeton.
        // Le partage est réalisé en unités entières.
        // Cela permet notamment de partager 1 jeton
        // entre deux joueurs à hauteur de 0,5 chacun.

        const potUnits =
            this.toChipUnits(pot.amount);

        const baseShareUnits =
            Math.floor(potUnits / winners.length);

        let remainderUnits =
            potUnits % winners.length;

        const share =
            this.fromChipUnits(baseShareUnits);

        for (const winner of winners) {

            winner.stack = this.normalizeChips(
                winner.stack +
                this.fromChipUnits(baseShareUnits)
            );

        }

        const oddChipOrder =
            this.getOddChipOrder(winners);

        const oddChipRecipients = [];

        for (const winner of oddChipOrder) {

            if (remainderUnits <= 0) {
                break;
            }

            winner.stack = this.normalizeChips(
                winner.stack + 0.5
            );

            remainderUnits--;

            oddChipRecipients.push(winner.id);

        }

        if (remainderUnits !== 0) {
            throw new Error(
                "Erreur lors de la distribution des jetons restants."
            );
        }

        const winningEvaluation =
            eligiblePlayers.find(
                (item) => winners.includes(item.player)
            ).evaluation;

        return {

            amount: pot.amount,

            winnerIds: winners.map(
                (winner) => winner.id
            ),

            isTie: winners.length > 1,

            share,

            oddChipRecipients,

            category: winningEvaluation.categoryLabel

        };

    }


    /* =====================================================
       31. SHOWDOWN
       ===================================================== */

    showdown() {

        if (this.handComplete) {
            return this.lastResult;
        }

        if (this.board.length !== 5) {
            throw new Error(
                "Le board doit contenir cinq cartes au showdown."
            );
        }

        const playersInHand =
            this.getPlayersInHand();

        if (playersInHand.length === 0) {
            throw new Error(
                "Aucun joueur ne reste dans la main."
            );
        }

        if (playersInHand.length === 1) {
            return this.awardUncontestedPot();
        }

        const evaluations = playersInHand.map(
            (player) => ({

                player,

                evaluation: this.evaluatePlayer(player)

            })
        );

        const sidePots = this.buildSidePots();

        const distributedPots = [];

        for (const pot of sidePots) {

            distributedPots.push(
                this.distributePot(pot, evaluations)
            );

        }

        const totalPot =
            this.normalizeChips(
                sidePots.reduce(
                    (total, pot) => total + pot.amount,
                    0
                )
            );

        const winnerIds = [
            ...new Set(
                distributedPots.flatMap(
                    (pot) => pot.winnerIds
                )
            )
        ];

        this.lastResult = {

            type: "showdown",

            handNumber: this.handNumber,

            board: [...this.board],

            totalPot,

            pots: distributedPots,

            winnerIds,

            evaluations: evaluations.map(
                (item) => ({

                    playerId: item.player.id,

                    playerName: item.player.name,

                    category:
                        item.evaluation.categoryLabel,

                    score: [
                        ...item.evaluation.score
                    ],

                    bestFiveCards: [
                        ...item.evaluation.bestFiveCards
                    ]

                })
            )

        };

        this.finishHand();

        return this.lastResult;

    }


    /* =====================================================
       32. POT NON CONTESTÉ
       ===================================================== */

    awardUncontestedPot() {

        const remainingPlayers =
            this.getPlayersInHand();

        if (remainingPlayers.length !== 1) {
            throw new Error(
                "Situation de jeu invalide."
            );
        }

        const winner = remainingPlayers[0];

        const amount = this.getPot();

        winner.stack = this.normalizeChips(
            winner.stack + amount
        );

        this.lastResult = {

            type: "uncontested",

            handNumber: this.handNumber,

            totalPot: amount,

            winnerIds: [winner.id],

            pots: [{

                amount,

                winnerIds: [winner.id],

                isTie: false

            }]

        };

        this.recordEvent("uncontested_pot", {

            winnerId: winner.id,

            amount

        });

        this.finishHand();

        return this.lastResult;

    }


    /* =====================================================
       33. FIN DE LA MAIN
       ===================================================== */

    finishHand() {

        this.handComplete = true;

        this.street = "complete";

        this.pendingPlayers = [];

        this.currentPlayerId = null;

        this.recordEvent("hand_complete", {

            result: this.lastResult

        });

    }


    /* =====================================================
       34. HISTORIQUE
       ===================================================== */

    recordAction(player, action, amount) {

        this.recordEvent("player_action", {

            playerId: player.id,

            playerName: player.name,

            action,

            amount,

            street: this.street,

            pot: this.getPot()

        });

    }


    recordEvent(type, data = {}) {

        this.handHistory.push({

            type,

            timestamp: Date.now(),

            street: this.street,

            data

        });

    }


    getHandHistory() {

        return JSON.parse(
            JSON.stringify(this.handHistory)
        );

    }


    /* =====================================================
       35. INTÉGRATION DES BOTS
       ===================================================== */

    getBotContext(playerId) {

        const player = this.getPlayer(playerId);

        if (!player.isBot) {
            throw new Error(
                "Ce joueur n'est pas un bot."
            );
        }

        if (player.id !== this.currentPlayerId) {
            throw new Error(
                "Ce n'est pas le tour de ce bot."
            );
        }

        const opponentsRemaining =
            this.getPlayersInHand().filter(
                (opponent) => opponent.id !== player.id
            ).length;

        return {

            holeCards: [...player.holeCards],

            communityCards: [...this.board],

            pot: this.getPot(),

            callAmount: this.getAmountToCall(player),

            currentBet: this.currentBet,

            currentContribution: player.streetBet,

            minRaise: this.lastFullRaise,

            stack: player.stack,

            street: this.street,

            position: player.position,

            opponentsRemaining,

            canRaise: this.canPlayerRaise(player),

            profile: player.botProfile,

            difficulty: player.botDifficulty

        };

    }


    decideBotTurn(playerId) {

        if (!window.PokerLabBotEngine) {
            throw new Error(
                "PokerLabBotEngine n'est pas chargé."
            );
        }

        const context = this.getBotContext(playerId);

        return window.PokerLabBotEngine.decide(context);

    }


    playBotTurn(playerId = this.currentPlayerId) {

        const player = this.getPlayer(playerId);

        if (!player.isBot) {
            throw new Error(
                "Le joueur actuel n'est pas un bot."
            );
        }

        const decision = this.decideBotTurn(playerId);

        let result;

        switch (decision.action) {

            case "fold":
                result = this.act("fold", null, playerId);
                break;

            case "check":
                result = this.act("check", null, playerId);
                break;

            case "call":
                result = this.act("call", null, playerId);
                break;

            case "bet":
                result = this.act("bet", decision.amount, playerId);
                break;

            case "raise":
                result = this.act("raise", decision.raiseTo, playerId);
                break;

            case "all-in":
            case "allIn":
                result = this.act("all-in", null, playerId);
                break;

            default:
                throw new Error(
                    "Décision du bot inconnue : " + decision.action
                );

        }

        return {

            decision,

            result,

            state: this.getState()

        };

    }


    /* =====================================================
       36. ÉTAT PUBLIC DE LA PARTIE
       ===================================================== */

    getState() {

        return {

            handNumber: this.handNumber,

            street: this.street,

            board: [...this.board],

            pot: this.getPot(),

            currentBet: this.currentBet,

            lastFullRaise: this.lastFullRaise,

            minimumRaiseTo: this.getMinimumRaiseTo(),

            dealerIndex: this.dealerIndex,

            currentPlayerId: this.currentPlayerId,

            pendingPlayers: [
                ...this.pendingPlayers
            ],

            handComplete: this.handComplete,

            players: this.players.map(
                (player) => {

                    const actionOptions =
                        player.id === this.currentPlayerId
                            ? this.getPlayerActionOptions(player.id)
                            : null;

                    return {

                        id: player.id,

                        name: player.name,

                        stack: player.stack,

                        isHuman: player.isHuman,

                        isBot: player.isBot,

                        botProfile: player.isBot
                            ? player.botProfile
                            : null,

                        botDifficulty: player.isBot
                            ? player.botDifficulty
                            : null,

                        holeCards:
                            this.handComplete || player.isHuman
                                ? [...player.holeCards]
                                : null,

                        streetBet: player.streetBet,

                        totalContribution:
                            player.totalContribution,

                        folded: player.folded,

                        allIn: player.allIn,

                        hasActed: player.hasActed,

                        position: player.position,

                        amountToCall:
                            this.getAmountToCall(player),

                        actionOptions

                    };

                }
            ),

            result: this.lastResult

        };

    }


    /* =====================================================
       37. MAIN SUIVANTE
       ===================================================== */

    nextHand() {

        if (!this.handComplete) {
            throw new Error(
                "La main actuelle n'est pas terminée."
            );
        }

        if (this.getPlayersWithChips().length < 2) {
            throw new Error(
                "Il ne reste pas suffisamment de joueurs avec des jetons."
            );
        }

        const nextDealer =
            this.getNextOccupiedSeat(
                (this.dealerIndex + 1) %
                this.players.length
            );

        if (nextDealer === -1) {
            throw new Error(
                "Aucun joueur ne possède de jetons."
            );
        }

        this.dealerIndex = nextDealer;

        this.handSeatIndices = [];
        this.handPositions = [];

        return this.startHand();

    }

}


/* =========================================================
   38. EXPORT DU MODULE
   ========================================================= */

window.PokerLabGameEngine = PokerLabGameEngine;
