
/* =========================================================
   POKERLAB - GAME REVIEW MODULE
   Version : 1.0.0
   Description : Historique et analyse des mains jouées
   ========================================================= */

"use strict";

export interface ReviewPlayer {id:string;name?:string;startingStack?:number;[key:string]:unknown;}
export interface ReviewAction {street:string;playerId:string;type:string;amount?:number;[key:string]:unknown;}
export interface ReviewCard {value:number;suit:string;}
export interface ReviewHand {
  id?:string;players:ReviewPlayer[];actions:ReviewAction[];board:ReviewCard[];
  savedAt?:string;result?:string;theoreticalAnalysis?:unknown;
  [key:string]:unknown;
}
export interface SavedReviewHand extends ReviewHand {id:string;savedAt:string;}
interface ReviewFilters {playerId?:string;result?:string;from?:string;to?:string;}
interface PlayerSummary {
  playerId:string;playerName:string;actions:number;folds:number;checks:number;calls:number;
  bets:number;raises:number;allIns:number;totalInvested:number;
}
interface InvalidAction {actionIndex:number;errors:string[];}
function createReview() {

    /* =====================================================
       1. CONFIGURATION
       ===================================================== */

    const STORAGE_KEY = "pokerlab_game_review";

    const MAX_SAVED_HANDS = 500;

    const VALID_STREETS = [
        "preflop",
        "flop",
        "turn",
        "river",
        "showdown"
    ];

    const VALID_ACTIONS = [
        "fold",
        "check",
        "call",
        "bet",
        "raise",
        "all-in"
    ];

    const EVENTS = {
        HAND_SAVED: "pokerlab:review-hand-saved",
        HAND_LOADED: "pokerlab:review-hand-loaded",
        HAND_DELETED: "pokerlab:review-hand-deleted",
        ANALYSIS_COMPLETED: "pokerlab:review-analysis-completed",
        ERROR: "pokerlab:review-error"
    };


    /* =====================================================
       2. ÉTAT DU MODULE
       ===================================================== */

    let initialized = false;

    let hands: SavedReviewHand[] = [];

    let currentHand: SavedReviewHand | null = null;


    /* =====================================================
       3. OUTILS
       ===================================================== */

    function dispatch(eventName: string, detail: unknown = {}): void {

        window.dispatchEvent(
            new CustomEvent(eventName, {
                detail
            })
        );

    }


    function clone<T>(value: T): T {

        return JSON.parse(JSON.stringify(value)) as T;

    }


    function createId(): string {

        if (
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
        ) {

            return window.crypto.randomUUID();

        }

        return `hand-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 10)}`;

    }


    function normalizeAction(action: unknown): string {

        const aliases: Record<string, string> = {
            "all in": "all-in",
            "all_in": "all-in",
            "shove": "all-in"
        };

        const value = String(action || "")
            .trim()
            .toLowerCase();

        return aliases[value] || value;

    }


    /* =====================================================
       4. VALIDATION DES MAINS
       ===================================================== */

    function validateAction(candidate: unknown) {
        const action = candidate as Partial<ReviewAction> | null;

        const errors: string[] = [];

        if (!action || typeof action !== "object") {

            return {
                valid: false,
                errors: ["Action invalide."]
            };

        }

        if (!VALID_STREETS.includes(action.street ?? "")) {
            errors.push("Street invalide.");
        }

        if (!action.playerId) {
            errors.push("Identifiant du joueur manquant.");
        }

        if (
            !VALID_ACTIONS.includes(
                normalizeAction(action.type)
            )
        ) {
            errors.push("Type d'action invalide.");
        }

        if (
            action.amount !== undefined &&
            (
                typeof action.amount !== "number" ||
                !Number.isFinite(action.amount) ||
                action.amount < 0
            )
        ) {
            errors.push("Montant de l'action invalide.");
        }

        return {
            valid: errors.length === 0,
            errors
        };

    }


    function validateHand(candidate: unknown) {
        const hand = candidate as Partial<ReviewHand> | null;

        const errors: Array<string | InvalidAction> = [];

        if (!hand || typeof hand !== "object") {

            return {
                valid: false,
                errors: ["Main invalide."]
            };

        }

        if (!Array.isArray(hand.players) || hand.players.length < 2) {
            errors.push("La main doit comporter au moins deux joueurs.");
        }

        if (!Array.isArray(hand.actions)) {
            errors.push("L'historique des actions est invalide.");
        }

        if (!Array.isArray(hand.board)) {
            errors.push("Le tableau des cartes communes est invalide.");
        }

        if (Array.isArray(hand.actions)) {

            hand.actions.forEach((action, index) => {

                const validation = validateAction(action);

                if (!validation.valid) {

                    errors.push({
                        actionIndex: index,
                        errors: validation.errors
                    });

                }

            });

        }

        return {
            valid: errors.length === 0,
            errors
        };

    }


    /* =====================================================
       5. SAUVEGARDE LOCALE
       ===================================================== */

    function persist(): boolean {

        try {

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(hands)
            );

            return true;

        } catch (caught: unknown) {
            const error = caught instanceof Error ? caught : new Error(String(caught));

            console.error(
                "PokerLabGameReview : sauvegarde impossible.",
                error
            );

            dispatch(EVENTS.ERROR, {
                message: "Impossible de sauvegarder l'historique."
            });

            return false;

        }

    }


    function loadSavedHands(): void {

        try {

            const saved = localStorage.getItem(STORAGE_KEY);

            if (!saved) {
                hands = [];
                return;
            }

            const parsed = JSON.parse(saved);

            if (!Array.isArray(parsed)) {

                throw new Error(
                    "Format d'historique invalide."
                );

            }

            hands = (parsed as SavedReviewHand[]).filter(hand => {

                return validateHand(hand).valid;

            });

        } catch (caught: unknown) {
            const error = caught instanceof Error ? caught : new Error(String(caught));

            console.warn(
                "PokerLabGameReview : historique illisible.",
                error
            );

            hands = [];

        }

    }


    /* =====================================================
       6. ENREGISTREMENT D'UNE MAIN
       ===================================================== */

    function saveHand(hand: ReviewHand | null) {

        if (!hand || typeof hand !== "object") {

            return {
                success: false,
                errors: ["Main invalide."]
            };

        }

        // L'entraînement peut sauvegarder une main avant que l'utilisateur ouvre Review.
        // Charger d'abord l'historique existant pour ne jamais l'écraser au premier enregistrement.
        if (!initialized) {
            loadSavedHands();
        }

        const preparedHand: SavedReviewHand = {
            ...clone(hand),
            id: hand.id || createId(),
            savedAt: new Date().toISOString()
        } as SavedReviewHand;

        const validation = validateHand(preparedHand);

        if (!validation.valid) {

            return {
                success: false,
                errors: validation.errors
            };

        }

        const previousHands = hands;
        const existingIndex = hands.findIndex(
            item => item.id === preparedHand.id
        );
        const nextHands: SavedReviewHand[] = [...hands];

        if (existingIndex !== -1) {
            nextHands[existingIndex] = preparedHand;
        } else {
            nextHands.unshift(preparedHand);
        }

        hands = nextHands.slice(0, MAX_SAVED_HANDS);

        if (!persist()) {
            hands = previousHands;
            return {
                success: false,
                errors: ["La main n'a pas pu être enregistrée dans le stockage local."]
            };
        }

        dispatch(EVENTS.HAND_SAVED, {
            hand: clone(preparedHand)
        });

        // Si l'historique est déjà affiché, le mettre à jour immédiatement.
        const historyContainer = document.querySelector<HTMLElement>("[data-review-history]");
        if (historyContainer) {
            renderHistory(historyContainer);
        }

        return {
            success: true,
            hand: clone(preparedHand)
        };

    }


    /* =====================================================
       7. HISTORIQUE
       ===================================================== */

    function getAllHands() {

        return clone(hands);

    }


    function getHand(id: unknown) {

        const hand = hands.find(
            item => item.id === id
        );

        return hand ? clone(hand) : null;

    }


    function deleteHand(id: unknown): boolean {

        const previousHands = hands;
        const previousCurrentHand = currentHand;
        const nextHands = hands.filter(hand => hand.id !== id);

        if (nextHands.length === hands.length) {
            return false;
        }

        hands = nextHands;
        if (currentHand && currentHand.id === id) {
            currentHand = null;
        }

        if (!persist()) {
            hands = previousHands;
            currentHand = previousCurrentHand;
            return false;
        }

        dispatch(EVENTS.HAND_DELETED, {
            handId: id
        });

        return true;

    }


    function clearHistory(): boolean {

        const previousHands = hands;
        const previousCurrentHand = currentHand;

        hands = [];
        currentHand = null;

        if (!persist()) {
            hands = previousHands;
            currentHand = previousCurrentHand;
            return false;
        }

        return true;

    }


    /* =====================================================
       8. SÉLECTION D'UNE MAIN
       ===================================================== */

    function selectHand(id: unknown) {

        const hand = hands.find(
            item => item.id === id
        );

        if (!hand) {

            return {
                success: false,
                error: "Main introuvable."
            };

        }

        currentHand = hand;

        dispatch(EVENTS.HAND_LOADED, {
            hand: clone(hand)
        });

        return {
            success: true,
            hand: clone(hand)
        };

    }


    function getCurrentHand() {

        return currentHand
            ? clone(currentHand)
            : null;

    }


    /* =====================================================
       9. FILTRAGE DE L'HISTORIQUE
       ===================================================== */

    function filterHands(filters: ReviewFilters = {}) {

        return hands.filter(hand => {

            if (
                filters.playerId &&
                !hand.players.some(
                    player => player.id === filters.playerId
                )
            ) {
                return false;
            }

            if (
                filters.result &&
                hand.result !== filters.result
            ) {
                return false;
            }

            if (
                filters.from &&
                new Date(hand.savedAt) < new Date(filters.from)
            ) {
                return false;
            }

            if (
                filters.to &&
                new Date(hand.savedAt) > new Date(filters.to)
            ) {
                return false;
            }

            return true;

        }).map(hand => clone(hand));

    }


    /* =====================================================
       10. ANALYSE DES ACTIONS
       ===================================================== */

    function analyzeActions(hand: ReviewHand) {

        const validation = validateHand(hand);

        if (!validation.valid) {

            return {
                success: false,
                errors: validation.errors
            };

        }

        const summary: Record<string, PlayerSummary> = {};

        hand.players.forEach(player => {

            summary[player.id] = {
                playerId: player.id,
                playerName: player.name || player.id,
                actions: 0,
                folds: 0,
                checks: 0,
                calls: 0,
                bets: 0,
                raises: 0,
                allIns: 0,
                totalInvested: 0
            };

        });

        hand.actions.forEach(action => {

            const player = summary[action.playerId];

            if (!player) {
                return;
            }

            const type = normalizeAction(action.type);

            player.actions++;

            if (type === "fold") player.folds++;
            if (type === "check") player.checks++;
            if (type === "call") player.calls++;
            if (type === "bet") player.bets++;
            if (type === "raise") player.raises++;
            if (type === "all-in") player.allIns++;

            player.totalInvested += Number(action.amount || 0);

        });

        return {
            success: true,
            players: Object.values(summary),
            totalActions: hand.actions.length
        };

    }


    /* =====================================================
       11. ANALYSE THÉORIQUE PRÉCALCULÉE
       ===================================================== */

    function getTheoreticalAnalysis(hand: ReviewHand | null) {

        if (
            !hand ||
            !hand.theoreticalAnalysis
        ) {

            return {
                available: false,
                message: "Aucune analyse théorique disponible pour cette main."
            };

        }

        return {
            available: true,
            data: clone(hand.theoreticalAnalysis)
        };

    }


    /* =====================================================
       12. AFFICHAGE D'UNE MAIN
       ===================================================== */

    function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: unknown = undefined): HTMLElementTagNameMap[K] {

        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined && text !== null) {
            element.textContent = String(text);
        }

        return element;

    }


    function renderHand(container: HTMLElement, hand: ReviewHand | null = currentHand) {

        if (!(container instanceof HTMLElement)) {

            throw new Error(
                "Conteneur d'analyse invalide."
            );

        }

        container.replaceChildren();

        if (!hand) {

            container.appendChild(
                createElement(
                    "p",
                    "pl-review-empty",
                    "Sélectionne une main pour commencer son analyse."
                )
            );

            return;

        }

        const header = createElement(
            "div",
            "pl-review-header"
        );

        header.appendChild(
            createElement(
                "h2",
                "pl-review-title",
                `Analyse de la main ${hand.id}`
            )
        );

        if (hand.savedAt) {

            header.appendChild(
                createElement(
                    "span",
                    "pl-review-date",
                    new Date(hand.savedAt).toLocaleString("fr-FR")
                )
            );

        }

        container.appendChild(header);

        // Joueurs.

        const playersSection = createElement(
            "section",
            "pl-review-players"
        );

        playersSection.appendChild(
            createElement("h3", "", "Joueurs")
        );

        hand.players.forEach(player => {

            const item = createElement(
                "div",
                "pl-review-player"
            );

            item.appendChild(
                createElement(
                    "strong",
                    "",
                    player.name || player.id
                )
            );

            item.appendChild(
                createElement(
                    "span",
                    "",
                    `${Number(player.startingStack || 0)} jetons`
                )
            );

            playersSection.appendChild(item);

        });

        container.appendChild(playersSection);

        // Cartes communes.

        const boardSection = createElement(
            "section",
            "pl-review-board"
        );

        boardSection.appendChild(
            createElement("h3", "", "Cartes communes")
        );

        boardSection.appendChild(
            createElement(
                "p",
                "",
                hand.board.length
                    ? hand.board.map(card => {
                        return `${card.value}${card.suit}`;
                    }).join(" ")
                    : "Aucune carte commune"
            )
        );

        container.appendChild(boardSection);

        // Historique des actions.

        const actionsSection = createElement(
            "section",
            "pl-review-actions"
        );

        actionsSection.appendChild(
            createElement("h3", "", "Déroulement de la main")
        );

        hand.actions.forEach((action, index) => {

            const player = hand.players.find(
                item => item.id === action.playerId
            );

            const playerName = player
                ? player.name || player.id
                : action.playerId;

            const actionElement = createElement(
                "div",
                "pl-review-action"
            );

            const description = [
                `${index + 1}.`,
                action.street.toUpperCase(),
                playerName,
                normalizeAction(action.type).toUpperCase()
            ];

            if (action.amount !== undefined) {
                description.push(
                    `${action.amount} jetons`
                );
            }

            actionElement.textContent =
                description.join(" — ");

            actionsSection.appendChild(actionElement);

        });

        container.appendChild(actionsSection);

        // Résultat.

        if (hand.result) {

            container.appendChild(
                createElement(
                    "div",
                    "pl-review-result",
                    `Résultat : ${hand.result}`
                )
            );

        }

        // Analyse théorique.

        const theoretical = getTheoreticalAnalysis(hand);

        const theorySection = createElement(
            "section",
            "pl-review-theory"
        );

        theorySection.appendChild(
            createElement(
                "h3",
                "",
                "Analyse théorique"
            )
        );

        theorySection.appendChild(
            createElement(
                "p",
                "",
                theoretical.available
                    ? "Des données théoriques sont disponibles pour cette main."
                    : theoretical.message
            )
        );

        container.appendChild(theorySection);

        return container;

    }


    /* =====================================================
       13. AFFICHAGE DE L'HISTORIQUE
       ===================================================== */

    function renderHistory(container: HTMLElement) {

        if (!(container instanceof HTMLElement)) {

            throw new Error(
                "Conteneur d'historique invalide."
            );

        }

        container.replaceChildren();

        if (hands.length === 0) {

            container.appendChild(
                createElement(
                    "p",
                    "pl-review-empty",
                    "Aucune main enregistrée pour le moment."
                )
            );

            return;

        }

        const list = createElement(
            "div",
            "pl-review-history"
        );

        hands.forEach(hand => {

            const item = createElement(
                "article",
                "pl-review-history-item"
            );

            const title = createElement(
                "h3",
                "",
                `Main ${hand.id}`
            );

            const date = createElement(
                "span",
                "",
                hand.savedAt
                    ? new Date(hand.savedAt).toLocaleString("fr-FR")
                    : "Date inconnue"
            );

            const openButton = createElement(
                "button",
                "pl-button",
                "Analyser"
            );

            openButton.type = "button";

            openButton.addEventListener("click", () => {

                const result = selectHand(hand.id);

                if (!result.success) {
                    return;
                }

                const reviewContainer = document.querySelector<HTMLElement>(
                    "[data-review-detail]"
                );

                if (reviewContainer) {
                    renderHand(reviewContainer, currentHand);
                }

            });

            item.appendChild(title);
            item.appendChild(date);
            item.appendChild(openButton);

            list.appendChild(item);

        });

        container.appendChild(list);

        return list;

    }


    /* =====================================================
       14. INITIALISATION
       ===================================================== */

    function init(): void {

        if (initialized) {
            return;
        }

        loadSavedHands();

        const historyContainer = document.querySelector<HTMLElement>(
            "[data-review-history]"
        );

        if (historyContainer) {
            renderHistory(historyContainer);
        }

        const detailContainer = document.querySelector<HTMLElement>(
            "[data-review-detail]"
        );

        if (detailContainer) {
            renderHand(detailContainer);
        }

        initialized = true;

    }


    /* =====================================================
       15. EXPORT PUBLIC
       ===================================================== */

    return {

        init,

        validateAction,

        validateHand,

        saveHand,

        getAllHands,

        getHand,

        deleteHand,

        clearHistory,

        selectHand,

        getCurrentHand,

        filterHands,

        analyzeActions,

        getTheoreticalAnalysis,

        renderHand,

        renderHistory,

        EVENTS

    };

}
export type GameReviewApi = ReturnType<typeof createReview>;
export function installGameReview(): GameReviewApi {
  const target = window as Window & { PokerLabGameReview?: GameReviewApi };
  if (!target.PokerLabGameReview) target.PokerLabGameReview = createReview();
  return target.PokerLabGameReview;
}
