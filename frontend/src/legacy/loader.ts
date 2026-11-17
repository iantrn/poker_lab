import { installRangeAdapter } from "./range-adapter";
import { installStorageMirror } from "../storage/mirror";
import { SolverScheduler } from "../solver/scheduler";
import { installNavigation } from "../navigation";
import { installRangesData } from "../ranges/data";
import { installRangesViewer } from "../ranges/viewer";
import { installLessons } from "../training/lessons";
import { installPuzzles } from "../training/puzzles";
import { installGameReview } from "../training/game-review";
import { installTraining } from "../training/session";
import { installSolverPrecompute } from "../solver/precompute";
import { installSolverInputContract } from "../solver/input-contract";
import { installPostflopSolver } from "../solver/postflop";
import { installCfrCore } from "../solver/cfr-core";
import { installPostflopSolverUI } from "../ui/postflop-solver";
import { installBotProfiles } from "../bots/profiles";
import { installBotEngine } from "../bots/engine";
import { installDeck } from "../core/deck";
import { installApp } from "../app";
import { installPokerRules } from "../core/poker-rules";
import { installGameEngine } from "../core/game-engine";
import { installEvaluator } from "../core/evaluator";
import { installCards } from "../components/cards";
import { installTable } from "../components/table";

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
      // Preserve the original module load position with the typed implementation.
      if (file === "js/app.js") { installApp(); continue; }
      if (file === "js/core/deck.js") { installDeck(); continue; }
      if (file === "js/core/poker-rules.js") { installPokerRules(); continue; }
      if (file === "js/core/evaluator.js") { installEvaluator(); continue; }
      if (file === "js/core/game-engine.js") { installGameEngine(); continue; }
      if (file === "js/components/cards.js") { installCards(); continue; }
      if (file === "js/components/table.js") { installTable(); continue; }
      if (file === "js/bots/bot-profiles.js") { installBotProfiles(); continue; }
      if (file === "js/bots/bot-engine.js") { installBotEngine(); continue; }
      if (file === "js/components/navigation.js") { installNavigation(); continue; }
      if (file === "js/modules/ranges-data.js") { installRangesData(); continue; }
      if (file === "js/components/range-matrix.js") { installRangeAdapter(); continue; }
      if (file === "js/modules/ranges-viewer.js") { installRangesViewer(); continue; }
      if (file === "js/modules/lessons.js") { installLessons(); continue; }
      if (file === "js/modules/puzzles.js") { installPuzzles(); continue; }
      if (file === "js/modules/game-review.js") { installGameReview(); continue; }
      if (file === "js/modules/training.js") { installTraining(); continue; }
      if (file === "js/modules/postflop-solver.js") { installPostflopSolver(); continue; }
      if (file === "js/modules/solver-precompute.js") { installSolverPrecompute(); continue; }
      if (file === "js/modules/cfr-core.js") { installCfrCore(); continue; }
      if (file === "js/modules/postflop-solver-ui.js") { installPostflopSolverUI(); continue; }
      await loadClassicScript(file);
      if (file === "js/modules/postflop-solver.js") installSolverInputContract();
    }
    installStorageMirror();
    (window as Window & { PokerLabV2?: { solver: SolverScheduler } }).PokerLabV2 = {
      solver: new SolverScheduler()
    };
  })();
  return loading;
}
