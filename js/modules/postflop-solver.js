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

    function actionCode(action, aggressorNumber, data = {}) {
        if (action === "call" || action === "all_in_call") return "call";
        if (action === "fold") return "fold";
        if (action === "check") return "check";
        if (!["bet", "raise", "short_raise", "short_all_in_bet"].includes(action)) return null;
        if (aggressorNumber === 1) return "RFI";
        if (aggressorNumber === 2) return "3bet";
        if (aggressorNumber === 3) return "4bet";
        if (aggressorNumber === 4) return data.allIn ? "5bet" : "5bet_small";
        return "6bet";
    }

    function matrixPosition(position) {
        const aliases = {
            "BTN": "BU",
            "BTN/SB": "BU",
            "HJ": "MP"
        };
        return aliases[position] || position;
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
            const code = actionCode(action, aggressorNumber, event.data || {});
            if (index === actorIndex) {
                targetCode = code;
                break;
            }
            const position = matrixPosition(positions.get(event.data.playerId));
            if (position && code) prefix.push(position + " " + code);
        }

        if (!targetCode) return { combos: null, label: "Range large (action non couverte)" };
        const sequence = prefix.join(" › ");
        const opponentPosition = matrixPosition(opponent.position);
        const candidates = matrix.index.spots.filter(item =>
            item.p === opponentPosition && item.a === targetCode
        );
        // Never substitute a merely similar sequence: a different preflop line
        // can represent a materially different range. If the exact line is absent,
        // analyse against the explicit uniform fallback instead.
        const spot = candidates.find(item => (item.s || "") === sequence);

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

    function resolveInput(input, history = []) {
        if (input && Object.prototype.hasOwnProperty.call(input, "schemaVersion")) {
            if (input.schemaVersion !== 1 || !input.state) {
                throw new Error("Version du contrat de données du solveur non prise en charge.");
            }
            return {
                state: input.state,
                history: Array.isArray(input.history) ? input.history : []
            };
        }
        return { state: input, history: Array.isArray(history) ? history : [] };
    }

    function createInput(state, history = []) {
        if (!state || !Array.isArray(state.players)) {
            throw new Error("Impossible de construire les données du solveur : état invalide.");
        }

        const chipAmount = (value, label) => {
            const amount = value === undefined || value === null ? 0 : Number(value);
            if (!Number.isFinite(amount) || amount < 0 ||
                Math.abs(amount * 2 - Math.round(amount * 2)) > 0.000001) {
                throw new Error("Contrat du solveur invalide : " + label + " doit respecter les incréments de 0,5 jeton.");
            }
            return amount;
        };

        const players = state.players.map(player => ({
            id: player.id,
            name: player.name,
            isHuman: Boolean(player.isHuman),
            isBot: Boolean(player.isBot),
            botProfile: player.botProfile || null,
            botDifficulty: player.botDifficulty || null,
            position: player.position || null,
            stack: chipAmount(player.stack, "stack"),
            streetBet: chipAmount(player.streetBet, "streetBet"),
            totalContribution: chipAmount(player.totalContribution, "totalContribution"),
            folded: Boolean(player.folded),
            allIn: Boolean(player.allIn),
            hasActed: Boolean(player.hasActed),
            lastActedBet: chipAmount(player.lastActedBet, "lastActedBet"),
            amountToCall: chipAmount(player.amountToCall, "amountToCall"),
            holeCards: player.isHuman && Array.isArray(player.holeCards)
                ? player.holeCards.map(card => ({ value: card.value, suit: card.suit }))
                : null,
            actionOptions: player.isHuman && player.actionOptions
                ? { ...player.actionOptions }
                : null
        }));

        const allowedHistoryFields = [
            "playerId", "playerName", "action", "amount", "pot",
            "potBefore", "potAfter", "currentBetBefore", "currentBetAfter",
            "streetBetBefore", "streetBetAfter", "stackBefore", "stackAfter",
            "totalContributionBefore", "totalContributionAfter",
            "betTo", "raiseTo", "raiseSize",
            "isFullRaise", "lastFullRaiseBefore", "lastFullRaiseAfter", "allIn",
            "street", "board", "smallBlind", "smallBlindAmount",
            "bigBlind", "bigBlindAmount", "winnerId"
        ];
        const safeHistory = (Array.isArray(history) ? history : []).map(event => {
            const data = {};
            for (const key of allowedHistoryFields) {
                if (event && event.data && Object.prototype.hasOwnProperty.call(event.data, key)) {
                    const value = event.data[key];
                    data[key] = key === "board" && Array.isArray(value)
                        ? value.map(card => ({ value: card.value, suit: card.suit }))
                        : value;
                }
            }
            return {
                type: event && event.type,
                street: event && event.street,
                timestamp: Number(event && event.timestamp) || 0,
                data
            };
        });

        const snapshot = {
            handNumber: state.handNumber,
            street: state.street,
            board: (state.board || []).map(card => ({ value: card.value, suit: card.suit })),
            pot: chipAmount(state.pot, "pot"),
            currentBet: chipAmount(state.currentBet, "currentBet"),
            lastFullRaise: chipAmount(state.lastFullRaise, "lastFullRaise"),
            minimumRaiseTo: chipAmount(state.minimumRaiseTo, "minimumRaiseTo"),
            blinds: state.blinds ? { ...state.blinds } : { smallBlind: 0.5, bigBlind: 1 },
            dealerIndex: state.dealerIndex,
            currentPlayerId: state.currentPlayerId,
            pendingPlayers: Array.isArray(state.pendingPlayers) ? state.pendingPlayers.slice() : [],
            handComplete: Boolean(state.handComplete),
            players
        };

        return { schemaVersion: 1, state: snapshot, history: safeHistory };
    }

    function validateState(state) {
        if (!state || !Array.isArray(state.board) || state.board.length < 3 || state.board.length > 5) {
            throw new Error("Le solveur est disponible à partir du flop.");
        }
        if (!Array.isArray(state.players)) {
            throw new Error("La liste des joueurs est invalide.");
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

    function buildUniformCombos(knownCards) {
        const deck = makeDeck(new Set(knownCards.map(cardKey)));
        const combos = [];
        for (let first = 0; first < deck.length; first++) {
            for (let second = first + 1; second < deck.length; second++) {
                combos.push({ cards: [deck[first], deck[second]], weight: 1 });
            }
        }
        return combos;
    }

    function estimateBotHandStrength(holeCards, board) {
        const result = global.PokerLabHandEvaluator.evaluate([...holeCards, ...board]);
        const categoryStrength = [0.24, 0.40, 0.56, 0.68, 0.78, 0.84, 0.91, 0.96, 0.985, 0.995];
        let strength = categoryStrength[result.score[0]] ?? 0.5;
        if (Array.isArray(result.score) && result.score.length > 1) {
            const kickerSum = result.score.slice(1).reduce((sum, value) =>
                sum + (Number.isFinite(value) ? value : 0), 0);
            strength += Math.max(0, Math.min(0.025, kickerSum / 1000));
        }
        return Math.max(0.05, Math.min(0.995, strength));
    }

    function conditionRangeOnPostflopActions(state, history, opponent, range) {
        if (!range || !Array.isArray(range.combos)) return range;
        const streetOrder = { flop: 3, turn: 4, river: 5 };
        const actions = (history || []).filter(event =>
            event.type === "player_action" &&
            event.data &&
            event.data.playerId === opponent.id &&
            Object.prototype.hasOwnProperty.call(streetOrder, event.street) &&
            streetOrder[event.street] <= state.board.length &&
            ["check", "call", "all_in_call", "bet", "raise", "short_raise", "short_all_in_bet"].includes(event.data.action)
        );
        if (!actions.length) return { ...range, postflopActionsUsed: 0 };

        const conditioned = range.combos.map(item => {
            let logWeight = Math.log(Math.max(Number(item.weight) || 0, 1e-12));
            for (const event of actions) {
                const boardLength = streetOrder[event.street];
                const board = state.board.slice(0, boardLength);
                let strength = 0.5;
                try {
                    strength = estimateBotHandStrength(item.cards, board);
                } catch (error) {
                    // An invalid historical board must not silently discard a combo.
                    strength = 0.5;
                }
                const action = event.data.action;
                let likelihood;
                if (action === "check") {
                    likelihood = 0.25 + (1 - strength) * 0.75;
                } else if (action === "call" || action === "all_in_call") {
                    likelihood = 0.20 + strength * 0.80;
                } else {
                    likelihood = 0.12 + strength * 0.88;

                    // Les sizings observés apportent un signal supplémentaire :
                    // un sizing plus élevé augmente légèrement le poids des mains
                    // fortes, sans supposer qu'une grosse mise exclut les bluffs.
                    const potBefore = Number(event.data.potBefore);
                    const sizeAmount = Number(
                        action === "bet" || action === "short_all_in_bet"
                            ? (event.data.betTo ?? event.data.amount)
                            : (event.data.raiseSize ?? event.data.amount)
                    );
                    if (Number.isFinite(potBefore) && potBefore > 0 &&
                        Number.isFinite(sizeAmount) && sizeAmount > 0) {
                        const sizeRatio = sizeAmount / potBefore;
                        const sizingSignal = Math.min(1, Math.log1p(sizeRatio) / Math.LN2);
                        const sizingMultiplier = Math.exp((strength - 0.5) * 0.8 * sizingSignal);
                        likelihood *= Math.max(0.5, Math.min(1.5, sizingMultiplier));
                    }
                }
                logWeight += Math.log(Math.max(0.05, likelihood));
            }
            return { cards: item.cards, logWeight };
        });

        const maxLogWeight = Math.max(...conditioned.map(item => item.logWeight));
        const combos = conditioned.map(item => ({
            cards: item.cards,
            weight: Math.exp(item.logWeight - maxLogWeight)
        })).filter(item => item.weight > 0);

        return {
            ...range,
            combos,
            postflopActionsUsed: actions.length,
            conditioning: "heuristique basée sur la force de main, les actions et les sizings observés"
        };
    }

    async function getOpponentRange(state, history, opponent) {
        let baseRange;
        try {
            const matrix = await loadMatrix();
            baseRange = findOpponentRange(state, history, opponent, matrix);
        } catch (error) {
            baseRange = {
                combos: null,
                label: "Range large (bundle préflop indisponible)",
                rangeError: error && error.message ? error.message : "Chargement des ranges impossible."
            };
        }
        const rangeUsed = Array.isArray(baseRange.combos) && baseRange.combos.length > 0;
        const sourceRange = rangeUsed
            ? baseRange
            : { ...baseRange, combos: buildUniformCombos([
                ...(state.players.find(player => player.isHuman)?.holeCards || []),
                ...state.board
            ]) };
        const conditioned = conditionRangeOnPostflopActions(state, history, opponent, sourceRange);
        conditioned.rangeUsed = rangeUsed;
        if (conditioned.postflopActionsUsed > 0 && conditioned.combos) {
            conditioned.label += " · ajustée postflop";
        }
        return conditioned;
    }

    async function analyse(input, history = [], options = {}) {
        const resolved = resolveInput(input, history);
        const state = resolved.state;
        history = resolved.history;
        const { hero, opponent } = validateState(state);
        const known = [...hero.holeCards, ...state.board];
        const seen = new Set();
        for (const card of known) {
            const key = cardKey(card);
            if (!key || seen.has(key)) throw new Error("Cartes connues invalides ou dupliquées.");
            seen.add(key);
        }
        const range = await getOpponentRange(state, history, opponent);
        const baseDeck = makeDeck(seen);
        const availableCombos = Array.isArray(range.combos)
            ? range.combos.filter(item =>
                item.cards.every(card => baseDeck.some(candidate => cardKey(candidate) === cardKey(card)))
            )
            : [];
        const weightedRange = availableCombos.length ? availableCombos : null;
        const preflopRangeUsed = range.rangeUsed !== false && availableCombos.length > 0;
        const iterations = Math.max(300, Math.min(10000, Number(options.iterations) || DEFAULT_ITERATIONS));
        let wins = 0, ties = 0, losses = 0;
        for (let i = 0; i < iterations; i++) {
            const deck = baseDeck.slice();
            const villain = sampleOpponentHand(deck, weightedRange);
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
            rangeLabel: range.rangeUsed === false
                ? range.label
                : preflopRangeUsed
                    ? range.label
                    : "Range large (combinaisons bloquées)",
            rangeUsed: preflopRangeUsed,
            decision,
            note: "Équité Monte-Carlo contre une range préflop, éventuellement ajustée par un modèle heuristique des actions postflop observées. Les fréquences stratégiques proviennent d'un arbre CFR+ abstrait ; elles ne constituent pas un équilibre GTO certifié."
        };
    }

    global.PokerLabPostflopSolver = { analyse, validateState, getOpponentRange, createInput, resolveInput };
})(window);
