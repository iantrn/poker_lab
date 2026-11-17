
/* =========================================================
   POKERLAB - CARD COMPONENT
   Version : 1.0.0
   Description : Affichage des cartes de poker
   ========================================================= */

"use strict";

export interface PokerCard { value: number; suit: string; }
export interface CardSuit { symbol: string; label: string; color: string; }
export interface CardOptions {
  hidden?: boolean; compact?: boolean; selected?: boolean; className?: string;
}
const PokerLabCards = (() => {

    /* =====================================================
       1. CONFIGURATION DES CARTES
       ===================================================== */

    const SUITS: Record<string, CardSuit> = {
        clubs: {
            symbol: "♣",
            label: "Trèfle",
            color: "black"
        },
        diamonds: {
            symbol: "♦",
            label: "Carreau",
            color: "red"
        },
        hearts: {
            symbol: "♥",
            label: "Cœur",
            color: "red"
        },
        spades: {
            symbol: "♠",
            label: "Pique",
            color: "black"
        }
    };

    const RANKS: Record<number, string> = {
        2: "2",
        3: "3",
        4: "4",
        5: "5",
        6: "6",
        7: "7",
        8: "8",
        9: "9",
        10: "10",
        11: "J",
        12: "Q",
        13: "K",
        14: "A"
    };


    /* =====================================================
       2. VALIDATION D'UNE CARTE
       ===================================================== */

    function isValidCard(card: unknown): card is PokerCard {

        if (!card || typeof card !== "object") {
            return false;
        }

        const candidate = card as Partial<PokerCard>;
        return (
            typeof candidate.value === "number" &&
            Number.isInteger(candidate.value) &&
            candidate.value >= 2 &&
            candidate.value <= 14 &&
            typeof candidate.suit === "string" &&
            Object.prototype.hasOwnProperty.call(SUITS, candidate.suit)
        );

    }


    /* =====================================================
       3. INFORMATIONS D'UNE CARTE
       ===================================================== */

    function getRank(card: unknown): string {

        if (!isValidCard(card)) {
            throw new Error("Carte invalide.");
        }

        return RANKS[card.value]!;

    }


    function getSuit(card: unknown): CardSuit {

        if (!isValidCard(card)) {
            throw new Error("Carte invalide.");
        }

        return SUITS[card.suit]!;

    }


    function getCardLabel(card: unknown): string {

        if (!isValidCard(card)) {
            return "Carte inconnue";
        }

        const rankNames: Record<number, string> = {
            11: "Valet",
            12: "Dame",
            13: "Roi",
            14: "As"
        };

        const rank =
            rankNames[card.value] ??
            String(card.value);

        return `${rank} de ${getSuit(card).label}`;

    }


    /* =====================================================
       4. CRÉATION D'UNE CARTE HTML
       ===================================================== */

    function create(card: unknown, options: CardOptions = {}): HTMLDivElement {

        const {
            hidden = false,
            compact = false,
            selected = false,
            className = ""
        } = options;

        const element = document.createElement("div");

        element.classList.add("pl-card");

        if (compact) {
            element.classList.add("pl-card--compact");
        }

        if (selected) {
            element.classList.add("pl-card--selected");
        }

        if (className) {
            element.classList.add(...className.split(" ").filter(Boolean));
        }

        element.setAttribute("role", "img");

        if (hidden) {

            element.classList.add("pl-card--back");

            element.setAttribute(
                "aria-label",
                "Carte face cachée"
            );

            const pattern = document.createElement("span");

            pattern.className = "pl-card__back-symbol";
            pattern.textContent = "♠";

            element.appendChild(pattern);

            return element;

        }

        if (!isValidCard(card)) {

            element.classList.add("pl-card--empty");

            element.setAttribute(
                "aria-label",
                "Emplacement de carte vide"
            );

            return element;

        }

        const suit = getSuit(card);
        const rank = getRank(card);

        element.classList.add(
            suit.color === "red"
                ? "pl-card--red"
                : "pl-card--black"
        );

        element.setAttribute(
            "aria-label",
            getCardLabel(card)
        );

        // Coin supérieur gauche.

        const topCorner = document.createElement("div");

        topCorner.className = "pl-card__corner pl-card__corner--top";

        const topRank = document.createElement("span");
        topRank.className = "pl-card__rank";
        topRank.textContent = rank;

        const topSuit = document.createElement("span");
        topSuit.className = "pl-card__suit";
        topSuit.textContent = suit.symbol;

        topCorner.append(topRank, topSuit);

        // Symbole central.

        const center = document.createElement("div");

        center.className = "pl-card__center";
        center.textContent = suit.symbol;

        // Coin inférieur droit.

        const bottomCorner = document.createElement("div");

        bottomCorner.className =
            "pl-card__corner pl-card__corner--bottom";

        const bottomRank = document.createElement("span");
        bottomRank.className = "pl-card__rank";
        bottomRank.textContent = rank;

        const bottomSuit = document.createElement("span");
        bottomSuit.className = "pl-card__suit";
        bottomSuit.textContent = suit.symbol;

        bottomCorner.append(bottomRank, bottomSuit);

        element.append(
            topCorner,
            center,
            bottomCorner
        );

        return element;

    }


    /* =====================================================
       5. CRÉATION D'UNE SÉRIE DE CARTES
       ===================================================== */

    function createMany(cards: unknown, options: CardOptions = {}): HTMLDivElement {

        if (!Array.isArray(cards)) {
            throw new Error("La liste des cartes doit être un tableau.");
        }

        const container = document.createElement("div");

        container.className = "pl-cards";

        if (options.className) {
            container.classList.add(
                ...options.className.split(" ").filter(Boolean)
            );
        }

        cards.forEach((card) => {

            container.appendChild(
                create(card, options)
            );

        });

        return container;

    }


    /* =====================================================
       6. AFFICHAGE DANS UN CONTENEUR EXISTANT
       ===================================================== */

    function renderInto(container: Element | string | null, cards: unknown, options: CardOptions = {}): Element {

        if (typeof container === "string") {
            container = document.querySelector(container);
        }

        if (!container) {
            throw new Error("Conteneur de cartes introuvable.");
        }

        if (!Array.isArray(cards)) {
            throw new Error("La liste des cartes est invalide.");
        }

        container.replaceChildren();

        const cardGroup = createMany(cards, options);

        container.appendChild(cardGroup);

        return container;

    }


    /* =====================================================
       7. AFFICHAGE DES CARTES PRIVATIVES
       ===================================================== */

    function renderHoleCards(container: Element | string | null, cards: unknown, options: CardOptions = {}): Element {

        if (!Array.isArray(cards)) {
            throw new Error("Les cartes privatives sont invalides.");
        }

        if (cards.length !== 2) {
            throw new Error(
                "Un joueur doit posséder exactement deux cartes."
            );
        }

        return renderInto(
            container,
            cards,
            {
                ...options,
                className: [
                    "pl-hole-cards",
                    options.className ?? ""
                ].join(" ")
            }
        );

    }


    /* =====================================================
       8. AFFICHAGE DU BOARD
       ===================================================== */

    function renderBoard(container: Element | string | null, cards: unknown, options: CardOptions = {}): Element {

        if (!Array.isArray(cards)) {
            throw new Error("Le board est invalide.");
        }

        if (cards.length > 5) {
            throw new Error(
                "Le board ne peut pas contenir plus de cinq cartes."
            );
        }

        const visibleCards: unknown[] = [...cards];

        while (visibleCards.length < 5) {
            visibleCards.push(null);
        }

        if (typeof container === "string") {
            container = document.querySelector(container);
        }

        if (!container) {
            throw new Error("Conteneur du board introuvable.");
        }

        container.replaceChildren();

        const group = document.createElement("div");

        group.className = "pl-board";

        if (options.className) {
            group.classList.add(
                ...options.className.split(" ").filter(Boolean)
            );
        }

        visibleCards.forEach((card) => {

            group.appendChild(
                card
                    ? create(card, options)
                    : create(null, {
                        ...options,
                        className: "pl-card--board-slot"
                    })
            );

        });

        container.appendChild(group);

        return container;

    }


    /* =====================================================
       9. API PUBLIQUE
       ===================================================== */

    return {

        SUITS,
        RANKS,

        isValidCard,

        getRank,
        getSuit,
        getCardLabel,

        create,
        createMany,

        renderInto,
        renderHoleCards,
        renderBoard

    };

})();


/* =========================================================
   10. EXPORT DU MODULE
   ========================================================= */

export type PokerLabCardsApi = typeof PokerLabCards;
export function installCards(): PokerLabCardsApi {
  (window as Window & { PokerLabCards?: PokerLabCardsApi }).PokerLabCards = PokerLabCards;
  return PokerLabCards;
}
