"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadStrategy() {
    const context = {
        console,
        Math,
        Set,
        Map,
        Promise,
        Float64Array,
        setTimeout,
        Uint32Array
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync("js/core/evaluator.js", "utf8"), context);
    vm.runInContext(fs.readFileSync("js/modules/postflop-strategy.js", "utf8"), context);
    context.PokerLabPostflopSolver = {
        getOpponentRange: async () => ({
            label: "test-range",
            combos: [
                { cards: [card(4, "clubs"), card(5, "clubs")], weight: 1 },
                { cards: [card(6, "clubs"), card(7, "clubs")], weight: 1 },
                { cards: [card(8, "clubs"), card(9, "clubs")], weight: 1 },
                { cards: [card(2, "diamonds"), card(3, "diamonds")], weight: 1 }
            ]
        })
    };
    return context;
}

function card(value, suit) {
    return { value, suit };
}

function riverState() {
    return {
        street: "river",
        board: [
            card(10, "spades"),
            card(11, "spades"),
            card(12, "spades"),
            card(13, "spades"),
            card(14, "spades")
        ],
        pot: 10,
        currentPlayerId: "hero",
        handComplete: false,
        players: [
            {
                id: "hero", isHuman: true, folded: false,
                holeCards: [card(2, "clubs"), card(3, "clubs")],
                stack: 20, streetBet: 0, amountToCall: 0,
                actionOptions: { canCheck: true, canBet: true, canCall: false, canRaise: false }
            },
            {
                id: "bot_1", isHuman: false, folded: false,
                holeCards: null, stack: 20, streetBet: 0,
                position: "BB"
            }
        ]
    };
}

test("l'arbre river HU expose check, bet et tapis quand ils sont légaux", () => {
    const app = loadStrategy();
    const state = riverState();
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(state, state.players[0].actionOptions);
    assert.deepEqual(
        Array.from(built.tree.actions, entry => entry.action.label),
        ["check", "bet_50", "all_in"]
    );
    assert.ok(built.nodeCount > 1);
});

test("face à une mise, l'arbre propose fold, call et raise si la relance est légale", () => {
    const app = loadStrategy();
    const state = riverState();
    state.pot = 15;
    state.players[1].streetBet = 5;
    state.players[0].actionOptions = { canFold: true, canCall: true, canRaise: true };
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(state, state.players[0].actionOptions);
    assert.deepEqual(
        Array.from(built.tree.actions, entry => entry.action.label),
        ["fold", "call", "raise"]
    );
});

test("l'arbre respecte l'interdiction de relancer fournie par le moteur", () => {
    const app = loadStrategy();
    const state = riverState();
    state.pot = 15;
    state.players[1].streetBet = 5;
    state.players[0].actionOptions = { canFold: true, canCall: true, canRaise: false };
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(state, state.players[0].actionOptions);
    assert.deepEqual(
        Array.from(built.tree.actions, entry => entry.action.label),
        ["fold", "call"]
    );
});

test("CFR+ renvoie des fréquences normalisées et une EV finie", async () => {
    const app = loadStrategy();
    const result = await app.PokerLabPostflopStrategy.solveRiver(riverState(), [], {
        iterations: 20,
        samples: 8
    });
    const totalFrequency = result.actions.reduce((sum, action) => sum + action.frequency, 0);
    assert.equal(result.algorithm, "CFR+");
    assert.equal(result.iterations, 20);
    assert.equal(result.sampledOpponentHands, 8);
    assert.ok(Math.abs(totalFrequency - 1) < 0.000001);
    assert.ok(Number.isFinite(result.heroEV));
    assert.ok(result.treeNodes > 1);
    assert.equal(result.rangeUsed, true);
});

test("CFR+ refuse le flop : la première abstraction stratégique est river", async () => {
    const app = loadStrategy();
    const state = riverState();
    state.street = "flop";
    state.board = state.board.slice(0, 3);
    assert.throws(
        () => app.PokerLabPostflopStrategy.validate(state),
        /river/
    );
});

test("CFR+ refuse une situation multiway", async () => {
    const app = loadStrategy();
    const state = riverState();
    state.players.push({
        id: "bot_2", isHuman: false, folded: false,
        holeCards: null, stack: 20, streetBet: 0
    });
    assert.throws(
        () => app.PokerLabPostflopStrategy.validate(state),
        /heads-up/
    );
});


test("un tapis laisse encore à l'adversaire le choix fold ou call", () => {
    const app = loadStrategy();
    const state = riverState();
    state.pot = 10;
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(state, state.players[0].actionOptions);
    const allIn = built.tree.actions.find(entry => entry.action.label === "all_in");
    assert.ok(allIn);
    assert.equal(allIn.child.terminal, false);
    assert.deepEqual(
        Array.from(allIn.child.actions, entry => entry.action.label),
        ["fold", "call"]
    );
});
