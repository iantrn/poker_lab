/* =========================================================
   POKERLAB - POSTFLOP EQUITY ANALYSER
   Version : 0.1.0
   Monte-Carlo equity engine for heads-up postflop spots.
   ========================================================= */
"use strict";

(function (global) {
    const SUITS = ["clubs", "diamonds", "hearts", "spades"];
    const SUIT_CODES = { clubs: "c", diamonds: "d", hearts: "h", spades: "s" };
    const RANKS = "23456789TJQKA";
    const MATRIX_URL = "./data/ranges/preflop/matrix/";
    const DEFAULT_ITERATIONS = 1800;
    let matrixIndexPromise = null;
    let matrixBundlePromise = null;

    function cardKey(card) {
        return card && Number.isInteger(card.value) && SUIT_CODES[card.suit]
            ? card.value + "_" + card.suit : null;
    }

    function toCard(value, suit) {
        const labels = { 11: "J", 12: "Q", 13: "K", 14: "A" };
        return {
            id: value + "_" + suit, value, suit,
            rank: labels[value] || String(value),
            symbol: ({clubs:"♣",diamonds:"♦",hearts:"♥",spades:"♠"})[suit]
        };
    }

    function makeDeck(excluded) {
        const deck = [];
        for (const suit of SUITS) for (let value = 2; value <= 14; value++) {
            const card = toCard(value, suit);
            if (!excluded.has(cardKey(card))) deck.push(card);
        }
        return deck;
    }

    function randomInt(max) {
        if (global.crypto && global.crypto.getRandomValues) {
            const data = new Uint32Array(1);
            const limit = 0x100000000 - (0x100000000 % max);
            do { global.crypto.getRandomValues(data); } while (data[0] >= limit);
            return data[0] % max;
        }
        return Math.floor(Math.random() * max);
    }

    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = randomInt(i + 1);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function score(hero, villain, board) {
        const evaluator = global.PokerLabHandEvaluator;
        const a = evaluator.evaluate([...hero, ...board]).score;
        const b = evaluator.evaluate([...villain, ...board]).score;
        return evaluator.compareScores(a, b);
    }

    function handClass(rankA, rankB, suited) {
        const high = Math.max(rankA, rankB);
        const low = Math.min(rankA, rankB);
        if (high === low) return RANKS[high - 2] + RANKS[low - 2];
        return RANKS[high - 2] + RANKS[low - 2] + (suited ? "s" : "o");
    }

    async function loadMatrix() {
        if (!matrixIndexPromise) {
            matrixIndexPromise = fetch(MATRIX_URL + "index.json")
                .then(r => { if (!r.ok) throw new Error("Index de ranges indisponible."); return r.json(); })
                .then(data => {
                    if (data.version !== 1 || !Array.isArray(data.spots)) throw new Error("Index de ranges invalide.");
                    return data;
                }).catch(error => { matrixIndexPromise = null; throw error; });
        }
        if (!matrixBundlePromise) {
            matrixBundlePromise = fetch(MATRIX_URL + "ranges.json")
                .then(r => { if (!r.ok) throw new Error("Bundle de ranges indisponible."); return r.json(); })
                .then(data => {
                    if (data.version !== 1 || !data.ranges) throw new Error("Bundle de ranges invalide.");
                    return data.ranges;
                }).catch(error => { matrixBundlePromise = null; throw error; });
        }
        const [index, ranges] = await Promise.all([matrixIndexPromise, matrixBundlePromise]);
        return { index, ranges };
    }

    function actionCode(action, aggressorNumber) {
        if (action === "call" || action === "all_in_call") return "call";
        if (!["bet", "raise", "short_raise", "short_all_in_bet"].includes(action)) return null;
        if (aggressorNumber === 1) return "RFI";
        if (aggressorNumber === 2) return "3bet";
        if (aggressorNumber === 3) return "4bet";
        if (aggressorNumber === 4) return "5bet";
        return "6bet";
    }

    function findOpponentRange(state, history, opponent, matrix) {
        const preflop = history.filter(event => event.type === "player_action" && event.street === "preflop");
        const actorIndex = preflop.map(event => event.data.playerId).lastIndexOf(opponent.id);
        if (actorIndex < 0) return { combos: null, label: "Range large (non renseignée)" };

        const positions = new Map(state.players.map(player => [player.id, player.position]));
        const prefix = [];
        let aggressorNumber = 0;
        let targetCode = null;

        for (let index = 0; index <= actorIndex; index++) {
            const event = preflop[index];
            const action = event.data.action;
            const isAggressive = ["bet", "raise", "short_raise", "short_all_in_bet"].includes(action);
            if (isAggressive) aggressorNumber++;
            const code = actionCode(action, aggressorNumber);
            if (index === actorIndex) {
                targetCode = code;
                break;
            }
            const position = positions.get(event.data.playerId);
            if (position && code) prefix.push(position + " " + code);
        }

        if (!targetCode) return { combos: null, label: "Range large (action non couverte)" };
        const sequence = prefix.join(" › ");
        const candidates = matrix.index.spots.filter(item =>
            item.p === opponent.position && item.a === targetCode
        );
        const exact = candidates.find(item => (item.s || "") === sequence);
        const spot = exact || candidates.sort((a, b) => {
            const depthA = a.s ? a.s.split("›").length : 0;
            const depthB = b.s ? b.s.split("›").length : 0;
            return Math.abs(depthA - prefix.length) - Math.abs(depthB - prefix.length);
        })[0];

        if (!spot || !matrix.ranges[spot.id]) {
            return { combos: null, label: "Range large (spot absent)" };
        }

        const weighted = [];
        const range = matrix.ranges[spot.id];
        for (let a = 2; a <= 14; a++) for (let b = 2; b <= a; b++) {
            const pairClass = handClass(a, b, true);
            const suitedClass = handClass(a, b, true);
            const offClass = handClass(a, b, false);
            const frequency = Number(range[pairClass] ?? 0);
            const offFrequency = Number(range[offClass] ?? 0);
            if (a === b) {
                if (frequency > 0) addClassCombos(weighted, a, b, frequency, false);
            } else {
                if (frequency > 0) addClassCombos(weighted, a, b, frequency, true);
                if (offFrequency > 0) addClassCombos(weighted, a, b, offFrequency, false);
            }
        }
        return { combos: weighted.length ? weighted : null, label: spot.id };
    }

    function addClassCombos(target, rankA, rankB, frequency, suited) {
        for (const suitA of SUITS) for (const suitB of SUITS) {
            if (suited && suitA !== suitB) continue;
            if (!suited && suitA === suitB) continue;
            if (rankA === rankB && SUITS.indexOf(suitB) <= SUITS.indexOf(suitA)) continue;
            target.push({
                cards: [toCard(rankA, suitA), toCard(rankB, suitB)],
                weight: frequency
            });
        }
    }

    function weightedChoice(items) {
        const total = items.reduce((sum, item) => sum + item.weight, 0);
        let cursor = Math.random() * total;
        for (const item of items) {
            cursor -= item.weight;
            if (cursor <= 0) return item.cards;
        }
        return items[items.length - 1].cards;
    }

    function sampleOpponentHand(deck, weightedRange) {
        if (!weightedRange) {
            const cards = shuffle(deck.slice());
            return cards.slice(0, 2);
        }
        const available = weightedRange.filter(item =>
            item.cards.every(card => deck.some(candidate => cardKey(candidate) === cardKey(card)))
        );
        if (!available.length) return shuffle(deck.slice()).slice(0, 2);
        return weightedChoice(available);
    }

    function validateState(state) {
        if (!state || !Array.isArray(state.board) || state.board.length < 3 || state.board.length > 5) {
            throw new Error("Le solveur est disponible à partir du flop.");
        }
        const active = state.players.filter(player => !player.folded && player.stack >= 0);
        if (active.length !== 2) throw new Error("La première version du solveur est limitée au heads-up.");
        const hero = state.players.find(player => player.isHuman);
        if (!hero || !Array.isArray(hero.holeCards) || hero.holeCards.length !== 2) {
            throw new Error("Les cartes du joueur sont indisponibles.");
        }
        return { hero, opponent: active.find(player => player.id !== hero.id) };
    }

    function recommend(equity, state, hero) {
        const amount = Number(hero.amountToCall) || 0;
        const pot = Number(state.pot) || 0;
        const potOdds = amount > 0 ? amount / (pot + amount) : 0;
        const margin = equity - potOdds;
        const options = hero.actionOptions || {};
        let action, explanation;
        if (amount > 0) {
            if (equity >= potOdds + 0.08 && (options.canRaise || options.canBet)) {
                action = "Relance envisageable";
                explanation = "L'équité estimée dépasse nettement le seuil du call. Une relance peut extraire de la value, mais le sizing et les ranges restent déterminants.";
            } else if (equity >= potOdds) {
                action = "Suivre";
                explanation = "L'équité estimée atteint le seuil de rentabilité immédiat du call, avant prise en compte des mises futures.";
            } else {
                action = "Se coucher";
                explanation = "L'équité estimée est inférieure aux pot odds. Le call est défavorable à long terme dans ce modèle simplifié.";
            }
        } else if (equity >= 0.65 && (options.canBet || options.canRaise)) {
            action = "Miser pour value";
            explanation = "L'équité estimée est élevée. Une mise peut être intéressante, sous réserve de la texture du board et de la range adverse.";
        } else {
            action = "Checker";
            explanation = "Sans mise à payer, le check conserve le pot. La décision d'ouvrir dépend aussi de l'avantage de range et de la stratégie.";
        }
        return { action, explanation, potOdds, margin };
    }

    async function analyse(state, history, options = {}) {
        const { hero, opponent } = validateState(state);
        const known = [...hero.holeCards, ...state.board];
        const seen = new Set();
        for (const card of known) {
            const key = cardKey(card);
            if (!key || seen.has(key)) throw new Error("Cartes connues invalides ou dupliquées.");
            seen.add(key);
        }
        const matrix = await loadMatrix();
        const range = findOpponentRange(state, history, opponent, matrix);
        const baseDeck = makeDeck(seen);
        const iterations = Math.max(300, Math.min(10000, Number(options.iterations) || DEFAULT_ITERATIONS));
        let wins = 0, ties = 0, losses = 0;
        for (let i = 0; i < iterations; i++) {
            const deck = baseDeck.slice();
            const villain = sampleOpponentHand(deck, range.combos);
            const villainKeys = new Set(villain.map(cardKey));
            const remaining = deck.filter(card => !villainKeys.has(cardKey(card)));
            shuffle(remaining);
            const runout = remaining.slice(0, 5 - state.board.length);
            const result = score(hero.holeCards, villain, [...state.board, ...runout]);
            if (result > 0) wins++;
            else if (result === 0) ties++;
            else losses++;
        }
        const equity = (wins + ties / 2) / iterations;
        const decision = recommend(equity, state, hero);
        return {
            iterations, wins, ties, losses, equity,
            rangeLabel: range.label,
            rangeUsed: Boolean(range.combos),
            decision,
            note: "Estimation Monte-Carlo. Ce module ne calcule pas encore un équilibre GTO ni un arbre complet de mises."
        };
    }

    global.PokerLabPostflopSolver = { analyse, validateState };
})(window);
