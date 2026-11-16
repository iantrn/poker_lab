"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const workerSource = fs.readFileSync(
    path.join(__dirname, "..", "pokerlab-solver-worker.js"),
    "utf8"
);

function createWorkerHarness() {
    const messages = [];
    const importedScripts = [];
    let handler = null;

    const self = {
        addEventListener(type, callback) {
            if (type === "message") handler = callback;
        },
        postMessage(message) {
            messages.push(message);
        },
        PokerLabPostflopSolver: {
            async analyse(input) {
                return { task: "equity", input };
            }
        },
        PokerLabPostflopStrategy: {
            async solvePostflop(input) {
                return { task: "strategy", input };
            }
        }
    };
    self.window = self;

    const context = {
        self,
        window: self,
        importScripts(...scripts) {
            importedScripts.push(...scripts);
        },
        Promise,
        Error,
        String,
        Number
    };

    vm.createContext(context);
    vm.runInContext(workerSource, context, {
        filename: "pokerlab-solver-worker.js"
    });

    return {
        self,
        messages,
        importedScripts,
        async send(data) {
            assert.equal(typeof handler, "function");
            await handler({ data });
            return messages.at(-1);
        }
    };
}

test("le Worker charge les modules de calcul depuis la racine de l'application", () => {
    const harness = createWorkerHarness();

    assert.equal(harness.self.window, harness.self);
    assert.deepEqual(harness.importedScripts, [
        "./js/core/evaluator.js",
        "./js/modules/postflop-solver.js",
        "./js/modules/cfr-core.js",
        "./js/modules/postflop-strategy.js"
    ]);
});

test("le Worker traite les tâches d'équité et de stratégie avec un identifiant de requête", async () => {
    const harness = createWorkerHarness();

    const equity = await harness.send({
        id: 1,
        task: "equity",
        input: { spot: "flop" }
    });
    assert.equal(equity.id, 1);
    assert.equal(equity.ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(equity.result)), {
        task: "equity",
        input: { spot: "flop" }
    });

    const strategy = await harness.send({
        id: 2,
        task: "strategy",
        input: { spot: "river" }
    });
    assert.equal(strategy.id, 2);
    assert.equal(strategy.ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(strategy.result)), {
        task: "strategy",
        input: { spot: "river" }
    });
});

test("le Worker renvoie une erreur structurée pour une tâche inconnue", async () => {
    const harness = createWorkerHarness();
    const response = await harness.send({
        id: 3,
        task: "unknown",
        input: {}
    });

    assert.equal(response.id, 3);
    assert.equal(response.ok, false);
    assert.match(response.error, /Tâche de solveur inconnue/);
});
