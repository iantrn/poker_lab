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
        ["check", "bet_33", "bet_75", "all_in"]
    );
    assert.deepEqual(
        Array.from(built.tree.actions[0].child.actions, entry => entry.action.label),
        ["check", "bet_33", "bet_75", "all_in"]
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
    assert.equal(result.algorithm, "CFR+ avec rééchantillonnage des chances");
    assert.equal(result.iterations, 160);
    assert.equal(result.sampledOpponentHands, 160);
    assert.equal(result.evaluationSamples, 8);
    assert.ok(Math.abs(totalFrequency - 1) < 0.000001);
    assert.ok(Number.isFinite(result.heroEV));
    assert.ok(result.actions.every(action => Number.isFinite(action.ev)));
    assert.ok(result.treeNodes > 1);
    assert.equal(result.rangeUsed, true);
});

test("CFR+ refuse le préflop", async () => {
    const app = loadStrategy();
    const state = riverState();
    state.street = "preflop";
    state.board = [];
    assert.throws(
        () => app.PokerLabPostflopStrategy.validate(state),
        /à partir du flop/
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


test("la taille de relance à la racine respecte le minimum du moteur", () => {
    const app = loadStrategy();
    const state = riverState();
    state.pot = 15;
    state.players[1].streetBet = 5;
    state.players[0].actionOptions = {
        canFold: true, canCall: true, canRaise: true,
        minimumRaiseTo: 15, maximumRaiseTo: 20, isAllIn: true
    };
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(state, state.players[0].actionOptions);
    const raise = built.tree.actions.find(entry => entry.action.type === "raise");
    assert.ok(raise);
    assert.equal(raise.action.amount, 15);
});

test("une relance à tapis courte reste représentée si le tapis ne couvre pas le minimum", () => {
    const app = loadStrategy();
    const state = riverState();
    state.pot = 30;
    state.players[0].stack = 12;
    state.players[1].streetBet = 5;
    state.players[0].actionOptions = {
        canFold: true, canCall: true, canRaise: true,
        minimumRaiseTo: 20, maximumRaiseTo: 12, isAllIn: true
    };
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(state, state.players[0].actionOptions);
    const raise = built.tree.actions.find(entry => entry.action.label === "all_in_raise");
    assert.ok(raise);
    assert.equal(raise.action.amount, 12);
});


test("la range uniforme énumère chaque combinaison légale exactement une fois", () => {
    const app = loadStrategy();
    const state = riverState();
    const combos = app.PokerLabPostflopStrategy.buildUniformRange([
        ...state.players[0].holeCards,
        ...state.board
    ]);
    const identifiers = combos.map(item => item.cards.map(card => card.value + "_" + card.suit).sort().join("|"));
    assert.equal(combos.length, 990);
    assert.equal(new Set(identifiers).size, 990);
});


test("les mises à tapis sont plafonnées au tapis effectif en heads-up", () => {
    const app = loadStrategy();
    const state = riverState();
    state.players[0].stack = 100;
    state.players[1].stack = 12;
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(state, state.players[0].actionOptions);
    const allIn = built.tree.actions.find(entry => entry.action.label === "all_in");
    assert.ok(allIn);
    assert.equal(allIn.action.amount, 12);
});

test("un call à tapis court restitue la partie non couverte de la mise adverse", () => {
    const app = loadStrategy();
    const state = riverState();
    state.pot = 20;
    state.players[0].stack = 5;
    state.players[1].streetBet = 10;
    state.players[0].actionOptions = { canFold: true, canCall: true, canRaise: false };
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(state, state.players[0].actionOptions);
    const call = built.tree.actions.find(entry => entry.action.label === "call");
    assert.ok(call);
    assert.equal(call.child.pot, 20);
    assert.equal(call.child.heroInvested, 5);
});


test("l'arbre ajoute les nœuds de turn et river après les checks successifs", () => {
    const app = loadStrategy();
    const state = riverState();
    state.street = "flop";
    state.board = state.board.slice(0, 3);
    const turnCard = card(4, "diamonds");
    const riverCard = card(5, "clubs");
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(
        state,
        state.players[0].actionOptions,
        [],
        [turnCard, riverCard]
    );
    const turnNode = built.tree.actions.find(entry => entry.action.type === "check")
        .child.actions.find(entry => entry.action.type === "check").child;
    assert.equal(turnNode.board.length, 4);
    assert.equal(turnNode.history.includes("street:turn"), true);
    const riverNode = turnNode.actions.find(entry => entry.action.type === "check")
        .child.actions.find(entry => entry.action.type === "check").child;
    assert.equal(riverNode.board.length, 5);
    assert.equal(riverNode.history.includes("street:river"), true);
});

test("CFR+ échantillonne les runouts et calcule une stratégie dès le flop", async () => {
    const app = loadStrategy();
    const state = riverState();
    state.street = "flop";
    state.board = [
        card(2, "spades"),
        card(7, "diamonds"),
        card(9, "hearts")
    ];
    state.players[0].position = "BTN/SB";
    state.players[1].position = "BB";
    const result = await app.PokerLabPostflopStrategy.solvePostflop(state, [], {
        iterations: 20,
        samples: 8
    });
    const totalFrequency = result.actions.reduce((sum, action) => sum + action.frequency, 0);
    assert.equal(result.street, "flop");
    assert.equal(result.sampledOpponentHands, 160);
    assert.ok(Math.abs(totalFrequency - 1) < 0.000001);
    assert.ok(Number.isFinite(result.heroEV));
    assert.ok(result.treeNodes > 10);
});


test("CFR+ échantillonne la river et calcule une stratégie depuis le turn", async () => {
    const app = loadStrategy();
    const state = riverState();
    state.street = "turn";
    state.board = [
        card(2, "spades"),
        card(7, "diamonds"),
        card(9, "hearts"),
        card(10, "clubs")
    ];
    state.players[0].position = "BTN/SB";
    state.players[1].position = "BB";
    const result = await app.PokerLabPostflopStrategy.solvePostflop(state, [], {
        iterations: 20,
        samples: 8
    });
    const totalFrequency = result.actions.reduce((sum, action) => sum + action.frequency, 0);
    assert.equal(result.street, "turn");
    assert.equal(result.sampledOpponentHands, 160);
    assert.ok(Math.abs(totalFrequency - 1) < 0.000001);
    assert.ok(Number.isFinite(result.heroEV));
    assert.ok(result.treeNodes > 10);
});


test("l'ordre de parole des streets suivantes respecte le premier joueur actif après le bouton", () => {
    const app = loadStrategy();
    const state = riverState();
    state.street = "flop";
    state.board = state.board.slice(0, 3);
    state.postflopFirstActorId = "bot_1";
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(
        state,
        state.players[0].actionOptions,
        [],
        [card(4, "diamonds"), card(5, "clubs")]
    );
    const turnNode = built.tree.actions.find(entry => entry.action.type === "check")
        .child.actions.find(entry => entry.action.type === "check").child;
    assert.equal(turnNode.actor, 1);
});


test("le moteur signale le fallback uniforme si toutes les combos pondérées sont bloquées", async () => {
    const app = loadStrategy();
    app.PokerLabPostflopSolver.getOpponentRange = async () => ({
        label: "blocked-range",
        combos: [{
            cards: [card(2, "clubs"), card(5, "clubs")],
            weight: 100
        }]
    });
    const result = await app.PokerLabPostflopStrategy.solvePostflop(riverState(), [], {
        iterations: 20,
        samples: 8
    });
    assert.equal(result.rangeUsed, false);
    assert.equal(result.rangeLabel, "Range large (combinaisons bloquées)");
});


test("l'interface déclenche CFR+ sur le flop, le turn et la river", () => {
    const ui = fs.readFileSync("js/modules/postflop-solver-ui.js", "utf8");
    assert.match(ui, /PokerLabPostflopStrategy\.solvePostflop\(solverInput\)/);
    assert.doesNotMatch(ui, /initialState\.street === ["']river["']/);
    assert.match(ui, /"Détails stratégiques — " \+ strategy\.street/);
});


test("un check adverse déjà joué ferme le tour si le héros check à son tour", () => {
    const app = loadStrategy();
    const state = riverState();
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(
        state,
        state.players[0].actionOptions,
        ["BB:check"],
        [],
        1
    );
    const heroCheck = built.tree.actions.find(entry => entry.action.type === "check");
    assert.ok(heroCheck);
    assert.equal(heroCheck.child.terminal, true);
    assert.equal(heroCheck.child.type, "showdown");
});


test("une relance est plafonnée au tapis adverse sans exiger que le héros soit à tapis", () => {
    const app = loadStrategy();
    const state = riverState();
    state.pot = 15;
    state.players[0].stack = 100;
    state.players[1].stack = 3;
    state.players[1].streetBet = 5;
    state.players[0].actionOptions = {
        canFold: true, canCall: true, canRaise: true,
        minimumRaiseTo: 15, maximumRaiseTo: 100, isAllIn: false
    };
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(state, state.players[0].actionOptions);
    const raise = built.tree.actions.find(entry => entry.action.label === "raise_effective");
    assert.ok(raise);
    assert.equal(raise.action.amount, 8);
});


test("le message de repli UI ne prétend pas limiter CFR+ à la river", () => {
    const ui = fs.readFileSync("js/modules/postflop-solver-ui.js", "utf8");
    assert.doesNotMatch(ui, /limité à la river/);
    assert.match(ui, /Fréquences stratégiques indisponibles pour cette situation/);
});


test("les montants de l'arbre stratégique respectent l'unité de 0,5 jeton", () => {
    const app = loadStrategy();
    const state = riverState();
    state.pot = 11;
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(state, state.players[0].actionOptions);
    const amounts = [];
    function visit(node) {
        if (!node || node.terminal) return;
        for (const entry of node.actions) {
            if (entry.action.amount > 0) amounts.push(entry.action.amount);
            visit(entry.child);
        }
    }
    visit(built.tree);
    assert.ok(amounts.length > 0);
    assert.ok(amounts.every(amount => Math.abs(amount * 2 - Math.round(amount * 2)) < 0.000001));
});

test("une relance postflop respecte la dernière relance complète de la street", () => {
    const app = loadStrategy();
    const state = riverState();
    state.players[1].streetBet = 3.5;
    state.lastFullRaise = 3.5;
    state.pot = 17;
    state.players[0].actionOptions = { canFold: true, canCall: true, canRaise: true };
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(state, state.players[0].actionOptions);
    const raise = built.tree.actions.find(entry => entry.action.type === "raise");
    assert.ok(raise);
    assert.ok(raise.action.amount >= 7);
});


test("un short all-in inférieur à la relance minimale ne rouvre pas les enchères", () => {
    const app = loadStrategy();
    const state = riverState();
    state.pot = 1;
    state.players[1].stack = 0.5;
    state.players[0].hasActed = false;
    state.players[0].lastActedBet = 0;
    state.players[1].hasActed = false;
    state.players[1].lastActedBet = 0;
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(
        state,
        { canCheck: true, canBet: true, canRaise: true, minimumBet: 1, maximumBet: 20 }
    );
    const heroCheck = built.tree.actions.find(entry => entry.action.type === "check");
    const shortBet = heroCheck.child.actions.find(entry => entry.action.type === "bet");
    assert.ok(shortBet);
    assert.equal(shortBet.action.amount, 0.5);
    assert.deepEqual(
        Array.from(shortBet.child.actions, entry => entry.action.type),
        ["fold", "call"]
    );
});

test("une mise complète rouvre le droit de relance d'un joueur ayant déjà checké", () => {
    const app = loadStrategy();
    const state = riverState();
    state.pot = 1;
    state.players[1].stack = 10;
    state.players[0].hasActed = false;
    state.players[0].lastActedBet = 0;
    state.players[1].hasActed = false;
    state.players[1].lastActedBet = 0;
    const built = app.PokerLabPostflopStrategy.buildDecisionTree(
        state,
        { canCheck: true, canBet: true, canRaise: true, minimumBet: 1, maximumBet: 20 }
    );
    const heroCheck = built.tree.actions.find(entry => entry.action.type === "check");
    const fullBet = heroCheck.child.actions.find(entry =>
        entry.action.type === "bet" && entry.action.amount >= 1
    );
    assert.ok(fullBet);
    assert.ok(fullBet.child.actions.some(entry => entry.action.type === "raise"));
});


test("l'arbre interdit une seconde relance après une relance déjà effectuée dans la street", () => {
    const app = loadStrategy();
    const state = riverState();
    state.pot = 20;
    state.players[0].streetBet = 5;
    state.players[0].hasActed = true;
    state.players[0].lastActedBet = 5;
    state.players[1].streetBet = 15;
    state.players[0].actionOptions = {
        canFold: true,
        canCall: true,
        canRaise: true,
        minimumRaiseTo: 25,
        maximumRaiseTo: 100
    };

    const built = app.PokerLabPostflopStrategy.buildDecisionTree(
        state,
        state.players[0].actionOptions,
        ["BTN:bet:5", "BB:raise:15"],
        [],
        0,
        1
    );

    assert.deepEqual(
        Array.from(built.tree.actions, entry => entry.action.label),
        ["fold", "call"]
    );
});


test("solvePostflop tient compte des relances déjà présentes dans l'historique réel", async () => {
    const app = loadStrategy();
    const state = riverState();
    state.pot = 20;
    state.players[0].streetBet = 5;
    state.players[0].stack = 20;
    state.players[0].hasActed = true;
    state.players[0].lastActedBet = 5;
    state.players[0].amountToCall = 10;
    state.players[0].actionOptions = {
        canFold: true,
        canCall: true,
        canRaise: true,
        minimumRaiseTo: 25,
        maximumRaiseTo: 25
    };
    state.players[1].streetBet = 15;
    state.players[1].stack = 20;

    const history = [
        {
            type: "player_action",
            street: "river",
            data: { playerId: "hero", action: "bet", amount: 5 }
        },
        {
            type: "player_action",
            street: "river",
            data: { playerId: "bot_1", action: "short_raise", amount: 10 }
        }
    ];

    const result = await app.PokerLabPostflopStrategy.solvePostflop(
        state,
        history,
        { iterations: 10, samples: 8 }
    );

    assert.deepEqual(
        Array.from(result.actions, action => action.action).sort(),
        ["call", "fold"]
    );
});
