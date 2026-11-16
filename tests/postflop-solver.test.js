"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadSolver(fetcher = async url => ({
    ok: true,
    json: async () => url.endsWith("index.json")
        ? { version: 1, spots: [] }
        : { version: 1, ranges: {} }
})) {
    const context = {
        console,
        Math,
        Set,
        Map,
        Uint32Array,
        Promise,
        fetch: fetcher
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

test("le solveur utilise une range préflop compatible lorsqu'elle existe", async () => {
    const fetcher = async url => ({
        ok: true,
        json: async () => url.endsWith("index.json")
            ? { version: 1, spots: [{ id: "bb/BB_3bet_vs_BU_RFI", p: "BB", a: "3bet", s: "BU RFI" }] }
            : { version: 1, ranges: { "bb/BB_3bet_vs_BU_RFI": { AA: 100 } } }
    });
    const app = loadSolver(fetcher);
    const current = state(
        [card(2, "spades"), card(4, "spades"), card(6, "hearts"), card(8, "clubs"), card(10, "diamonds")],
        [card(3, "clubs"), card(5, "clubs")]
    );
    current.players[0].position = "BU";
    current.players[1].position = "BB";
    const history = [
        { type: "player_action", street: "preflop", data: { playerId: "hero", action: "raise" } },
        { type: "player_action", street: "preflop", data: { playerId: "bot_1", action: "raise" } }
    ];
    const result = await app.PokerLabPostflopSolver.analyse(current, history, { iterations: 300 });
    assert.equal(result.rangeUsed, true);
    assert.equal(result.rangeLabel, "bb/BB_3bet_vs_BU_RFI");
    assert.equal(result.equity, 1);
});

test("le solveur actualise la range adverse après un call préflop", async () => {
    const fetcher = async url => ({
        ok: true,
        json: async () => url.endsWith("index.json")
            ? { version: 1, spots: [{ id: "bb/BB_call_vs_BU_RFI", p: "BB", a: "call", s: "BU RFI" }] }
            : { version: 1, ranges: { "bb/BB_call_vs_BU_RFI": { AA: 100 } } }
    });
    const app = loadSolver(fetcher);
    const current = state(
        [card(2, "spades"), card(4, "spades"), card(6, "hearts"), card(8, "clubs"), card(10, "diamonds")],
        [card(3, "clubs"), card(5, "clubs")]
    );
    current.players[0].position = "BU";
    const history = [
        { type: "player_action", street: "preflop", data: { playerId: "hero", action: "raise" } },
        { type: "player_action", street: "preflop", data: { playerId: "bot_1", action: "call" } }
    ];
    const result = await app.PokerLabPostflopSolver.analyse(current, history, { iterations: 300 });
    assert.equal(result.rangeUsed, true);
    assert.equal(result.rangeLabel, "bb/BB_call_vs_BU_RFI");
    assert.equal(result.equity, 1);
});


test("le solveur conserve les folds dans la séquence préflop", async () => {
    const fetcher = async url => ({
        ok: true,
        json: async () => url.endsWith("index.json")
            ? { version: 1, spots: [{ id: "bb/BB_call_vs_BU_RFI_SB_fold", p: "BB", a: "call", s: "BU RFI › SB fold" }] }
            : { version: 1, ranges: { "bb/BB_call_vs_BU_RFI_SB_fold": { AA: 100 } } }
    });
    const app = loadSolver(fetcher);
    const current = state(
        [card(2, "spades"), card(4, "spades"), card(6, "hearts"), card(8, "clubs"), card(10, "diamonds")],
        [card(3, "clubs"), card(5, "clubs")]
    );
    current.players[0].position = "BU";
    current.players[1].position = "BB";
    current.players.push({ id: "bot_2", isHuman: false, folded: true, holeCards: null, stack: 90, position: "SB" });
    const history = [
        { type: "player_action", street: "preflop", data: { playerId: "hero", action: "raise" } },
        { type: "player_action", street: "preflop", data: { playerId: "bot_2", action: "fold" } },
        { type: "player_action", street: "preflop", data: { playerId: "bot_1", action: "call" } }
    ];
    const result = await app.PokerLabPostflopSolver.analyse(current, history, { iterations: 300 });
    assert.equal(result.rangeUsed, true);
    assert.equal(result.rangeLabel, "bb/BB_call_vs_BU_RFI_SB_fold");
    assert.equal(result.equity, 1);
});

test("le solveur ne remplace pas une séquence absente par une range de profondeur similaire", async () => {
    const fetcher = async url => ({
        ok: true,
        json: async () => url.endsWith("index.json")
            ? { version: 1, spots: [{ id: "bb/BB_call_vs_BU_RFI_CO_fold", p: "BB", a: "call", s: "BU RFI › CO fold" }] }
            : { version: 1, ranges: { "bb/BB_call_vs_BU_RFI_CO_fold": { AA: 100 } } }
    });
    const app = loadSolver(fetcher);
    const current = state(
        [card(2, "spades"), card(4, "spades"), card(6, "hearts"), card(8, "clubs"), card(10, "diamonds")],
        [card(3, "clubs"), card(5, "clubs")]
    );
    current.players[0].position = "BU";
    current.players[1].position = "BB";
    current.players.push({ id: "bot_2", isHuman: false, folded: true, holeCards: null, stack: 90, position: "SB" });
    const history = [
        { type: "player_action", street: "preflop", data: { playerId: "hero", action: "raise" } },
        { type: "player_action", street: "preflop", data: { playerId: "bot_2", action: "fold" } },
        { type: "player_action", street: "preflop", data: { playerId: "bot_1", action: "call" } }
    ];
    const result = await app.PokerLabPostflopSolver.analyse(current, history, { iterations: 300 });
    assert.equal(result.rangeUsed, false);
    assert.match(result.rangeLabel, /Range large/);
});


test("le contrat solver v1 copie l'état et n'expose jamais les cartes adverses", () => {
    const app = loadSolver();
    const current = state(
        [card(2, "clubs"), card(7, "diamonds"), card(9, "hearts")],
        [card(14, "spades"), card(14, "hearts")]
    );
    current.players[1].holeCards = [card(3, "clubs"), card(4, "clubs")];
    const history = [{
        type: "player_action",
        street: "flop",
        data: { playerId: "bot_1", action: "check", amount: 0, potBefore: 2, potAfter: 2, currentBetBefore: 0, currentBetAfter: 0, streetBetBefore: 0, streetBetAfter: 0, stackBefore: 100, stackAfter: 100, betTo: null, raiseTo: null, raiseSize: null, isFullRaise: null, lastFullRaiseBefore: 1, lastFullRaiseAfter: 1, allIn: false, secret: "must-not-pass" }
    }];
    const input = app.PokerLabPostflopSolver.createInput(current, history);
    assert.equal(input.schemaVersion, 1);
    assert.equal(input.state.players[1].holeCards, null);
    assert.notEqual(input.state.board, current.board);
    assert.equal(input.history[0].data.secret, undefined);
    assert.equal(input.history[0].data.potBefore, 2);
    assert.equal(input.history[0].data.currentBetAfter, 0);
    assert.equal(input.history[0].data.stackAfter, 100);
    input.state.board[0].value = 3;
    assert.equal(current.board[0].value, 2);
});

test("une action postflop adverse modifie les poids de la range sans prétendre à une range GTO", async () => {
    const fetcher = async url => ({
        ok: true,
        json: async () => url.endsWith("index.json")
            ? { version: 1, spots: [{ id: "bb/BB_call_vs_BU_RFI", p: "BB", a: "call", s: "BU RFI" }] }
            : { version: 1, ranges: { "bb/BB_call_vs_BU_RFI": { AA: 100, "43o": 100 } } }
    });
    const app = loadSolver(fetcher);
    const current = state(
        [card(2, "clubs"), card(7, "diamonds"), card(9, "hearts")],
        [card(14, "spades"), card(14, "hearts")]
    );
    current.players[0].position = "BU";
    current.players[1].position = "BB";
    const history = [
        { type: "player_action", street: "preflop", data: { playerId: "hero", action: "raise" } },
        { type: "player_action", street: "preflop", data: { playerId: "bot_1", action: "call" } },
        { type: "player_action", street: "flop", data: { playerId: "bot_1", action: "check", amount: 0 } }
    ];
    const range = await app.PokerLabPostflopSolver.getOpponentRange(current, history, current.players[1]);
    const aaWeight = range.combos.filter(item => item.cards.every(c => c.value === 14))
        .reduce((sum, item) => sum + item.weight, 0);
    const weakWeight = range.combos.filter(item =>
        item.cards.some(c => c.value === 4) && item.cards.some(c => c.value === 3))
        .reduce((sum, item) => sum + item.weight, 0);
    assert.equal(range.rangeUsed, true);
    assert.equal(range.postflopActionsUsed, 1);
    assert.match(range.label, /ajustée postflop/);
    assert.ok(weakWeight > aaWeight);
});


test("le solveur conserve une range uniforme hors ligne si le bundle préflop est indisponible", async () => {
    const app = loadSolver(async () => ({ ok: false, json: async () => ({}) }));
    const current = state(
        [card(2, "clubs"), card(7, "diamonds"), card(9, "hearts")],
        [card(14, "spades"), card(14, "hearts")]
    );
    current.players[1].position = "BB";
    const range = await app.PokerLabPostflopSolver.getOpponentRange(
        current,
        [],
        current.players[1]
    );
    assert.equal(range.rangeUsed, false);
    assert.match(range.label, /bundle préflop indisponible/);
    assert.equal(range.combos.length, 1081);
});
