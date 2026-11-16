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
