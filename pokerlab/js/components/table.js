
/* =========================================================
   POKERLAB - TABLE COMPONENT
   Design : Winamax inspired / Minimal
   Version : 3.0.0
   ========================================================= */

"use strict";

(function () {

    const HAND_LABELS = [
        "Carte haute",
        "Paire",
        "Double paire",
        "Brelan",
        "Quinte",
        "Couleur",
        "Full",
        "Carré",
        "Quinte flush",
        "Quinte flush royale"
    ];

    const RANKS = {
        2: "2",
        3: "3",
        4: "4",
        5: "5",
        6: "6",
        7: "7",
        8: "8",
        9: "9",
        10: "10",
        11: "Valet",
        12: "Dame",
        13: "Roi",
        14: "As"
    };

    const SUITS = {
        clubs: "♣",
        diamonds: "♦",
        hearts: "♥",
        spades: "♠"
    };


    /* =====================================================
       1. OUTILS
       ===================================================== */

    function formatAmount(value) {

        const amount = Number(value) || 0;

        return amount.toLocaleString("fr-FR", {
            maximumFractionDigits: 2
        });

    }


    function getRank(value) {

        return RANKS[value] || String(value);

    }


    function getSuitSymbol(suit) {

        return SUITS[suit] || "";

    }


    function getPlayerSlot(index, count) {

        const layouts = {

            2: [[50, 62], [50, 15]],
            3: [[50, 62], [22, 20], [78, 20]],
            4: [[50, 62], [14, 38], [50, 15], [86, 38]],
            5: [[50, 62], [13, 54], [27, 18], [73, 18], [87, 54]],
            6: [[50, 62], [13, 57], [13, 27], [50, 15], [87, 27], [87, 57]]

        };

        const layout = layouts[count] || layouts[6];

        return layout[index] || [50, 50];

    }


    function createElement(tag, className, content = "") {

        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (content !== undefined && content !== null) {
            element.textContent = String(content);
        }

        return element;

    }


    function appendCard(container, card, options = {}) {

        if (
            window.PokerLabCards &&
            typeof window.PokerLabCards.create === "function"
        ) {

            container.appendChild(
                window.PokerLabCards.create(
                    card,
                    options
                )
            );

            return;

        }

        const fallback = createElement(
            "div",
            "pl-card-fallback",
            options.hidden
                ? "♠"
                : `${getRank(card.value)}${getSuitSymbol(card.suit)}`
        );

        container.appendChild(fallback);

    }


    /* =====================================================
       2. IDENTIFICATION DE LA MAIN PRÉFLOP
       ===================================================== */

    function evaluatePreflop(cards) {

        if (!Array.isArray(cards) || cards.length !== 2) {

            return {
                label: "En attente des cartes",
                detail: "",
                category: -1
            };

        }

        const first = cards[0];
        const second = cards[1];

        if (
            !first ||
            !second ||
            !Number.isInteger(first.value) ||
            !Number.isInteger(second.value)
        ) {

            return {
                label: "Main de départ",
                detail: "",
                category: -1
            };

        }

        const high = Math.max(
            first.value,
            second.value
        );

        const low = Math.min(
            first.value,
            second.value
        );

        const isPair = high === low;

        const isSuited =
            first.suit === second.suit;

        const gap = high - low;

        if (isPair) {

            return {
                label: `Paire de ${getRank(high)}s`,
                detail: "Paire servie",
                category: 1
            };

        }

        const connectors = {

            1: "Connecteurs",

            2: "One-gapper",

            3: "Two-gapper"

        };

        const highName = getRank(high);
        const lowName = getRank(low);

        let detail = `${highName}-${lowName}`;

        if (isSuited) {
            detail += " assortis";
        } else {
            detail += " dépareillés";
        }

        if (gap === 1) {
            detail += " · Connecteurs";
        } else if (gap === 2) {
            detail += " · One-gapper";
        } else if (gap === 3) {
            detail += " · Two-gapper";
        }

        let label;

        if (high >= 11 && low >= 10) {
            label = "Deux figures";
        } else if (high === 14 && low >= 10) {
            label = "As accompagné";
        } else {
            label = `Hauteur ${highName}`;
        }

        return {
            label,
            detail,
            category: 0
        };

    }


    /* =====================================================
       3. ÉVALUATION POSTFLOP
       ===================================================== */

    function evaluateHeroHand(cards, board) {

        if (!Array.isArray(cards) || cards.length !== 2) {
            return evaluatePreflop(cards);
        }

        if (!Array.isArray(board) || board.length < 3) {
            return evaluatePreflop(cards);
        }

        if (!window.PokerLabHandEvaluator) {

            return {
                label: "Évaluation indisponible",
                detail: "",
                category: -1
            };

        }

        try {

            const evaluation =
                window.PokerLabHandEvaluator.evaluate([
                    ...cards,
                    ...board
                ]);

            return {

                label:
                    evaluation.description ||
                    evaluation.categoryLabel ||
                    HAND_LABELS[evaluation.category],

                detail:
                    HAND_LABELS[evaluation.category] || "",

                category: evaluation.category,

                score: evaluation.score,

                bestFiveCards:
                    evaluation.bestFiveCards

            };

        } catch (error) {

            console.error(
                "[PokerLab] Erreur d'évaluation de la main :",
                error
            );

            return {
                label: "Évaluation indisponible",
                detail: "",
                category: -1
            };

        }

    }


    /* =====================================================
       4. CARTES COMMUNES
       ===================================================== */

    function renderCommunityCards(board = []) {

        const container = createElement(
            "div",
            "pl-board"
        );

        const cards = Array.isArray(board)
            ? board.slice(0, 5)
            : [];

        for (let i = 0; i < 5; i++) {

            const card = cards[i] || null;

            appendCard(
                container,
                card,
                {
                    compact: false
                }
            );

        }

        return container;

    }


    /* =====================================================
       5. CARTES PRIVATIVES
       ===================================================== */

    function renderPlayerCards(cards, visible = false) {

        const container = createElement(
            "div",
            "pl-player-cards"
        );

        for (let i = 0; i < 2; i++) {

            const card =
                Array.isArray(cards)
                    ? cards[i]
                    : null;

            appendCard(
                container,
                card,
                {
                    hidden: !visible || !card,
                    compact: true
                }
            );

        }

        return container;

    }


    /* =====================================================
       6. BADGES DU JOUEUR
       ===================================================== */

    function renderPlayerBadges(player, isDealer, isActive) {

        const container = createElement(
            "div",
            "pl-player-badges"
        );

        if (isDealer) {

            container.appendChild(
                createElement(
                    "span",
                    "pl-badge pl-badge-dealer",
                    "D"
                )
            );

        }

        if (player.folded) {

            container.appendChild(
                createElement(
                    "span",
                    "pl-badge pl-badge-folded",
                    "Fold"
                )
            );

        } else if (player.allIn) {

            container.appendChild(
                createElement(
                    "span",
                    "pl-badge pl-badge-allin",
                    "All-in"
                )
            );

        } else if (isActive) {

            container.appendChild(
                createElement(
                    "span",
                    "pl-badge pl-badge-active",
                    "À jouer"
                )
            );

        }

        return container;

    }


    /* =====================================================
       7. SIÈGES DES JOUEURS
       ===================================================== */

    function renderSeats(players, dealerIndex, currentPlayerId, handComplete = false, revealCards = false) {

        const container = createElement(
            "div",
            "pl-seats"
        );

        if (!Array.isArray(players)) {
            return container;
        }

        const count = players.length;

        players.forEach((player, index) => {

            const [x, y] = getPlayerSlot(index, count);

            const isDealer = index === dealerIndex;

            const isActive =
                player.id === currentPlayerId;

            const isHuman = Boolean(player.isHuman);

            const isFolded = Boolean(player.folded);

            const isAllIn = Boolean(player.allIn);

            const visibleCards =
                (!handComplete && isHuman) || Boolean(player.showCards) || revealCards;

            const seat = createElement(
                "div",
                "pl-seat"
            );

            seat.classList.add(
                `pl-seat-${index + 1}`
            );

            if (isHuman) {
                seat.classList.add("pl-seat-hero");
            }

            if (isActive) {
                seat.classList.add("is-active");
            }

            if (isFolded) {
                seat.classList.add("is-folded");
            }

            if (isAllIn) {
                seat.classList.add("is-allin");
            }

            seat.dataset.playerId = player.id;

            seat.style.setProperty("--seat-x", `${x}%`);
            seat.style.setProperty("--seat-y", `${y}%`);
            seat.style.left = `${x}%`;
            seat.style.top = `${y}%`;

            // Informations du joueur.

            const info = createElement(
                "div",
                "pl-player-info"
            );

            const name = createElement(
                "span",
                "pl-player-name",
                player.name
            );

            const isEliminated = handComplete && Number(player.stack) <= 0;
            const positionLabel = isEliminated
                ? "OUT"
                : (player.position || (isDealer ? "BTN" : ""));

            const position = createElement(
                "span",
                isEliminated
                    ? "pl-player-position pl-position-out"
                    : "pl-player-position",
                positionLabel
            );

            if (positionLabel) {
                position.dataset.position = positionLabel;
            }

            const stack = createElement(
                "span",
                "pl-player-stack",
                `${formatAmount(player.stack)} BB`
            );

            const playerDetails = createElement(
                "div",
                "pl-player-details"
            );

            playerDetails.append(
                name,
                position
            );

            info.append(
                playerDetails,
                stack
            );

            // Cartes.

            const cards = renderPlayerCards(
                player.holeCards,
                visibleCards
            );

            // Badges.

            const badges = renderPlayerBadges(
                player,
                isDealer,
                isActive
            );

            // Mise du joueur.

            seat.append(
                badges,
                info,
                cards
            );

            if (player.streetBet > 0) {

                const bet = createElement(
                    "div",
                    "pl-player-bet",
                    `${formatAmount(player.streetBet)}`
                );

                seat.appendChild(bet);

            }

            container.appendChild(seat);

        });

        return container;

    }


    /* =====================================================
       8. INDICATEUR DE MAIN DU JOUEUR
       ===================================================== */

    function renderHandStrength(hero, board) {

        const container = createElement(
            "div",
            "pl-hand-strength"
        );

        if (!hero || !Array.isArray(hero.holeCards)) {
            return container;
        }

        const evaluation = evaluateHeroHand(
            hero.holeCards,
            board
        );

        const label = createElement(
            "span",
            "pl-hand-strength-label",
            "VOTRE MAIN"
        );

        const value = createElement(
            "strong",
            "pl-hand-strength-value",
            evaluation.label
        );

        const detail = createElement(
            "span",
            "pl-hand-strength-detail",
            evaluation.detail
        );

        container.append(
            label,
            value,
            detail
        );

        if (
            Number.isInteger(evaluation.category) &&
            evaluation.category >= 0
        ) {

            container.dataset.category =
                String(evaluation.category);

        }

        return container;

    }


    /* =====================================================
       9. RÉSULTAT DE LA MAIN
       ===================================================== */

    function renderResult(result, players = []) {

        if (!result) {
            return null;
        }

        const container = createElement(
            "div",
            "pl-hand-result"
        );

        const title = createElement(
            "strong",
            "pl-hand-result-title",
            result.type === "uncontested"
                ? "Pot remporté"
                : "Showdown"
        );

        const winnerIds = Array.isArray(result.winnerIds)
            ? result.winnerIds
            : [];

        const winnerNames = winnerIds.map(id => {
            const player = players.find(item => item.id === id);
            return player ? player.name : id;
        });

        const description = createElement(
            "span",
            "pl-hand-result-description",
            winnerNames.length > 0
                ? `Gagnant${winnerNames.length > 1 ? "s" : ""} : ${winnerNames.join(", ")}`
                : "Main terminée"
        );

        container.append(
            title,
            description
        );

        return container;

    }


    /* =====================================================
       10. RENDU COMPLET DE LA TABLE
       ===================================================== */

    function render(container, gameState) {

        if (!container || !gameState) {
            return;
        }

        const players = Array.isArray(gameState.players)
            ? gameState.players
            : [];

        const hero = players.find(
            player => player.isHuman
        );

        const isHeadsUp = players.length === 2;

        const table = createElement(
            "div",
            `pl-table-container ${isHeadsUp ? "pl-table-heads-up" : "pl-table-six-max"}`
        );

        // En-tête.

        const header = createElement(
            "div",
            "pl-table-header"
        );

        const handNumber = createElement(
            "span",
            "pl-table-hand-number",
            `MAIN #${gameState.handNumber || 1}`
        );

        const format = createElement(
            "span",
            "pl-table-format",
            isHeadsUp
                ? "HEADS-UP"
                : `${players.length}-MAX`
        );

        const blinds = createElement(
            "span",
            "pl-table-blinds",
            "0,5 / 1 BB"
        );

        header.append(
            handNumber,
            format,
            blinds
        );

        // Tapis.

        const felt = createElement(
            "div",
            "pl-felt"
        );

        const center = createElement(
            "div",
            "pl-table-center"
        );

        const pot = createElement(
            "div",
            "pl-pot-display"
        );

        const potLabel = createElement(
            "span",
            "pl-pot-label",
            "POT"
        );

        const potAmount = createElement(
            "strong",
            "pl-pot-amount",
            `${formatAmount(gameState.pot)} BB`
        );

        pot.append(
            potLabel,
            potAmount
        );

        const board = renderCommunityCards(
            gameState.board
        );

        center.append(
            pot,
            board
        );

        felt.appendChild(center);

        // Sièges.

        const seats = renderSeats(
            players,
            gameState.dealerIndex ?? 0,
            gameState.currentPlayerId,
            Boolean(gameState.handComplete),
            Boolean(gameState.handComplete && gameState.result && gameState.result.type === "showdown")
        );

        // Indicateur de main.

        const handStrength = renderHandStrength(
            hero,
            gameState.board
        );

        // Résultat éventuel.

        const result = gameState.handComplete
            ? renderResult(gameState.result, players)
            : null;

        const actionMount = createElement("div", "pl-hero-actions-mount");

        table.append(header, felt, seats);

        if (handStrength.childNodes.length > 0) {
            table.appendChild(handStrength);
        }

        if (result) {
            table.appendChild(result);
        }

        table.appendChild(actionMount);

        container.replaceChildren(table);

    }


    /* =====================================================
       11. EXPORT
       ===================================================== */

    window.PokerLabTable = {

        render,

        renderSeats,

        renderCommunityCards,

        renderPlayerCards,

        evaluateHeroHand,

        evaluatePreflop

    };

})();
