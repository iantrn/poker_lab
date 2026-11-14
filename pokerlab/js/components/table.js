
/* =========================================================
   POKERLAB - TABLE COMPONENT
   Version : 1.0.0
   Description : Affichage de la table et des joueurs
   ========================================================= */

"use strict";

window.PokerLabTable = (function () {

    /* =====================================================
       1. CONFIGURATION
       ===================================================== */

    const DEFAULT_OPTIONS = {
        heroPlayerId: null,
        revealAllCards: false,
        currency: "jetons",
        showPositions: true,
        showPlayerBets: true,
        showStacks: true
    };


    /* =====================================================
       2. OUTILS DOM
       ===================================================== */

    function createElement(tag, className, text) {

        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined && text !== null) {
            element.textContent = String(text);
        }

        return element;

    }


    function clear(container) {

        if (!(container instanceof HTMLElement)) {
            throw new Error("Conteneur de table invalide.");
        }

        container.replaceChildren();

    }


    function formatChips(amount, currency) {

        const value = Number(amount);

        if (!Number.isFinite(value)) {
            return `0 ${currency}`;
        }

        return `${value.toLocaleString("fr-FR")} ${currency}`;

    }


    function addStatus(container, text, className) {

        if (!text) {
            return;
        }

        const status = createElement(
            "span",
            `pl-player-status ${className || ""}`,
            text
        );

        container.appendChild(status);

    }


    /* =====================================================
       3. AFFICHAGE DES CARTES
       ===================================================== */

    function createCardBack() {

        return createElement(
            "div",
            "pl-card pl-card--back",
            ""
        );

    }


    function renderPlayerCards(player, options) {

        const cardsContainer = createElement(
            "div",
            "pl-player-cards"
        );

        const canReveal =
            options.revealAllCards ||
            player.id === options.heroPlayerId;

        const holeCards = player.holeCards;

        if (
            canReveal &&
            Array.isArray(holeCards) &&
            holeCards.length === 2 &&
            window.PokerLabCards
        ) {

            window.PokerLabCards.renderInto(
                cardsContainer,
                holeCards,
                {
                    compact: true
                }
            );

            return cardsContainer;

        }

        if (Array.isArray(holeCards) && holeCards.length === 0) {
            return cardsContainer;
        }

        cardsContainer.appendChild(createCardBack());
        cardsContainer.appendChild(createCardBack());

        return cardsContainer;

    }


    function renderBoard(board) {

        const boardContainer = createElement(
            "div",
            "pl-table-board"
        );

        const title = createElement(
            "div",
            "pl-table-board-title",
            "CARTES COMMUNES"
        );

        boardContainer.appendChild(title);

        const cardsContainer = createElement(
            "div",
            "pl-table-board-cards"
        );

        if (window.PokerLabCards) {

            window.PokerLabCards.renderBoard(
                cardsContainer,
                Array.isArray(board) ? board : []
            );

        } else {

            console.error(
                "PokerLabCards n'est pas chargé."
            );

        }

        boardContainer.appendChild(cardsContainer);

        return boardContainer;

    }


    /* =====================================================
       4. AFFICHAGE D'UN JOUEUR
       ===================================================== */

    function renderPlayer(player, index, state, options) {

        const isCurrentPlayer =
            player.id === state.currentPlayerId;

        const isDealer =
            index === state.dealerIndex;

        const isHero =
            player.id === options.heroPlayerId;

        const classes = [
            "pl-table-player"
        ];

        if (isCurrentPlayer) {
            classes.push("is-active");
        }

        if (player.folded) {
            classes.push("is-folded");
        }

        if (player.allIn) {
            classes.push("is-all-in");
        }

        if (isHero) {
            classes.push("is-hero");
        }

        const playerElement = createElement(
            "div",
            classes.join(" ")
        );

        playerElement.dataset.playerId = player.id;

        // En-tête du joueur.

        const header = createElement(
            "div",
            "pl-player-header"
        );

        const name = createElement(
            "span",
            "pl-player-name",
            player.name || `Joueur ${index + 1}`
        );

        header.appendChild(name);

        if (isDealer) {
            addStatus(header, "D", "pl-status-dealer");
        }

        if (options.showPositions && player.position) {
            addStatus(
                header,
                player.position,
                "pl-status-position"
            );
        }

        playerElement.appendChild(header);

        // Stack du joueur.

        if (options.showStacks) {

            const stack = createElement(
                "div",
                "pl-player-stack",
                formatChips(player.stack, options.currency)
            );

            playerElement.appendChild(stack);

        }

        // Cartes privatives.

        playerElement.appendChild(
            renderPlayerCards(player, options)
        );

        // Mise engagée dans le tour actuel.

        if (
            options.showPlayerBets &&
            Number(player.streetBet) > 0
        ) {

            const bet = createElement(
                "div",
                "pl-player-bet",
                `Mise : ${formatChips(
                    player.streetBet,
                    options.currency
                )}`
            );

            playerElement.appendChild(bet);

        }

        // États particuliers.

        const statuses = createElement(
            "div",
            "pl-player-statuses"
        );

        if (player.folded) {
            addStatus(statuses, "COUCHÉ", "pl-status-folded");
        }

        if (player.allIn) {
            addStatus(statuses, "ALL-IN", "pl-status-all-in");
        }

        if (isCurrentPlayer) {
            addStatus(statuses, "À VOUS", "pl-status-active");
        }

        if (statuses.childElementCount > 0) {
            playerElement.appendChild(statuses);
        }

        return playerElement;

    }


    /* =====================================================
       5. AFFICHAGE DU POT
       ===================================================== */

    function renderPot(state, options) {

        const potContainer = createElement(
            "div",
            "pl-table-pot"
        );

        const label = createElement(
            "span",
            "pl-table-pot-label",
            "POT"
        );

        const amount = createElement(
            "strong",
            "pl-table-pot-amount",
            formatChips(state.pot, options.currency)
        );

        potContainer.appendChild(label);
        potContainer.appendChild(amount);

        return potContainer;

    }


    /* =====================================================
       6. AFFICHAGE DE LA TABLE
       ===================================================== */

    function render(container, state, customOptions = {}) {

        if (!(container instanceof HTMLElement)) {
            throw new Error(
                "Le conteneur HTML de la table est invalide."
            );
        }

        if (!state || !Array.isArray(state.players)) {
            throw new Error(
                "L'état de la partie est invalide."
            );
        }

        if (!window.PokerLabCards) {
            throw new Error(
                "PokerLabCards doit être chargé avant PokerLabTable."
            );
        }

        const options = {
            ...DEFAULT_OPTIONS,
            ...customOptions
        };

        clear(container);

        container.classList.add("pl-table-container");

        // Tapis de poker.

        const table = createElement(
            "div",
            "pl-table"
        );

        // Zone des joueurs.

        const playersContainer = createElement(
            "div",
            "pl-table-players"
        );

        state.players.forEach((player, index) => {

            const playerElement = renderPlayer(
                player,
                index,
                state,
                options
            );

            playersContainer.appendChild(playerElement);

        });

        table.appendChild(playersContainer);

        // Zone centrale.

        const center = createElement(
            "div",
            "pl-table-center"
        );

        center.appendChild(renderPot(state, options));
        center.appendChild(renderBoard(state.board));

        table.appendChild(center);

        // Informations de la main.

        const information = createElement(
            "div",
            "pl-table-information"
        );

        const street = createElement(
            "span",
            "pl-table-street",
            getStreetLabel(state.street)
        );

        const handNumber = createElement(
            "span",
            "pl-table-hand-number",
            `Main n° ${state.handNumber || 0}`
        );

        information.appendChild(street);
        information.appendChild(handNumber);

        table.appendChild(information);

        container.appendChild(table);

        return table;

    }


    /* =====================================================
       7. TRADUCTION DES TOURS DE JEU
       ===================================================== */

    function getStreetLabel(street) {

        const labels = {
            waiting: "En attente",
            preflop: "Préflop",
            flop: "Flop",
            turn: "Turn",
            river: "River",
            showdown: "Showdown",
            complete: "Main terminée"
        };

        return labels[street] || "Partie";

    }


    /* =====================================================
       8. EXPORT PUBLIC
       ===================================================== */

    return {

        render,

        clear,

        getStreetLabel

    };

})();
