/* =========================================================
   POKERLAB - POSTFLOP STRATEGY (CFR+)
   Version : 0.1.0
   First strategic subgame: heads-up river, one raise maximum.
   This is an abstracted CFR+ model, not a full GTO solver.
   ========================================================= */
"use strict";

(function (global) {
    const DEFAULT_ITERATIONS = 120;
    const DEFAULT_SAMPLES = 48;
    const BET_FRACTION = 0.5;
    const ACTION_LIMIT = 3;

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
            heroInvested: state.heroInvested,
            raises: state.raises,
            checks: state.checks,
            history: state.history.slice(),
            root: state.root
        };
    }

    function amountToCall(state, actor) {
        return Math.max(0, state.bets[1 - actor] - state.bets[actor]);
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
        const paid = Math.max(0, Math.min(state.stacks[actor], amount));
        state.stacks[actor] -= paid;
        state.bets[actor] += paid;
        state.pot += paid;
        if (actor === 0) state.heroInvested += paid;
        return paid;
    }

    function makeAction(label, type, amount = 0) {
        return { label, type, amount };
    }

    function buildDecisionTree(input, rootOptions, priorHistory = [], runout = []) {
        const initial = {
            actor: 0,
            pot: Number(input.pot) || 0,
            stacks: input.players.map(player => Number(player.stack) || 0),
            bets: input.players.map(player => Number(player.streetBet) || 0),
            heroInvested: 0,
            raises: 0,
            checks: 0,
            history: priorHistory.slice(),
            root: true
        };
        const nodes = { count: 0 };

        function firstToAct() {
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

            if (toCall === 0 && state.checks >= 1) {
                return advanceStreet(state, board, runoutIndex, depth);
            }

            const actions = [];
            const canRaise = state.raises < 1 && state.stacks[other] > 0;

            if (toCall > 0) {
                actions.push(makeAction("fold", "fold"));
                actions.push(makeAction("call", "call", toCall));

                const rootRaiseAllowed = !state.root || rootOptions.canRaise;
                const requiredRaiseTotal = state.root && Number.isFinite(rootOptions.minimumRaiseTo)
                    ? Math.max(toCall, rootOptions.minimumRaiseTo - state.bets[actor])
                    : Math.max(toCall, state.pot * BET_FRACTION);
                const effectiveMaximum = toCall + state.stacks[other];
                const maximumRaiseTotal = state.root && Number.isFinite(rootOptions.maximumRaiseTo)
                    ? Math.min(state.stacks[actor], rootOptions.maximumRaiseTo - state.bets[actor], effectiveMaximum)
                    : Math.min(state.stacks[actor], effectiveMaximum);
                if (canRaise && rootRaiseAllowed && state.stacks[actor] > toCall) {
                    const desiredRaiseTotal = toCall + Math.max(toCall, state.pot * BET_FRACTION,
                        requiredRaiseTotal - toCall);
                    if (desiredRaiseTotal <= maximumRaiseTotal + 0.000001) {
                        actions.push(makeAction("raise", "raise", desiredRaiseTotal));
                    } else if (state.root && rootOptions.isAllIn && maximumRaiseTotal > toCall) {
                        actions.push(makeAction("all_in_raise", "raise", maximumRaiseTotal));
                    } else if (!state.root && state.stacks[actor] > toCall && maximumRaiseTotal > toCall) {
                        actions.push(makeAction("all_in_raise", "raise", maximumRaiseTotal));
                    }
                }
            } else {
                actions.push(makeAction("check", "check"));
                const rootBetAllowed = !state.root || rootOptions.canBet;
                if (canRaise && rootBetAllowed && state.stacks[actor] > 0) {
                    const minimumBet = state.root && Number.isFinite(rootOptions.minimumBet)
                        ? rootOptions.minimumBet : 1;
                    const effectiveBetStack = Math.min(state.stacks[actor], state.stacks[other]);
                    const bet = Math.min(effectiveBetStack, Math.max(minimumBet, state.pot * BET_FRACTION));
                    if (bet > 0) actions.push(makeAction("bet_50", "bet", bet));
                    if (effectiveBetStack > bet * 1.8) {
                        actions.push(makeAction("all_in", "bet", effectiveBetStack));
                    }
                }
            }

            const node = {
                terminal: false,
                actor,
                board: board.slice(),
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
                    const child = next.stacks[0] <= 0 || next.stacks[1] <= 0
                        ? terminal("showdown", next)
                        : advanceStreet(next, board, runoutIndex, depth + 1);
                    node.actions.push({ action, child });
                    continue;
                }

                if (action.type === "bet") {
                    applyContribution(next, actor, action.amount);
                    next.checks = 0;
                    next.actor = other;
                    node.actions.push({ action, child: build(next, board, runoutIndex, depth + 1) });
                    continue;
                }

                if (action.type === "raise") {
                    applyContribution(next, actor, action.amount);
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

    function weightedSample(items) {
        const total = items.reduce((sum, item) => sum + item.weight, 0);
        if (!(total > 0)) return items[Math.floor(Math.random() * items.length)].cards;
        let cursor = Math.random() * total;
        for (const item of items) {
            cursor -= item.weight;
            if (cursor <= 0) return item.cards;
        }
        return items[items.length - 1].cards;
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

    function sampleDeals(hero, board, range, sampleCount) {
        const blocked = new Set([...hero, ...board].map(cardId));
        let candidates = Array.isArray(range) ? range.filter(item =>
            item.cards && item.cards.length === 2 &&
            item.cards.every(card => !blocked.has(cardId(card))) &&
            cardId(item.cards[0]) !== cardId(item.cards[1]) &&
            Number(item.weight) > 0
        ) : [];

        if (!candidates.length) {
            candidates = buildUniformRange([...hero, ...board]);
        }
        if (!candidates.length) throw new Error("Aucune combinaison adverse disponible pour le calcul CFR.");

        const deals = [];
        const suits = ["clubs", "diamonds", "hearts", "spades"];
        for (let i = 0; i < sampleCount; i++) {
            const villain = weightedSample(candidates);
            const excluded = new Set([...hero, ...board, ...villain].map(cardId));
            const deck = [];
            for (const suit of suits) for (let value = 2; value <= 14; value++) {
                const card = { value, suit };
                if (!excluded.has(cardId(card))) deck.push(card);
            }
            for (let index = deck.length - 1; index > 0; index--) {
                const swap = Math.floor(Math.random() * (index + 1));
                [deck[index], deck[swap]] = [deck[swap], deck[index]];
            }
            const runout = deck.slice(0, 5 - board.length);
            deals.push({ villain, runout, finalBoard: [...board, ...runout] });
        }
        return deals;
    }

    function utility(node, deal, hero, board) {
        if (node.type === "fold") {
            return node.winner === 0
                ? node.pot - node.heroInvested
                : -node.heroInvested;
        }
        const result = global.PokerLabHandEvaluator.compareScores(
            global.PokerLabHandEvaluator.evaluate([...hero, ...(deal.finalBoard || board)]).score,
            global.PokerLabHandEvaluator.evaluate([...deal.villain, ...(deal.finalBoard || board)]).score
        );
        const payout = result > 0 ? node.pot : result === 0 ? node.pot / 2 : 0;
        return payout - node.heroInvested;
    }

    function regretMatched(regrets, count) {
        const positive = regrets ? Array.from(regrets, value => Math.max(0, value)) : [];
        const total = positive.reduce((sum, value) => sum + value, 0);
        if (total <= 0) return Array(count).fill(1 / count);
        return positive.map(value => value / total);
    }

    function informationKey(node, deal, hero, board) {
        const privateHand = node.actor === 0 ? handId(hero) : handId(deal.villain);
        return node.actor + "|" + privateHand + "|" + boardId(node.board || board) + "|" + node.history;
    }

    function runCfr(node, deal, traverser, reach, maps, hero, board, averageWeight) {
        if (node.terminal) return utility(node, deal, hero, board);

        const key = informationKey(node, deal, hero, board);
        const count = node.actions.length;
        let regrets = maps.regrets.get(key);
        if (!regrets) {
            regrets = new Float64Array(count);
            maps.regrets.set(key, regrets);
        }
        let strategySum = maps.strategy.get(key);
        if (!strategySum) {
            strategySum = new Float64Array(count);
            maps.strategy.set(key, strategySum);
        }
        const strategy = regretMatched(regrets, count);
        const ownReach = reach[node.actor];
        for (let i = 0; i < count; i++) strategySum[i] += averageWeight * ownReach * strategy[i];

        const values = new Float64Array(count);
        let nodeValue = 0;
        for (let i = 0; i < count; i++) {
            const nextReach = reach.slice();
            nextReach[node.actor] *= strategy[i];
            values[i] = runCfr(node.actions[i].child, deal, traverser, nextReach, maps, hero, board, averageWeight);
            nodeValue += strategy[i] * values[i];
        }

        if (node.actor === traverser) {
            const opponentReach = reach[1 - node.actor];
            const sign = node.actor === 0 ? 1 : -1;
            for (let i = 0; i < count; i++) {
                regrets[i] = Math.max(0, regrets[i] + sign * opponentReach * (values[i] - nodeValue));
            }
        }
        return nodeValue;
    }

    function averageStrategy(node, deal, maps, hero, board) {
        if (node.terminal) return utility(node, deal, hero, board);
        const key = informationKey(node, deal, hero, board);
        const sums = maps.strategy.get(key);
        const total = sums ? Array.from(sums).reduce((a, b) => a + b, 0) : 0;
        const strategy = sums && total > 0
            ? Array.from(sums, value => value / total)
            : Array(node.actions.length).fill(1 / node.actions.length);
        return node.actions.reduce((sum, entry, index) =>
            sum + strategy[index] * averageStrategy(entry.child, deal, maps, hero, board), 0);
    }

    function getRootStrategy(tree, deal, maps, hero, board) {
        const key = informationKey(tree, deal, hero, board);
        const sums = maps.strategy.get(key);
        if (!sums) return tree.actions.map(() => 1 / tree.actions.length);
        const total = Array.from(sums).reduce((a, b) => a + b, 0);
        return Array.from(sums, value => total > 0 ? value / total : 1 / sums.length);
    }

    function validate(state) {
        if (!state || state.street !== "river" || !Array.isArray(state.board) || state.board.length !== 5) {
            throw new Error("Le moteur CFR+ est d'abord disponible à la river.");
        }
        const active = state.players.filter(player => !player.folded);
        if (active.length !== 2) throw new Error("Le moteur CFR+ est limité au heads-up.");
        const hero = state.players.find(player => player.isHuman);
        if (!hero || !hero.holeCards || hero.holeCards.length !== 2) {
            throw new Error("Les cartes du joueur sont indisponibles.");
        }
        if (state.currentPlayerId !== hero.id) {
            throw new Error("Le calcul stratégique doit être lancé au tour du joueur humain.");
        }
        const opponent = active.find(player => player.id !== hero.id);
        if (!opponent) throw new Error("Adversaire heads-up introuvable.");
        return { hero, opponent };
    }

    async function solveRiver(state, history = [], options = {}) {
        const { hero, opponent } = validate(state);
        const rangeInfo = await global.PokerLabPostflopSolver.getOpponentRange(state, history, opponent);
        const iterations = Math.max(20, Math.min(1000, Number(options.iterations) || DEFAULT_ITERATIONS));
        const samples = Math.max(8, Math.min(160, Number(options.samples) || DEFAULT_SAMPLES));
        const deals = sampleDeals(hero.holeCards, state.board, rangeInfo.combos, samples);
        const priorHistory = (history || [])
            .filter(event => event.type === "player_action" && event.street === state.street)
            .map(event => {
                const data = event.data || {};
                const player = state.players.find(item => item.id === data.playerId);
                return (player ? player.position || player.id : data.playerId) +
                    ":" + data.action + (Number.isFinite(data.amount) ? ":" + data.amount : "");
            });
        const { tree, nodeCount } = buildDecisionTree(state, hero.actionOptions || {}, priorHistory);
        if (tree.terminal || !tree.actions || !tree.actions.length) {
            throw new Error("Aucune décision stratégique disponible dans cette situation.");
        }

        const maps = { regrets: new Map(), strategy: new Map() };
        for (let iteration = 0; iteration < iterations; iteration++) {
            for (const deal of deals) {
                runCfr(tree, deal, 0, [1, 1], maps, hero.holeCards, state.board, iteration + 1);
                runCfr(tree, deal, 1, [1, 1], maps, hero.holeCards, state.board, iteration + 1);
            }
            // Yield periodically so the PWA remains responsive during CFR iterations.
            if (iteration % 5 === 4) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        const rootStrategy = getRootStrategy(tree, deals[0], maps, hero.holeCards, state.board);
        const actionValues = tree.actions.map(entry => {
            let total = 0;
            for (const deal of deals) {
                total += averageStrategy(entry.child, deal, maps, hero.holeCards, state.board);
            }
            return total / deals.length;
        });
        const actions = tree.actions.map((entry, index) => ({
            action: entry.action.label,
            frequency: rootStrategy[index],
            ev: actionValues[index]
        })).sort((a, b) => b.frequency - a.frequency);

        const ev = actionValues.reduce((sum, value, index) =>
            sum + rootStrategy[index] * value, 0);

        return {
            algorithm: "CFR+",
            averageStrategyWeighting: "linear",
            abstraction: "River HU · check · mise 50 % pot ou tapis · une relance maximale",
            iterations,
            sampledOpponentHands: samples,
            treeNodes: nodeCount,
            rangeLabel: rangeInfo.label,
            rangeUsed: Boolean(rangeInfo.combos),
            heroEV: ev,
            actions,
            convergence: "Approximation CFR+ sur un échantillon de mains adverses ; convergence non certifiée."
        };
    }

    global.PokerLabPostflopStrategy = { solveRiver, validate, buildDecisionTree, buildUniformRange };
})(window);
