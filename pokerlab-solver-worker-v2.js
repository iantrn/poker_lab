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

// The V1 worker is retained as an immutable fallback/oracle.
// This V2 classic worker loads ES-module WASM glue using dynamic import().
// When unavailable the original evaluator remains active.
let backendPromise = null;
let backend = "legacy";
async function installFastEvaluator() {
    if (backendPromise) return backendPromise;
    backendPromise = (async () => {
        try {
            const wasm = await import("./wasm/pokerlab_engine.js");
            await wasm.default(new URL("./wasm/pokerlab_engine_bg.wasm", self.location.href));
            const old = self.PokerLabHandEvaluator;
            const suits = {clubs: 0, diamonds: 1, hearts: 2, spades: 3};
            // Current postflop equity and CFR+ paths only consume score.
            // Extra metadata stays lazily available for future consumers.
            self.PokerLabHandEvaluator = {
                ...old,
                evaluate(cards) {
                    if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) {
                        return old.evaluate(cards);
                    }
                    const packed = new Uint8Array(cards.length);
                    for (let index = 0; index < cards.length; index++) {
                        const card = cards[index];
                        if (!card || !Number.isInteger(card.value) ||
                            card.value < 2 || card.value > 14 ||
                            !Object.prototype.hasOwnProperty.call(suits, card.suit)) {
                            return old.evaluate(cards);
                        }
                        packed[index] = card.value | (suits[card.suit] << 4);
                    }
                    let score;
                    try {
                        score = Array.from(wasm.evaluate_score(packed));
                    } catch {
                        return old.evaluate(cards);
                    }
                    let full = null;
                    const stableCards = cards.slice();
                    const fullResult = () => full || (full = old.evaluate(stableCards));
                    return {
                        category: score[0], score,
                        get categoryKey() {return fullResult().categoryKey;},
                        get categoryLabel() {return fullResult().categoryLabel;},
                        get bestFiveCards() {return fullResult().bestFiveCards;},
                        get description() {return fullResult().description;}
                    };
                }
            };
            backend = "wasm";
        } catch (error) {
            backend = "legacy";
            console.warn("[PokerLab V2] WASM evaluator unavailable; falling back to JS:", error);
        }
    })();
    return backendPromise;
}

self.addEventListener("message", async event => {
    const message = event.data || {};
    const { id, task, input } = message;

    if (!Number.isInteger(id)) return;
    await installFastEvaluator();
    if (task === "backend") {
        self.postMessage({id, ok: true, result: {backend}});
        return;
    }

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
