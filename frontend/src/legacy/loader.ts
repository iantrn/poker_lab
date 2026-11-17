import { installRangeAdapter } from "./range-adapter";
import { installStorageMirror } from "../storage/mirror";
import { SolverScheduler } from "../solver/scheduler";
import { createTypedPostflopWorker } from "../workers/postflop-client";
import { installNavigation } from "../navigation";
import { installRangesData } from "../ranges/data";
import { installRangesViewer } from "../ranges/viewer";
import { installLessons } from "../training/lessons";
import { installPuzzles } from "../training/puzzles";
import { installGameReview } from "../training/game-review";
import { installTraining } from "../training/session";
import { installSolverPrecompute } from "../solver/precompute";
import { installPostflopSolver } from "../solver/postflop";
import { installStrategy } from "../solver/strategy";
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

/** Installed in the established dependency order. These are compiled V2 modules,
 * not legacy scripts; their public runtime hooks remain stable.
 */
const TYPED_BOOTSTRAP = [
  installDeck,
  installPokerRules,
  installEvaluator,
  installGameEngine,
  installBotProfiles,
  installBotEngine,
  installCards,
  installTable,
  installNavigation,
  installRangeAdapter,
  installRangesData,
  installRangesViewer,
  installTraining,
  installPostflopSolver,
  installCfrCore,
  installStrategy,
  installSolverPrecompute,
  installPostflopSolverUI,
  installPuzzles,
  installLessons,
  installGameReview,
  installApp,
] as const;

let loading: Promise<void> | null = null;
/** Stable bridge name for the React entrypoint; no legacy scripts are loaded. */
export function loadLegacy(): Promise<void> {
  if (loading) return loading;
  loading = Promise.resolve().then(() => {
    for (const install of TYPED_BOOTSTRAP) install();
    installStorageMirror();
    (window as Window & { PokerLabV2?: {
      solver: SolverScheduler;
      createTypedPostflopWorker: typeof createTypedPostflopWorker;
    } }).PokerLabV2 = {
      solver: new SolverScheduler(),
      createTypedPostflopWorker
    };
  }).catch((error: unknown) => {
    // An initialization failure must be visible and retryable after recovery.
    loading = null;
    throw error;
  });
  return loading;
}
