/// <reference lib="webworker" />
/**
 * Module-Worker implementation of the V1 precompute protocol.
 *
 * Equity/range extraction and the complete chance-sampled CFR+ strategy now
 * execute from the strict TypeScript ports in an isolated Worker.
 * Rust/WASM is used for the repeated hand-scoring hot path when available.
 *
 * The legacy classic Worker is retained for rollback until full browser parity
 * (including Safari) has been established.
 */
import { installEvaluator, type PokerCard, type PokerHandEvaluation } from "../core/evaluator";
import { installBotProfiles } from "../bots/profiles";
import { installPostflopSolver } from "../solver/postflop";
import { installCfrCore } from "../solver/cfr-core";
import { installStrategy } from "../solver/strategy";

type SolverTask = "backend" | "equity" | "strategy";
interface SolverRequest {
  id: number;
  task: SolverTask;
  input?: unknown;
  options?: {
    iterations?: number; samples?: number; seed?: number;
    evaluationSamples?: number; exploitabilitySamples?: number;
  };
}
interface WasmEvaluator {
  default(input: URL): Promise<unknown>;
  evaluate_score(cards: Uint8Array): Uint8Array;
}
interface WorkerAliases {
  window: unknown;
  PokerLabHandEvaluator?: ReturnType<typeof installEvaluator>;
}
const scope = self as DedicatedWorkerGlobalScope;
const aliases = self as unknown as WorkerAliases;
// V1 typed APIs intentionally read their dependencies via window; in a Worker
// the same global namespace exists on self, not Window.
aliases.window = self;

const referenceEvaluator = installEvaluator();
installBotProfiles();
const equityEngine = installPostflopSolver();
installCfrCore();
const strategyEngine = installStrategy();

let evaluatorBackend: "wasm" | "typescript" = "typescript";
let loading: Promise<void> | null = null;

async function useRustEvaluator(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      // Vite emits module worker bundles into /assets/. WASM pack resources are
      // copied at the deployment root by the Vite legacy-assets plugin.
      const appBase = new URL("../", scope.location.href);
      const jsUrl = new URL("wasm/pokerlab_engine.js", appBase).href;
      const wasmUrl = new URL("wasm/pokerlab_engine_bg.wasm", appBase);
      const wasm = await import(/* @vite-ignore */ jsUrl) as WasmEvaluator;
      await wasm.default(wasmUrl);

      const suits: Record<string, number> = {
        clubs: 0, diamonds: 1, hearts: 2, spades: 3
      };
      const accelerated = {
        ...referenceEvaluator,
        evaluate(cards: PokerCard[]): PokerHandEvaluation {
          if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) {
            return referenceEvaluator.evaluate(cards);
          }
          const packed = new Uint8Array(cards.length);
          for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const suit = card ? suits[card.suit] : undefined;
            if (!card || !Number.isInteger(card.value) || card.value < 2 ||
                card.value > 14 || suit === undefined) {
              return referenceEvaluator.evaluate(cards);
            }
            packed[i] = card.value | (suit << 4);
          }
          let score: number[];
          try {
            score = Array.from(wasm.evaluate_score(packed));
          } catch {
            // Invalid or duplicate card errors retain the V1 error contract.
            return referenceEvaluator.evaluate(cards);
          }
          let full: PokerHandEvaluation | null = null;
          const originalCards = [...cards];
          const metadata = (): PokerHandEvaluation =>
            full ?? (full = referenceEvaluator.evaluate(originalCards));
          return {
            category: score[0]!,
            score,
            get categoryKey() { return metadata().categoryKey; },
            get categoryLabel() { return metadata().categoryLabel; },
            get bestFiveCards() { return metadata().bestFiveCards; },
            get description() { return metadata().description; }
          };
        }
      };
      aliases.PokerLabHandEvaluator = accelerated;
      evaluatorBackend = "wasm";
    } catch (error) {
      console.warn("[PokerLab V2] Moteur Rust/WASM non disponible dans le Worker typé :", error);
      evaluatorBackend = "typescript";
    }
  })();
  return loading;
}

scope.addEventListener("message", (event: MessageEvent<SolverRequest>) => {
  const message = event.data;
  if (!message || !Number.isSafeInteger(message.id)) return;
  void (async () => {
    const { id, task, input, options } = message;
    try {
      await useRustEvaluator();
      if (task === "backend") {
        scope.postMessage({ id, ok: true, result: { backend: evaluatorBackend, implementation: "typescript" } });
        return;
      }
      if (task !== "equity" && task !== "strategy") {
        throw new Error("Tâche du solveur inconnue.");
      }
      scope.postMessage({ id, progress: 0, phase: task + "_started" });
      const result = task === "equity"
        ? await equityEngine.analyse(input)
        : await strategyEngine.solvePostflop(input, [], options || {});
      scope.postMessage({ id, progress: 1, phase: task + "_completed" });
      scope.postMessage({ id, ok: true, result });
    } catch (error: unknown) {
      scope.postMessage({ id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();
});
