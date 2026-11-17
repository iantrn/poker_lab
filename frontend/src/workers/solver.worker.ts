/// <reference lib="webworker" />
import type { WorkerRequest, WorkerResponse } from "../../../shared/models/solver";

interface WasmEngine {
  default(input?: string | URL): Promise<unknown>;
  evaluate_score(cards: Uint8Array): Uint8Array;
  equity_monte_carlo(holes: Uint8Array, board: Uint8Array, iterations: number, seed: bigint): Float64Array;
  range_category_histogram(cards: Uint8Array, weights: Float64Array, width: number): Float64Array;
  equity_range_monte_carlo(hero: Uint8Array, board: Uint8Array, villainPairs: Uint8Array, weights: Float64Array, iterations: number, seed: bigint): Float64Array;
  cfr_plus_matrix(payoffs: Float64Array, rows: number, cols: number, iterations: number): Float64Array;
  equity_vs_range(hero: Uint8Array, board: Uint8Array, opponents: Uint8Array, weights: Float64Array, iterations: number, seed: bigint): Float64Array;
}
let loading: Promise<WasmEngine> | null = null;
async function engine(baseUrl: string): Promise<WasmEngine> {
  if (loading) return loading;
  loading = (async () => {
    const moduleUrl = new URL("wasm/pokerlab_engine.js", baseUrl).href;
    const wasmUrl = new URL("wasm/pokerlab_engine_bg.wasm", baseUrl);
    const module = await import(/* @vite-ignore */ moduleUrl) as WasmEngine;
    await module.default(wasmUrl);
    return module;
  })();
  return loading;
}
const scope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
scope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const { id, request, baseUrl } = event.data;
  if (!Number.isSafeInteger(id)) return;
  void (async () => {
    try {
      const wasm = await engine(baseUrl);
      let result: number[];
      switch (request.kind) {
        case "evaluate": result = Array.from(wasm.evaluate_score(new Uint8Array(request.cards))); break;
        case "equity": result = Array.from(wasm.equity_monte_carlo(
          new Uint8Array(request.holes), new Uint8Array(request.board), request.iterations, BigInt(request.seed))); break;
        case "equityRange": result = Array.from(wasm.equity_range_monte_carlo(
          new Uint8Array(request.hero), new Uint8Array(request.board), new Uint8Array(request.villainPairs),
          new Float64Array(request.weights), request.iterations, BigInt(request.seed))); break;
        case "rangeEquity": result = Array.from(wasm.equity_vs_range(
          new Uint8Array(request.hero), new Uint8Array(request.board),
          new Uint8Array(request.opponents), new Float64Array(request.weights),
          request.iterations, BigInt(request.seed))); break;
        case "range": result = Array.from(wasm.range_category_histogram(
          new Uint8Array(request.cards), new Float64Array(request.weights), request.width)); break;
        case "cfr": result = Array.from(wasm.cfr_plus_matrix(
          new Float64Array(request.payoffs), request.rows, request.cols, request.iterations)); break;
      }
      scope.postMessage({ id, ok: true, result } satisfies WorkerResponse);
    } catch (error: unknown) {
      scope.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies WorkerResponse);
    }
  })();
});
