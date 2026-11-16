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
    vm.runInContext(fs.readFileSync("js/bots/bot-profiles.js", "utf8"), context);
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
    current.players[1].isBot = true;
    current.players[1].botProfile = "nit";
    current.players[1].botDifficulty = "hard";
    const history = [{
        type: "player_action",
        street: "flop",
        data: { playerId: "bot_1", action: "check", amount: 0, potBefore: 2, potAfter: 2, currentBetBefore: 0, currentBetAfter: 0, streetBetBefore: 0, streetBetAfter: 0, stackBefore: 100, stackAfter: 100, totalContributionBefore: 100, totalContributionAfter: 100, betTo: null, raiseTo: null, raiseSize: null, isFullRaise: null, lastFullRaiseBefore: 1, lastFullRaiseAfter: 1, allIn: false, secret: "must-not-pass" }
    }];
    const input = app.PokerLabPostflopSolver.createInput(current, history);
    assert.equal(input.schemaVersion, 1);
    assert.equal(input.state.players[1].holeCards, null);
    assert.equal(input.state.players[1].botProfile, "nit");
    assert.equal(input.state.players[1].botDifficulty, "hard");
    assert.notEqual(input.state.board, current.board);
    assert.equal(input.history[0].data.secret, undefined);
    assert.equal(input.history[0].data.potBefore, 2);
    assert.equal(input.history[0].data.currentBetAfter, 0);
    assert.equal(input.history[0].data.stackAfter, 100);
    assert.equal(input.history[0].data.totalContributionBefore, 100);
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
    assert.equal(range.combos.length, 1176);
});


test("la position BTN du moteur est convertie en BU pour sélectionner une range", async () => {
    const fetcher = async url => ({
        ok: true,
        json: async () => url.endsWith("index.json")
            ? { version: 1, spots: [{ id: "bu/BU_RFI", p: "BU", a: "RFI", s: "" }] }
            : { version: 1, ranges: { "bu/BU_RFI": { AA: 100 } } }
    });
    const app = loadSolver(fetcher);
    const current = state(
        [card(2, "spades"), card(4, "spades"), card(6, "hearts")],
        [card(3, "clubs"), card(5, "clubs")]
    );
    current.players[0].position = "BB";
    current.players[1].position = "BTN";
    const history = [{
        type: "player_action",
        street: "preflop",
        data: { playerId: "bot_1", action: "raise" }
    }];

    const range = await app.PokerLabPostflopSolver.getOpponentRange(
        current,
        history,
        current.players[1]
    );

    assert.equal(range.rangeUsed, true);
    assert.equal(range.label, "bu/BU_RFI");
});

test("la position BTN/SB du heads-up est convertie en BU", async () => {
    const fetcher = async url => ({
        ok: true,
        json: async () => url.endsWith("index.json")
            ? { version: 1, spots: [{ id: "bu/BU_RFI", p: "BU", a: "RFI", s: "" }] }
            : { version: 1, ranges: { "bu/BU_RFI": { AA: 100 } } }
    });
    const app = loadSolver(fetcher);
    const current = state(
        [card(2, "spades"), card(4, "spades"), card(6, "hearts")],
        [card(3, "clubs"), card(5, "clubs")]
    );
    current.players[0].position = "BB";
    current.players[1].position = "BTN/SB";
    const history = [{
        type: "player_action",
        street: "preflop",
        data: { playerId: "bot_1", action: "raise" }
    }];

    const range = await app.PokerLabPostflopSolver.getOpponentRange(
        current,
        history,
        current.players[1]
    );

    assert.equal(range.rangeUsed, true);
    assert.equal(range.label, "bu/BU_RFI");
});

test("la position HJ du moteur est convertie en MP dans la matrice", async () => {
    const fetcher = async url => ({
        ok: true,
        json: async () => url.endsWith("index.json")
            ? { version: 1, spots: [{ id: "mp/MP_RFI", p: "MP", a: "RFI", s: "" }] }
            : { version: 1, ranges: { "mp/MP_RFI": { AA: 100 } } }
    });
    const app = loadSolver(fetcher);
    const current = state(
        [card(2, "spades"), card(4, "spades"), card(6, "hearts")],
        [card(3, "clubs"), card(5, "clubs")]
    );
    current.players[1].position = "HJ";
    const history = [{
        type: "player_action",
        street: "preflop",
        data: { playerId: "bot_1", action: "raise" }
    }];

    const range = await app.PokerLabPostflopSolver.getOpponentRange(
        current,
        history,
        current.players[1]
    );

    assert.equal(range.rangeUsed, true);
    assert.equal(range.label, "mp/MP_RFI");
});

test("les positions BTN sont normalisées dans la séquence préflop face à une défense BB", async () => {
    const fetcher = async url => ({
        ok: true,
        json: async () => url.endsWith("index.json")
            ? { version: 1, spots: [{ id: "bb/BB_call_vs_BU_RFI", p: "BB", a: "call", s: "BU RFI" }] }
            : { version: 1, ranges: { "bb/BB_call_vs_BU_RFI": { AA: 100 } } }
    });
    const app = loadSolver(fetcher);
    const current = state(
        [card(2, "spades"), card(4, "spades"), card(6, "hearts")],
        [card(3, "clubs"), card(5, "clubs")]
    );
    current.players[0].position = "BTN";
    current.players[1].position = "BB";
    const history = [
        {
            type: "player_action",
            street: "preflop",
            data: { playerId: "hero", action: "raise" }
        },
        {
            type: "player_action",
            street: "preflop",
            data: { playerId: "bot_1", action: "call" }
        }
    ];

    const range = await app.PokerLabPostflopSolver.getOpponentRange(
        current,
        history,
        current.players[1]
    );

    assert.equal(range.rangeUsed, true);
    assert.equal(range.label, "bb/BB_call_vs_BU_RFI");
});


test("le mapping distingue un 5bet non all-in d'un 5bet à tapis", async () => {
    const sequence = "BU RFI › BB 3bet › BU 4bet";
    const smallId = "bb/BB_5bet_small_vs_BU_RFI_BB_3bet_BU_4bet";
    const jamId = "bb/BB_5bet_vs_BU_RFI_BB_3bet_BU_4bet";
    const fetcher = async url => ({
        ok: true,
        json: async () => url.endsWith("index.json")
            ? {
                version: 1,
                spots: [
                    { id: smallId, p: "BB", a: "5bet_small", s: sequence },
                    { id: jamId, p: "BB", a: "5bet", s: sequence }
                ]
            }
            : { version: 1, ranges: { [smallId]: { AA: 100 }, [jamId]: { KK: 100 } } }
    });
    const app = loadSolver(fetcher);
    const current = state(
        [card(2, "spades"), card(4, "spades"), card(6, "hearts")],
        [card(3, "clubs"), card(5, "clubs")]
    );
    current.players[0].position = "BTN";
    current.players[1].position = "BB";

    const makeHistory = allIn => [
        { type: "player_action", street: "preflop", data: { playerId: "hero", action: "raise", allIn: false } },
        { type: "player_action", street: "preflop", data: { playerId: "bot_1", action: "raise", allIn: false } },
        { type: "player_action", street: "preflop", data: { playerId: "hero", action: "raise", allIn: false } },
        { type: "player_action", street: "preflop", data: { playerId: "bot_1", action: "raise", allIn } }
    ];

    const small = await app.PokerLabPostflopSolver.getOpponentRange(
        current, makeHistory(false), current.players[1]
    );
    const jam = await app.PokerLabPostflopSolver.getOpponentRange(
        current, makeHistory(true), current.players[1]
    );

    assert.equal(small.rangeUsed, true);
    assert.equal(small.label, smallId);
    assert.equal(jam.rangeUsed, true);
    assert.equal(jam.label, jamId);
});


test("un sizing de mise plus élevé renforce prudemment le poids des mains fortes", async () => {
    const spotId = "bb/BB_call_vs_BU_RFI";
    const fetcher = async url => ({
        ok: true,
        json: async () => url.endsWith("index.json")
            ? { version: 1, spots: [{ id: spotId, p: "BB", a: "call", s: "BU RFI" }] }
            : { version: 1, ranges: { [spotId]: { AA: 100, "43o": 100 } } }
    });
    const app = loadSolver(fetcher);
    const current = state(
        [card(2, "clubs"), card(7, "diamonds"), card(9, "hearts")],
        [card(8, "clubs"), card(5, "clubs")]
    );
    current.players[0].position = "BTN";
    current.players[1].position = "BB";

    const baseHistory = [
        { type: "player_action", street: "preflop", data: { playerId: "hero", action: "raise" } },
        { type: "player_action", street: "preflop", data: { playerId: "bot_1", action: "call" } }
    ];
    const rangeForBetSize = async betTo => app.PokerLabPostflopSolver.getOpponentRange(
        current,
        [
            ...baseHistory,
            {
                type: "player_action",
                street: "flop",
                data: {
                    playerId: "bot_1",
                    action: "bet",
                    amount: betTo,
                    betTo,
                    potBefore: 10
                }
            }
        ],
        current.players[1]
    );
    const small = await rangeForBetSize(1);
    const large = await rangeForBetSize(10);

    const ratioFor = range => {
        const aces = range.combos
            .filter(item => item.cards[0].value === 14 && item.cards[1].value === 14)
            .reduce((sum, item) => sum + item.weight, 0);
        const lowOffsuit = range.combos
            .filter(item =>
                [item.cards[0].value, item.cards[1].value].includes(4) &&
                [item.cards[0].value, item.cards[1].value].includes(3) &&
                item.cards[0].suit !== item.cards[1].suit
            )
            .reduce((sum, item) => sum + item.weight, 0);
        return aces / lowOffsuit;
    };

    assert.ok(ratioFor(large) > ratioFor(small));
    assert.equal(large.postflopActionsUsed, 1);
});


test("le solveur construit aussi la range préflop du héros à partir de sa propre ligne", async () => {
    const spotId = "bu/BU_RFI";
    const fetcher = async url => ({
        ok: true,
        json: async () => url.endsWith("index.json")
            ? { version: 1, spots: [{ id: spotId, p: "BU", a: "RFI", s: "" }] }
            : { version: 1, ranges: { [spotId]: { AA: 100, KK: 50 } } }
    });
    const app = loadSolver(fetcher);
    const current = state(
        [card(2, "spades"), card(4, "spades"), card(6, "hearts")],
        [card(14, "clubs"), card(14, "hearts")]
    );
    current.players[0].position = "BTN";
    const history = [{
        type: "player_action",
        street: "preflop",
        data: { playerId: "hero", action: "raise" }
    }];

    const range = await app.PokerLabPostflopSolver.getPlayerRange(
        current,
        history,
        current.players[0]
    );

    assert.equal(range.rangeUsed, true);
    assert.equal(range.actualHandInRange, true);
    assert.equal(range.label, spotId);
    assert.ok(range.combos.some(item =>
        item.cards.every(card => card.value === 14)
    ));
});

test("la range héro retombe en range large si elle exclut la main réellement distribuée", async () => {
    const spotId = "bu/BU_RFI";
    const fetcher = async url => ({
        ok: true,
        json: async () => url.endsWith("index.json")
            ? { version: 1, spots: [{ id: spotId, p: "BU", a: "RFI", s: "" }] }
            : { version: 1, ranges: { [spotId]: { KK: 100 } } }
    });
    const app = loadSolver(fetcher);
    const current = state(
        [card(2, "spades"), card(4, "spades"), card(6, "hearts")],
        [card(14, "clubs"), card(14, "hearts")]
    );
    current.players[0].position = "BTN";
    const history = [{
        type: "player_action",
        street: "preflop",
        data: { playerId: "hero", action: "raise" }
    }];

    const range = await app.PokerLabPostflopSolver.getPlayerRange(
        current,
        history,
        current.players[0]
    );

    assert.equal(range.rangeUsed, false);
    assert.equal(range.actualHandInRange, true);
    assert.match(range.label, /main réelle absente/);
    assert.ok(range.combos.some(item =>
        item.cards.some(card => card.value === 14 && card.suit === "clubs") &&
        item.cards.some(card => card.value === 14 && card.suit === "hearts")
    ));
});


test("le fallback uniforme de la range adverse n'est pas bloqué par la main réelle du héros", async () => {
    const app = loadSolver();
    const heroCards = [card(14, "spades"), card(14, "hearts")];
    const current = state(
        [card(2, "clubs"), card(7, "diamonds"), card(9, "hearts")],
        heroCards
    );

    const range = await app.PokerLabPostflopSolver.getPlayerRange(
        current,
        [],
        current.players[1]
    );
    const handKey = cards => cards
        .map(item => item.value + "_" + item.suit)
        .sort()
        .join("|");

    assert.equal(range.rangeUsed, false);
    assert.ok(range.combos.some(item => handKey(item.cards) === handKey(heroCards)));
});


test("le conditionnement postflop tient compte du profil et de la difficulté du bot", () => {
    const app = loadSolver();
    const board = [
        card(2, "clubs"),
        card(7, "diamonds"),
        card(9, "hearts")
    ];
    const strongHand = [card(9, "spades"), card(9, "diamonds")];
    const mediumHand = [card(7, "spades"), card(3, "clubs")];
    const range = {
        label: "test-range",
        combos: [
            { cards: strongHand, weight: 1 },
            { cards: mediumHand, weight: 1 }
        ]
    };
    const state = { board };
    const history = [{
        type: "player_action",
        street: "flop",
        data: {
            playerId: "bot",
            action: "bet",
            amount: 10,
            potBefore: 10,
            potAfter: 20,
            currentBetBefore: 0,
            currentBetAfter: 10,
            streetBetBefore: 0,
            streetBetAfter: 10,
            stackBefore: 100,
            stackAfter: 90,
            betTo: 10,
            raiseSize: 10,
            isFullRaise: true,
            lastFullRaiseBefore: 1,
            allIn: false
        }
    }];

    const nit = app.PokerLabPostflopSolver.conditionRangeOnPostflopActions(
        state,
        history,
        { id: "bot", isBot: true, botProfile: "nit", botDifficulty: "hard" },
        range
    );
    const lag = app.PokerLabPostflopSolver.conditionRangeOnPostflopActions(
        state,
        history,
        { id: "bot", isBot: true, botProfile: "lag", botDifficulty: "medium" },
        range
    );

    const ratio = result => result.combos[0].weight / result.combos[1].weight;
    assert.equal(nit.profileModeledActions, 1);
    assert.equal(lag.profileModeledActions, 1);
    assert.match(nit.conditioning, /profil et la difficulté/);
    assert.ok(ratio(nit) > ratio(lag));
});
