/* =========================================================
   POKERLAB - GENERIC CFR+ CORE
   Imperfect-information, two-player, zero-sum extensive games.
   ========================================================= */
"use strict";

(function (global) {
    function regretMatched(regrets, actionCount) {
        const positive = regrets
            ? Array.from(regrets, value => Math.max(0, value))
            : [];
        const total = positive.reduce((sum, value) => sum + value, 0);
        if (!(total > 0)) return Array(actionCount).fill(1 / actionCount);
        return positive.map(value => value / total);
    }

    function ensureInfoSet(key, actionCount, maps) {
        let regrets = maps.regrets.get(key);
        if (!regrets) {
            regrets = new Float64Array(actionCount);
            maps.regrets.set(key, regrets);
        } else if (regrets.length !== actionCount) {
            throw new Error("Un même information set ne peut pas avoir des ensembles d'actions différents.");
        }

        let strategySum = maps.strategy.get(key);
        if (!strategySum) {
            strategySum = new Float64Array(actionCount);
            maps.strategy.set(key, strategySum);
        } else if (strategySum.length !== actionCount) {
            throw new Error("Un même information set ne peut pas avoir des ensembles d'actions différents.");
        }

        return { regrets, strategySum };
    }

    function runCfr(node, deal, traverser, reach, maps, callbacks, averageWeight = 1, chanceWeight = 1) {
        if (node.terminal) return callbacks.utility(node, deal);
        if (node.actor !== 0 && node.actor !== 1) {
            throw new Error("Un nœud CFR doit appartenir au joueur 0 ou au joueur 1.");
        }
        if (!Array.isArray(node.actions) || node.actions.length === 0) {
            throw new Error("Un nœud CFR non terminal doit proposer au moins une action.");
        }

        const key = callbacks.informationKey(node, deal);
        const { regrets, strategySum } = ensureInfoSet(key, node.actions.length, maps);
        const strategy = regretMatched(regrets, node.actions.length);
        const ownReach = reach[node.actor];

        if (traverser === 0) {
            for (let index = 0; index < strategy.length; index++) {
                strategySum[index] += averageWeight * ownReach * strategy[index] * chanceWeight;
            }
        }

        const actionValues = new Float64Array(node.actions.length);
        let nodeValue = 0;
        for (let index = 0; index < node.actions.length; index++) {
            const nextReach = reach.slice();
            nextReach[node.actor] *= strategy[index];
            actionValues[index] = runCfr(
                node.actions[index].child,
                deal,
                traverser,
                nextReach,
                maps,
                callbacks,
                averageWeight,
                chanceWeight
            );
            nodeValue += strategy[index] * actionValues[index];
        }

        if (node.actor === traverser) {
            const opponentReach = reach[1 - node.actor];
            const utilitySign = node.actor === 0 ? 1 : -1;
            for (let index = 0; index < actionValues.length; index++) {
                const instantaneousRegret = utilitySign *
                    opponentReach *
                    (actionValues[index] - nodeValue) *
                    chanceWeight;
                regrets[index] = Math.max(0, regrets[index] + instantaneousRegret);
            }
        }

        return nodeValue;
    }

    function averageStrategy(node, deal, maps, callbacks) {
        if (node.terminal) return callbacks.utility(node, deal);
        const key = callbacks.informationKey(node, deal);
        const sums = maps.strategy.get(key);
        const total = sums
            ? Array.from(sums).reduce((sum, value) => sum + value, 0)
            : 0;
        const strategy = sums && total > 0
            ? Array.from(sums, value => value / total)
            : Array(node.actions.length).fill(1 / node.actions.length);

        return node.actions.reduce((sum, entry, index) =>
            sum + strategy[index] * averageStrategy(entry.child, deal, maps, callbacks), 0);
    }

    function getStrategy(node, deal, maps, callbacks) {
        if (node.terminal) return [];
        const key = callbacks.informationKey(node, deal);
        const sums = maps.strategy.get(key);
        const total = sums
            ? Array.from(sums).reduce((sum, value) => sum + value, 0)
            : 0;
        return sums && total > 0
            ? Array.from(sums, value => value / total)
            : Array(node.actions.length).fill(1 / node.actions.length);
    }

    function bestResponse(dealTrees, player, maps, callbacks) {
        if (player !== 0 && player !== 1) {
            throw new Error("Le joueur de la meilleure réponse doit être 0 ou 1.");
        }
        if (!Array.isArray(dealTrees) || dealTrees.length === 0) {
            throw new Error("La meilleure réponse exige au moins un arbre de décision.");
        }

        const informationSets = new Map();
        let totalChanceWeight = 0;

        function collect(node, deal, weight, depth) {
            if (node.terminal || weight <= 0) return;
            if (node.actor === player) {
                const key = callbacks.informationKey(node, deal);
                let group = informationSets.get(key);
                if (!group) {
                    group = { key, depth, actionCount: node.actions.length, records: [] };
                    informationSets.set(key, group);
                } else if (group.actionCount !== node.actions.length) {
                    throw new Error("Un information set CFR contient des ensembles d'actions incompatibles.");
                }
                group.records.push({ node, deal, weight });

                // Counterfactual reach excludes the responding player's own
                // realization probability, so all of its actions are explored.
                for (const entry of node.actions) {
                    collect(entry.child, deal, weight, depth + 1);
                }
                return;
            }

            const strategy = getStrategy(node, deal, maps, callbacks);
            for (let index = 0; index < node.actions.length; index++) {
                const probability = Number(strategy[index]) || 0;
                if (probability > 0) {
                    collect(node.actions[index].child, deal, weight * probability, depth + 1);
                }
            }
        }

        for (const item of dealTrees) {
            const weight = Number(item.weight) > 0 ? Number(item.weight) : 1;
            totalChanceWeight += weight;
            collect(item.root, item.deal, weight, 0);
        }

        const policies = new Map();

        function evaluate(node, deal) {
            if (node.terminal) return callbacks.utility(node, deal);
            if (node.actor === player) {
                const key = callbacks.informationKey(node, deal);
                const selectedAction = policies.get(key);
                const index = Number.isInteger(selectedAction) ? selectedAction : 0;
                return evaluate(node.actions[index].child, deal);
            }

            const strategy = getStrategy(node, deal, maps, callbacks);
            let value = 0;
            for (let index = 0; index < node.actions.length; index++) {
                value += strategy[index] * evaluate(node.actions[index].child, deal);
            }
            return value;
        }

        const groups = Array.from(informationSets.values())
            .sort((first, second) => second.depth - first.depth);

        for (const group of groups) {
            const actionValues = new Array(group.actionCount).fill(0);
            for (const record of group.records) {
                for (let index = 0; index < group.actionCount; index++) {
                    actionValues[index] += record.weight *
                        evaluate(record.node.actions[index].child, record.deal);
                }
            }

            let bestIndex = 0;
            for (let index = 1; index < actionValues.length; index++) {
                const isBetter = player === 0
                    ? actionValues[index] > actionValues[bestIndex]
                    : actionValues[index] < actionValues[bestIndex];
                if (isBetter) bestIndex = index;
            }
            policies.set(group.key, bestIndex);
        }

        let valueSum = 0;
        for (const item of dealTrees) {
            const weight = Number(item.weight) > 0 ? Number(item.weight) : 1;
            valueSum += weight * evaluate(item.root, item.deal);
        }

        return {
            player,
            value: valueSum / totalChanceWeight,
            informationSets: informationSets.size,
            policies
        };
    }

    function estimateExploitability(dealTrees, maps, callbacks) {
        const playerZero = bestResponse(dealTrees, 0, maps, callbacks);
        const playerOne = bestResponse(dealTrees, 1, maps, callbacks);
        const nashConv = Math.max(0, playerZero.value - playerOne.value);
        return {
            playerZeroBestResponse: playerZero.value,
            playerOneBestResponse: playerOne.value,
            nashConv,
            exploitability: nashConv / 2,
            informationSets: {
                playerZero: playerZero.informationSets,
                playerOne: playerOne.informationSets
            }
        };
    }

    function createMaps() {
        return { regrets: new Map(), strategy: new Map() };
    }

    global.PokerLabCFRCore = {
        regretMatched,
        runCfr,
        averageStrategy,
        getStrategy,
        bestResponse,
        estimateExploitability,
        createMaps
    };
})(window);
