
/* =========================================================
   POKERLAB - GAME ENGINE
   Version : 1.0.0
   Description : Moteur de jeu Texas Hold'em No-Limit
   ========================================================= */

"use strict";


/* =========================================================
   1. CLASSE PRINCIPALE
   ========================================================= */

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

        if (
            options.players.length < 2 ||
            options.players.length > 6
        ) {
            throw new Error(
                "Une partie doit contenir entre 2 et 6 joueurs."
            );
        }

        // Configuration des blinds.

        this.blinds = window.PokerLabRules.blinds.create(
            options.smallBlind ?? 1,
            options.bigBlind ?? 2
        );

        // Initialisation des joueurs.

        this.players = this.createPlayers(options.players);

        // Configuration générale.

        this.dealerIndex = options.dealerIndex ?? 0;

        if (
            !Number.isInteger(this.dealerIndex) ||
            this.dealerIndex < 0 ||
            this.dealerIndex >= this.players.length
        ) {
            throw new Error("Position du bouton invalide.");
        }

        // État initial de la partie.

        this.deck = null;

        this.board = [];

        this.street = "waiting";

        this.currentBet = 0;

        this.lastFullRaise = this.blinds.bigBlind;

        this.pendingPlayers = [];

        this.actedSinceFullRaise = new Set();

        this.currentPlayerId = null;

        this.handNumber = 0;

        this.handComplete = true;

        this.handHistory = [];

        this.lastResult = null;

        this.handStarted = false;

    }


    /* =====================================================
       2. CRÉATION DES JOUEURS
       ===================================================== */

    createPlayers(players) {

        const identifiers = new Set();

        return players.map((player, index) => {

            if (
                !Number.isFinite(player.stack) ||
                player.stack <= 0
            ) {
                throw new Error(
                    `Stack invalide pour le joueur ${index + 1}.`
                );
            }

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

                stack: player.stack,

                isHuman: player.isHuman ?? false,

                isBot: player.isBot ?? false,

                holeCards: [],

                streetBet: 0,

                totalContribution: 0,

                folded: false,

                allIn: false,

                hasActed: false,

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
            (player) => !player.folded && player.holeCards.length === 2
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

        return this.players
            .filter((player) => player.stack > 0)
            .map((player) => this.players.indexOf(player));

    }


    getActivePositions() {

        const activeSeats = this.getActiveSeatIndices();

        const dealerPosition =
            activeSeats.indexOf(this.dealerIndex);

        if (dealerPosition === -1) {
            throw new Error("Le bouton doit être occupé.");
        }

        const positionNames =
            window.PokerLabRules.positions.getPositionNames(
                activeSeats.length
            );

        return activeSeats.map((seatIndex, index) => ({

            seatIndex,

            position: positionNames[index],

            isDealer: index === 0,

            isSmallBlind:
                positionNames[index] === "SB" ||
                positionNames[index] === "BTN/SB",

            isBigBlind:
                positionNames[index] === "BB"

        }));

    }


    /* =====================================================
       4. DÉMARRAGE D'UNE MAIN
       ===================================================== */

    startHand() {

        if (this.getPlayersWithChips().length < 2) {
            throw new Error(
                "Il faut au moins deux joueurs avec des jetons."
            );
        }

        // Le bouton doit être occupé.

        if (this.players[this.dealerIndex].stack <= 0) {

            this.dealerIndex = this.getNextOccupiedSeat(
                (this.dealerIndex + 1) % this.players.length
            );

        }

        // Réinitialisation de la main.

        this.handNumber++;

        this.deck = new window.PokerLabDeck();

        this.board = [];

        this.street = "preflop";

        this.currentBet = 0;

        this.lastFullRaise = this.blinds.bigBlind;

        this.pendingPlayers = [];

        this.actedSinceFullRaise.clear();

        this.currentPlayerId = null;

        this.handComplete = false;

        this.lastResult = null;

        this.handStarted = true;

        // Réinitialisation des joueurs.

        for (const player of this.players) {

            player.holeCards = [];

            player.streetBet = 0;

            player.totalContribution = 0;

            player.folded = player.stack <= 0;

            player.allIn = false;

            player.hasActed = false;

            player.position = null;

        }

        // Attribution des positions.

        const positions = this.getActivePositions();

        for (const position of positions) {

            this.players[position.seatIndex].position =
                position.position;

        }

        // Distribution des cartes privatives.

        this.dealHoleCards();

        // Placement des blinds.

        this.postBlinds();

        // Détermination du premier joueur.

        this.initializePreflopAction();

        this.handHistory = [];

        this.recordEvent("hand_started", {

            handNumber: this.handNumber,

            dealerIndex: this.dealerIndex,

            blinds: { ...this.blinds }

        });

        this.resolveAutomaticProgress();

        return this.getState();

    }


    /* =====================================================
       5. DISTRIBUTION DES CARTES PRIVATIVES
       ===================================================== */

    dealHoleCards() {

        const activeSeats = this.getActiveSeatIndices();

        const order = this.getClockwiseOrder(
            (this.dealerIndex + 1) % this.players.length
        ).filter(
            (seatIndex) => activeSeats.includes(seatIndex)
        );

        // Distribution en deux tours.

        for (let round = 0; round < 2; round++) {

            for (const seatIndex of order) {

                const player = this.players[seatIndex];

                player.holeCards.push(
                    this.deck.drawOne()
                );

            }

        }

    }


    /* =====================================================
       6. PLACEMENT DES BLINDS
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

        this.commitChips(
            smallBlindPlayer,
            this.blinds.smallBlind
        );

        this.commitChips(
            bigBlindPlayer,
            this.blinds.bigBlind
        );

        this.currentBet = Math.max(
            smallBlindPlayer.streetBet,
            bigBlindPlayer.streetBet
        );

        this.recordEvent("blinds_posted", {

            smallBlind: smallBlindPlayer.id,

            bigBlind: bigBlindPlayer.id

        });

    }


    /* =====================================================
       7. INITIALISATION DU TOUR PRÉFLOP
       ===================================================== */

    initializePreflopAction() {

        const positions = this.getActivePositions();

        let firstPosition;

        if (positions.length === 2) {

            // En heads-up, le bouton parle en premier.

            firstPosition = positions[0].seatIndex;

        } else {

            // En 3-max et plus, UTG parle en premier.

            const bigBlindPosition = positions.find(
                (position) => position.isBigBlind
            );

            firstPosition =
                (bigBlindPosition.seatIndex + 1) %
                this.players.length;

        }

        const order = this.getClockwiseOrder(firstPosition);

        this.pendingPlayers = order.filter(
            (seatIndex) => {

                const player = this.players[seatIndex];

                return (
                    !player.folded &&
                    !player.allIn &&
                    player.stack > 0
                );

            }
        );

        this.updateCurrentPlayer();

    }


    /* =====================================================
       8. GESTION DES JETONS
       ===================================================== */

    commitChips(player, amount) {

        if (
            !Number.isFinite(amount) ||
            amount < 0
        ) {
            throw new Error("Montant de jetons invalide.");
        }

        const paidAmount = Math.min(
            amount,
            player.stack
        );

        player.stack -= paidAmount;

        player.streetBet += paidAmount;

        player.totalContribution += paidAmount;

        if (player.stack === 0) {

            player.allIn = true;

        }

        return paidAmount;

    }


    getPot() {

        return this.players.reduce(
            (total, player) =>
                total + player.totalContribution,
            0
        );

    }


    getAmountToCall(player) {

        return Math.max(
            0,
            this.currentBet - player.streetBet
        );

    }


    /* =====================================================
       9. GESTION DU JOUEUR ACTUEL
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

        if (player.folded || player.allIn) {
            throw new Error("Ce joueur ne peut plus agir.");
        }

        return player;

    }


    /* =====================================================
       10. GESTION DES ACTIONS
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

                result = this.allIn(player);

                break;

            default:

                throw new Error(
                    "Action inconnue : " + action
                );

        }

        this.resolveAutomaticProgress();

        return result;

    }


    /* =====================================================
       11. FOLD
       ===================================================== */

    fold(player) {

        player.folded = true;

        player.hasActed = true;

        this.actedSinceFullRaise.add(player.id);

        this.removeFromPending(player);

        this.recordAction(player, "fold", 0);

        return {
            action: "fold",
            playerId: player.id
        };

    }


    /* =====================================================
       12. CHECK
       ===================================================== */

    check(player) {

        if (this.getAmountToCall(player) > 0) {

            throw new Error(
                "Impossible de checker : une mise doit être égalisée."
            );

        }

        player.hasActed = true;

        this.actedSinceFullRaise.add(player.id);

        this.removeFromPending(player);

        this.recordAction(player, "check", 0);

        return {
            action: "check",
            playerId: player.id
        };

    }


    /* =====================================================
       13. CALL
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
            amountToCall
        );

        player.hasActed = true;

        this.actedSinceFullRaise.add(player.id);

        this.removeFromPending(player);

        this.recordAction(
            player,
            "call",
            paidAmount
        );

        return {

            action: "call",

            playerId: player.id,

            amount: paidAmount,

            allIn: player.allIn

        };

    }


    /* =====================================================
       14. BET
       ===================================================== */

    bet(player, amount) {

        if (this.currentBet > 0) {

            throw new Error(
                "Une mise existe déjà : utilisez raiseTo."
            );

        }

        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {
            throw new Error("Montant de mise invalide.");
        }

        if (amount > player.stack) {
            throw new Error("Stack insuffisant.");
        }

        const isAllIn = amount === player.stack;

        const minimumBet =
            this.blinds.bigBlind;

        if (
            amount < minimumBet &&
            !isAllIn
        ) {

            throw new Error(
                "La mise minimale est égale à une Big Blind."
            );

        }

        const paidAmount = this.commitChips(
            player,
            amount
        );

        this.currentBet = player.streetBet;

        this.lastFullRaise = paidAmount;

        player.hasActed = true;

        this.actedSinceFullRaise.clear();

        this.actedSinceFullRaise.add(player.id);

        this.rebuildPendingAfterFullRaise(player);

        this.recordAction(
            player,
            "bet",
            paidAmount
        );

        return {

            action: "bet",

            playerId: player.id,

            amount: paidAmount,

            allIn: player.allIn

        };

    }


    /* =====================================================
       15. RAISE TO
       ===================================================== */

    raiseTo(player, raiseToAmount) {

        if (
            !Number.isFinite(raiseToAmount) ||
            raiseToAmount <= this.currentBet
        ) {

            throw new Error(
                "Le montant de relance doit dépasser la mise actuelle."
            );

        }

        const additionalAmount =
            raiseToAmount - player.streetBet;

        if (additionalAmount > player.stack) {

            throw new Error(
                "Stack insuffisant pour cette relance."
            );

        }

        const isAllIn =
            additionalAmount === player.stack;

        const raiseSize =
            raiseToAmount - this.currentBet;

        const isFullRaise =
            raiseSize >= this.lastFullRaise;

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

        player.hasActed = true;

        if (isFullRaise) {

            this.lastFullRaise = raiseSize;

            this.actedSinceFullRaise.clear();

            this.actedSinceFullRaise.add(player.id);

            this.rebuildPendingAfterFullRaise(player);

        } else {

            // Une relance à tapis insuffisante ne rouvre
            // pas automatiquement les enchères.

            this.actedSinceFullRaise.add(player.id);

            this.rebuildPendingAfterShortRaise(player);

        }

        this.recordAction(
            player,
            isFullRaise ? "raise" : "short_raise",
            paidAmount
        );

        return {

            action: isFullRaise ? "raise" : "short_raise",

            playerId: player.id,

            amount: paidAmount,

            raiseTo: player.streetBet,

            allIn: player.allIn

        };

    }


    /* =====================================================
       16. ALL-IN
       ===================================================== */

    allIn(player) {

        if (player.stack <= 0) {

            throw new Error(
                "Ce joueur ne possède plus de jetons."
            );

        }

        const amount = player.stack;

        const resultingBet =
            player.streetBet + amount;

        // Un tapis qui dépasse la mise actuelle
        // constitue une mise ou une relance.

        if (resultingBet > this.currentBet) {

            if (this.currentBet === 0) {

                return this.bet(player, amount);

            }

            return this.raiseTo(
                player,
                resultingBet
            );

        }

        // Sinon, le tapis correspond à un call incomplet.

        const paidAmount = this.commitChips(
            player,
            amount
        );

        player.hasActed = true;

        this.actedSinceFullRaise.add(player.id);

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
       17. GESTION DES JOUEURS EN ATTENTE
       ===================================================== */

    removeFromPending(player) {

        this.pendingPlayers =
            this.pendingPlayers.filter(
                (seatIndex) =>
                    this.players[seatIndex].id !== player.id
            );

        this.updateCurrentPlayer();

    }


    rebuildPendingAfterFullRaise(player) {

        const nextSeat =
            (this.players.indexOf(player) + 1) %
            this.players.length;

        this.pendingPlayers =
            this.getClockwiseOrder(nextSeat).filter(
                (seatIndex) => {

                    const candidate =
                        this.players[seatIndex];

                    return (
                        candidate.id !== player.id &&
                        !candidate.folded &&
                        !candidate.allIn &&
                        candidate.stack > 0
                    );

                }
            );

        this.updateCurrentPlayer();

    }


    rebuildPendingAfterShortRaise(player) {

        const nextSeat =
            (this.players.indexOf(player) + 1) %
            this.players.length;

        const existingPending =
            new Set(this.pendingPlayers);

        const newPending = [];

        for (const seatIndex of this.getClockwiseOrder(nextSeat)) {

            const candidate =
                this.players[seatIndex];

            if (
                candidate.id === player.id ||
                candidate.folded ||
                candidate.allIn ||
                candidate.stack <= 0
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
       18. RÉSOLUTION AUTOMATIQUE DU JEU
       ===================================================== */

    resolveAutomaticProgress() {

        if (this.handComplete) {
            return;
        }

        // Un seul joueur reste dans la main.

        if (this.getPlayersInHand().length === 1) {

            this.awardUncontestedPot();

            return;

        }

        // Tous les joueurs pouvant agir ont terminé.

        if (this.pendingPlayers.length === 0) {

            this.endBettingRound();

        }

    }


    /* =====================================================
       19. FIN D'UN TOUR D'ENCHÈRES
       ===================================================== */

    endBettingRound() {

        if (this.handComplete) {
            return;
        }

        const actionablePlayers =
            this.getActionablePlayers();

        // S'il ne reste qu'un seul joueur capable de miser,
        // aucun autre adversaire ne peut suivre ses mises.

        if (actionablePlayers.length <= 1) {

            this.runoutBoard();

            return;

        }

        // Passage à la phase suivante.

        this.advanceStreet();

    }


    /* =====================================================
       20. PASSAGE À LA PHASE SUIVANTE
       ===================================================== */

    advanceStreet() {

        const nextStreet =
            window.PokerLabRules.streets.getNext(
                this.street
            );

        if (!nextStreet) {
            this.showdown();
            return;
        }

        this.street = nextStreet;

        if (this.street === "showdown") {

            this.showdown();

            return;

        }

        // Distribution des cartes communes.

        this.dealCommunityCards();

        // Réinitialisation des mises de la phase.

        this.currentBet = 0;

        this.lastFullRaise = this.blinds.bigBlind;

        this.actedSinceFullRaise.clear();

        for (const player of this.players) {

            player.streetBet = 0;

            player.hasActed = false;

        }

        // Premier joueur après le bouton.

        this.initializePostflopAction();

        this.recordEvent("street_changed", {

            street: this.street,

            board: [...this.board]

        });

        // Si les joueurs encore actifs ne peuvent plus
        // réellement miser, déroulement automatique.

        this.resolveAutomaticProgress();

    }


    /* =====================================================
       21. DISTRIBUTION DU BOARD
       ===================================================== */

    dealCommunityCards() {

        if (this.street === "flop") {

            // Carte brûlée.

            this.deck.drawOne();

            this.board.push(
                ...this.deck.draw(3)
            );

        } else if (
            this.street === "turn" ||
            this.street === "river"
        ) {

            // Carte brûlée.

            this.deck.drawOne();

            this.board.push(
                this.deck.drawOne()
            );

        }

    }


    /* =====================================================
       22. INITIALISATION POSTFLOP
       ===================================================== */

    initializePostflopAction() {

        const nextSeat =
            (this.dealerIndex + 1) %
            this.players.length;

        const order =
            this.getClockwiseOrder(nextSeat);

        this.pendingPlayers = order.filter(
            (seatIndex) => {

                const player = this.players[seatIndex];

                return (
                    !player.folded &&
                    !player.allIn &&
                    player.stack > 0
                );

            }
        );

        this.updateCurrentPlayer();

    }


    /* =====================================================
       23. DÉROULEMENT AUTOMATIQUE DU BOARD
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
       24. CONSTRUCTION DES POTS SECONDAIRES
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
                (level - previousLevel) *
                contributors.length;

            const eligiblePlayers = contributors.filter(
                (player) => !player.folded
            );

            if (amount > 0) {

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
       25. ÉVALUATION DES JOUEURS
       ===================================================== */

    evaluatePlayer(player) {

        return window.PokerLabHandEvaluator.evaluate([

            ...player.holeCards,

            ...this.board

        ]);

    }


    /* =====================================================
       26. GESTION DES ÉGALITÉS ET JETONS IMPAIRS
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
            .filter((player) => winnerIds.has(player.id));

    }


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

        const share =
            Math.floor(pot.amount / winners.length);

        let remainder =
            pot.amount % winners.length;

        for (const winner of winners) {

            winner.stack += share;

        }

        // Le jeton impair revient au premier gagnant
        // situé à gauche du bouton.

        const oddChipOrder =
            this.getOddChipOrder(winners);

        const oddChipRecipients = [];

        for (const winner of oddChipOrder) {

            if (remainder <= 0) {
                break;
            }

            winner.stack += 1;

            remainder--;

            oddChipRecipients.push(winner.id);

        }

        return {

            amount: pot.amount,

            winnerIds: winners.map(
                (winner) => winner.id
            ),

            isTie: winners.length > 1,

            share,

            oddChipRecipients,

            category: eligiblePlayers.find(
                (item) =>
                    winners.includes(item.player)
            ).evaluation.categoryLabel

        };

    }


    /* =====================================================
       27. SHOWDOWN
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

        const evaluations = playersInHand.map(
            (player) => ({

                player,

                evaluation: this.evaluatePlayer(player)

            })
        );

        const sidePots = this.buildSidePots();

        const distributedPots = [];

        for (const pot of sidePots) {

            const result = this.distributePot(
                pot,
                evaluations
            );

            distributedPots.push(result);

        }

        const totalPot =
            sidePots.reduce(
                (total, pot) => total + pot.amount,
                0
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
       28. POT NON CONTESTÉ
       ===================================================== */

    awardUncontestedPot() {

        const remainingPlayers =
            this.getPlayersInHand();

        if (remainingPlayers.length !== 1) {
            throw new Error("Situation de jeu invalide.");
        }

        const winner = remainingPlayers[0];

        const amount = this.getPot();

        winner.stack += amount;

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
       29. FIN DE LA MAIN
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
       30. HISTORIQUE DES ACTIONS
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

        return [...this.handHistory];

    }


    /* =====================================================
       31. ÉTAT PUBLIC DE LA PARTIE
       ===================================================== */

    getState() {

        return {

            handNumber: this.handNumber,

            street: this.street,

            board: [...this.board],

            pot: this.getPot(),

            currentBet: this.currentBet,

            lastFullRaise: this.lastFullRaise,

            dealerIndex: this.dealerIndex,

            currentPlayerId: this.currentPlayerId,

            pendingPlayers: [
                ...this.pendingPlayers
            ],

            handComplete: this.handComplete,

            players: this.players.map(
                (player) => ({

                    id: player.id,

                    name: player.name,

                    stack: player.stack,

                    isHuman: player.isHuman,

                    isBot: player.isBot,

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
                        this.getAmountToCall(player)

                })
            ),

            result: this.lastResult

        };

    }


    /* =====================================================
       32. PASSAGE AU JOUEUR SUIVANT POUR LA MAIN SUIVANTE
       ===================================================== */

    nextHand() {

        if (!this.handComplete) {

            throw new Error(
                "La main actuelle n'est pas terminée."
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

        return this.startHand();

    }

}


/* =========================================================
   33. EXPORT DU MODULE
   ========================================================= */

window.PokerLabGameEngine = PokerLabGameEngine;
