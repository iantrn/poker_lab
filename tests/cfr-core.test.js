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

    return { core, maps, callbacks, deals, expectedValue };
}

test("CFR+ converge vers la valeur théorique de Kuhn Poker", () => {
    const result = trainKuhn(50000);
    // Valeur d'équilibre du premier joueur dans Kuhn Poker à ante 1 : -1/18.
    assert.ok(
        Math.abs(result.expectedValue + 1 / 18) < 0.015,
        "Valeur estimée : " + result.expectedValue
    );

    const exploitability = result.core.measureExploitability(
        result.deals,
        result.maps,
        result.callbacks
    );
    assert.ok(Math.abs(exploitability.profileValue - result.expectedValue) < 1e-9);
    assert.ok(exploitability.player0Gain >= -1e-9);
    assert.ok(exploitability.player1Gain >= -1e-9);
    assert.ok(exploitability.nashConv >= -1e-9);
    assert.ok(
        exploitability.nashConv < 0.04,
        "NashConv estimée : " + exploitability.nashConv
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

    const exploitability = core.measureExploitability(
        [{ root, deal: {} }],
        maps,
        callbacks
    );
    assert.ok(Math.abs(exploitability.profileValue) < 0.02);
    assert.ok(exploitability.player0Gain >= -1e-9);
    assert.ok(exploitability.player1Gain >= -1e-9);
    assert.ok(exploitability.nashConv >= -1e-9);
    assert.ok(
        exploitability.nashConv < 0.05,
        "NashConv estimée : " + exploitability.nashConv
    );
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


test("un information set refuse des actions différentes avec la même cardinalité", () => {
    const core = loadCore();
    const maps = core.createMaps();
    const callbacks = {
        informationKey: () => "same",
        utility: () => 0
    };
    const first = decision(0, "same", 1, 0, [
        ["check", terminal(1, 0)],
        ["bet_33", terminal(1, 0)]
    ]);
    const second = decision(0, "same", 1, 0, [
        ["check", terminal(1, 0)],
        ["bet_75", terminal(1, 0)]
    ]);

    core.runCfr(first, {}, 0, [1, 1], maps, callbacks, 1);
    assert.throws(
        () => core.runCfr(second, {}, 0, [1, 1], maps, callbacks, 1),
        /type, ordre, label ou sizing/
    );
});


test("getStrategy refuse un ensemble d'actions modifié dans un information set existant", () => {
    const core = loadCore();
    const maps = core.createMaps();
    const callbacks = {
        informationKey: () => "same",
        utility: () => 0
    };
    const first = decision(0, "same", 1, 0, [
        ["check", terminal(1, 0)],
        ["bet_33", terminal(1, 0)]
    ]);
    const changed = decision(0, "same", 1, 0, [
        ["check", terminal(1, 0)],
        ["bet_75", terminal(1, 0)]
    ]);

    core.runCfr(first, {}, 0, [1, 1], maps, callbacks, 1);
    assert.throws(
        () => core.getStrategy(changed, {}, maps, callbacks),
        /type, ordre, label ou sizing/
    );
});

test("averageStrategy refuse un sizing différent pour un information set existant", () => {
    const core = loadCore();
    const maps = core.createMaps();
    const callbacks = {
        informationKey: () => "same",
        utility: () => 0
    };
    const first = decision(0, "same", 1, 0, [
        ["check", terminal(1, 0)],
        ["bet_33", terminal(1, 0)]
    ]);
    const changed = decision(0, "same", 1, 0, [
        ["check", terminal(1, 0)],
        ["bet_75", terminal(1, 0)]
    ]);

    core.runCfr(first, {}, 0, [1, 1], maps, callbacks, 1);
    assert.throws(
        () => core.averageStrategy(changed, {}, maps, callbacks),
        /type, ordre, label ou sizing/
    );
});


test("les poids de chance pondèrent les regrets et la stratégie moyenne", () => {
    const core = loadCore();
    const maps = core.createMaps();
    const callbacks = {
        informationKey: () => "weighted-root",
        utility: node => node.payoff
    };
    const makeTree = (firstPayoff, secondPayoff) => ({
        terminal: false,
        actor: 0,
        actions: [
            { action: { type: "bet", label: "A", amount: 1 }, child: { terminal: true, payoff: firstPayoff } },
            { action: { type: "check", label: "B", amount: 0 }, child: { terminal: true, payoff: secondPayoff } }
        ]
    });

    core.runCfr(makeTree(1, -1), {}, 0, [1, 1], maps, callbacks, 1, 2);
    core.runCfr(makeTree(-1, 1), {}, 0, [1, 1], maps, callbacks, 1, 3);

    const regrets = Array.from(maps.regrets.get("weighted-root"));
    const strategySum = Array.from(maps.strategy.get("weighted-root"));

    assert.deepEqual(regrets, [2, 6]);
    assert.deepEqual(strategySum, [4, 1]);
});


test("la meilleure réponse agrège les poids de chance avant de choisir dans un information set partagé", () => {
    const core = loadCore();
    const maps = core.createMaps();
    const callbacks = {
        informationKey: () => "shared-private-information-set",
        utility: node => node.payoff
    };
    const makeTree = (firstPayoff, secondPayoff) => ({
        terminal: false,
        actor: 0,
        actions: [
            { action: { type: "check", label: "A" }, child: { terminal: true, payoff: firstPayoff } },
            { action: { type: "bet", label: "B", amount: 1 }, child: { terminal: true, payoff: secondPayoff } }
        ]
    });
    const deals = [
        { root: makeTree(1, 0), deal: { weight: 1 } },
        { root: makeTree(0, 1), deal: { weight: 4 } }
    ];

    const bestResponse = core.bestResponseValue(
        deals,
        maps,
        callbacks,
        0,
        deal => deal.weight
    );

    assert.equal(bestResponse.informationSets, 1);
    assert.equal(bestResponse.totalWeight, 5);
    assert.ok(Math.abs(bestResponse.value - 0.8) < 1e-9);
});


test("CFR+ restaure le vecteur de reach fourni et réutilise la clé d'information pour un même deal", () => {
    const core = loadCore();
    const maps = core.createMaps();
    let keyCalls = 0;
    const callbacks = {
        informationKey() {
            keyCalls++;
            return "cached-information-set";
        },
        utility() {
            return 1;
        }
    };
    const root = decision(0, "root", 1, 0, [
        ["left", terminal(1, 0)],
        ["right", terminal(1, 0)]
    ]);
    const deal = {};
    const reach = [0.75, 0.5];

    core.runCfr(root, deal, 0, reach, maps, callbacks, 1);
    core.runCfr(root, deal, 1, reach, maps, callbacks, 1);

    assert.deepEqual(reach, [0.75, 0.5]);
    assert.equal(keyCalls, 1);
});
