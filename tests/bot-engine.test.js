"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadPokerLab() {
    const deterministicMath = Object.create(Math);
    deterministicMath.random = () => 0.5;

    const context = {
        console,
        Date,
        JSON,
        Math: deterministicMath,
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
        "js/core/game-engine.js",
        "js/bots/bot-profiles.js",
        "js/bots/bot-engine.js"
    ]) {
        vm.runInContext(fs.readFileSync(path, "utf8"), context, {
            filename: path
        });
    }

    return context;
}

function players() {
    return [
        {
            id: "hero",
            name: "Hero",
            stack: 100,
            isHuman: true,
            isBot: false
        },
        {
            id: "bot",
            name: "Bot",
            stack: 100,
            isHuman: false,
            isBot: true,
            botProfile: "balanced",
            botDifficulty: "medium"
        }
    ];
}

function createEngine(app, dealerIndex = 0) {
    return new app.PokerLabGameEngine({
        players: players(),
        dealerIndex,
        smallBlind: 0.5,
        bigBlind: 1
    });
}

function assertValidDecision(decision) {
    assert.ok([
        "fold",
        "check",
        "call",
        "bet",
        "raise",
        "all-in"
    ].includes(decision.action));

    if (decision.action === "bet") {
        assert.ok(Number.isFinite(decision.amount));
        assert.ok(decision.amount > 0);
        assert.ok(Number.isInteger(decision.amount * 2));
    }

    if (decision.action === "raise") {
        assert.ok(Number.isFinite(decision.raiseTo));
        assert.ok(Number.isInteger(decision.raiseTo * 2));
    }
}

test("les profils et niveaux de difficulté sont accessibles", () => {
    const app = loadPokerLab();

    for (const profile of ["nit", "tag", "lag", "balanced"]) {
        assert.ok(app.PokerLabBotProfiles.getProfile(profile));
    }

    for (const difficulty of ["easy", "medium", "hard"]) {
        assert.ok(app.PokerLabBotProfiles.getDifficulty(difficulty));
    }
});

test("le moteur bot retourne une décision valide préflop", () => {
    const app = loadPokerLab();
    const decision = app.PokerLabBotEngine.decide({
        holeCards: [
            { value: 14, suit: "spades" },
            { value: 13, suit: "hearts" }
        ],
        communityCards: [],
        pot: 1.5,
        callAmount: 0.5,
        currentBet: 1,
        currentContribution: 0.5,
        minRaise: 1,
        bigBlind: 1,
        stack: 99.5,
        street: "preflop",
        position: "BTN/SB",
        opponentsRemaining: 1,
        canRaise: true,
        profile: "balanced",
        difficulty: "medium"
    });

    assertValidDecision(decision);
});

test("le moteur bot retourne une décision valide postflop", () => {
    const app = loadPokerLab();
    const decision = app.PokerLabBotEngine.decide({
        holeCards: [
            { value: 14, suit: "spades" },
            { value: 13, suit: "hearts" }
        ],
        communityCards: [
            { value: 14, suit: "clubs" },
            { value: 8, suit: "diamonds" },
            { value: 3, suit: "hearts" }
        ],
        pot: 2,
        callAmount: 0,
        currentBet: 0,
        currentContribution: 0,
        minRaise: 1,
        bigBlind: 1,
        stack: 99,
        street: "flop",
        position: "BB",
        opponentsRemaining: 1,
        canRaise: true,
        profile: "balanced",
        difficulty: "medium"
    });

    assertValidDecision(decision);
});

test("une décision bot préflop est acceptée par le moteur de jeu", () => {
    const app = loadPokerLab();
    const engine = createEngine(app, 1);
    engine.startHand();

    assert.equal(engine.getState().currentPlayerId, "bot");

    const played = engine.playBotTurn("bot");
    assertValidDecision(played.decision);
    assert.ok(played.result);
    assert.ok(
        played.state.handComplete ||
        played.state.currentPlayerId === "hero"
    );
});

test("une décision bot postflop est acceptée par le moteur de jeu", () => {
    const app = loadPokerLab();
    const engine = createEngine(app, 0);
    engine.startHand();

    engine.act("call", null, "hero");
    engine.act("check", null, "bot");

    assert.equal(engine.getState().street, "flop");
    assert.equal(engine.getState().currentPlayerId, "bot");

    const played = engine.playBotTurn("bot");
    assertValidDecision(played.decision);
    assert.ok(played.result);
    assert.ok(
        played.state.handComplete ||
        played.state.currentPlayerId === "hero"
    );
});
