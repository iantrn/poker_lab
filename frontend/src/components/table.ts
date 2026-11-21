
/* =========================================================
   POKERLAB - TABLE COMPONENT
   Design : Winamax inspired / Minimal
   Version : 3.0.0
   ========================================================= */

"use strict";

import type { PokerCard } from "../core/evaluator";
interface TablePlayer {
  id: string; name: string; stack: number; streetBet: number;
  folded?: boolean; allIn?: boolean; isHuman?: boolean;
  position?: string | null; holeCards: PokerCard[];
}
interface TablePot {
  amount:number; winnerIds?:string[]; isTie?:boolean;
  share?:number; oddChipRecipients?:string[]; category?:string;
}
interface TableEvaluation {
  playerId:string; playerName?:string; category?:string;
  bestFiveCards?:PokerCard[];
}
interface TableResult {
  type:string; winnerIds?:string[]; totalPot?:number;handNumber?:number;
  pots?:TablePot[]; evaluations?:TableEvaluation[];
}
interface TableState {
  players:TablePlayer[];board:PokerCard[];pot:number;
  handNumber?:number;dealerIndex?:number;currentPlayerId?:string|null;
  handComplete?:boolean;result?:TableResult|null;
}
interface HandView {label:string;detail:string;category:number;score?:number[];bestFiveCards?:PokerCard[];}
interface TableGlobals {
  PokerLabCards?:{create(card:unknown,options:Record<string,unknown>):HTMLElement};
  PokerLabHandEvaluator?:{evaluate(cards:PokerCard[]):{
    description?:string;categoryLabel:string;category:number;score:number[];bestFiveCards:PokerCard[];
  }};
}
function createTable() {
    const globals = window as Window & TableGlobals;

    let lastRenderedHandNumber: number | null = null;
    let lastRenderedBoardCount = 0;
    let lastRenderedHandComplete = false;

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

    const RANKS: Record<number,string> = {
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

    const SUITS: Record<string,string> = {
        clubs: "♣",
        diamonds: "♦",
        hearts: "♥",
        spades: "♠"
    };


    /* =====================================================
       1. OUTILS
       ===================================================== */

    function formatAmount(value: unknown): string {

        const amount = Number(value) || 0;

        return amount.toLocaleString("fr-FR", {
            maximumFractionDigits: 2
        });

    }


    function getRank(value: number): string {

        return RANKS[value] || String(value);

    }


    function getSuitSymbol(suit: string): string {

        return SUITS[suit] || "";

    }


    function getPlayerSlot(index: number, count: number): readonly [number,number] {

        // Presentation-only seats: two horizontal rails, never the corners.
        // Six-max: top 20/50/80 and bottom 15/50/85. Bottom centre is hero.
        const layouts: Record<number, Array<readonly [number, number]>> = {

            2: [[50, 88], [50, 12]],
            3: [[50, 88], [20, 12], [80, 12]],
            4: [[50, 88], [20, 88], [50, 12], [80, 12]],
            5: [[50, 88], [20, 88], [20, 12], [50, 12], [80, 12]],
            6: [[50, 88], [18, 88], [20, 12], [50, 12], [80, 12], [82, 88]]

        };

        const layout = layouts[count] || layouts[6]!;

        return layout[index] || [50, 50];

    }


    function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content: unknown = ""): HTMLElementTagNameMap[K] {

        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (content !== undefined && content !== null) {
            element.textContent = String(content);
        }

        return element;

    }


    function appendCard(container: HTMLElement, card: PokerCard | null, options: {hidden?:boolean;compact?:boolean} = {}): void {

        if (
            globals.PokerLabCards &&
            typeof globals.PokerLabCards.create === "function"
        ) {

            container.appendChild(
                globals.PokerLabCards.create(
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
                : `${getRank(card!.value)}${getSuitSymbol(card!.suit)}`
        );

        container.appendChild(fallback);

    }


    /* =====================================================
       2. IDENTIFICATION DE LA MAIN PRÉFLOP
       ===================================================== */

    function evaluatePreflop(cards: unknown): HandView {

        if (!Array.isArray(cards) || cards.length !== 2) {

            return {
                label: "En attente des cartes",
                detail: "",
                category: -1
            };

        }

        const first = cards[0] as PokerCard | undefined;
        const second = cards[1] as PokerCard | undefined;

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

        if (isPair) {
            const pairRank = getRank(high);
            const label = high === 14
                ? "Paire d'As"
                : high >= 11 ? `Paire de ${pairRank}s` : `Paire de ${pairRank}`;
            return { label, detail: "", category: 1 };
        }

        // A concise strength label only. The cards themselves supply the
        // precise combination; suitedness and gappers are deliberately hidden.
        return {
            label: `Hauteur ${getRank(high)}`,
            detail: "",
            category: 0
        };

    }


    /* =====================================================
       3. ÉVALUATION POSTFLOP
       ===================================================== */

    /** Display ranks 2–10 as digits, including legacy French evaluator text. */
    function numericRanks(label: string): string {
        const names: Record<string,string> = {
            deux: "2", trois: "3", quatre: "4", cinq: "5",
            six: "6", sept: "7", huit: "8", neuf: "9", dix: "10"
        };
        return label.replace(/\b(deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\b/gi,
            rank => names[rank.toLowerCase()] ?? rank);
    }

    function evaluateHeroHand(cards: unknown, board: unknown): HandView {

        if (!Array.isArray(cards) || cards.length !== 2) {
            return evaluatePreflop(cards);
        }

        if (!Array.isArray(board) || board.length < 3) {
            return evaluatePreflop(cards);
        }

        if (!globals.PokerLabHandEvaluator) {

            return {
                label: "Évaluation indisponible",
                detail: "",
                category: -1
            };

        }

        try {

            const evaluation =
                globals.PokerLabHandEvaluator.evaluate([
                    ...cards,
                    ...board
                ]);

            return {

                label: numericRanks(
                    evaluation.description ||
                    evaluation.categoryLabel ||
                    HAND_LABELS[evaluation.category] || ""
                ),

                detail: "",

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

    function renderCommunityCards(board: unknown = []): HTMLDivElement {

        const container = createElement(
            "div",
            "pl-board"
        );

        const cards = Array.isArray(board)
            ? board.slice(0, 5)
            : [];

        for (let i = 0; i < 5; i++) {

            const card = (cards[i] as PokerCard | undefined) || null;

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

    function renderPlayerCards(cards: unknown, visible = false): HTMLDivElement {

        const container = createElement(
            "div",
            "pl-player-cards"
        );

        for (let i = 0; i < 2; i++) {

            const card: PokerCard | null =
                Array.isArray(cards)
                    ? (cards[i] as PokerCard | undefined) ?? null
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

    function renderPlayerBadges(player: TablePlayer, isDealer: boolean, isActive: boolean): HTMLDivElement {

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
                    "FOLD"
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

    /** Original monochrome human avatar; completely separate from cards. */
    function renderPlayerAvatar(): HTMLSpanElement {
        const avatar = createElement("span", "pl-player-avatar");
        avatar.setAttribute("aria-hidden", "true");
        const ns = "http://www.w3.org/2000/svg";
        const graphic = document.createElementNS(ns, "svg");
        graphic.setAttribute("viewBox", "0 0 48 48");
        graphic.setAttribute("fill", "none");
        graphic.setAttribute("focusable", "false");
        const head = document.createElementNS(ns, "circle");
        head.setAttribute("cx", "24");
        head.setAttribute("cy", "17");
        head.setAttribute("r", "8");
        head.setAttribute("fill", "currentColor");
        const torso = document.createElementNS(ns, "path");
        torso.setAttribute("d", "M8 39c.8-9.3 6.5-14 16-14s15.2 4.7 16 14c-9.2 4.2-22.8 4.2-32 0Z");
        torso.setAttribute("fill", "currentColor");
        graphic.append(head, torso);
        avatar.appendChild(graphic);
        return avatar;
    }

    function renderSeats(players: TablePlayer[], dealerIndex: number, currentPlayerId: unknown, handComplete = false, revealCards = false): HTMLDivElement {

        const container = createElement(
            "div",
            "pl-seats"
        );

        if (!Array.isArray(players)) {
            return container;
        }

        const count = players.length;

        // Keep the human at the visually anchored bottom-centre seat, even
        // when an imported state does not list that player first. The dealer
        // is still evaluated against the engine's ORIGINAL player indices.
        const visualPlayers = [
            ...players.filter(player => player.isHuman),
            ...players.filter(player => !player.isHuman)
        ];
        visualPlayers.forEach((player, index) => {

            const [x, y] = getPlayerSlot(index, count);

            const isDealer = players.indexOf(player) === dealerIndex;

            const isActive =
                player.id === currentPlayerId;

            const isHuman = Boolean(player.isHuman);

            const isFolded = Boolean(player.folded);

            const isAllIn = Boolean(player.allIn);

            // Les cartes des adversaires ne sont visibles qu'à l'abattage,
            // et uniquement pour les joueurs qui n'ont pas passé.
            const visibleCards =
                (!handComplete && isHuman) || (revealCards && !isFolded);

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
            seat.classList.add(y < 50 ? "pl-seat-upper" : "pl-seat-lower");

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

            const isEliminated = Number(player.stack) <= 0;
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

            const caption = createElement("div", "pl-player-caption");
            caption.append(playerDetails, stack);
            info.append(renderPlayerAvatar(), caption);

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
                    `${formatAmount(player.streetBet)} BB`
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

    function renderHandStrength(hero: TablePlayer | undefined, board: unknown): HTMLDivElement {

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

        // The approved header shows only the hand category/strength.
        // No gap, suitedness, or redundant card-range description.
        container.append(label, value);

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

    /**
     * A single accessible, engine-driven result dialog. Payouts are amounts
     * distributed from the pot (not net profit after contributed blinds/bets).
     * We render actual per-pot winners and the five evaluated winning cards,
     * without recomputing or modifying the engine's outcome.
     */
    function renderResult(
        result: TableResult | null | undefined,
        players: TablePlayer[] = [],
        handNumber = 1
    ): HTMLDialogElement | null {
        if (!result) return null;

        const dialog = createElement("dialog", "pl-hand-result pl-result-dialog");
        dialog.setAttribute("aria-labelledby", "pl-result-title");
        dialog.setAttribute("aria-describedby", "pl-result-explanation");
        dialog.setAttribute("data-training-result", result.type);
        dialog.tabIndex = -1;
        dialog.addEventListener("cancel", event => event.preventDefault());

        const pots = Array.isArray(result.pots) ? result.pots : [];
        const winnerIds = [...new Set([
            ...(Array.isArray(result.winnerIds) ? result.winnerIds : []),
            ...pots.flatMap(pot => Array.isArray(pot.winnerIds) ? pot.winnerIds : [])
        ])];
        const evaluations = new Map(
            (Array.isArray(result.evaluations) ? result.evaluations : [])
                .map(item => [item.playerId, item])
        );
        const nameOf = (id: string): string => {
            const player = players.find(item => item.id === id);
            return player ? (player.isHuman ? "Vous" : player.name) : id;
        };
        const payoutFor = (id: string): number => {
            if (!pots.length && winnerIds.length === 1) {
                return Number.isFinite(result.totalPot) ? result.totalPot! : 0;
            }
            return pots.reduce((sum, pot) => {
                const potWinners = Array.isArray(pot.winnerIds) ? pot.winnerIds : [];
                if (!potWinners.includes(id)) return sum;
                const share = typeof pot.share === "number" && Number.isFinite(pot.share)
                    ? pot.share
                    : pot.amount / potWinners.length;
                return sum + share +
                    (Array.isArray(pot.oddChipRecipients) &&
                    pot.oddChipRecipients.includes(id) ? 0.5 : 0);
            }, 0);
        };
        const potTotal = Number.isFinite(result.totalPot)
            ? result.totalPot!
            : pots.reduce((sum, pot) => sum + pot.amount, 0);
        const isUncontested = result.type === "uncontested";
        const isSplit = pots.some(pot => (pot.winnerIds?.length ?? 0) > 1);
        const heroWon = winnerIds.some(id =>
            players.some(player => player.id === id && player.isHuman)
        );
        const canContinue = players.filter(player => player.stack > 0).length >= 2;

        const header = createElement("header", "pl-result-header");
        const eyebrow = createElement("div", "pl-result-eyebrow");
        const ornament = createElement("span", "pl-result-ornament", "✦");
        ornament.setAttribute("aria-hidden", "true");
        eyebrow.append(
            ornament,
            createElement("span", "", `MAIN #${result.handNumber ?? handNumber} · ${isUncontested ? "POT NON CONTESTÉ" : "SHOWDOWN"}`)
        );
        const title = createElement(
            "h2", "pl-hand-result-title", isSplit
                ? "Pot partagé"
                : winnerIds.length > 1 ? "Plusieurs gagnants"
                : heroWon ? "Vous remportez le pot"
                : winnerIds.length === 1 ? "Pot remporté"
                : "Main terminée"
        );
        title.id = "pl-result-title";
        const winnerSummary = createElement(
            "p", "pl-hand-result-description",
            winnerIds.length
                ? winnerIds.map(nameOf).join(" · ")
                : "Aucun vainqueur identifié"
        );
        const explanation = createElement(
            "p", "pl-result-explanation",
            isUncontested
                ? "Tous les adversaires ont abandonné la main. Aucun abattage nécessaire."
                : "Les mains ont été comparées à l'abattage. Voici les jetons attribués et les combinaisons gagnantes."
        );
        explanation.id = "pl-result-explanation";
        header.append(eyebrow, title, winnerSummary, explanation);

        const total = createElement("div", "pl-result-total");
        total.append(
            createElement("span", "pl-result-total-label", "POT TOTAL DISTRIBUÉ"),
            createElement("strong", "pl-result-total-value", `${formatAmount(potTotal)} BB`)
        );

        const winnings = createElement("section", "pl-result-winnings");
        if (winnerIds.length > 1) winnings.classList.add("pl-result-winnings--multi");
        winnings.setAttribute("aria-label", "Détails de la victoire");
        winnings.appendChild(createElement("h3", "pl-result-section-title", "Gains et mains gagnantes"));
        if (!winnerIds.length) {
            winnings.appendChild(
                createElement("p", "pl-result-empty", "Aucune répartition disponible pour cette main.")
            );
        }
        winnerIds.forEach(id => {
            const evaluation = evaluations.get(id);
            const row = createElement("div", "pl-result-winner");
            const player = players.find(item => item.id === id);
            if (player?.isHuman) row.classList.add("pl-result-winner--hero");

            const topLine = createElement("div", "pl-result-winner-top");
            const identity = createElement("div", "pl-result-winner-identity");
            const dot = createElement("span", "pl-result-winner-dot");
            dot.setAttribute("aria-hidden", "true");
            identity.append(dot, createElement("strong", "pl-result-winner-name", nameOf(id)));
            topLine.append(identity,
                createElement("strong", "pl-result-winner-gain", `+${formatAmount(payoutFor(id))} BB`));
            row.appendChild(topLine);

            const category = isUncontested
                ? "Victoire sans showdown"
                : evaluation?.category || pots.find(pot => pot.winnerIds?.includes(id))?.category
                    || "Combinaison gagnante";
            row.appendChild(createElement("p", "pl-result-winner-hand", category));

            if (!isUncontested && Array.isArray(evaluation?.bestFiveCards) &&
                evaluation.bestFiveCards.length === 5) {
                const hand = createElement("div", "pl-result-best-five");
                hand.setAttribute("aria-label", `Cinq meilleures cartes de ${nameOf(id)}`);
                evaluation.bestFiveCards.forEach(card => appendCard(hand, card, {compact:true}));
                row.appendChild(hand);
            }
            winnings.appendChild(row);
        });

        const breakdown = createElement("section", "pl-result-pot-breakdown");
        breakdown.setAttribute("aria-label", "Répartition des pots");
        breakdown.appendChild(
            createElement("h3", "pl-result-section-title", "Répartition du pot")
        );
        if (pots.length) {
            pots.forEach((pot, index) => {
                const potRow = createElement("div", "pl-result-pot-row");
                const info = createElement("div", "pl-result-pot-info");
                info.append(
                    createElement("strong", "pl-result-pot-name",
                        index === 0 ? "Pot principal" : `Pot secondaire ${index}`),
                    createElement("span", "pl-result-pot-beneficiaries",
                        (pot.winnerIds || []).map(nameOf).join(" · ") || "Non attribué")
                );
                const value = createElement("strong", "pl-result-pot-value",
                    `${formatAmount(pot.amount)} BB`);
                potRow.append(info, value);
                breakdown.appendChild(potRow);
            });
        } else {
            breakdown.appendChild(
                createElement("p", "pl-result-pot-beneficiaries",
                    "Le pot a été attribué sans répartition secondaire.")
            );
        }

        const footer = createElement("footer", "pl-result-footer");
        if (canContinue) {
            const next = createElement("button", "pl-result-next-hand");
            next.type = "button";
            next.dataset.trainingAction = "next-hand";
            next.append(
                createElement("span", "", "Main suivante"),
                createElement("span", "pl-result-next-arrow", "→")
            );
            next.setAttribute("aria-label", "Passer à la main suivante");
            footer.appendChild(next);
        } else {
            footer.appendChild(createElement("p", "pl-result-game-over",
                "Partie terminée : moins de deux joueurs disposent encore de jetons."));
        }
        const leave = createElement("button", "pl-result-stop-session", "Quitter la partie");
        leave.type = "button";
        leave.dataset.trainingAction = "end-session";
        footer.appendChild(leave);

        dialog.append(header, total, winnings, breakdown, footer);
        return dialog;
    }


    /* =====================================================
       10. RENDU COMPLET DE LA TABLE
       ===================================================== */

    function render(container: HTMLElement | null, gameState: TableState | null): void {

        if (!container || !gameState) {
            return;
        }

        const players: TablePlayer[] = Array.isArray(gameState.players)
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

        // Existing settings route, not a new game-mode control.
        const settings = createElement("a", "pl-table-settings");
        settings.href = "#settings";
        settings.dataset.page = "settings";
        settings.setAttribute("aria-label", "Paramètres");
        settings.setAttribute("title", "Paramètres");
        settings.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="11" cy="18" r="2"/></svg>';
        header.append(handNumber, format, blinds, settings);

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

        const handNumberValue = gameState.handNumber ?? null;
        const sameHand = handNumberValue === lastRenderedHandNumber;
        const previousBoardCount = sameHand ? lastRenderedBoardCount : 0;
        const boardCount = Array.isArray(gameState.board) ? Math.min(gameState.board.length, 5) : 0;
        const justReachedShowdown = Boolean(
            gameState.handComplete &&
            !(sameHand && lastRenderedHandComplete) &&
            gameState.result &&
            gameState.result.type === "showdown"
        );

        // Only animate newly dealt community cards. The board is recreated
        // after each betting action, so replaying existing cards would be a bug.
        // The flop is deliberately staggered, while turn/river enter singly.
        if (boardCount > previousBoardCount) {
            const newCards = board.querySelectorAll<HTMLElement>(":scope > *");
            for (let index = previousBoardCount; index < boardCount; index++) {
                const card = newCards[index];
                if (!card || card.classList.contains("pl-card--empty")) continue;

                const street = index < 3 ? "flop" : index === 3 ? "turn" : "river";
                card.classList.add("pl-card-deal", `pl-card-deal--${street}`);
                card.dataset.dealStreet = street;

                // 3 cards at the flop, with a rhythmic 140ms spacing. A
                // normal turn or river starts immediately when it is dealt.
                // For imported/fast-forwarded states, process any missing
                // community cards in the canonical flop → turn → river order.
                const dealDelay = index < 3 ? index * 140
                    : previousBoardCount < 3 ? (index === 3 ? 570 : 850)
                    : previousBoardCount < 4 && index === 4 ? 360 : 0;
                card.style.animationDelay = `${dealDelay}ms`;
            }
        }

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
            ? renderResult(gameState.result, players, gameState.handNumber ?? 1)
            : null;

        const actionMount = createElement("div", "pl-hero-actions-mount");

        if (justReachedShowdown) {
            table.classList.add("pl-showdown-entering");
            const revealedCards = seats.querySelectorAll<HTMLElement>(".pl-seat .pl-player-cards > *");
            revealedCards.forEach((card, index) => {
                card.classList.add("pl-card-showdown-reveal");
                card.style.animationDelay = (Math.floor(index / 2) * 90 + (index % 2) * 110) + "ms";
            });
        }

        // Presentation-only street timeline and turn context. The labels
        // are derived from actual board/player state, never synthetic solver data.
        const flow = createElement("div", "pl-table-flow");
        flow.setAttribute("aria-label", "Progression de la main");
        const phases = ["Préflop", "Flop", "Turn", "River"];
        const activePhase = boardCount < 3 ? 0 : boardCount === 3 ? 1 : boardCount === 4 ? 2 : 3;
        const timeline = createElement("div", "pl-table-flow-steps");
        phases.forEach((label, index) => {
            const marker = createElement("span", "pl-table-flow-step", label);
            if (index === activePhase) marker.classList.add("is-current");
            if (index < activePhase) marker.classList.add("is-complete");
            if (gameState.handComplete && index === activePhase) marker.classList.add("is-complete");
            timeline.appendChild(marker);
        });
        const activePlayer = players.find(player => player.id === gameState.currentPlayerId);
        const status = createElement(
            "span",
            "pl-table-flow-status",
            gameState.handComplete ? "Main terminée" : activePlayer
                ? (activePlayer.isHuman ? "À vous de jouer" : "Au tour de " + activePlayer.name)
                : "En attente du prochain tour"
        );
        flow.append(timeline, status);

        table.append(header, felt, seats, flow);

        if (handStrength.childNodes.length > 0) {
            table.appendChild(handStrength);
        }

        if (result) {
            table.appendChild(result);
        }

        table.appendChild(actionMount);

        if (result && justReachedShowdown) {
            result.classList.add("pl-showdown-result-enter");
        }

        container.replaceChildren(table);

        // A native modal brings proper backdrop, keyboard focus and access
        // to the next-hand button. It is not a screenshot or a duplicated
        // result block below the table.
        if (result && !result.open) {
            result.showModal();
            // The first interactive descendant is at the bottom: focus the
            // dialog itself so users first see the outcome rather than being
            // auto-scrolled past the winner and pot summary.
            result.focus();
            result.scrollTop = 0;
        }

        lastRenderedHandNumber = handNumberValue;
        lastRenderedBoardCount = boardCount;
        lastRenderedHandComplete = Boolean(gameState.handComplete);

    }


    /* =====================================================
       11. EXPORT
       ===================================================== */

    return {

        render,

        renderSeats,

        renderCommunityCards,

        renderPlayerCards,

        evaluateHeroHand,

        evaluatePreflop

    };

}
export type TableApi = ReturnType<typeof createTable>;
export function installTable(): TableApi {
  const target = window as Window & { PokerLabTable?: TableApi };
  if (!target.PokerLabTable) target.PokerLabTable = createTable();
  return target.PokerLabTable;
}
