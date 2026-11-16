/** Strict TypeScript port of the original solver precomputation orchestrator.
 * State eligibility, event names, LRU behavior, and Worker protocol remain unchanged.
 */
interface Player {
  id: unknown;
  isHuman?: boolean;
  folded?: boolean;
  holeCards?: unknown[] | null;
}
interface GameState {
  handComplete?: boolean;
  street?: string;
  players?: Player[];
  currentPlayerId?: unknown;
}
interface TrainingBridge {
  getGameState(): GameState | null;
  getHandHistory(): unknown;
}
interface SolverBridge { createInput(state: GameState, history: unknown): unknown; }
export interface PrecomputeResult {
  equity: unknown;
  strategy: unknown;
  strategyError: string | null;
}
export interface PrecomputeSnapshot {
  key: string;
  version: number;
  phase: "equity" | "strategy" | "error" | "cancelled" | "complete";
  progress?: number;
  error?: string;
  result?: PrecomputeResult;
  cached?: boolean;
}
export interface PrecomputeApi {
  onStateChange(): void;
  getOrStart(): Promise<PrecomputeResult>;
  subscribe(listener: (snapshot: PrecomputeSnapshot) => void): () => void;
  cancel(reason?: string): void;
  clearCache(): void;
  getCacheSize(): number;
  getActiveKey(): string | null;
}
interface WorkerResult {
  id: number;
  ok?: boolean;
  progress?: number;
  result?: unknown;
  error?: string;
}
interface Context { key: string; input: unknown; }
interface Task {
  key: string;
  input: unknown;
  version: number;
  controller: AbortController;
  worker: Worker | null;
  requestId: number;
  currentTask: "equity" | "strategy" | null;
  equity: unknown;
  strategy: unknown;
  strategyError: string | null;
  resolve(value: PrecomputeResult): void;
  reject(error: Error): void;
  promise: Promise<PrecomputeResult>;
}
type LegacyWindow = Window & {
  PokerLabTraining?: TrainingBridge;
  PokerLabPostflopSolver?: SolverBridge;
  PokerLabSolverPrecompute?: PrecomputeApi;
  Worker?: typeof Worker;
};
export function installSolverPrecompute(): PrecomputeApi {
  const global = window as LegacyWindow;
  if (global.PokerLabSolverPrecompute) return global.PokerLabSolverPrecompute;
  const MAX_CACHE_ENTRIES = 6;
  const WORKER_URL = "./pokerlab-solver-worker.js";
  const cache = new Map<string, PrecomputeResult>();
  const listeners = new Set<(snapshot: PrecomputeSnapshot) => void>();
  let worker: Worker | null = null;
  let taskSequence = 0;
  let stateVersion = 0;
  let active: Task | null = null;
  function isEligible(state: GameState | null): state is GameState & { players: Player[] } {
    if (!state || state.handComplete || !["flop", "turn", "river"].includes(state.street ?? "") ||
      !Array.isArray(state.players)) return false;
    const hero = state.players.find(player => player.isHuman);
    if (!hero || state.currentPlayerId !== hero.id ||
      !Array.isArray(hero.holeCards) || hero.holeCards.length !== 2) return false;
    return state.players.filter(player => !player.folded).length === 2;
  }
  function createContext(): Context | null {
    const training = global.PokerLabTraining;
    const solver = global.PokerLabPostflopSolver;
    if (!training || !solver) return null;
    const state = training.getGameState();
    if (!isEligible(state)) return null;
    const input = solver.createInput(state, training.getHandHistory());
    return { input, key: JSON.stringify(input) as string };
  }
  function notify(snapshot: PrecomputeSnapshot): void {
    listeners.forEach(listener => {
      try { listener(snapshot); } catch (error: unknown) {
        console.error("[PokerLab] Listener de pré-calcul en erreur :", error);
      }
    });
  }
  function touchCache(key: string): PrecomputeResult | null {
    if (!cache.has(key)) return null;
    const value = cache.get(key)!;
    cache.delete(key);
    cache.set(key, value);
    return value;
  }
  function storeCache(key: string, value: PrecomputeResult): void {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  }
  function ensureWorker(): Worker {
    if (worker) return worker;
    if (typeof global.Worker !== "function") {
      throw new Error("Les Web Workers ne sont pas disponibles. Le solveur reste désactivé pour préserver la fluidité de l'interface.");
    }
    worker = new global.Worker(WORKER_URL);
    worker.addEventListener("message", handleWorkerMessage);
    worker.addEventListener("error", handleWorkerError);
    return worker;
  }
  function handleWorkerMessage(event: MessageEvent<WorkerResult>): void {
    const task = active;
    const message = event.data || ({} as WorkerResult);
    if (!task || task.controller.signal.aborted ||
      message.id !== task.requestId || task.version !== stateVersion) return;
    if (message.progress !== undefined) {
      notify({ key: task.key, version: task.version, phase: task.currentTask!, progress: message.progress });
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
  function handleWorkerError(event: ErrorEvent): void {
    if (active) settleError(active, new Error(event.message || "Le Worker du solveur a rencontré une erreur."));
  }
  function settleError(task: Task, error: Error): void {
    if (active !== task) return;
    active = null;
    task.worker?.terminate();
    if (worker === task.worker) worker = null;
    task.reject(error);
    notify({ key: task.key, version: task.version, phase: "error", error: error.message });
  }
  function settleSuccess(task: Task): void {
    if (active !== task) return;
    const result: PrecomputeResult = {
      equity: task.equity, strategy: task.strategy, strategyError: task.strategyError
    };
    storeCache(task.key, result);
    active = null;
    task.resolve(result);
    notify({ key: task.key, version: task.version, phase: "complete", result });
  }
  function postTask(task: Task, type: "equity" | "strategy"): void {
    if (active !== task || task.controller.signal.aborted) return;
    task.currentTask = type;
    task.requestId = ++taskSequence;
    notify({ key: task.key, version: task.version, phase: type, progress: 0 });
    try { task.worker!.postMessage({ id: task.requestId, task: type, input: task.input }); }
    catch (error: unknown) { settleError(task, error instanceof Error ? error : new Error(String(error))); }
  }
  function cancel(reason?: string): void {
    if (!active) return;
    const task = active;
    active = null;
    stateVersion++;
    task.controller.abort(reason || "Calcul obsolète.");
    task.worker?.terminate();
    if (worker === task.worker) worker = null;
    const error = new Error(reason || "La situation a changé.");
    error.name = "AbortError";
    task.reject(error);
    notify({ key: task.key, version: task.version, phase: "cancelled" });
  }
  function start(context: Context): Promise<PrecomputeResult> {
    cancel("Nouvel état de table.");
    const controller = new AbortController();
    let resolve!: (value: PrecomputeResult) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<PrecomputeResult>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    const task: Task = {
      key: context.key, input: context.input, version: ++stateVersion,
      controller, worker: null, requestId: 0, currentTask: null,
      equity: null, strategy: null, strategyError: null,
      resolve, reject, promise
    };
    task.promise.catch(() => {});
    try {
      task.worker = ensureWorker();
      active = task;
      postTask(task, "equity");
    } catch (error: unknown) {
      active = task;
      settleError(task, error instanceof Error ? error : new Error(String(error)));
    }
    return task.promise;
  }
  function onStateChange(): void {
    let context: Context | null;
    try { context = createContext(); }
    catch (error: unknown) {
      cancel("Impossible de construire le snapshot du solveur.");
      console.error("[PokerLab] Pré-calcul ignoré :", error);
      return;
    }
    if (!context) { cancel("La situation n'est plus éligible au solveur."); return; }
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
  function getOrStart(): Promise<PrecomputeResult> {
    const context = createContext();
    if (!context) return Promise.reject(new Error(
      "Le solveur est disponible uniquement dans une situation postflop heads-up où le joueur humain doit agir."
    ));
    const cached = touchCache(context.key);
    if (cached) return Promise.resolve(cached);
    if (active && active.key === context.key) return active.promise;
    return start(context);
  }
  function subscribe(listener: (snapshot: PrecomputeSnapshot) => void): () => void {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  const api: PrecomputeApi = {
    onStateChange, getOrStart, subscribe, cancel,
    clearCache() { cache.clear(); },
    getCacheSize: () => cache.size,
    getActiveKey: () => active ? active.key : null
  };
  global.PokerLabSolverPrecompute = api;
  return api;
}
