import { installRangeAdapter } from "./range-adapter";
import { installStorageMirror } from "../storage/mirror";
import { SolverScheduler } from "../solver/scheduler";

// Keep exactly the script order from index.html in the validated V1 snapshot.
const SCRIPTS = [
  "js/core/deck.js", "js/core/poker-rules.js", "js/core/evaluator.js", "js/core/game-engine.js",
  "js/bots/bot-profiles.js", "js/bots/bot-engine.js",
  "js/components/cards.js", "js/components/table.js", "js/components/navigation.js",
  "js/components/range-matrix.js", "js/modules/ranges-data.js", "js/modules/ranges-viewer.js",
  "js/modules/training.js", "js/modules/postflop-solver.js", "js/modules/cfr-core.js",
  "js/modules/postflop-strategy.js", "js/modules/solver-precompute.js",
  "js/modules/postflop-solver-ui.js", "js/modules/puzzles.js", "js/modules/lessons.js",
  "js/modules/game-review.js", "js/app.js"
] as const;

let loading: Promise<void> | null = null;
function loadClassicScript(path: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL(path, document.baseURI).href;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Impossible de charger ${path}`));
    document.body.append(script);
  });
}
export function loadLegacy(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    for (const file of SCRIPTS) {
      await loadClassicScript(file);
      if (file === "js/components/range-matrix.js") installRangeAdapter();
    }
    installStorageMirror();
    (window as Window & { PokerLabV2?: { solver: SolverScheduler } }).PokerLabV2 = {
      solver: new SolverScheduler()
    };
  })();
  return loading;
}
