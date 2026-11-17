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

/** V2 uses only compiled TypeScript modules on its main thread.
 *
 * Each entry documents a V1 script and its already-parity-tested V2 installer.
 * Entries intentionally match the original script execution order, but none
 * of the V1 scripts is fetched, evaluated or injected into the application.
 * The legacy JS assets remain available exclusively as rollback/Worker oracles.
 */
const MIGRATED_BOOTSTRAP = [
  ["js/core/deck.js", installDeck],
  ["js/core/poker-rules.js", installPokerRules],
  ["js/core/evaluator.js", installEvaluator],
  ["js/core/game-engine.js", installGameEngine],
  ["js/bots/bot-profiles.js", installBotProfiles],
  ["js/bots/bot-engine.js", installBotEngine],
  ["js/components/cards.js", installCards],
  ["js/components/table.js", installTable],
  ["js/components/navigation.js", installNavigation],
  ["js/components/range-matrix.js", installRangeAdapter],
  ["js/modules/ranges-data.js", installRangesData],
  ["js/modules/ranges-viewer.js", installRangesViewer],
  ["js/modules/training.js", installTraining],
  ["js/modules/postflop-solver.js", installPostflopSolver],
  ["js/modules/cfr-core.js", installCfrCore],
  ["js/modules/postflop-strategy.js", installStrategy],
  ["js/modules/solver-precompute.js", installSolverPrecompute],
  ["js/modules/postflop-solver-ui.js", installPostflopSolverUI],
  ["js/modules/puzzles.js", installPuzzles],
  ["js/modules/lessons.js", installLessons],
  ["js/modules/game-review.js", installGameReview],
  ["js/app.js", installApp],
] as const;

let loading: Promise<void> | null = null;
/** Stable bridge name for the React entrypoint; no legacy scripts are loaded. */
export function loadLegacy(): Promise<void> {
  if (loading) return loading;
  loading = Promise.resolve().then(() => {
    for (const [, install] of MIGRATED_BOOTSTRAP) install();
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
