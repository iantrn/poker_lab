/// <reference lib="webworker" />
/** Typed PokerLab postflop Worker preview; the V1/V2 classic Worker stays
 * active until full range-vs-range parity and offline validation pass.
 */
import { installEvaluator, type PokerLabHandEvaluatorApi } from "../core/evaluator";
import { installBotProfiles } from "../bots/profiles";
import { installPostflopSolver } from "../solver/postflop";
import { installCfrCore } from "../solver/cfr-core";
import { installStrategy } from "../solver/strategy";

interface PostflopRequest {
  id: number;
  task: "backend" | "equity" | "strategy";
  input?: unknown;
  options?: { iterations?: number; samples?: number; seed?: number; evaluationSamples?: number; exploitabilitySamples?: number };
}
interface WasmEvaluator {
  default(input?: string | URL): Promise<unknown>;
  evaluate_score(cards: Uint8Array): Uint8Array;
}
type PostflopScope = DedicatedWorkerGlobalScope & {
  window?: unknown;
  PokerLabMatrixBaseUrl?: string;
  PokerLabHandEvaluator?: PokerLabHandEvaluatorApi;
};
const scope = self as PostflopScope;
(scope as {window?:unknown}).window = scope;
const appBase = new URL(import.meta.env.BASE_URL, scope.location.origin);
scope.PokerLabMatrixBaseUrl = new URL("data/ranges/preflop/matrix/", appBase).href;

let initialization: Promise<"wasm" | "legacy"> | null = null;
async function init(): Promise<"wasm" | "legacy"> {
  if (initialization) return initialization;
  initialization = (async () => {
    installEvaluator();
    installBotProfiles();
    installPostflopSolver();
    installCfrCore();
    installStrategy();

    // Rust is an optional accelerator, not a dependency for strategy correctness.
    try {
      const moduleUrl = new URL("wasm/pokerlab_engine.js", appBase).href;
      const wasmUrl = new URL("wasm/pokerlab_engine_bg.wasm", appBase);
      const wasm = await import(/* @vite-ignore */ moduleUrl) as WasmEvaluator;
      await wasm.default(wasmUrl);
      const original = scope.PokerLabHandEvaluator!;
      const suits: Record<string,number> = { clubs:0, diamonds:1, hearts:2, spades:3 };
      scope.PokerLabHandEvaluator = {
        ...original,
        evaluate(cards) {
          if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7)
            return original.evaluate(cards);
          const packed = new Uint8Array(cards.length);
          for (let index=0;index<cards.length;index++) {
            const card=cards[index]!;
            if (!card || !Number.isInteger(card.value) || card.value<2 || card.value>14 ||
              !Object.prototype.hasOwnProperty.call(suits,card.suit))
              return original.evaluate(cards);
            packed[index]=card.value | (suits[card.suit]! << 4);
          }
          let score: number[];
          try { score=Array.from(wasm.evaluate_score(packed)); }
          catch { return original.evaluate(cards); }
          let metadata: ReturnType<typeof original.evaluate> | null = null;
          const full=()=>metadata ?? (metadata=original.evaluate(cards.slice()));
          return {
            category:score[0]!,score,
            get categoryKey(){return full().categoryKey;},
            get categoryLabel(){return full().categoryLabel;},
            get bestFiveCards(){return full().bestFiveCards;},
            get description(){return full().description;}
          };
        }
      } as PokerLabHandEvaluatorApi;
      return "wasm";
    } catch (error) {
      console.warn("[PokerLab V2] Rust unavailable in typed postflop Worker; using JS evaluator.",error);
      return "legacy";
    }
  })();
  return initialization;
}
scope.addEventListener("message", (event: MessageEvent<PostflopRequest>) => {
  const message=event.data;
  if(!Number.isSafeInteger(message?.id))return;
  void (async()=>{
    try {
      const backend=await init();
      if(message.task==="backend") {
        scope.postMessage({id:message.id,ok:true,result:{backend,implementation:"typescript"}});
        return;
      }
      scope.postMessage({id:message.id,progress:0,phase:message.task+"_started"});
      let result: unknown;
      const globals=scope as unknown as {
        PokerLabPostflopSolver: ReturnType<typeof installPostflopSolver>;
        PokerLabPostflopStrategy: ReturnType<typeof installStrategy>;
      };
      if(message.task==="equity") {
        result=await globals.PokerLabPostflopSolver.analyse(message.input as Parameters<typeof globals.PokerLabPostflopSolver.analyse>[0],
          [],message.options);
      } else if(message.task==="strategy") {
        result=await globals.PokerLabPostflopStrategy.solvePostflop(message.input,[],message.options);
      } else throw new Error("Tâche de solveur inconnue.");
      scope.postMessage({id:message.id,progress:1,phase:message.task+"_completed"});
      scope.postMessage({id:message.id,ok:true,result});
    } catch(error:unknown) {
      scope.postMessage({id:message.id,ok:false,error:error instanceof Error?error.message:String(error)});
    }
  })();
});
