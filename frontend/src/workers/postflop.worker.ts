/// <reference lib="webworker" />
/** Typed PokerLab postflop Worker preview; the V1/V2 classic Worker stays
 * active until full range-vs-range parity and offline validation pass.
 */
import { installEvaluator, type PokerLabHandEvaluatorApi } from "../core/evaluator";
import { installBotProfiles } from "../bots/profiles";
import { installPostflopSolver, type PostflopSolverApi } from "../solver/postflop";
import { installCfrCore } from "../solver/cfr-core";
import { installStrategy, createStrategy, type StrategyProgress } from "../solver/strategy";
import { createRustCfrStrategyCore, type RustCfrSession } from "../solver/rust-cfr-strategy-core";
import {createSolverInput,resolveSolverInput,
  type SolverCard, type SolverStateInput, type SolverInputSnapshot} from "../solver/input-contract";
import { createStrategicGameState, type StrategicGameState } from "../solver/strategic-state";
import {solveMultiway,analyzeMultiwayEquity,
  type MultiwayCfrKernel,type MultiwayEnvironment} from "../solver/multiway";

interface PostflopRequest {
  id: number;
  task: "backend" | "equity" | "strategy";
  input?: unknown;
  experimentalRustCfr?: boolean;
  options?: { iterations?: number; samples?: number; seed?: number; evaluationSamples?: number; exploitabilitySamples?: number };
}
interface WasmEvaluator {
  default(input?: string | URL): Promise<unknown>;
  evaluate_score(cards: Uint8Array): Uint8Array;
  compare_showdown(cards: Uint8Array): number;
  CfrSession?: new () => RustCfrSession;
  MultiwayCfrSession?: new (players:number) => MultiwayCfrKernel;
}
type PostflopScope = DedicatedWorkerGlobalScope & {
  window?: unknown;
  PokerLabMatrixBaseUrl?: string;
  PokerLabHandEvaluator?: PokerLabHandEvaluatorApi;
  PokerLabShowdownCompare?: (hero:SolverCard[],villain:SolverCard[],board:SolverCard[])=>number;
};
const scope = self as PostflopScope;
(scope as {window?:unknown}).window = scope;
const appBase = new URL(import.meta.env.BASE_URL, scope.location.origin);
scope.PokerLabMatrixBaseUrl = new URL("data/ranges/preflop/matrix/", appBase).href;

let rustSessionFactory: (() => RustCfrSession) | null = null;
let multiwaySessionFactory: ((players:number) => MultiwayCfrKernel) | null = null;
// Circuit breaker: one failed automatic Rust solve must not retry every hand.
let autoRustDisabled = false;
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
      if (typeof wasm.CfrSession === "function") rustSessionFactory = () => new wasm.CfrSession!();
      if (typeof wasm.MultiwayCfrSession === "function")
        multiwaySessionFactory = players => new wasm.MultiwayCfrSession!(players);
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
      // A valid showdown always contains two hole pairs plus five community
      // cards. Compare both seven-card hands with one allocation-free Rust
      // call, rather than allocating two WASM score arrays for every CFR deal.
      // Keep the exact TypeScript evaluator as a safety fallback.
      const packedShowdown = new Uint8Array(9);
      scope.PokerLabShowdownCompare = (hero,villain,board) => {
        const fallback=()=>original.compareScores(
          original.evaluate([...hero,...board]).score,
          original.evaluate([...villain,...board]).score
        );
        if(hero.length!==2||villain.length!==2||board.length!==5)return fallback();
        for(let i=0;i<9;i++){
          const card = i<2 ? hero[i] : i<4 ? villain[i-2] : board[i-4];
          if(!card || !Number.isInteger(card.value) || card.value<2 || card.value>14 ||
             !Object.prototype.hasOwnProperty.call(suits,card.suit))return fallback();
          packedShowdown[i]=card.value | (suits[card.suit]!<<4);
        }
        try{return wasm.compare_showdown(packedShowdown);}
        catch{return fallback();}
      };
      return "wasm";
    } catch (error) {
      console.warn("[PokerLab V2] Rust unavailable in typed postflop Worker; using JS evaluator.",error);
      return "legacy";
    }
  })();
  return initialization;
}
function multiwayEnvironment(message:PostflopRequest):MultiwayEnvironment {
  // JS card evaluation / equity must still function even when the multiway
  // Rust kernel is unavailable; only strategic CFR+ requires the WASM class.
  // Sanitization is applied again before range lookups: bot hole cards are
  // forbidden, even when supplied in a crafted versioned snapshot.
  const resolved=resolveSolverInput(message.input);
  const safe=createSolverInput(resolved.state as SolverStateInput,resolved.history);
  const solver=(scope as unknown as {PokerLabPostflopSolver:PostflopSolverApi}).PokerLabPostflopSolver;
  const evaluator=scope.PokerLabHandEvaluator!;
  return {
    newSession:players=>{
      if(!multiwaySessionFactory)
        throw new Error("Le noyau Rust/WASM multiway est indisponible hors ligne.");
      return multiwaySessionFactory(players);
    },
    async loadRange(playerId){
      const opponent=safe.state.players.find(player=>player.id===playerId);
      if(!opponent)throw new Error("Joueur adverse multiway introuvable.");
      return solver.getOpponentRange(
        safe.state as Parameters<PostflopSolverApi["getOpponentRange"]>[0],
        safe.history as Parameters<PostflopSolverApi["getOpponentRange"]>[1],
        opponent as Parameters<PostflopSolverApi["getOpponentRange"]>[2]
      );
    },
    evaluate:cards=>evaluator.evaluate(cards).score,
    compareScores:(a,b)=>evaluator.compareScores([...a],[...b])
  };
}
function multiwayState(message:PostflopRequest):StrategicGameState {
  const input=message.input as SolverStateInput|SolverInputSnapshot;
  return createStrategicGameState(input,{stateVersion:Math.max(1,message.id)});
}
function isMultiwayRequest(message:PostflopRequest):boolean {
  const resolved=resolveSolverInput(message.input);
  const state=resolved.state as Partial<SolverStateInput>|null;
  return Array.isArray(state?.players)&&
    state.players.filter(player=>player&&!player.folded).length>=3;
}
scope.addEventListener("message", (event: MessageEvent<PostflopRequest>) => {
  const message=event.data;
  if(!Number.isSafeInteger(message?.id))return;
  void (async()=>{
    try {
      const backend=await init();
      if(message.task==="backend") {
        scope.postMessage({id:message.id,ok:true,result:{
          backend,implementation:"typescript",
          cfrDefault:rustSessionFactory&&!autoRustDisabled?"rust":"typescript",
          multiway:multiwaySessionFactory?"rust-sampled":"unavailable"
        }});
        return;
      }
      scope.postMessage({id:message.id,progress:0,phase:message.task+"_started"});
      let result: unknown;
      const globals=scope as unknown as {
        PokerLabPostflopSolver: ReturnType<typeof installPostflopSolver>;
        PokerLabPostflopStrategy: ReturnType<typeof installStrategy>;
      };
      if(message.task==="equity") {
        if(isMultiwayRequest(message)){
          const strategic=multiwayState(message);
          if(strategic.capability.solver!=="multiway-cfr-plus")
            throw new Error(strategic.capability.reason);
          result=await analyzeMultiwayEquity(strategic,multiwayEnvironment(message),message.options);
        }else{
          // Preserve the established heads-up input contract and its error
          // behavior; strict multiway pot accounting is intentionally scoped
          // to the new 3–6 player engine.
          result=await globals.PokerLabPostflopSolver.analyse(
            message.input as Parameters<typeof globals.PokerLabPostflopSolver.analyse>[0],
            [],message.options);
        }
      } else if(message.task==="strategy") {
        // Defensive preflight shared by every backend. Reject unsupported or
        // inconsistent public states before exposing any pseudo-GTO frequencies.
        // This adapter never accesses unrevealed opponent cards.
        const strategic=isMultiwayRequest(message)?multiwayState(message):null;
        if(strategic&&strategic.capability.quality==="unavailable")
          throw new Error(strategic.capability.reason);
        const strategyOptions={
          ...message.options,
          onProgress:(update:StrategyProgress)=>{
            // Updates are provisional and associated with this request ID.
            // The parent terminates obsolete Workers, so old state versions
            // cannot send a final strategy through an active Worker.
            scope.postMessage({
              id:message.id,progress:update.progress,
              phase:"strategy_"+update.phase,
              provisional:true,iterations:update.iterations,
              ...(update.actions?{previewActions:update.actions}:{})
            });
          }
        };
        if(strategic?.capability.solver==="multiway-cfr-plus"){
          if(message.experimentalRustCfr===false)
            throw new Error("Mode TypeScript imposé : le moteur stratégique multiway nécessite Rust/WASM.");
          result=await solveMultiway(strategic,multiwayEnvironment(message),strategyOptions);
          scope.postMessage({id:message.id,progress:1,phase:"strategy_completed"});
          scope.postMessage({id:message.id,ok:true,result});
          return;
        }
        const wantsRust=message.experimentalRustCfr===true ||
          (message.experimentalRustCfr===undefined &&
           Boolean(rustSessionFactory) && !autoRustDisabled);
        if(wantsRust && !rustSessionFactory)
          throw new Error("Session CFR+ Rust non disponible.");
        if(wantsRust){
          try{
            const root=scope as unknown as Parameters<typeof createStrategy>[0];
            const isolated=Object.assign(Object.create(root) as object,{
              PokerLabCFRCore:createRustCfrStrategyCore(
                (scope as unknown as {
                  PokerLabCFRCore:ReturnType<typeof installCfrCore>;
                }).PokerLabCFRCore,
                rustSessionFactory!
              )
            }) as Parameters<typeof createStrategy>[0];
            result=await createStrategy(isolated).solvePostflop(message.input,[],strategyOptions);
          }catch(error:unknown){
            // Explicit opt-in is a diagnostic tool: report the real failure.
            // Automatic production mode must keep the poker table usable
            // without trusting a partly completed sampled Rust session.
            if(message.experimentalRustCfr===true)throw error;
            autoRustDisabled=true;
            console.warn("[PokerLab V2] Rust CFR+ auto fallback to TypeScript:",error);
            result=await globals.PokerLabPostflopStrategy.solvePostflop(
              message.input,[],strategyOptions
            );
          }
        }else{
          result=await globals.PokerLabPostflopStrategy.solvePostflop(
            message.input,[],strategyOptions
          );
        }
      } else throw new Error("Tâche de solveur inconnue.");
      scope.postMessage({id:message.id,progress:1,phase:message.task+"_completed"});
      scope.postMessage({id:message.id,ok:true,result});
    } catch(error:unknown) {
      scope.postMessage({id:message.id,ok:false,error:error instanceof Error?error.message:String(error)});
    }
  })();
});
