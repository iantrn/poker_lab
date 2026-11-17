export type EngineRequest =
  | { kind: "evaluate"; cards: number[] }
  | { kind: "equity"; holes: number[]; board: number[]; iterations: number; seed: number }
  | { kind: "range"; cards: number[]; weights: number[]; width: number }
  | { kind: "equityRange"; hero: number[]; board: number[]; villainPairs: number[]; weights: number[]; iterations: number; seed: number }
  | { kind: "cfr"; payoffs: number[]; rows: number; cols: number; iterations: number };
export interface WorkerRequest { id: number; request: EngineRequest; baseUrl: string; }
export type WorkerResponse =
  | { id: number; ok: true; result: number[] }
  | { id: number; ok: false; error: string };
