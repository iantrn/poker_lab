"use strict";

const fs = require("node:fs");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const ROOT = process.cwd();
const paths = [
    "js/core/evaluator.js",
    "js/modules/cfr-core.js",
    "js/modules/postflop-strategy.js"
];

function card(value, suit) {
    return { value, suit };
}

function makeState(street) {
    const boards = {
        flop: [card(2, "clubs"), card(7, "diamonds"), card(9, "hearts")],
        turn: [card(2, "clubs"), card(7, "diamonds"), card(9, "hearts"), card(5, "spades")],
        river: [card(2, "clubs"), card(7, "diamonds"), card(9, "hearts"), card(5, "spades"), card(3, "clubs")]
    };
    return {
        street,
        board: boards[street],
        pot: 10,
        currentBet: 0,
        lastFullRaise: 1,
        minimumRaiseTo: 1,
        blinds: { smallBlind: 0.5, bigBlind: 1 },
        dealerIndex: 0,
        currentPlayerId: "hero",
        handComplete: false,
        players: [
            {
                id: "hero", name: "Hero", isHuman: true, isBot: false,
                position: "BTN", folded: false,
                holeCards: [card(14, "spades"), card(13, "spades")],
                stack: 100, streetBet: 0, totalContribution: 5,
                amountToCall: 0, lastActedBet: 0, hasActed: false,
                actionOptions: {
                    callAmount: 0, minimumBet: 1, minimumRaiseTo: 1,
                    maximumRaiseTo: 100, canCheck: true, canCall: false,
                    canBet: true, canRaise: false
                }
            },
            {
                id: "villain", name: "Villain", isHuman: false, isBot: true,
                position: "BB", folded: false, holeCards: null,
                stack: 100, streetBet: 0, totalContribution: 5,
                amountToCall: 0, lastActedBet: 0, hasActed: false
            }
        ]
    };
}

function makeContext() {
    const context = {
        console,
        Math,
        Set,
        Map,
        Promise,
        Float64Array,
        Uint32Array,
        setTimeout,
        performance
    };
    context.window = context;
    vm.createContext(context);
    for (const path of paths) {
        vm.runInContext(fs.readFileSync(path, "utf8"), context, { filename: path });
    }

    const opponentCombos = [
        [card(12, "clubs"), card(11, "clubs")],
        [card(12, "diamonds"), card(11, "diamonds")],
        [card(10, "clubs"), card(9, "clubs")],
        [card(10, "diamonds"), card(9, "diamonds")],
        [card(8, "clubs"), card(7, "clubs")],
        [card(8, "diamonds"), card(6, "diamonds")]
    ].map(cards => ({ cards, weight: 1 }));
    context.PokerLabPostflopSolver = {
        getOpponentRange: async () => ({
            label: "benchmark-opponent-range",
            rangeUsed: true,
            combos: opponentCombos
        }),
        getPlayerRange: async (state, history, player) => ({
            label: "benchmark-hero-range",
            rangeUsed: true,
            actualHandInRange: true,
            combos: [
                { cards: player.holeCards, weight: 1 },
                { cards: [card(14, "hearts"), card(13, "hearts")], weight: 1 },
                { cards: [card(14, "diamonds"), card(13, "diamonds")], weight: 1 }
            ]
        })
    };
    return context;
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

async function benchmarkStreet(street, repeats = 3) {
    const context = makeContext();
    const evaluator = context.PokerLabHandEvaluator;
    const cfr = context.PokerLabCFRCore;
    const counters = { evaluatorCalls: 0, evaluatorMs: 0, cfrCalls: 0, cfrMs: 0 };
    const originalEvaluate = evaluator.evaluate.bind(evaluator);
    evaluator.evaluate = cards => {
        const start = performance.now();
        try {
            return originalEvaluate(cards);
        } finally {
            counters.evaluatorCalls++;
            counters.evaluatorMs += performance.now() - start;
        }
    };
    const originalRunCfr = cfr.runCfr;
    cfr.runCfr = (...args) => {
        const start = performance.now();
        try {
            return originalRunCfr(...args);
        } finally {
            counters.cfrCalls++;
            counters.cfrMs += performance.now() - start;
        }
    };

    // Warm up JIT and one-time runtime paths before collecting samples.
    await context.PokerLabPostflopStrategy.solvePostflop(
        makeState(street),
        [],
        {
            iterations: 10,
            samples: 8,
            evaluationSamples: 16,
            exploitabilitySamples: 8,
            seed: 20261115
        }
    );

    const durations = [];
    const perRun = [];
    for (let run = 0; run < repeats; run++) {
        counters.evaluatorCalls = 0;
        counters.evaluatorMs = 0;
        counters.cfrCalls = 0;
        counters.cfrMs = 0;
        const start = performance.now();
        const result = await context.PokerLabPostflopStrategy.solvePostflop(
            makeState(street),
            [],
            {
                iterations: 10,
                samples: 8,
                evaluationSamples: 16,
                exploitabilitySamples: 8,
                seed: 20261116 + run
            }
        );
        const elapsedMs = performance.now() - start;
        durations.push(elapsedMs);
        perRun.push({
            elapsedMs: Number(elapsedMs.toFixed(2)),
            evaluatorCalls: counters.evaluatorCalls,
            evaluatorMs: Number(counters.evaluatorMs.toFixed(2)),
            cfrTraversals: counters.cfrCalls,
            cfrMs: Number(counters.cfrMs.toFixed(2)),
            averageTreeNodes: result.treeNodes,
            trainingIterations: result.iterations,
            evaluationSamples: result.evaluationSamples,
            exploitabilitySamples: result.exploitabilitySamples
        });
    }
    return {
        street,
        medianMs: Number(median(durations).toFixed(2)),
        minMs: Number(Math.min(...durations).toFixed(2)),
        maxMs: Number(Math.max(...durations).toFixed(2)),
        runs: perRun
    };
}

function benchmarkEvaluator() {
    const context = makeContext();
    const evaluator = context.PokerLabHandEvaluator;
    const hands = {
        five: [card(14, "spades"), card(13, "spades"), card(12, "spades"), card(11, "spades"), card(10, "spades")],
        six: [card(14, "spades"), card(13, "spades"), card(12, "spades"), card(11, "spades"), card(10, "spades"), card(2, "clubs")],
        seven: [card(14, "spades"), card(13, "spades"), card(12, "spades"), card(11, "spades"), card(10, "spades"), card(2, "clubs"), card(3, "diamonds")]
    };
    const output = {};
    for (const [size, hand] of Object.entries(hands)) {
        for (let i = 0; i < 100; i++) evaluator.evaluate(hand);
        const start = performance.now();
        const iterations = 2000;
        for (let i = 0; i < iterations; i++) evaluator.evaluate(hand);
        const elapsedMs = performance.now() - start;
        output[size] = {
            iterations,
            totalMs: Number(elapsedMs.toFixed(2)),
            operationsPerSecond: Math.round(iterations / (elapsedMs / 1000))
        };
    }
    return output;
}

(async () => {
    const report = {
        benchmark: "PokerLab postflop baseline",
        runtime: process.version,
        note: "Diagnostic timings, not CI pass/fail thresholds. Same deterministic state shapes and fixed solver budgets per street.",
        evaluatorMicrobench: benchmarkEvaluator(),
        streets: []
    };
    for (const street of ["flop", "turn", "river"]) {
        report.streets.push(await benchmarkStreet(street));
    }
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
