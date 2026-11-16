"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function createBrowserContext(fetcher = async () => ({
    ok: true,
    json: async () => ({})
})) {
    const values = new Map();
    const events = [];
    const window = {
        dispatchEvent(event) {
            events.push(event);
            return true;
        },
        addEventListener() {},
        crypto: {
            randomUUID: () => "test-hand-id"
        }
    };
    const localStorage = {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        }
    };
    const document = {
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };
    const context = {
        window,
        document,
        localStorage,
        fetch: fetcher,
        CustomEvent: class CustomEvent {
            constructor(type, options = {}) {
                this.type = type;
                this.detail = options.detail;
            }
        },
        HTMLElement: class HTMLElement {},
        console,
        Date,
        Math,
        Set,
        Map,
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Error,
        TypeError
    };
    vm.createContext(context);
    return { context, window, localStorage, events };
}

function loadModule(relativePath, globalName, fetcher) {
    const browser = createBrowserContext(fetcher);
    vm.runInContext(read(relativePath), browser.context, {
        filename: relativePath
    });
    return {
        ...browser,
        module: browser.window[globalName]
    };
}

test("le catalogue de leçons contient des identifiants uniques et des sections valides", () => {
    const data = JSON.parse(read("data/lessons/lessons.json"));
    const { module } = loadModule("js/modules/lessons.js", "PokerLabLessons");

    assert.equal(data.version, 1);
    assert.ok(data.lessons.length >= 5);
    assert.equal(module.validateCollection(data.lessons).valid, true);

    const duplicate = [data.lessons[0], { ...data.lessons[0] }];
    assert.equal(module.validateCollection(duplicate).valid, false);
});

test("le module de leçons charge le catalogue et conserve une progression valide", async () => {
    const data = JSON.parse(read("data/lessons/lessons.json"));
    const { module, localStorage } = loadModule(
        "js/modules/lessons.js",
        "PokerLabLessons",
        async () => ({ ok: true, json: async () => data })
    );

    const result = await module.loadLessons();
    assert.equal(result.success, true);
    assert.equal(result.count, data.lessons.length);
    assert.equal(module.getNextLesson().id, data.lessons[0].id);

    module.openLesson(data.lessons[0].id);
    module.completeLesson(data.lessons[0].id);

    assert.equal(module.isCompleted(data.lessons[0].id), true);
    assert.equal(module.getProgress().completed, 1);
    assert.ok(localStorage.getItem("pokerlab_lessons_progress"));
});

test("les exercices ont des actions et des identifiants uniques", () => {
    const data = JSON.parse(read("data/puzzles/puzzles.json"));
    const { module } = loadModule("js/modules/puzzles.js", "PokerLabPuzzles");

    assert.equal(data.version, 1);
    assert.ok(data.puzzles.length >= 6);
    assert.equal(module.validatePuzzleCollection(data.puzzles).valid, true);

    const duplicate = [data.puzzles[0], { ...data.puzzles[0] }];
    assert.equal(module.validatePuzzleCollection(duplicate).valid, false);

    const invalid = {
        ...data.puzzles[0],
        options: [{ action: "teleport", label: "Action invalide" }]
    };
    assert.equal(module.validatePuzzle(invalid).valid, false);
});

test("le module de tactiques charge, filtre et corrige un exercice sans exposer sa solution", async () => {
    const data = JSON.parse(read("data/puzzles/puzzles.json"));
    const { module } = loadModule(
        "js/modules/puzzles.js",
        "PokerLabPuzzles",
        async () => ({ ok: true, json: async () => data })
    );

    const loaded = await module.loadPuzzles();
    assert.equal(loaded.success, true);
    assert.equal(loaded.count, data.puzzles.length);

    const preflop = module.filterPuzzles({ category: "Préflop" });
    assert.ok(preflop.length > 0);
    assert.ok(preflop.every(puzzle => puzzle.category === "Préflop"));

    const selected = module.selectPuzzle(preflop[0].id);
    assert.equal(selected.success, true);
    assert.equal(Object.prototype.hasOwnProperty.call(selected.puzzle, "solution"), false);

    const result = module.submitAnswer(preflop[0].solution.action);
    assert.equal(result.success, true);
    assert.equal(result.correct, true);
    assert.equal(module.submitAnswer(preflop[0].solution.action).success, false);
    assert.equal(module.getStatistics().correct, 1);
});

test("Game Review accepte une main terminée et refuse les actions invalides", () => {
    const { module, localStorage } = loadModule(
        "js/modules/game-review.js",
        "PokerLabGameReview"
    );

    const hand = {
        id: "session-1-hand-1",
        players: [
            { id: "hero", name: "Vous", stack: 100 },
            { id: "bot", name: "Bot", stack: 100, folded: true }
        ],
        board: [],
        actions: [
            { street: "preflop", playerId: "hero", type: "raise", amount: 2 },
            { street: "preflop", playerId: "bot", type: "fold", amount: 0 }
        ]
    };

    assert.equal(module.validateHand(hand).valid, true);
    assert.equal(module.saveHand(hand).success, true);
    assert.equal(module.getAllHands().length, 1);
    assert.ok(localStorage.getItem("pokerlab_game_review"));

    const invalid = {
        ...hand,
        id: "invalid",
        actions: [{ street: "complete", playerId: "hero", type: "teleport" }]
    };
    assert.equal(module.validateHand(invalid).valid, false);
});


test("les modules pédagogiques sont reliés à la navigation et aux sections HTML", () => {
    const html = read("index.html");
    const app = read("js/app.js");

    for (const page of ["tactics", "lessons", "review"]) {
        assert.match(html, new RegExp(`data-module=["']${page}["']`));
        assert.match(app, new RegExp(`\\b${page}: window\\.PokerLab`));
    }

    for (const selector of [
        "data-puzzles-container",
        "data-puzzle-category",
        "data-puzzle-difficulty",
        "data-lessons-catalog",
        "data-lesson-content",
        "data-lessons-progress",
        "data-review-history",
        "data-review-detail"
    ]) {
        assert.ok(html.includes(selector), `Conteneur absent : ${selector}`);
    }

    for (const modulePath of [
        "./js/modules/puzzles.js",
        "./js/modules/lessons.js",
        "./js/modules/game-review.js"
    ]) {
        assert.ok(html.includes(`src="${modulePath}"`), `Script non chargé : ${modulePath}`);
    }
});

test("les mains terminées sont enregistrées avec un snapshot public du moteur", () => {
    const training = read("js/modules/training.js");
    const engine = read("js/core/game-engine.js");

    assert.match(training, /function saveCompletedHand\(state\)/);
    assert.match(training, /PokerLabGameReview\.saveHand\(hand\)/);
    assert.match(training, /gameEngine\.getHandHistory\(\)/);
    assert.match(engine, /Ne jamais exposer les cartes adverses avant le showdown/);
    assert.match(engine, /this\.handComplete\s*&&\s*this\.lastResult\?\.type\s*===\s*"showdown"/);
});
