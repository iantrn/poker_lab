/* =========================================================
   POKERLAB - SOLVER PRECOMPUTATION ORCHESTRATOR
   Background analysis, versioning, cancellation and LRU cache.
   ========================================================= */
"use strict";

(function (global) {
    const MAX_CACHE_ENTRIES = 6;
    const WORKER_URL = "./pokerlab-solver-worker.js";
    const cache = new Map();
    const listeners = new Set();
    let worker = null;
    let taskSequence = 0;
    let stateVersion = 0;
    let active = null;

    function isEligible(state) {
        if (!state || state.handComplete ||
            !["flop", "turn", "river"].includes(state.street) ||
            !Array.isArray(state.players)) return false;
        const hero = state.players.find(player => player.isHuman);
        if (!hero || state.currentPlayerId !== hero.id ||
            !Array.isArray(hero.holeCards) || hero.holeCards.length !== 2) return false;
        return state.players.filter(player => !player.folded).length === 2;
    }

    function createContext() {
        const training = global.PokerLabTraining;
        const solver = global.PokerLabPostflopSolver;
        if (!training || !solver) return null;
        const state = training.getGameState();
        if (!isEligible(state)) return null;
        const input = solver.createInput(state, training.getHandHistory());
        return { input, key: JSON.stringify(input) };
    }

    function notify(snapshot) {
        listeners.forEach(listener => {
            try { listener(snapshot); } catch (error) {
                console.error("[PokerLab] Listener de pré-calcul en erreur :", error);
            }
        });
    }

    function touchCache(key) {
        if (!cache.has(key)) return null;
        const value = cache.get(key);
        cache.delete(key);
        cache.set(key, value);
        return value;
    }

    function storeCache(key, value) {
        cache.delete(key);
        cache.set(key, value);
        while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    }

    function ensureWorker() {
        if (worker) return worker;
        if (typeof global.Worker !== "function") {
            throw new Error("Les Web Workers ne sont pas disponibles. Le solveur reste désactivé pour préserver la fluidité de l'interface.");
        }
        worker = new global.Worker(WORKER_URL);
        worker.addEventListener("message", handleWorkerMessage);
        worker.addEventListener("error", handleWorkerError);
        return worker;
    }

    function handleWorkerMessage(event) {
        const task = active;
        const message = event.data || {};
        if (!task || task.controller.signal.aborted ||
            message.id !== task.requestId || task.version !== stateVersion) return;
        if (message.progress !== undefined) {
            notify({ key: task.key, version: task.version, phase: task.currentTask, progress: message.progress });
            return;
        }
        if (!message.ok) {
            const error = new Error(message.error || "Erreur du Worker de solveur.");
            if (task.currentTask === "strategy") {
                task.strategyError = error.message;
                settleSuccess(task);
            } else settleError(task, error);
            return;
        }
        if (task.currentTask === "equity") {
            task.equity = message.result;
            postTask(task, "strategy");
        } else if (task.currentTask === "strategy") {
            task.strategy = message.result;
            settleSuccess(task);
        }
    }

    function handleWorkerError(event) {
        if (active) settleError(active, new Error(event.message || "Le Worker du solveur a rencontré une erreur."));
    }

    function settleError(task, error) {
        if (!task || active !== task) return;
        active = null;
        if (task.worker) task.worker.terminate();
        if (worker === task.worker) worker = null;
        task.reject(error);
        notify({ key: task.key, version: task.version, phase: "error", error: error.message });
    }

    function settleSuccess(task) {
        if (!task || active !== task) return;
        const result = { equity: task.equity, strategy: task.strategy, strategyError: task.strategyError };
        storeCache(task.key, result);
        active = null;
        task.resolve(result);
        notify({ key: task.key, version: task.version, phase: "complete", result });
    }

    function postTask(task, type) {
        if (active !== task || task.controller.signal.aborted) return;
        task.currentTask = type;
        task.requestId = ++taskSequence;
        notify({ key: task.key, version: task.version, phase: type, progress: 0 });
        try {
            task.worker.postMessage({ id: task.requestId, task: type, input: task.input });
        } catch (error) {
            settleError(task, error);
        }
    }

    function cancel(reason) {
        if (!active) return;
        const task = active;
        active = null;
        stateVersion++;
        task.controller.abort(reason || "Calcul obsolète.");
        if (task.worker) task.worker.terminate();
        if (worker === task.worker) worker = null;
        const error = new Error(reason || "La situation a changé.");
        error.name = "AbortError";
        task.reject(error);
        notify({ key: task.key, version: task.version, phase: "cancelled" });
    }

    function start(context) {
        cancel("Nouvel état de table.");
        const controller = new global.AbortController();
        const task = {
            key: context.key, input: context.input, version: ++stateVersion,
            controller, worker: null, requestId: 0, currentTask: null,
            equity: null, strategy: null, strategyError: null,
            resolve: null, reject: null, promise: null
        };
        task.promise = new Promise((resolve, reject) => {
            task.resolve = resolve;
            task.reject = reject;
        });
        task.promise.catch(() => {});
        try {
            task.worker = ensureWorker();
            active = task;
            postTask(task, "equity");
        } catch (error) {
            active = task;
            settleError(task, error);
        }
        return task.promise;
    }

    function onStateChange() {
        let context;
        try {
            context = createContext();
        } catch (error) {
            cancel("Impossible de construire le snapshot du solveur.");
            console.error("[PokerLab] Pré-calcul ignoré :", error);
            return;
        }
        if (!context) {
            cancel("La situation n'est plus éligible au solveur.");
            return;
        }
        if (active && active.key === context.key) return;
        if (touchCache(context.key)) {
            cancel("Le résultat de la situation courante est déjà en cache.");
            notify({ key: context.key, version: stateVersion, phase: "complete", cached: true });
            return;
        }
        start(context).catch(error => {
            if (error.name !== "AbortError") console.error("[PokerLab] Pré-calcul impossible :", error);
        });
    }

    function getOrStart() {
        const context = createContext();
        if (!context) {
            return Promise.reject(new Error("Le solveur est disponible uniquement dans une situation postflop heads-up où le joueur humain doit agir."));
        }
        const cached = touchCache(context.key);
        if (cached) return Promise.resolve(cached);
        if (active && active.key === context.key) return active.promise;
        return start(context);
    }

    function subscribe(listener) {
        if (typeof listener !== "function") return function () {};
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    function clearCache() { cache.clear(); }

    global.PokerLabSolverPrecompute = {
        onStateChange, getOrStart, subscribe, cancel, clearCache,
        getCacheSize: () => cache.size,
        getActiveKey: () => active ? active.key : null
    };
})(window);
