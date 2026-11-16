"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadGameEngine() {
    const context = {
        console,
        Date,
        JSON,
        Math,
        Set,
        Map,
        Uint32Array
    };

    context.window = context;
    vm.createContext(context);

    for (const path of [
        "js/core/deck.js",
        "js/core/poker-rules.js",
        "js/core/evaluator.js",
        "js/core/game-engine.js"
    ]) {
        vm.runInContext(fs.readFileSync(path, "utf8"), context, {
            filename: path
        });
    }

    return context;
}

function createPlayers(count = 2, stack = 100) {
    return Array.from({ length: count }, (_, index) => ({
        id: index === 0 ? "hero" : `player_${index}`,
        name: index === 0 ? "Hero" : `Player ${index}`,
        stack,
        isHuman: index === 0,
        isBot: index !== 0,
        botProfile: "balanced",
        botDifficulty: "medium"
    }));
}

function createEngine(app, count = 2, stack = 100, dealerIndex = 0) {
    return new app.PokerLabGameEngine({
        players: createPlayers(count, stack),
        dealerIndex,
        smallBlind: 0.5,
        bigBlind: 1
    });
}

function cardIds(cards) {
    return cards.map(card => card.id);
}

test("une main distribue deux cartes distinctes à chaque joueur", () => {
    const app = loadGameEngine();
    const engine = createEngine(app, 6);
    engine.startHand();

    const dealtCards = engine.players.flatMap(player => player.holeCards);
    const ids = cardIds(dealtCards);

    assert.equal(dealtCards.length, 12);
    assert.equal(new Set(ids).size, 12);
    assert.ok(dealtCards.every(card => card && card.value >= 2 && card.value <= 14));
});

test("le heads-up respecte les positions et l'ordre de parole", () => {
    const app = loadGameEngine();
    const engine = createEngine(app);
    let state = engine.startHand();

    assert.equal(engine.players[0].position, "BTN/SB");
    assert.equal(engine.players[1].position, "BB");
    assert.equal(state.currentPlayerId, "hero");

    engine.act("call", null, "hero");
    assert.equal(engine.getState().currentPlayerId, "player_1");

    engine.act("check", null, "player_1");
    state = engine.getState();

    assert.equal(state.street, "flop");
    assert.equal(state.board.length, 3);
    assert.equal(state.currentPlayerId, "player_1");
});

test("le 6-max fait parler UTG en premier préflop", () => {
    const app = loadGameEngine();
    const engine = createEngine(app, 6);
    const state = engine.startHand();

    assert.deepEqual(
        Array.from(engine.players, player => player.position),
        ["BTN", "SB", "BB", "UTG", "HJ", "CO"]
    );
    assert.equal(state.currentPlayerId, "player_3");
});

test("les cartes adverses restent masquées dans l'état public", () => {
    const app = loadGameEngine();
    const engine = createEngine(app);
    engine.startHand();

    const state = engine.getState();
    const hero = state.players.find(player => player.id === "hero");
    const opponent = state.players.find(player => player.id === "player_1");

    assert.equal(hero.holeCards.length, 2);
    assert.equal(opponent.holeCards, null);
});

test("l'historique conserve les actions préflop et le changement de street", () => {
    const app = loadGameEngine();
    const engine = createEngine(app);
    engine.startHand();

    engine.act("call", null, "hero");
    engine.act("check", null, "player_1");

    const history = engine.getHandHistory();
    const actions = history.filter(event => event.type === "player_action");

    assert.deepEqual(
        Array.from(actions, event => [event.data.playerId, event.data.action]),
        [["hero", "call"], ["player_1", "check"]]
    );
    assert.ok(history.some(event =>
        event.type === "street_changed" &&
        event.street === "flop" &&
        event.data.board.length === 3
    ));
});

test("l'historique retourné est une copie indépendante", () => {
    const app = loadGameEngine();
    const engine = createEngine(app);
    engine.startHand();
    engine.act("fold", null, "hero");

    const history = engine.getHandHistory();
    history[0].type = "tampered";
    history[0].data.smallBlind = 999;

    const freshHistory = engine.getHandHistory();
    assert.notEqual(freshHistory[0].type, "tampered");
    assert.notEqual(freshHistory[0].data.smallBlind, 999);
});

test("une main non contestée attribue le pot au dernier joueur restant", () => {
    const app = loadGameEngine();
    const engine = createEngine(app);
    engine.startHand();

    engine.act("fold", null, "hero");

    const state = engine.getState();
    assert.equal(state.handComplete, true);
    assert.equal(state.result.type, "uncontested");
    assert.deepEqual(Array.from(state.result.winnerIds), ["player_1"]);
    assert.equal(state.result.totalPot, 1.5);
    assert.equal(state.players.find(player => player.id === "player_1").stack, 100.5);
});

test("une mise d'ouverture inférieure à la big blind est refusée hors tapis", () => {
    const app = loadGameEngine();
    const engine = createEngine(app);
    engine.startHand();

    engine.act("call", null, "hero");
    engine.act("check", null, "player_1");

    assert.equal(engine.getState().street, "flop");
    assert.throws(
        () => engine.act("bet", 0.5, "player_1"),
        /mise minimale/i
    );
    assert.equal(engine.getState().pot, 2);
});


test("l'historique conserve les montants exacts d'une mise et d'une relance", () => {
    const app = loadGameEngine();
    const engine = createEngine(app);
    engine.startHand();

    engine.act("call", null, "hero");
    engine.act("check", null, "player_1");
    engine.act("bet", 3, "player_1");
    engine.act("raise", 9, "hero");

    const actions = engine.getHandHistory().filter(event =>
        event.type === "player_action" &&
        ["bet", "raise"].includes(event.data.action)
    );

    assert.equal(actions.length, 2);

    const bet = actions[0].data;
    assert.equal(bet.potBefore, 2);
    assert.equal(bet.potAfter, 5);
    assert.equal(bet.currentBetBefore, 0);
    assert.equal(bet.currentBetAfter, 3);
    assert.equal(bet.streetBetBefore, 0);
    assert.equal(bet.streetBetAfter, 3);
    assert.equal(bet.betTo, 3);
    assert.equal(bet.raiseSize, 3);
    assert.equal(bet.isFullRaise, true);

    const raise = actions[1].data;
    assert.equal(raise.potBefore, 5);
    assert.equal(raise.potAfter, 14);
    assert.equal(raise.currentBetBefore, 3);
    assert.equal(raise.currentBetAfter, 9);
    assert.equal(raise.streetBetBefore, 0);
    assert.equal(raise.streetBetAfter, 9);
    assert.equal(raise.raiseTo, 9);
    assert.equal(raise.raiseSize, 6);
    assert.equal(raise.isFullRaise, true);
});


test("les pots principal et secondaires respectent les niveaux de contribution", () => {
    const app = loadGameEngine();
    const engine = createEngine(app, 3);
    engine.startHand();

    const [hero, second, third] = engine.players;
    hero.totalContribution = 50;
    second.totalContribution = 100;
    third.totalContribution = 150;

    const pots = engine.buildSidePots();

    assert.deepEqual(
        Array.from(pots, pot => [pot.amount, pot.lowerLevel, pot.upperLevel]),
        [[150, 0, 50], [100, 50, 100], [50, 100, 150]]
    );
    assert.deepEqual(
        Array.from(pots, pot => Array.from(pot.eligiblePlayerIds)),
        [
            ["hero", "player_1", "player_2"],
            ["player_1", "player_2"],
            ["player_2"]
        ]
    );
    assert.equal(pots.reduce((sum, pot) => sum + pot.amount, 0), 300);
});

test("les contributions d'un joueur foldé restent dans les pots sans lui donner de droit au gain", () => {
    const app = loadGameEngine();
    const engine = createEngine(app, 3);
    engine.startHand();

    const [hero, second, third] = engine.players;
    hero.totalContribution = 50;
    second.totalContribution = 100;
    third.totalContribution = 100;
    hero.folded = true;

    const pots = engine.buildSidePots();

    assert.deepEqual(
        Array.from(pots, pot => pot.eligiblePlayerIds),
        [["player_1", "player_2"], ["player_1", "player_2"]]
    );
    assert.equal(pots.reduce((sum, pot) => sum + pot.amount, 0), 250);
});

test("un pot secondaire non couvert est restitué au seul joueur éligible", () => {
    const app = loadGameEngine();
    const engine = createEngine(app, 3);
    engine.startHand();

    const [hero, second, third] = engine.players;
    hero.totalContribution = 20;
    second.totalContribution = 20;
    third.totalContribution = 50;

    const pots = engine.buildSidePots();
    assert.deepEqual(
        Array.from(pots, pot => [pot.amount, pot.eligiblePlayerIds]),
        [[60, ["hero", "player_1", "player_2"]], [30, ["player_2"]]]
    );

    const before = third.stack;
    const returned = engine.distributePot(
        pots[1],
        [{ player: third, evaluation: { score: [1] } }]
    );

    assert.equal(returned.amount, 30);
    assert.deepEqual(Array.from(returned.winnerIds), ["player_2"]);
    assert.equal(third.stack, before + 30);
});

test("le partage d'un pot impair attribue le demi-jeton selon l'ordre du bouton", () => {
    const app = loadGameEngine();
    const engine = createEngine(app);
    engine.startHand();

    const hero = engine.players[0];
    const opponent = engine.players[1];
    const heroBefore = hero.stack;
    const opponentBefore = opponent.stack;

    const result = engine.distributePot(
        { amount: 1.5, eligiblePlayerIds: ["hero", "player_1"] },
        [
            { player: hero, evaluation: { score: [2, 14] } },
            { player: opponent, evaluation: { score: [2, 14] } }
        ]
    );

    assert.equal(result.isTie, true);
    assert.equal(hero.stack, heroBefore + 0.5);
    assert.equal(opponent.stack, opponentBefore + 1);
    assert.deepEqual(Array.from(result.oddChipRecipients), ["player_1"]);
});

test("les relances courtes cumulées ne rouvrent les enchères qu'au seuil complet", () => {
    const app = loadGameEngine();
    const engine = createEngine(app, 3);
    engine.startHand();

    const hero = engine.players[0];
    hero.hasActed = true;
    hero.lastActedBet = 5;
    engine.lastFullRaise = 5;

    engine.currentBet = 9;
    assert.equal(engine.canPlayerRaise(hero), false);

    engine.currentBet = 10;
    assert.equal(engine.canPlayerRaise(hero), true);
});


test("la distribution de tous les pots conserve exactement les jetons", () => {
    const app = loadGameEngine();
    const engine = createEngine(app, 3);
    engine.startHand();

    const [hero, second, third] = engine.players;
    hero.totalContribution = 20;
    second.totalContribution = 20;
    third.totalContribution = 50;
    hero.stack = 80;
    second.stack = 80;
    third.stack = 50;

    const totalBefore = engine.players.reduce(
        (sum, player) => sum + player.stack + player.totalContribution,
        0
    );
    const pots = engine.buildSidePots();
    const evaluations = [
        { player: hero, evaluation: { score: [4, 14] } },
        { player: second, evaluation: { score: [1, 14] } },
        { player: third, evaluation: { score: [3, 10] } }
    ];

    for (const pot of pots) {
        engine.distributePot(pot, evaluations);
    }

    const totalAfter = engine.players.reduce(
        (sum, player) => sum + player.stack,
        0
    );

    assert.equal(totalBefore, 300);
    assert.equal(totalAfter, totalBefore);
    assert.equal(hero.stack, 140);
    assert.equal(third.stack, 80);
});
