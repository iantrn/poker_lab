/* =========================================================
   POKERLAB - POSTFLOP STRATEGY (CFR+)
   Version : 0.2.0
   Chance-sampled CFR+ across flop, turn and river in heads-up pots.
   Abstracted betting tree; not a full or certified GTO solver.
   ========================================================= */
"use strict";

(function (global) {
    const DEFAULT_ITERATIONS = 60;
    const DEFAULT_SAMPLES = 24;
    const BET_FRACTION = 0.5;
    const BET_SIZINGS = [0.33, 0.75];
    const ACTION_LIMIT = 4;

    const CHIP_UNIT = 0.5;
    const CHIP_EPSILON = 0.000001;

    function roundChips(amount) {
        return Math.round((Number(amount) || 0) / CHIP_UNIT) * CHIP_UNIT;
    }

    function ceilChips(amount) {
        return Math.ceil((Number(amount) || 0) / CHIP_UNIT - CHIP_EPSILON) * CHIP_UNIT;
    }

    function floorChips(amount) {
        return Math.floor((Number(amount) || 0) / CHIP_UNIT + CHIP_EPSILON) * CHIP_UNIT;
    }

    function cardId(card) {
        return card.value + "_" + card.suit;
    }

    function handId(cards) {
        return cards.map(cardId).sort().join(",");
    }

    function boardId(cards) {
        return cards.map(cardId).sort().join(",");
    }

    function cloneState(state) {
        return {
            actor: state.actor,
            pot: state.pot,
            stacks: state.stacks.slice(),
            bets: state.bets.slice(),
            hasActed: state.hasActed.slice(),
            lastActedBets: state.lastActedBets.slice(),
            lastFullRaise: state.lastFullRaise,
            bigBlind: state.bigBlind,
            heroInvested: state.heroInvested,
            raises: state.raises,
            checks: state.checks,
            history: state.history.slice(),
            root: state.root
        };
    }

    function amountToCall(state, actor) {
        return roundChips(Math.max(0, state.bets[1 - actor] - state.bets[actor]));
    }

    function terminal(type, state, winner = null) {
        return {
            terminal: true,
            type,
            winner,
            pot: state.pot,
            heroInvested: state.heroInvested
        };
    }

    function applyContribution(state, actor, amount) {
        const paid = floorChips(Math.max(0, Math.min(state.stacks[actor], amount)));
        state.stacks[actor] -= paid;
        state.bets[actor] += paid;
        state.pot += paid;
        if (actor === 0) state.heroInvested += paid;
        return paid;
    }

    function makeAction(label, type, amount = 0) {
        return { label, type, amount };
    }

    function buildDecisionTree(input, rootOptions, priorHistory = [], runout = [], rootChecks = 0, rootRaises = 0) {
        const initial = {
            actor: 0,
            pot: roundChips(input.pot),
            stacks: input.players.map(player => floorChips(player.stack)),
            bets: input.players.map(player => roundChips(player.streetBet)),
            hasActed: input.players.map(player => Boolean(player.hasActed)),
            lastActedBets: input.players.map(player => roundChips(player.lastActedBet)),
            lastFullRaise: roundChips(input.lastFullRaise) || 1,
            bigBlind: roundChips(input.blinds && input.blinds.bigBlind) || 1,
            heroInvested: 0,
            raises: Math.max(0, Math.floor(Number(rootRaises) || 0)),
            checks: rootChecks,
            history: priorHistory.slice(),
            root: true
        };
        const nodes = { count: 0 };

        function firstToAct() {
            if (input.postflopFirstActorId) {
                const firstIndex = input.players.findIndex(player =>
                    player.id === input.postflopFirstActorId
                );
                if (firstIndex >= 0) return firstIndex;
            }
            const index = input.players.findIndex(player =>
                ["BTN/SB", "SB", "BTN"].includes(player.position)
            );
            return index >= 0 ? index : 0;
        }

        function advanceStreet(state, board, runoutIndex, depth) {
            if (state.stacks[0] <= 0 || state.stacks[1] <= 0 || runoutIndex >= runout.length) {
                return terminal("showdown", state);
            }
            const nextBoard = [...board, runout[runoutIndex]];
            const next = cloneState(state);
            next.actor = firstToAct();
            next.bets = [0, 0];
            next.hasActed = [false, false];
            next.lastActedBets = [0, 0];
            next.lastFullRaise = next.bigBlind;
            next.raises = 0;
            next.checks = 0;
            next.root = false;
            const streetName = nextBoard.length === 4 ? "turn" : "river";
            next.history.push("street:" + streetName);
            return build(next, nextBoard, runoutIndex + 1, depth + 1);
        }

        function build(state, board, runoutIndex, depth) {
            nodes.count++;
            if (depth > 18 || state.stacks[state.actor] <= 0) {
                return terminal("showdown", state);
            }

            const actor = state.actor;
            const other = 1 - actor;
            const toCall = amountToCall(state, actor);

            if (toCall === 0 && state.checks >= 2) {
                return advanceStreet(state, board, runoutIndex, depth);
            }

            const actions = [];
            const currentBet = Math.max(state.bets[0], state.bets[1]);
            const actorRaiseRights = !state.hasActed[actor] ||
                currentBet - state.lastActedBets[actor] >= state.lastFullRaise - CHIP_EPSILON;
            const canContinueAggression = state.raises < 1 &&
                state.stacks[other] > 0 &&
                actorRaiseRights;
            const canRaise = canContinueAggression &&
                !(state.root && actor === 0 && rootOptions.canRaise === false);

            if (toCall > 0) {
                actions.push(makeAction("fold", "fold"));
                actions.push(makeAction("call", "call", toCall));

                const rootRaiseAllowed = !state.root || rootOptions.canRaise;
                const requiredRaiseTotal = ceilChips(state.root && Number.isFinite(rootOptions.minimumRaiseTo)
                    ? Math.max(toCall, rootOptions.minimumRaiseTo - state.bets[actor])
                    : toCall + state.lastFullRaise);
                const effectiveMaximum = floorChips(toCall + state.stacks[other]);
                const maximumRaiseTotal = floorChips(state.root && Number.isFinite(rootOptions.maximumRaiseTo)
                    ? Math.min(state.stacks[actor], rootOptions.maximumRaiseTo - state.bets[actor], effectiveMaximum)
                    : Math.min(state.stacks[actor], effectiveMaximum));
                if (canRaise && rootRaiseAllowed && state.stacks[actor] > toCall) {
                    const desiredRaiseTotal = ceilChips(toCall + Math.max(toCall, state.pot * BET_FRACTION,
                        requiredRaiseTotal - toCall, state.lastFullRaise));
                    if (desiredRaiseTotal <= maximumRaiseTotal + 0.000001) {
                        actions.push(makeAction("raise", "raise", desiredRaiseTotal));
                    } else if (state.root && rootOptions.isAllIn && maximumRaiseTotal > toCall) {
                        actions.push(makeAction("all_in_raise", "raise", maximumRaiseTotal));
                    } else if (state.root && maximumRaiseTotal > toCall) {
                        actions.push(makeAction("raise_effective", "raise", maximumRaiseTotal));
                    } else if (!state.root && state.stacks[actor] > toCall && maximumRaiseTotal > toCall) {
                        actions.push(makeAction("all_in_raise", "raise", maximumRaiseTotal));
                    }
                }
            } else {
                actions.push(makeAction("check", "check"));
                const rootBetAllowed = !state.root || rootOptions.canBet;
                if (canContinueAggression && rootBetAllowed && state.stacks[actor] > 0) {
                    const minimumBet = ceilChips(state.root && Number.isFinite(rootOptions.minimumBet)
                        ? rootOptions.minimumBet : 1);
                    const effectiveBetStack = floorChips(Math.min(state.stacks[actor], state.stacks[other]));
                    const addedBetAmounts = new Set();
                    let largestBet = 0;
                    for (const fraction of BET_SIZINGS) {
                        const amount = floorChips(Math.min(effectiveBetStack, Math.max(minimumBet, roundChips(state.pot * fraction))));
                        if (amount <= 0 || addedBetAmounts.has(amount)) continue;
                        addedBetAmounts.add(amount);
                        largestBet = Math.max(largestBet, amount);
                        actions.push(makeAction("bet_" + Math.round(fraction * 100), "bet", amount));
                    }
                    if (largestBet > 0 && effectiveBetStack > largestBet * 1.25) {
                        actions.push(makeAction("all_in", "bet", effectiveBetStack));
                    }
                }
            }

            const node = {
                terminal: false,
                actor,
                board: board.slice(),
                pot: state.pot,
                stacks: state.stacks.slice(),
                bets: state.bets.slice(),
                hasActed: state.hasActed.slice(),
                lastActedBets: state.lastActedBets.slice(),
                lastFullRaise: state.lastFullRaise,
                raises: state.raises,
                checks: state.checks,
                history: state.history.join("/"),
                actions: []
            };

            for (const action of actions.slice(0, ACTION_LIMIT)) {
                const next = cloneState(state);
                next.root = false;
                next.history.push(actor + ":" + action.label);

                if (action.type === "fold") {
                    node.actions.push({ action, child: terminal("fold", next, other) });
                    continue;
                }

                if (action.type === "check") {
                    next.checks++;
                    next.hasActed[actor] = true;
                    next.lastActedBets[actor] = next.bets[actor];
                    next.actor = other;
                    node.actions.push({ action, child: build(next, board, runoutIndex, depth + 1) });
                    continue;
                }

                if (action.type === "call") {
                    const paid = applyContribution(next, actor, action.amount);
                    if (paid + 0.000001 < action.amount) {
                        const uncalled = action.amount - paid;
                        next.pot -= uncalled;
                        next.bets[other] -= uncalled;
                        next.stacks[other] += uncalled;
                        if (other === 0) next.heroInvested -= uncalled;
                    }
                    next.hasActed[actor] = true;
                    next.lastActedBets[actor] = next.bets[actor];
                    const child = next.stacks[0] <= 0 || next.stacks[1] <= 0
                        ? terminal("showdown", next)
                        : advanceStreet(next, board, runoutIndex, depth + 1);
                    node.actions.push({ action, child });
                    continue;
                }

                if (action.type === "bet") {
                    const paid = applyContribution(next, actor, action.amount);
                    next.checks = 0;
                    if (paid >= next.bigBlind - CHIP_EPSILON) {
                        next.lastFullRaise = paid;
                    }
                    next.hasActed[actor] = true;
                    next.lastActedBets[actor] = next.bets[actor];
                    next.actor = other;
                    node.actions.push({ action, child: build(next, board, runoutIndex, depth + 1) });
                    continue;
                }

                if (action.type === "raise") {
                    const paid = applyContribution(next, actor, action.amount);
                    const raiseIncrement = Math.max(0, paid - toCall);
                    if (raiseIncrement >= next.lastFullRaise - CHIP_EPSILON) {
                        next.lastFullRaise = raiseIncrement;
                    }
                    next.hasActed[actor] = true;
                    next.lastActedBets[actor] = next.bets[actor];
                    next.raises++;
                    next.checks = 0;
                    next.actor = other;
                    node.actions.push({ action, child: build(next, board, runoutIndex, depth + 1) });
                }
            }

            if (!node.actions.length) return terminal("showdown", state);
            return node;
        }

        const tree = build(initial, input.board, 0, 0);
        return { tree, nodeCount: nodes.count };
    }

    function createRandom(seed) {
        let state = Number(seed) >>> 0;
        return function () {
            state = (state + 0x6D2B79F5) | 0;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }

    function weightedSampleEntry(items, random = Math.random) {
        const total = items.reduce((sum, item) => sum + item.weight, 0);
        if (!(total > 0)) return items[Math.floor(random() * items.length)];
        let cursor = random() * total;
        for (const item of items) {
            cursor -= item.weight;
            if (cursor <= 0) return item;
        }
        return items[items.length - 1];
    }

    function weightedSample(items, random = Math.random) {
        return weightedSampleEntry(items, random).cards;
    }

    function buildUniformRange(knownCards) {
        const blocked = new Set(knownCards.map(cardId));
        const suits = ["clubs", "diamonds", "hearts", "spades"];
        const deck = [];
        for (const suit of suits) for (let value = 2; value <= 14; value++) {
            const card = { value, suit };
            if (!blocked.has(cardId(card))) deck.push(card);
        }
        const combos = [];
        for (let first = 0; first < deck.length; first++) {
            for (let second = first + 1; second < deck.length; second++) {
                combos.push({ cards: [deck[first], deck[second]], weight: 1 });
            }
        }
        return combos;
    }

    function sampleDeals(
        actualHero,
        board,
        opponentRange,
        sampleCount,
        rangeUsedHint = true,
        random = Math.random,
        heroRange = null
    ) {
        const boardBlocked = new Set(board.map(cardId));
        const validCombos = (range, blocked) => Array.isArray(range)
            ? range.filter(item =>
                item.cards && item.cards.length === 2 &&
                item.cards.every(card => card && !blocked.has(cardId(card))) &&
                cardId(item.cards[0]) !== cardId(item.cards[1]) &&
                Number.isFinite(Number(item.weight)) && Number(item.weight) > 0
            )
            : [];

        let heroCandidates = validCombos(heroRange, boardBlocked);
        if (!heroCandidates.length) {
            heroCandidates = [{ cards: actualHero, weight: 1 }];
        }

        const heroTotal = heroCandidates.reduce((sum, item) => sum + Number(item.weight), 0);
        const actualHeroKey = handId(actualHero);
        const actualHeroEntry = heroCandidates.find(item => handId(item.cards) === actualHeroKey);
        const actualHeroProbability = actualHeroEntry
            ? Number(actualHeroEntry.weight) / heroTotal
            : 0;

        // Oversample the observed holding so its root information set receives
        // enough updates. Importance weights restore the original range prior.
        const actualHandBoost = actualHeroEntry ? 0.25 : 0;
        const proposalHeroRange = heroCandidates.map(item => {
            const priorProbability = Number(item.weight) / heroTotal;
            const isActual = handId(item.cards) === actualHeroKey;
            return {
                ...item,
                priorProbability,
                proposalProbability: (1 - actualHandBoost) * priorProbability +
                    (isActual ? actualHandBoost : 0)
            };
        });

        const deals = [];
        const suits = ["clubs", "diamonds", "hearts", "spades"];
        let actualHeroSamples = 0;
        let opponentRangeSamples = 0;

        for (let i = 0; i < sampleCount; i++) {
            const selectedHero = weightedSampleEntry(
                proposalHeroRange.map(item => ({
                    cards: item.cards,
                    weight: item.proposalProbability,
                    priorProbability: item.priorProbability,
                    proposalProbability: item.proposalProbability
                })),
                random
            );
            const hero = selectedHero.cards;
            const isActualHero = handId(hero) === actualHeroKey;
            if (isActualHero) actualHeroSamples++;

            const heroImportanceWeight = selectedHero.proposalProbability > 0
                ? selectedHero.priorProbability / selectedHero.proposalProbability
                : 1;

            const blocked = new Set([...hero, ...board].map(cardId));
            let villainCandidates = validCombos(opponentRange, blocked);
            const hasRangeCandidates = villainCandidates.length > 0;
            if (!hasRangeCandidates) {
                const uniform = buildUniformRange([...hero, ...board]);
                villainCandidates = uniform;
            }
            if (!villainCandidates.length) {
                throw new Error("Aucune combinaison adverse disponible pour le calcul CFR.");
            }

            const villain = weightedSample(villainCandidates, random);
            if (hasRangeCandidates && rangeUsedHint) opponentRangeSamples++;

            const excluded = new Set([...hero, ...board, ...villain].map(cardId));
            const deck = [];
            for (const suit of suits) for (let value = 2; value <= 14; value++) {
                const card = { value, suit };
                if (!excluded.has(cardId(card))) deck.push(card);
            }
            for (let index = deck.length - 1; index > 0; index--) {
                const swap = Math.floor(random() * (index + 1));
                [deck[index], deck[swap]] = [deck[swap], deck[index]];
            }
            const runout = deck.slice(0, 5 - board.length);
            deals.push({
                hero,
                villain,
                runout,
                finalBoard: [...board, ...runout],
                heroImportanceWeight,
                isActualHero
            });
        }

        return {
            deals,
            rangeUsed: opponentRangeSamples === sampleCount && rangeUsedHint,
            heroRangeUsed: Array.isArray(heroRange) && heroRange.length > 0,
            actualHeroInRange: Boolean(actualHeroEntry),
            actualHeroSamples
        };
    }

    function utility(node, deal, hero, board) {
        if (node.type === "fold") {
            return node.winner === 0
                ? node.pot - node.heroInvested
                : -node.heroInvested;
        }
        const result = Number.isInteger(deal.showdownResult)
            ? deal.showdownResult
            : global.PokerLabHandEvaluator.compareScores(
                global.PokerLabHandEvaluator.evaluate([...(deal.hero || hero), ...(deal.finalBoard || board)]).score,
                global.PokerLabHandEvaluator.evaluate([...deal.villain, ...(deal.finalBoard || board)]).score
            );
        const payout = result > 0 ? node.pot : result === 0 ? node.pot / 2 : 0;
        return payout - node.heroInvested;
    }

    function cfrCallbacks(hero, board) {
        return {
            informationKey: (node, deal) =>
                informationKey(node, deal, deal && deal.hero || hero, board),
            utility: (node, deal) =>
                utility(node, deal, deal && deal.hero || hero, board)
        };
    }

    function runCfr(node, deal, traverser, reach, maps, hero, board, averageWeight) {
        if (!global.PokerLabCFRCore) {
            throw new Error("Le noyau CFR+ n'est pas chargé.");
        }
        const chanceWeight = Number(deal.heroImportanceWeight) > 0
            ? Number(deal.heroImportanceWeight)
            : 1;
        return global.PokerLabCFRCore.runCfr(
            node,
            deal,
            traverser,
            reach,
            maps,
            cfrCallbacks(hero, board),
            averageWeight,
            chanceWeight
        );
    }

    function averageStrategy(node, deal, maps, hero, board) {
        return global.PokerLabCFRCore.averageStrategy(
            node,
            deal,
            maps,
            cfrCallbacks(hero, board)
        );
    }

    function getRootStrategy(tree, deal, maps, hero, board) {
        return global.PokerLabCFRCore.getStrategy(
            tree,
            deal,
            maps,
            cfrCallbacks(hero, board)
        );
    }

    function validate(state) {
        const expectedBoardLength = { flop: 3, turn: 4, river: 5 };
        if (!state || !Object.prototype.hasOwnProperty.call(expectedBoardLength, state.street) ||
            !Array.isArray(state.board) || state.board.length !== expectedBoardLength[state.street]) {
            throw new Error("Le moteur CFR+ est disponible à partir du flop.");
        }
        if (!Array.isArray(state.players)) throw new Error("La liste des joueurs est invalide.");
        const active = state.players.filter(player => !player.folded);
        if (active.length !== 2) throw new Error("Le moteur CFR+ est limité au heads-up.");
        const hero = state.players.find(player => player.isHuman);
        if (!hero || !Array.isArray(hero.holeCards) || hero.holeCards.length !== 2) {
            throw new Error("Les cartes du joueur sont indisponibles.");
        }
        if (state.currentPlayerId !== hero.id) {
            throw new Error("Le calcul stratégique doit être lancé au tour du joueur humain.");
        }
        const opponent = active.find(player => player.id !== hero.id);
        if (!opponent) throw new Error("Adversaire heads-up introuvable.");

        const seen = new Set();
        for (const card of [...hero.holeCards, ...state.board]) {
            if (!card || !Number.isInteger(card.value) || card.value < 2 || card.value > 14 ||
                !["clubs", "diamonds", "hearts", "spades"].includes(card.suit)) {
                throw new Error("Une carte de l'état stratégique est invalide.");
            }
            const key = cardId(card);
            if (seen.has(key)) throw new Error("L'état stratégique contient des cartes dupliquées.");
            seen.add(key);
        }

        const chipValues = [
            state.pot, hero.stack, opponent.stack, hero.streetBet, opponent.streetBet,
            hero.amountToCall, state.lastFullRaise, hero.lastActedBet, opponent.lastActedBet
        ].filter(value => value !== undefined && value !== null);
        if (chipValues.some(value => !Number.isFinite(Number(value)) || Number(value) < 0 ||
            Math.abs(Number(value) * 2 - Math.round(Number(value) * 2)) > CHIP_EPSILON)) {
            throw new Error("L'état stratégique contient un montant qui ne respecte pas l'unité de 0,5 jeton.");
        }
        return { hero, opponent };
    }

    async function solvePostflop(input, history = [], options = {}) {
        const resolved = global.PokerLabPostflopSolver &&
            typeof global.PokerLabPostflopSolver.resolveInput === "function"
            ? global.PokerLabPostflopSolver.resolveInput(input, history)
            : { state: input, history: Array.isArray(history) ? history : [] };
        const state = resolved.state;
        history = resolved.history;
        const { hero, opponent } = validate(state);
        const defaults = {
            flop: { iterations: 20, samples: 8 },
            turn: { iterations: 30, samples: 12 },
            river: { iterations: DEFAULT_ITERATIONS, samples: DEFAULT_SAMPLES }
        }[state.street];
        const rangeInfo = await global.PokerLabPostflopSolver.getOpponentRange(state, history, opponent);
        const heroRangeInfo = typeof global.PokerLabPostflopSolver.getPlayerRange === "function"
            ? await global.PokerLabPostflopSolver.getPlayerRange(state, history, hero)
            : {
                label: "Range héro non renseignée (main réelle uniquement)",
                rangeUsed: false,
                actualHandInRange: true,
                combos: [{ cards: hero.holeCards, weight: 1 }]
            };
        const requestedIterations = Math.max(10, Math.min(1000, Number(options.iterations) || defaults.iterations));
        const samples = Math.max(8, Math.min(160, Number(options.samples) || defaults.samples));
        // Chaque itération reçoit une nouvelle main adverse et un nouveau runout.
        // Le budget total de traversées reste proche de l'ancienne version iterations × samples.
        const trainingIterations = Math.min(4000, requestedIterations * samples);
        const currentStreetActions = (history || [])
            .filter(event => event.type === "player_action" && event.street === state.street);
        const priorHistory = currentStreetActions.map(event => {
            const data = event.data || {};
            const player = state.players.find(item => item.id === data.playerId);
            return (player ? player.position || player.id : data.playerId) +
                ":" + data.action + (Number.isFinite(data.amount) ? ":" + data.amount : "");
        });
        const lastStreetAction = currentStreetActions[currentStreetActions.length - 1];
        const lastActorId = lastStreetAction && lastStreetAction.data
            ? lastStreetAction.data.playerId : null;
        const rootRaises = currentStreetActions.filter(event =>
            event.data && ["raise", "short_raise"].includes(event.data.action)
        ).length;
        const rootChecks = Number(hero.amountToCall) === 0 && lastStreetAction &&
            lastStreetAction.data && lastStreetAction.data.action === "check" &&
            lastActorId !== hero.id ? 1 : 0;

        let postflopFirstActorId = null;
        if (Number.isInteger(state.dealerIndex) && state.players.length > 0) {
            const activeIds = new Set([hero.id, opponent.id]);
            for (let offset = 1; offset <= state.players.length; offset++) {
                const seat = (state.dealerIndex + offset) % state.players.length;
                if (activeIds.has(state.players[seat].id)) {
                    postflopFirstActorId = state.players[seat].id;
                    break;
                }
            }
        }
        const normalizedState = {
            ...state,
            players: [hero, opponent],
            postflopFirstActorId
        };
        const random = Number.isInteger(options.seed)
            ? createRandom(options.seed)
            : Math.random;
        const maps = global.PokerLabCFRCore.createMaps();
        let rootTree = null;
        let averageNodeCount = 0;
        let sampledRangeUsed = true;
        let sampledHeroHands = 0;
        let sampledActualHeroHand = 0;

        for (let iteration = 0; iteration < trainingIterations; iteration++) {
            const sampled = sampleDeals(
                hero.holeCards,
                state.board,
                rangeInfo.combos,
                1,
                rangeInfo.rangeUsed !== false,
                random,
                heroRangeInfo.combos
            );
            const deal = sampled.deals[0];
            sampledRangeUsed = sampledRangeUsed && sampled.rangeUsed;
            sampledHeroHands++;
            sampledActualHeroHand += sampled.actualHeroSamples;
            deal.showdownResult = global.PokerLabHandEvaluator.compareScores(
                global.PokerLabHandEvaluator.evaluate([...deal.hero, ...deal.finalBoard]).score,
                global.PokerLabHandEvaluator.evaluate([...deal.villain, ...deal.finalBoard]).score
            );
            const built = buildDecisionTree(
                normalizedState,
                hero.actionOptions || {},
                priorHistory,
                deal.runout,
                rootChecks,
                rootRaises
            );
            if (built.tree.terminal || !built.tree.actions || !built.tree.actions.length) {
                throw new Error("Aucune décision stratégique disponible dans cette situation.");
            }
            if (rootTree && built.tree.actions.length !== rootTree.actions.length) {
                throw new Error("L'arbre stratégique change de structure entre deux échantillons.");
            }
            rootTree = built.tree;
            averageNodeCount += built.nodeCount;

            // Une seule accumulation de stratégie moyenne par itération CFR+.
            runCfr(built.tree, deal, 0, [1, 1], maps, deal.hero, state.board, iteration + 1);
            runCfr(built.tree, deal, 1, [1, 1], maps, deal.hero, state.board, iteration + 1);

            // L'échantillonnage est renouvelé à chaque itération ; le navigateur reste réactif.
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const requestedEvaluationSamples = Number.isInteger(options.evaluationSamples)
            ? Math.max(16, Math.min(512, options.evaluationSamples))
            : Math.max(64, Math.min(256, samples * 4));
        const rootStrategy = getRootStrategy(rootTree, null, maps, hero.holeCards, state.board);
        const actionValueSums = new Array(rootTree.actions.length).fill(0);
        const actionValueSquares = new Array(rootTree.actions.length).fill(0);
        let heroEVSum = 0;
        let heroEVSquares = 0;
        let evaluatedDeals = 0;

        for (let sampleIndex = 0; sampleIndex < requestedEvaluationSamples; sampleIndex++) {
            const sampled = sampleDeals(
                hero.holeCards,
                state.board,
                rangeInfo.combos,
                1,
                rangeInfo.rangeUsed !== false,
                random
            );
            const deal = sampled.deals[0];
            deal.showdownResult = global.PokerLabHandEvaluator.compareScores(
                global.PokerLabHandEvaluator.evaluate([...hero.holeCards, ...deal.finalBoard]).score,
                global.PokerLabHandEvaluator.evaluate([...deal.villain, ...deal.finalBoard]).score
            );
            const built = buildDecisionTree(
                normalizedState,
                hero.actionOptions || {},
                priorHistory,
                deal.runout,
                rootChecks,
                rootRaises
            );
            if (built.tree.actions.length !== rootTree.actions.length) continue;

            const sampleActionValues = [];
            for (let actionIndex = 0; actionIndex < rootTree.actions.length; actionIndex++) {
                const value = averageStrategy(
                    built.tree.actions[actionIndex].child,
                    deal,
                    maps,
                    hero.holeCards,
                    state.board
                );
                sampleActionValues.push(value);
                actionValueSums[actionIndex] += value;
                actionValueSquares[actionIndex] += value * value;
            }

            const sampleHeroEV = sampleActionValues.reduce((sum, value, index) =>
                sum + rootStrategy[index] * value, 0);
            heroEVSum += sampleHeroEV;
            heroEVSquares += sampleHeroEV * sampleHeroEV;
            evaluatedDeals++;

            if ((sampleIndex + 1) % 8 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        if (!evaluatedDeals) {
            throw new Error("Impossible d'évaluer la stratégie sur les échantillons indépendants.");
        }

        const standardError = (sum, sumSquares) => {
            if (evaluatedDeals < 2) return 0;
            const mean = sum / evaluatedDeals;
            const variance = Math.max(0, (sumSquares - evaluatedDeals * mean * mean) / (evaluatedDeals - 1));
            return Math.sqrt(variance / evaluatedDeals);
        };

        const actions = rootTree.actions.map((entry, index) => {
            const ev = actionValueSums[index] / evaluatedDeals;
            const evStandardError = standardError(actionValueSums[index], actionValueSquares[index]);
            return {
                action: entry.action.label,
                frequency: rootStrategy[index],
                ev,
                evStandardError,
                evLower95: ev - 1.96 * evStandardError,
                evUpper95: ev + 1.96 * evStandardError
            };
        }).sort((a, b) => b.frequency - a.frequency);
        const heroEV = heroEVSum / evaluatedDeals;
        const heroEVStandardError = standardError(heroEVSum, heroEVSquares);

        return {
            algorithm: "CFR+ avec rééchantillonnage des chances",
            averageStrategyWeighting: "linéaire",
            street: state.street,
            abstraction: state.street.toUpperCase() +
                " → river HU · mises arrondies à 0,5 jeton · check · mises 33 % / 75 % pot · relance minimale respectée · tapis effectif · une relance maximale par street",
            iterations: trainingIterations,
            requestedIterations,
            samplesPerIteration: 1,
            randomSeed: Number.isInteger(options.seed) ? (options.seed >>> 0) : null,
            sampledOpponentHands: trainingIterations,
            sampledHeroHands,
            sampledActualHeroHand,
            heroRangeLabel: heroRangeInfo.label,
            heroRangeUsed: heroRangeInfo.rangeUsed !== false,
            actualHandInHeroRange: heroRangeInfo.actualHandInRange !== false,
            evaluationSamples: evaluatedDeals,
            evaluationMethod: "Échantillons indépendants ; erreur standard conditionnelle à la stratégie moyenne apprise.",
            heroEVStandardError,
            heroEVLower95: heroEV - 1.96 * heroEVStandardError,
            heroEVUpper95: heroEV + 1.96 * heroEVStandardError,
            treeNodes: Math.round(averageNodeCount / trainingIterations),
            rangeLabel: rangeInfo.rangeUsed === false
                ? rangeInfo.label
                : sampledRangeUsed
                    ? rangeInfo.label
                    : "Range large (combinaisons bloquées)",
            rangeUsed: rangeInfo.rangeUsed === false ? false : sampledRangeUsed,
            postflopActionsUsed: rangeInfo.postflopActionsUsed || 0,
            heroEV,
            actions,
            convergence: "CFR+ échantillonné sur les ranges des deux joueurs, avec suréchantillonnage corrigé de la main réelle du héros et un nouveau runout par itération. L'exploitabilité et la convergence ne sont pas certifiées ; les fréquences restent une approximation dépendante de l'abstraction."
        };
    }

    global.PokerLabPostflopStrategy = { solvePostflop, solveRiver: solvePostflop, validate, buildDecisionTree, buildUniformRange };
})(window);
