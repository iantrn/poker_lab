
/* =========================================================
   POKERLAB - DECK MANAGER
   Version : 1.0.0
   Description : Création, mélange et distribution des cartes
   ========================================================= */

"use strict";


/* =========================================================
   1. CONSTANTES DU PAQUET
   ========================================================= */

const POKER_CARD_SUITS = [
    {
        name: "clubs",
        symbol: "♣",
        label: "Trèfle",
        color: "black"
    },
    {
        name: "diamonds",
        symbol: "♦",
        label: "Carreau",
        color: "red"
    },
    {
        name: "hearts",
        symbol: "♥",
        label: "Cœur",
        color: "red"
    },
    {
        name: "spades",
        symbol: "♠",
        label: "Pique",
        color: "black"
    }
];


const POKER_CARD_RANKS = [
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" },
    { value: 5, label: "5" },
    { value: 6, label: "6" },
    { value: 7, label: "7" },
    { value: 8, label: "8" },
    { value: 9, label: "9" },
    { value: 10, label: "10" },
    { value: 11, label: "J" },
    { value: 12, label: "Q" },
    { value: 13, label: "K" },
    { value: 14, label: "A" }
];


const POKER_DECK_SIZE = 52;


/* =========================================================
   2. CLASSE DE GESTION DU PAQUET
   ========================================================= */

class PokerLabDeck {

    constructor(options = {}) {

        this.cards = [];

        this.position = 0;

        this.autoShuffle = options.autoShuffle ?? true;

        this.reset();

    }


    /* -----------------------------------------------------
       2.1. CRÉATION DU PAQUET
       ----------------------------------------------------- */

    createDeck() {

        const deck = [];

        for (const suit of POKER_CARD_SUITS) {

            for (const rank of POKER_CARD_RANKS) {

                const card = {

                    id: `${rank.value}_${suit.name}`,

                    value: rank.value,

                    rank: rank.label,

                    suit: suit.name,

                    symbol: suit.symbol,

                    suitLabel: suit.label,

                    color: suit.color,

                    display: `${rank.label}${suit.symbol}`

                };

                deck.push(card);

            }

        }

        return deck;

    }


    /* -----------------------------------------------------
       2.2. GÉNÉRATION D'UN NOMBRE ALÉATOIRE
       ----------------------------------------------------- */

    randomInteger(max) {

        if (!Number.isInteger(max) || max <= 0) {

            throw new Error(
                "La limite aléatoire doit être un entier positif."
            );

        }

        // Utilisation du générateur cryptographique du navigateur
        // lorsque celui-ci est disponible.

        if (
            typeof crypto !== "undefined" &&
            typeof crypto.getRandomValues === "function"
        ) {

            const randomValues = new Uint32Array(1);

            const range = 0x100000000;

            const limit = range - (range % max);

            let randomNumber;

            do {

                crypto.getRandomValues(randomValues);

                randomNumber = randomValues[0];

            } while (randomNumber >= limit);

            return randomNumber % max;

        }

        // Solution de secours si l'API cryptographique est absente.

        return Math.floor(Math.random() * max);

    }


    /* -----------------------------------------------------
       2.3. MÉLANGE DU PAQUET
       Algorithme de Fisher-Yates
       ----------------------------------------------------- */

    shuffle() {

        for (
            let i = this.cards.length - 1;
            i > this.position;
            i--
        ) {

            const j =
                this.position + this.randomInteger(
                    i - this.position + 1
                );

            const temporaryCard = this.cards[i];

            this.cards[i] = this.cards[j];

            this.cards[j] = temporaryCard;

        }

        return this;

    }


    /* -----------------------------------------------------
       2.4. RÉINITIALISATION DU PAQUET
       ----------------------------------------------------- */

    reset(options = {}) {

        this.cards = this.createDeck();

        this.position = 0;

        const shouldShuffle =
            options.shuffle ?? this.autoShuffle;

        if (shouldShuffle) {

            this.shuffle();

        }

        return this;

    }


    /* -----------------------------------------------------
       2.5. DISTRIBUTION D'UNE CARTE
       ----------------------------------------------------- */

    drawOne() {

        if (this.isEmpty()) {

            throw new Error(
                "Impossible de distribuer une carte : le paquet est vide."
            );

        }

        const card = this.cards[this.position];

        this.position++;

        return card;

    }


    /* -----------------------------------------------------
       2.6. DISTRIBUTION DE PLUSIEURS CARTES
       ----------------------------------------------------- */

    draw(count = 1) {

        if (
            !Number.isInteger(count) ||
            count < 1
        ) {

            throw new Error(
                "Le nombre de cartes à distribuer doit être un entier positif."
            );

        }

        if (count > this.remaining()) {

            throw new Error(
                `Distribution impossible : ${count} cartes demandées, ` +
                `${this.remaining()} disponibles.`
            );

        }

        const drawnCards = [];

        for (let i = 0; i < count; i++) {

            drawnCards.push(
                this.drawOne()
            );

        }

        return drawnCards;

    }


    /* -----------------------------------------------------
       2.7. NOMBRE DE CARTES RESTANTES
       ----------------------------------------------------- */

    remaining() {

        return this.cards.length - this.position;

    }


    /* -----------------------------------------------------
       2.8. VÉRIFIER SI LE PAQUET EST VIDE
       ----------------------------------------------------- */

    isEmpty() {

        return this.remaining() === 0;

    }


    /* -----------------------------------------------------
       2.9. CONSULTER LES CARTES RESTANTES
       ----------------------------------------------------- */

    getRemainingCards() {

        return this.cards.slice(this.position);

    }


    /* -----------------------------------------------------
       2.10. CONSULTER L'ÉTAT DU PAQUET
       ----------------------------------------------------- */

    getState() {

        return {

            totalCards: this.cards.length,

            dealtCards: this.position,

            remainingCards: this.remaining(),

            isEmpty: this.isEmpty()

        };

    }

}


/* =========================================================
   3. EXPORT DU MODULE
   ========================================================= */

// Mise à disposition du gestionnaire dans l'application.

window.PokerLabDeck = PokerLabDeck;


// Mise à disposition des constantes descriptives.

window.PokerLabCardConstants = {

    suits: POKER_CARD_SUITS,

    ranks: POKER_CARD_RANKS,

    deckSize: POKER_DECK_SIZE

};
