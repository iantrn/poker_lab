/**
 * PokerLab - Table Component
 * Gère le rendu et la mise à jour visuelle de la table de poker (6-max / Heads-Up).
 * Utilise le système de classes unifié compatible avec cards.js
 */

(function() {
    window.PokerLabTable = {
        /**
         * Rendu initial de la table dans le conteneur cible.
         * @param {HTMLElement} container - Élément conteneur de la vue.
         * @param {Object} gameState - État actuel de la partie.
         * @param {Object} options - Options d'affichage.
         */
        render(container, gameState, options = {}) {
            if (!container) return;

            const isHeadsUp = gameState.maxPlayers === 2 || (gameState.players && gameState.players.length === 2);
            const tableClass = isHeadsUp ? 'pl-table-container heads-up' : 'pl-table-container max-6';

            // Déterminer quels sièges afficher en fonction du nombre de joueurs
            const activeSeats = this.determineActiveSeats(gameState.players ? gameState.players.length : 6, isHeadsUp);

            container.innerHTML = `
                <div class="${tableClass}">
                    <!-- En-tête de la table / Infos de main -->
                    <div class="pl-table-header">
                        <span class="pl-hand-counter">Main #${gameState.handNumber || 1}</span>
                        <span class="pl-game-mode">${isHeadsUp ? 'Heads-Up' : '6-Max Cash Game'}</span>
                        <span class="pl-stakes">Blinds: 0.5 / 1 BB</span>
                    </div>

                    <!-- Surface de la table de poker -->
                    <div class="pl-felt">
                        <!-- Pot principal et pots secondaires -->
                        <div class="pl-pot-display">
                            <span class="pl-pot-label">Pot Total</span>
                            <span class="pl-pot-amount">${gameState.pot || 0} jetons</span>
                        </div>

                        <!-- Tableau (Board) : Flop, Turn, River -->
                        <div class="pl-community-cards" id="pl-board-cards">
                            ${this.renderCommunityCards(gameState.board)}
                        </div>
                    </div>

                    <!-- Sièges des joueurs -->
                    <div class="pl-seats-container" id="pl-seats-container">
                        ${this.renderSeats(gameState.players, gameState.dealerIndex, gameState.activePlayerIndex, activeSeats, isHeadsUp)}
                    </div>

                    <!-- Contrôles d'actions du joueur -->
                    <div class="pl-action-controls" id="pl-action-controls">
                        ${this.renderActionControls(gameState)}
                    </div>
                </div>
            `;
        },

        /**
         * Détermine quels sièges doivent être affichés en fonction du nombre de joueurs.
         * @param {number} playerCount - Nombre de joueurs.
         * @param {boolean} isHeadsUp - Mode Heads-Up.
         * @returns {Object} Objet indiquant quels sièges afficher.
         */
        determineActiveSeats(playerCount, isHeadsUp) {
            if (isHeadsUp || playerCount === 2) {
                return {
                    1: true,
                    2: false,
                    3: false,
                    4: true,
                    5: false,
                    6: false
                };
            }

            const seats = {};
            for (let i = 1; i <= 6; i++) {
                seats[i] = i <= playerCount;
            }
            return seats;
        },

        /**
         * Génère le HTML pour les cartes communes (Board).
         */
        renderCommunityCards(board = []) {
            if (!board || board.length === 0) {
                return `
                    <div class="pl-card pl-card--board-slot">Flop</div>
                    <div class="pl-card pl-card--board-slot">Turn</div>
                    <div class="pl-card pl-card--board-slot">River</div>
                `;
            }

            return board.map(card => {
                if (!card) {
                    return '<div class="pl-card pl-card--board-slot"></div>';
                }
                const isRed = card.suit === '♥' || card.suit === '♦';
                const suitClass = isRed ? 'pl-card--red' : 'pl-card--black';
                return `
                    <div class="pl-card ${suitClass}">
                        <div class="pl-card__corner pl-card__corner--top">
                            <span class="pl-card__rank">${card.rank}</span>
                            <span class="pl-card__suit">${card.suit}</span>
                        </div>
                        <div class="pl-card__center">${card.suit}</div>
                        <div class="pl-card__corner pl-card__corner--bottom">
                            <span class="pl-card__rank">${card.rank}</span>
                            <span class="pl-card__suit">${card.suit}</span>
                        </div>
                    </div>
                `;
            }).join('');
        },

        /**
         * Génère les sièges des joueurs positionnés autour du tapis.
         */
        renderSeats(players = [], dealerIndex = 0, activePlayerIndex = 0, activeSeats = {}, isHeadsUp = false) {
            if (!players || players.length === 0) return '';

            return players.map((player, index) => {
                const seatNumber = index + 1;
                const isDealer = index === dealerIndex;
                const isActive = index === activePlayerIndex;
                const isFolded = player.folded;
                const isAllIn = player.allIn;
                const shouldDisplay = activeSeats[seatNumber] !== false;

                // En Heads-Up, adapter les positions
                const seatClass = isHeadsUp && seatNumber === 4 ? 'pl-seat-hu-2' : `pl-seat-${seatNumber}`;

                return `
                    <div class="pl-seat ${seatClass} ${isActive ? 'active' : ''} ${isFolded ? 'folded' : ''} ${isAllIn ? 'all-in' : ''} ${!shouldDisplay ? 'hidden' : ''}"
                         data-player-index="${index}"
                         data-seat-number="${seatNumber}">
                        <div class="pl-player-info">
                            <span class="pl-player-name">${player.name}</span>
                            <span class="pl-player-stack">${player.stack} BB</span>
                        </div>
                        <div class="pl-player-cards">
                            ${this.renderPlayerCards(player.cards, player.isUser, player.id)}
                        </div>
                        ${isDealer ? '<span class="pl-dealer-button">D</span>' : ''}
                        ${player.currentBet > 0 ? `<div class="pl-bet-chip">${player.currentBet}</div>` : ''}
                    </div>
                `;
            }).join('');
        },

        /**
         * Affiche les cartes du joueur (visibles ou cachées).
         */
        renderPlayerCards(cards = [], isUser = false, playerId = '') {
            if (!cards || cards.length === 0) {
                return '<div class="pl-card pl-card--back"></div><div class="pl-card pl-card--back"></div>';
            }

            return cards.map((card, idx) => {
                // Si ce n'est pas l'utilisateur et que la carte n'est pas révélée, afficher le dos
                if (!isUser && !card.revealed) {
                    return '<div class="pl-card pl-card--back"></div>';
                }

                if (!card) {
                    return '<div class="pl-card pl-card--back"></div>';
                }

                const isRed = card.suit === '♥' || card.suit === '♦';
                const suitClass = isRed ? 'pl-card--red' : 'pl-card--black';

                return `
                    <div class="pl-card ${suitClass}">
                        <div class="pl-card__corner pl-card__corner--top">
                            <span class="pl-card__rank">${card.rank}</span>
                            <span class="pl-card__suit">${card.suit}</span>
                        </div>
                        <div class="pl-card__center">${card.suit}</div>
                        <div class="pl-card__corner pl-card__corner--bottom">
                            <span class="pl-card__rank">${card.rank}</span>
                            <span class="pl-card__suit">${card.suit}</span>
                        </div>
                    </div>
                `;
            }).join('');
        },

        /**
         * Génère les boutons d'action (Fold, Check/Call, Raise).
         */
        renderActionControls(gameState) {
            return `
                <button class="pl-btn pl-btn-fold" data-action="fold">Coucher</button>
                <button class="pl-btn pl-btn-check" data-action="check">Check</button>
                <button class="pl-btn pl-btn-call" data-action="call">Suivre</button>
                <button class="pl-btn pl-btn-raise" data-action="raise">Relancer</button>
            `;
        },

        /**
         * Met à jour l'affichage des cartes communes.
         */
        updateCommunityCards(container, board) {
            if (!container) return;
            container.innerHTML = this.renderCommunityCards(board);
        },

        /**
         * Met à jour l'affichage des sièges.
         */
        updateSeats(container, players, dealerIndex, activePlayerIndex) {
            if (!container) return;
            const isHeadsUp = players && players.length === 2;
            const activeSeats = this.determineActiveSeats(players ? players.length : 6, isHeadsUp);
            container.innerHTML = this.renderSeats(players, dealerIndex, activePlayerIndex, activeSeats, isHeadsUp);
        },

        /**
         * Met à jour l'affichage des cartes d'un joueur spécifique.
         */
        updatePlayerCards(container, cards, isUser) {
            if (!container) return;
            container.innerHTML = this.renderPlayerCards(cards, isUser);
        }
    };
})();