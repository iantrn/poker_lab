"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadCore() {
    const context = { Float64Array, Map, Array, Math };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync("js/modules/cfr-core.js", "utf8"), context);
    return context.PokerLabCFRCore;
}

function terminal(pot, heroInvested, winner = null) {
    return { terminal: true, type: winner === null ? "showdown" : "fold", pot, heroInvested, winner };
}

function decision(actor, history, pot, heroInvested, actions) {
    return {
        terminal: false,
        actor,
        history,
        pot,
        heroInvested,
        actions: actions.map(([label, child]) => ({ action: { label }, child }))
    };
}

function kuhnTree(heroCard, villainCard) {
    const showdown = (pot, heroInvested) => terminal(pot, heroInvested);
    const heroFacingBet = decision(0, "check-bet", 3, 1, [
        ["fold", terminal(3, 1, 1)],
        ["call", showdown(4, 2)]
    ]);
    const villainAfterCheck = decision(1, "check", 2, 1, [
        ["check", showdown(2, 1)],
        ["bet", heroFacingBet]
    ]);
    const villainFacingBet = decision(1, "bet", 3, 2, [
        ["fold", terminal(3, 2, 0)],
        ["call", showdown(4, 2)]
    ]);
    const root = decision(0, "", 2, 1, [
        ["check", villainAfterCheck],
        ["bet", villainFacingBet]
    ]);

    return { root, deal: { hero: heroCard, villain: villainCard } };
}

function kuhnCallbacks() {
    return {
        informationKey(node, deal) {
            const privateCard = node.actor === 0 ? deal.hero : deal.villain;
            return node.actor + "|" + privateCard + "|" + node.history;
        },
        utility(node, deal) {
            if (node.type === "fold") {
                return node.winner === 0
                    ? node.pot - node.heroInvested
                    : -node.heroInvested;
            }
            const result = deal.hero > deal.villain ? 1 : -1;
            return (result > 0 ? node.pot : 0) - node.heroInvested;
        }
    };
}

function trainKuhn(iterations) {
    const core = loadCore();
    const maps = core.createMaps();
    const callbacks = kuhnCallbacks();
    const cards = [0, 1, 2];
    const deals = [];
    for (const hero of cards) {
        for (const villain of cards) {
            if (hero !== villain) deals.push(kuhnTree(hero, villain));
        }
    }

    for (let iteration = 0; iteration < iterations; iteration++) {
        for (const { root, deal } of deals) {
            core.runCfr(root, deal, 0, [1, 1], maps, callbacks, iteration + 1);
            core.runCfr(root, deal, 1, [1, 1], maps, callbacks, iteration + 1);
        }
    }

    const expectedValue = deals.reduce((sum, { root, deal }) =>
        sum + core.averageStrategy(root, deal, maps, callbacks), 0) / deals.length;
    const exploitability = core.estimateExploitability(
        deals.map(({ root, deal }) => ({ root, deal, weight: 1 })),
        maps,
        callbacks
    );

    return { core, maps, callbacks, deals, expectedValue, exploitability };
}

test("CFR+ converge vers la valeur théorique de Kuhn Poker", () => {
    const result = trainKuhn(50000);
    // Valeur d'équilibre du premier joueur dans Kuhn Poker à ante 1 : -1/18.
    assert.ok(
        Math.abs(result.expectedValue + 1 / 18) < 0.015,
        "Valeur estimée : " + result.expectedValue
    );
    assert.ok(
        result.exploitability.nashConv < 0.04,
        "NashConv estimé : " + result.exploitability.nashConv
    );
});

test("CFR+ apprend une stratégie mixte sur Matching Pennies", () => {
    const core = loadCore();
    const maps = core.createMaps();
    const callbacks = {
        informationKey(node) {
            // Le joueur 1 ne voit pas l'action simultanée du joueur 0.
            return "player-" + node.actor;
        },
        utility(node, deal) {
            return node.payoff;
        }
    };

    const root = {
        terminal: false,
        actor: 0,
        actions: [
            { action: { label: "heads" }, child: {
                terminal: false,
                actor: 1,
                actions: [
                    { action: { label: "heads" }, child: { terminal: true, payoff: 1 } },
                    { action: { label: "tails" }, child: { terminal: true, payoff: -1 } }
                ]
            }},
            { action: { label: "tails" }, child: {
                terminal: false,
                actor: 1,
                actions: [
                    { action: { label: "heads" }, child: { terminal: true, payoff: -1 } },
                    { action: { label: "tails" }, child: { terminal: true, payoff: 1 } }
                ]
            }}
        ]
    };

    for (let iteration = 0; iteration < 30000; iteration++) {
        core.runCfr(root, {}, 0, [1, 1], maps, callbacks, iteration + 1);
        core.runCfr(root, {}, 1, [1, 1], maps, callbacks, iteration + 1);
    }

    const rootStrategy = core.getStrategy(root, {}, maps, callbacks);
    const responseInfoSet = maps.strategy.get("player-1");
    const responseTotal = Array.from(responseInfoSet).reduce((sum, value) => sum + value, 0);
    const responseStrategy = Array.from(responseInfoSet, value => value / responseTotal);

    assert.ok(Math.abs(rootStrategy[0] - 0.5) < 0.02);
    assert.ok(Math.abs(rootStrategy[1] - 0.5) < 0.02);
    assert.ok(Math.abs(responseStrategy[0] - 0.5) < 0.02);
    assert.ok(Math.abs(responseStrategy[1] - 0.5) < 0.02);
    const exploitability = core.estimateExploitability(
        [{ root, deal: {}, weight: 1 }],
        maps,
        callbacks
    );
    assert.ok(exploitability.nashConv < 0.02);
});

test("un information set ne peut pas changer le nombre d'actions", () => {
    const core = loadCore();
    const maps = core.createMaps();
    const callbacks = {
        informationKey: () => "same",
        utility: () => 0
    };
    const first = decision(0, "same", 1, 0, [
        ["a", terminal(1, 0)],
        ["b", terminal(1, 0)]
    ]);
    const second = decision(0, "same", 1, 0, [
        ["a", terminal(1, 0)],
        ["b", terminal(1, 0)],
        ["c", terminal(1, 0)]
    ]);

    core.runCfr(first, {}, 0, [1, 1], maps, callbacks, 1);
    assert.throws(
        () => core.runCfr(second, {}, 0, [1, 1], maps, callbacks, 1),
        /ensembles d'actions différents/
    );
});
