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

    function createMaps() {
        return { regrets: new Map(), strategy: new Map() };
    }

    global.PokerLabCFRCore = {
        regretMatched,
        runCfr,
        averageStrategy,
        getStrategy,
        createMaps
    };
})(window);
