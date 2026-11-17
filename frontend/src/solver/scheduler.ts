import { pokerLabDb } from "../storage/db";
import type { EngineRequest, WorkerRequest, WorkerResponse } from "../../../shared/models/solver";
import type { PokerCard } from "../../../shared/types/poker";
import { createRangeEquityRequest, type WeightedOpponentCombo } from "./range-equity";

interface Job { controller: AbortController; worker: Worker; reject: (error: Error) => void; }
const CACHE_SCHEMA_VERSION = 1;

/** One active calculation; obsolete jobs terminate their Worker so CPU work really stops. */
export class SolverScheduler {
  private active: Job | null = null;
  private requestId = 0;
  private generation = 0;
  private readonly memory = new Map<string, number[]>();

  cancel(reason = "État du solveur modifié"): void {
    // Invalidate pending IndexedDB lookups as well as active Workers.
    this.generation++;
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.controller.abort(reason);
    active.worker.terminate();
    active.reject(new DOMException(reason, "AbortError"));
  }

  /** Typed V1-range adapter to the Rust exact-river / flop-turn Monte Carlo solver. */
  calculateRangeEquity(
    hero: readonly PokerCard[],
    board: readonly PokerCard[],
    combos: readonly WeightedOpponentCombo[],
    iterations = 2000,
    seed = 1
  ): Promise<number[]> {
    return this.calculate(createRangeEquityRequest(hero, board, combos, iterations, seed));
  }

  async calculate(request: EngineRequest): Promise<number[]> {
    const key = JSON.stringify({ version: CACHE_SCHEMA_VERSION, request });
    this.cancel("Recalcul demandé");
    const generation = this.generation;
    const inMemory = this.memory.get(key);
    if (inMemory) return [...inMemory];
    try {
      const cached = await pokerLabDb.solverCache.get(key);
      // Even a successful IndexedDB hit must not resurrect a superseded request.
      if (this.generation !== generation) {
        throw new DOMException("Calcul obsolète", "AbortError");
      }
      if (cached && cached.schemaVersion === CACHE_SCHEMA_VERSION && Array.isArray(cached.result)) {
        const result = cached.result.filter((value): value is number => typeof value === "number");
        if (result.length === cached.result.length) {
          this.memory.set(key, result);
          return [...result];
        }
      }
    } catch { /* IndexedDB may be blocked; continue without persistent caching. */ }
    // Independent calls may race during asynchronous cache reads.
    // Never start a Worker for a superseded request.
    if (this.generation !== generation) {
      throw new DOMException("Calcul obsolète", "AbortError");
    }
    const worker = new Worker(new URL("../workers/solver.worker.ts", import.meta.url), { type: "module" });
    const controller = new AbortController();
    const id = ++this.requestId;
    return new Promise<number[]>((resolve, reject) => {
      const active: Job = { controller, worker, reject };
      this.active = active;
      worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
        if (this.active !== active || event.data.id !== id) return;
        const response = event.data;
        this.active = null;
        worker.terminate();
        if (!response.ok) { reject(new Error(response.error)); return; }
        const result = response.result;
        this.memory.set(key, [...result]);
        if (this.memory.size > 24) this.memory.delete(this.memory.keys().next().value ?? "");
        void pokerLabDb.solverCache.put({ key, schemaVersion: CACHE_SCHEMA_VERSION,
          result, createdAt: Date.now(), lastAccessAt: Date.now() }).catch(() => {});
        resolve(result);
      });
      worker.addEventListener("error", (event) => {
        if (this.active !== active) return;
        this.active = null;
        worker.terminate();
        reject(new Error(event.message));
      });
      worker.postMessage({ id, request, baseUrl: document.baseURI } satisfies WorkerRequest);
    });
  }
}
