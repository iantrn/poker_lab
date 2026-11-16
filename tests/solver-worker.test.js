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
        "./js/bots/bot-profiles.js",
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


test("l'interface délègue les calculs au Worker et annule les requêtes obsolètes", () => {
    const ui = fs.readFileSync(
        path.join(__dirname, "..", "js/modules/postflop-solver-ui.js"),
        "utf8"
    );

    const orchestrator = fs.readFileSync(
        path.join(__dirname, "..", "js/modules/solver-precompute.js"),
        "utf8"
    );
    assert.match(orchestrator, /new global\.Worker\(WORKER_URL\)/);
    assert.match(orchestrator, /function cancel\(reason\)/);
    assert.match(orchestrator, /new global\.AbortController\(\)/);
    assert.match(orchestrator, /MAX_CACHE_ENTRIES/);
    assert.match(orchestrator, /task\.worker\.terminate\(\)/);
    assert.match(ui, /PokerLabSolverPrecompute\.getOrStart\(\)/);
    assert.match(ui, /error\.name === "AbortError"/);
    assert.doesNotMatch(ui, /global\.PokerLabPostflopSolver\.analyse\(solverInput\)/);
});


test("SOLVE présente les résultats dans une boîte de dialogue native refermable", () => {
    const ui = fs.readFileSync(
        path.join(__dirname, "..", "js/modules/postflop-solver-ui.js"),
        "utf8"
    );
    const css = fs.readFileSync(
        path.join(__dirname, "..", "css/style.css"),
        "utf8"
    );

    assert.match(ui, /element\("dialog", "pl-solve-dialog"\)/);
    assert.match(ui, /dialog\.showModal\(\)/);
    assert.match(ui, /dialog\.close\(\)/);
    assert.match(ui, /aria-labelledby/);
    assert.match(ui, /aria-label", "Fermer l'analyse SOLVE"/);
    assert.match(ui, /event\.target === dialog/);
    assert.match(css, /\.pl-solve-dialog::backdrop/);
    assert.match(css, /\.pl-solve-dialog-close:focus-visible/);
});


test("le pré-calcul est déclenché sur les transitions d'état de la table", () => {
    const training = fs.readFileSync(
        path.join(__dirname, "..", "js/modules/training.js"),
        "utf8"
    );
    const ui = fs.readFileSync(
        path.join(__dirname, "..", "js/modules/postflop-solver-ui.js"),
        "utf8"
    );
    assert.match(training, /dispatch\("pokerlab:table-state-changed"/);
    assert.match(ui, /addEventListener\("pokerlab:table-state-changed", sync\)/);
    assert.match(ui, /PokerLabSolverPrecompute\.onStateChange\(\)/);
});
