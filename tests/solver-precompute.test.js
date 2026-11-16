"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("js/modules/solver-precompute.js", "utf8");

function createHarness(delay = 0) {
    const workers = [];
    let state = {
        handNumber: 1,
        street: "flop",
        handComplete: false,
        currentPlayerId: "hero",
        board: [{ value: 2, suit: "clubs" }, { value: 7, suit: "diamonds" }, { value: 9, suit: "hearts" }],
        players: [
            { id: "hero", isHuman: true, folded: false, holeCards: [{ value: 14, suit: "spades" }, { value: 14, suit: "hearts" }] },
            { id: "villain", isHuman: false, folded: false, holeCards: null }
        ]
    };

    class FakeWorker {
        constructor() {
            this.listeners = new Map();
            this.terminated = false;
            workers.push(this);
        }
        addEventListener(type, callback) {
            if (!this.listeners.has(type)) this.listeners.set(type, []);
            this.listeners.get(type).push(callback);
        }
        postMessage(message) {
            setTimeout(() => {
                if (this.terminated) return;
                const result = message.task === "equity"
                    ? { equity: 0.5, handNumber: message.input.state.handNumber }
                    : { actions: [], handNumber: message.input.state.handNumber };
                for (const callback of this.listeners.get("message") || []) {
                    callback({ data: { id: message.id, ok: true, result } });
                }
            }, delay);
        }
        terminate() {
            this.terminated = true;
        }
    }

    const context = {
        console,
        Map,
        Set,
        Promise,
        Error,
        AbortController,
        Worker: FakeWorker,
        setTimeout,
        clearTimeout,
        JSON,
        PokerLabTraining: {
            getGameState: () => state,
            getHandHistory: () => []
        },
        PokerLabPostflopSolver: {
            createInput(current) {
                return { schemaVersion: 1, state: JSON.parse(JSON.stringify(current)), history: [] };
            }
        }
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: "solver-precompute.js" });

    return {
        precompute: context.PokerLabSolverPrecompute,
        workers,
        setState(next) { state = next; }
    };
}

test("le pré-calcul automatique est réutilisé par Analyser puis servi depuis le cache", async () => {
    const harness = createHarness();
    harness.precompute.onStateChange();

    const inFlight = harness.precompute.getOrStart();
    const result = await inFlight;
    assert.equal(result.equity.handNumber, 1);
    assert.equal(result.strategy.handNumber, 1);
    assert.equal(harness.workers.length, 1);

    const cached = await harness.precompute.getOrStart();
    assert.deepEqual(JSON.parse(JSON.stringify(cached)), JSON.parse(JSON.stringify(result)));
    assert.equal(harness.workers.length, 1);
    assert.equal(harness.precompute.getCacheSize(), 1);
});

test("un changement d'état annule le calcul précédent et ne publie que le nouvel état", async () => {
    const harness = createHarness(25);
    harness.precompute.onStateChange();
    const obsolete = harness.precompute.getOrStart();

    harness.setState({
        handNumber: 2,
        street: "turn",
        handComplete: false,
        currentPlayerId: "hero",
        board: [
            { value: 2, suit: "clubs" },
            { value: 7, suit: "diamonds" },
            { value: 9, suit: "hearts" },
            { value: 11, suit: "spades" }
        ],
        players: [
            { id: "hero", isHuman: true, folded: false, holeCards: [{ value: 14, suit: "spades" }, { value: 14, suit: "hearts" }] },
            { id: "villain", isHuman: false, folded: false, holeCards: null }
        ]
    });
    harness.precompute.onStateChange();

    await assert.rejects(obsolete, error => error.name === "AbortError");
    const current = await harness.precompute.getOrStart();
    assert.equal(current.equity.handNumber, 2);
    assert.equal(current.strategy.handNumber, 2);
    assert.equal(harness.workers.length, 2);
    assert.equal(harness.workers[0].terminated, true);
});
