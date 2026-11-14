/**
 * PokerLab - Table Component
 * Version avec design de cartes Winamax
 */

(function() {
    window.PokerLabTable = {
        /**
         * Rendu initial de la table.
         */
        render(container, gameState) {
            if (!container) return;

            const isHeadsUp = gameState.maxPlayers === 2 || (gameState.players && gameState.players.length === 2);
            const tableClass = isHeadsUp ? 'pl-table-container heads-up' : 'pl-table-container';

            container.innerHTML = `
                <div class="${tableClass}">
                    <div class="pl-table-header">
                        <span class="pl-hand-counter">Main #${gameState.handNumber || 1}</span>
                        <span class="pl-game-mode">${isHeadsUp ? 'Heads-Up' : '6-Max'}</span>
                        <span class="pl-stakes">Blinds: 0.5/1 BB</span>
                    </div>

                    <div class="pl-felt">
                        <div class="pl-pot-display">
                            <span class="pl-pot-label">Pot</span>
                            <span class="pl-pot-amount">${gameState.pot || 0} BB</span>
                        </div>
                        <div class="pl-community-cards" id="pl-board-cards">
                            ${this.renderCommunityCards(gameState.board)}
                        </div>
                    </div>

                    <div class="pl-seats-container" id="pl-seats-container">
                        ${this.renderSeats(gameState.players, gameState.dealerIndex, gameState.activePlayerIndex)}
                    </div>
                </div>
            `;
        },

        /**
         * Cartes communes (board).
         */
        renderCommunityCards(board = []) {
            if (!board || board.length === 0) {
                return Array(5).fill('<div class="pl-card-placeholder"></div>').join('');
            }

            return board.map(card => {
                if (!card) return '<div class="pl-card-placeholder"></div>';
                const isRed = card.suit === '♥' || card.suit === '♦';
                return `
                    <div class="pl-card ${isRed ? 'red' : 'black'}">
                        <div class="pl-card-corner top-left">
                            <span class="pl-card-rank">${card.rank}</span>
                            <span class="pl-card-suit">${card.suit}</span>
                        </div>
                        <div class="pl-card-center">${card.suit}</div>
                        <div class="pl-card-corner bottom-right">
                            <span class="pl-card-rank">${card.rank}</span>
                            <span class="pl-card-suit">${card.suit}</span>
                        </div>
                    </div>
                `;
            }).join('');
        },

        /**
         * Sièges des joueurs.
         */
        renderSeats(players = [], dealerIndex = 0, activePlayerIndex = 0) {
            if (!players || players.length === 0) return '';

            const isHeadsUp = players.length === 2;

            return players.map((player, index) => {
                const seatNumber = index + 1;
                const isDealer = index === dealerIndex;
                const isActive = index === activePlayerIndex;
                const isFolded = player.folded;
                const isAllIn = player.allIn;

                // Masquer les sièges inutilisés
                if (isHeadsUp && ![0, 3].includes(index)) {
                    return '';
                }
                if (!isHeadsUp && index >= players.length) {
                    return '';
                }

                const seatClass = isHeadsUp && index === 3 ? 'pl-seat-hu-2' : `pl-seat-${seatNumber}`;

                return `
                    <div class="pl-seat ${seatClass} ${isActive ? 'active' : ''} ${isFolded ? 'folded' : ''} ${isAllIn ? 'all-in' : ''}"
                         data-player-index="${index}">
                        <div class="pl-player-info">
                            <span class="pl-player-name">${player.name}</span>
                            <span class="pl-player-stack">${player.stack || 0} BB</span>
                        </div>
                        <div class="pl-player-cards">
                            ${this.renderPlayerCards(player.cards, player.isUser)}
                        </div>
                        ${isDealer ? '<span class="pl-dealer-button">D</span>' : ''}
                        ${player.currentBet > 0 ? `<div class="pl-bet-chip">${player.currentBet} BB</div>` : ''}
                    </div>
                `;
            }).join('');
        },

        /**
         * Cartes du joueur.
         */
        renderPlayerCards(cards = [], isUser = false) {
            if (!cards || cards.length === 0) {
                return '<div class="pl-card-back">♠</div><div class="pl-card-back">♠</div>';
            }

            return cards.map(card => {
                if (!isUser) {
                    return '<div class="pl-card-back">♠</div>';
                }
                const isRed = card.suit === '♥' || card.suit === '♦';
                return `
                    <div class="pl-card ${isRed ? 'red' : 'black'}">
                        <div class="pl-card-corner top-left">
                            <span class="pl-card-rank">${card.rank}</span>
                            <span class="pl-card-suit">${card.suit}</span>
                        </div>
                        <div class="pl-card-center">${card.suit}</div>
                        <div class="pl-card-corner bottom-right">
                            <span class="pl-card-rank">${card.rank}</span>
                            <span class="pl-card-suit">${card.suit}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    };
})();