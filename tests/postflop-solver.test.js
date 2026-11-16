"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadSolver() {
    const context = {
        console,
        Math,
        Set,
        Map,
        Uint32Array,
        Promise,
        fetch: async url => ({
            ok: true,
            json: async () => url.endsWith("index.json")
                ? { version: 1, spots: [] }
                : { version: 1, ranges: {} }
        })
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync("js/core/evaluator.js", "utf8"), context);
    vm.runInContext(fs.readFileSync("js/modules/postflop-solver.js", "utf8"), context);
    return context;
}

function card(value, suit) {
    return { value, suit };
}

function state(board, heroCards, opponentCards = null) {
    return {
        street: board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river",
        board,
        pot: 10,
        currentPlayerId: "hero",
        handComplete: false,
        players: [
            { id: "hero", isHuman: true, folded: false, holeCards: heroCards, stack: 90, amountToCall: 0, actionOptions: { canBet: true } },
            { id: "bot_1", isHuman: false, folded: false, holeCards: opponentCards, stack: 90, amountToCall: 0, position: "BB" }
        ]
    };
}

test("le solveur accepte un flop heads-up avec cartes privées du héros", () => {
    const app = loadSolver();
    const current = state(
        [card(2, "clubs"), card(7, "diamonds"), card(9, "hearts")],
        [card(14, "spades"), card(14, "hearts")]
    );
    assert.equal(app.PokerLabPostflopSolver.validateState(current).hero.id, "hero");
});

test("le solveur refuse le préflop", () => {
    const app = loadSolver();
    const current = state([], [card(14, "spades"), card(14, "hearts")]);
    assert.throws(() => app.PokerLabPostflopSolver.validateState(current), /à partir du flop/);
});

test("le solveur refuse les pots multiway", () => {
    const app = loadSolver();
    const current = state(
        [card(2, "clubs"), card(7, "diamonds"), card(9, "hearts")],
        [card(14, "spades"), card(14, "hearts")]
    );
    current.players.push({ id: "bot_2", isHuman: false, folded: false, holeCards: null, stack: 90 });
    assert.throws(() => app.PokerLabPostflopSolver.validateState(current), /heads-up/);
});

test("une quinte flush royale au board produit une équité de partage de 50 %", async () => {
    const app = loadSolver();
    const current = state(
        [card(14, "spades"), card(13, "spades"), card(12, "spades"), card(11, "spades"), card(10, "spades")],
        [card(2, "clubs"), card(3, "clubs")]
    );
    const result = await app.PokerLabPostflopSolver.analyse(current, [], { iterations: 300 });
    assert.equal(result.iterations, 300);
    assert.equal(result.ties, 300);
    assert.equal(result.wins, 0);
    assert.equal(result.losses, 0);
    assert.equal(result.equity, 0.5);
});
