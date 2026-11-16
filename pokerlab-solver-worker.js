"use strict";

// The solver modules are classic browser scripts and export through window.
// A dedicated worker has no Window object, so expose its own global as window.
self.window = self;

importScripts(
    "./js/core/evaluator.js",
    "./js/bots/bot-profiles.js",
    "./js/modules/postflop-solver.js",
    "./js/modules/cfr-core.js",
    "./js/modules/postflop-strategy.js"
);

self.addEventListener("message", async event => {
    const message = event.data || {};
    const { id, task, input } = message;

    if (!Number.isInteger(id)) return;

    try {
        let result;
        self.postMessage({ id, progress: 0, phase: task + "_started" });

        if (task === "equity") {
            if (!self.PokerLabPostflopSolver) {
                throw new Error("Le moteur d'équité n'est pas disponible dans le Worker.");
            }
            result = await self.PokerLabPostflopSolver.analyse(input);
        } else if (task === "strategy") {
            if (!self.PokerLabPostflopStrategy) {
                throw new Error("Le moteur CFR+ n'est pas disponible dans le Worker.");
            }
            result = await self.PokerLabPostflopStrategy.solvePostflop(input);
        } else {
            throw new Error("Tâche de solveur inconnue.");
        }

        self.postMessage({ id, progress: 1, phase: task + "_completed" });
        self.postMessage({
            id,
            ok: true,
            result
        });
    } catch (error) {
        self.postMessage({
            id,
            ok: false,
            error: error && error.message
                ? error.message
                : String(error)
        });
    }
});
