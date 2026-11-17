/** Chance-sampled, range-vs-range postflop CFR+ orchestration.
 * The exact betting-tree and CFR primitives are separate verified TS modules.
 * This is an *abstracted* poker game, not a certified full-game GTO solver.
 */
import type { SolverCard } from "./input-contract";
import type { CFRNode,CFRCallbacks,CFRDeal,CFRCoreApi,CFRBatchSample } from "./cfr-core";
import { buildDecisionTree, rootActionSignature,
  type AbstractTreeNode, type AbstractTreeInput, type AbstractRootOptions
} from "./decision-tree.ts";
import { sampleDeals, createDealSampler, buildUniformRange,
  type ChanceDeal, type HandCombo
} from "./deal-sampler.ts";

const DEFAULT_ITERATIONS=60;
const DEFAULT_SAMPLES=24;
const CHIP_UNIT=0.5;
const CHIP_EPSILON=0.000001;
interface StrategyPlayer {
  id:string;position?:string|null;isHuman?:boolean;folded?:boolean;
  holeCards?:SolverCard[]|null;stack:number;streetBet:number;
  totalContribution?:number;lastActedBet?:number;hasActed?:boolean;
  amountToCall?:number;actionOptions?:AbstractRootOptions&{
    canCheck?:boolean;canCall?:boolean;callAmount?:number;minimumBet?:number
  };
  [attribute:string]:unknown;
}
interface StrategyState extends AbstractTreeInput {
  street:string;board:SolverCard[];players:StrategyPlayer[];
  currentPlayerId:string;handComplete?:boolean;
  currentBet?:number;minimumRaiseTo?:number;dealerIndex?:number;
  blinds?:{smallBlind:number;bigBlind:number};
}
interface HistoryEvent {
  type:string;street:string;data:{
    playerId?:string;action?:string;amount?:number;[key:string]:unknown;
  };
}
interface StrategyRange {
  combos:HandCombo[]|null;label:string;rangeUsed?:boolean;
  actualHandInRange?:boolean;profileModeledActions?:number;
  conditioning?:string;postflopActionsUsed?:number;
}
interface StrategyGlobal {
  PokerLabPostflopSolver:{
    resolveInput?(input:unknown,history:HistoryEvent[]):{state:StrategyState;history:HistoryEvent[]};
    getOpponentRange(state:StrategyState,history:HistoryEvent[],opponent:StrategyPlayer):Promise<StrategyRange>;
    getPlayerRange?(state:StrategyState,history:HistoryEvent[],player:StrategyPlayer):Promise<StrategyRange>;
  };
  PokerLabHandEvaluator:{
    evaluate(cards:SolverCard[]):{score:number[]};
    compareScores(a:number[],b:number[]):number;
  };
  PokerLabCFRCore:CFRCoreApi;
  PokerLabShowdownCompare?: (hero:SolverCard[],villain:SolverCard[],board:SolverCard[])=>number;
}
export function createRandom(seed:number):()=>number {
  let state=seed|0;
  return ()=>{
    state=(state+0x6D2B79F5)|0;
    let value=state;
    value=Math.imul(value^(value>>>15),value|1);
    value^=value+Math.imul(value^(value>>>7),value|61);
    return ((value^(value>>>14))>>>0)/4294967296;
  };
}
const roundChips=(amount:unknown)=>Math.round((Number(amount)||0)/CHIP_UNIT)*CHIP_UNIT;
const cardId=(card:SolverCard):string=>card.value+"_"+card.suit;
const handId=(cards:SolverCard[]):string=>cards.map(cardId).sort().join(",");
const boardId=(cards:SolverCard[]):string=>cards.map(cardId).sort().join(",");
const toCFR=(node:AbstractTreeNode):CFRNode=>node as unknown as CFRNode;
const toAbstract=(node:CFRNode):AbstractTreeNode=>node as unknown as AbstractTreeNode;

function compareSampledShowdown(hero:SolverCard[],villain:SolverCard[],
  board:SolverCard[],global:StrategyGlobal):number {
  // One packed Rust call in the Worker, with an exact TypeScript fallback.
  if(global.PokerLabShowdownCompare)
    return global.PokerLabShowdownCompare(hero,villain,board);
  return global.PokerLabHandEvaluator.compareScores(
    global.PokerLabHandEvaluator.evaluate([...hero,...board]).score,
    global.PokerLabHandEvaluator.evaluate([...villain,...board]).score
  );
}
function utility(node:AbstractTreeNode,deal:ChanceDeal,hero:SolverCard[],board:SolverCard[],global:StrategyGlobal):number {
  if(node.terminal && node.type==="fold"){
    return node.winner===0 ? node.pot-node.heroInvested:-node.heroInvested;
  }
  const result=Number.isInteger(deal.showdownResult)
    ? deal.showdownResult!
    : compareSampledShowdown(deal.hero||hero,deal.villain,deal.finalBoard||board,global);
  const payout=result>0?node.pot:result===0?node.pot/2:0;
  return payout-(node.terminal?node.heroInvested:0);
}
// The betting topology is independent of future card values. Cache each
// sampled deal's public-board prefix identity for its information sets.
// Private hands and betting-state suffixes are repeated at every node visited
// for a sampled deal. Both are invariant over that deal's CFR traversals.
const dealPrivateHandKeys=new WeakMap<ChanceDeal,readonly [string,string]>();
function sampledHandIds(deal:ChanceDeal):readonly [string,string] {
  let keys=dealPrivateHandKeys.get(deal);
  if(!keys){
    keys=[handId(deal.hero),handId(deal.villain)];
    dealPrivateHandKeys.set(deal,keys);
  }
  return keys;
}
const informationSuffixes=new WeakMap<AbstractTreeNode,string>();
function staticInformationSuffix(node:Extract<AbstractTreeNode,{terminal:false}>):string {
  const cached=informationSuffixes.get(node);
  if(cached!==undefined)return cached;
  const publicState=[
    roundChips(node.pot),
    (node.stacks||[]).map(roundChips).join(","),
    (node.bets||[]).map(roundChips).join(","),
    (node.hasActed||[]).map(Boolean).join(","),
    (node.lastActedBets||[]).map(roundChips).join(","),
    roundChips(node.lastFullRaise),
    node.raises||0,node.checks||0
  ].join(":");
  const suffix="|"+publicState+"|"+node.history;
  informationSuffixes.set(node,suffix);
  return suffix;
}
const dealPublicBoardKeys=new WeakMap<ChanceDeal,Map<number,string>>();
function sampledBoardId(deal:ChanceDeal,length:number):string {
  let prefixes=dealPublicBoardKeys.get(deal);
  if(!prefixes){
    prefixes=new Map<number,string>();
    dealPublicBoardKeys.set(deal,prefixes);
  }
  let key=prefixes.get(length);
  if(key===undefined){
    key=boardId(deal.finalBoard.slice(0,length));
    prefixes.set(length,key);
  }
  return key;
}
// For Rust's reusable serializer, intern the public information prefix once
// per sampled deal, actor and board street (at most six distinct combinations).
// Canonical string keys remain unchanged for TypeScript CFR and exploitability.
const dealInformationPrefixes=new WeakMap<ChanceDeal,Map<number,string>>();
function informationPrefix(node:Extract<AbstractTreeNode,{terminal:false}>,
  deal:ChanceDeal|null,hero:SolverCard[],board:SolverCard[]):string {
  if(!deal){
    // Keep the exact legacy key semantics for external root-only reads.
    const privateHand=node.actor===0?handId(hero):handId(deal!.villain);
    return node.actor+"|"+privateHand+"|"+boardId(node.board||board);
  }
  let prefixes=dealInformationPrefixes.get(deal);
  if(!prefixes){
    prefixes=new Map<number,string>();
    dealInformationPrefixes.set(deal,prefixes);
  }
  const index=node.board.length*2+node.actor;
  let value=prefixes.get(index);
  if(value===undefined){
    const hand=sampledHandIds(deal)[node.actor===0?0:1];
    value=node.actor+"|"+hand+"|"+sampledBoardId(deal,node.board.length);
    prefixes.set(index,value);
  }
  return value;
}
function informationKey(node:AbstractTreeNode,deal:ChanceDeal|null,hero:SolverCard[],board:SolverCard[]):string {
  if(node.terminal)return "";
  return informationPrefix(node,deal,hero,board)+staticInformationSuffix(node);
}
function cfrCallbacks(hero:SolverCard[],board:SolverCard[],global:StrategyGlobal):CFRCallbacks {
  return {
    informationKey:(node,deal)=>informationKey(toAbstract(node),deal as ChanceDeal|null,hero,board),
    informationPrefix:(node,deal)=>informationPrefix(
      toAbstract(node) as Extract<AbstractTreeNode,{terminal:false}>,
      deal as ChanceDeal|null,hero,board),
    informationSuffix:node=>staticInformationSuffix(
      toAbstract(node) as Extract<AbstractTreeNode,{terminal:false}>),
    utility:(node,deal)=>utility(toAbstract(node),deal as ChanceDeal,hero,board,global)
  };
}
function runCfr(node:AbstractTreeNode,deal:ChanceDeal,traverser:number,reach:number[],maps:ReturnType<CFRCoreApi["createMaps"]>,
  hero:SolverCard[],board:SolverCard[],averageWeight:number,global:StrategyGlobal):number {
  const chanceWeight=Number(deal.heroImportanceWeight)>0?Number(deal.heroImportanceWeight):1;
  return global.PokerLabCFRCore.runCfr(toCFR(node),deal,traverser,reach,maps,
      cfrCallbacks(hero,board,global),averageWeight,chanceWeight);
}
function averageStrategy(node:AbstractTreeNode,deal:ChanceDeal,maps:ReturnType<CFRCoreApi["createMaps"]>,
  hero:SolverCard[],board:SolverCard[],global:StrategyGlobal):number {
  return global.PokerLabCFRCore.averageStrategy(toCFR(node),deal,maps,cfrCallbacks(hero,board,global));
}
function getRootStrategy(tree:AbstractTreeNode,maps:ReturnType<CFRCoreApi["createMaps"]>,hero:SolverCard[],board:SolverCard[],
  global:StrategyGlobal):Float64Array|[] {
  return global.PokerLabCFRCore.getStrategy(toCFR(tree),null,maps,cfrCallbacks(hero,board,global));
}
export function createStrategy(global:StrategyGlobal){
    function validate(input:unknown):{hero:StrategyPlayer & {holeCards:SolverCard[]};opponent:StrategyPlayer} {
        const state=input as StrategyState|null;
        const expectedBoardLength:Record<string,number> = { flop: 3, turn: 4, river: 5 };
        if (!state || !Object.prototype.hasOwnProperty.call(expectedBoardLength, state.street) ||
            !Array.isArray(state.board) || state.board.length !== expectedBoardLength[state.street]) {
            throw new Error("Le moteur CFR+ est disponible à partir du flop.");
        }
        if (!Array.isArray(state.players)) throw new Error("La liste des joueurs est invalide.");
        const playerIds = state.players.map(player => player && player.id);
        if (playerIds.some(id => id === undefined || id === null) ||
            new Set(playerIds).size !== playerIds.length) {
            throw new Error("Les identifiants des joueurs sont invalides ou dupliqués.");
        }
        const humanPlayers = state.players.filter(player => player.isHuman);
        if (humanPlayers.length !== 1) {
            throw new Error("Le moteur stratégique exige exactement un joueur humain.");
        }
        const active = state.players.filter(player => !player.folded);
        if (active.length !== 2) throw new Error("Le moteur CFR+ est limité au heads-up.");
        const hero = humanPlayers[0];
        if (!hero || !Array.isArray(hero.holeCards) || hero.holeCards.length !== 2) {
            throw new Error("Les cartes du joueur sont indisponibles.");
        }
        if (state.currentPlayerId !== hero.id) {
            throw new Error("Le calcul stratégique doit être lancé au tour du joueur humain.");
        }
        const opponent = active.find(player => player.id !== hero.id);
        if (!opponent) throw new Error("Adversaire heads-up introuvable.");

        const seen = new Set();
        for (const card of [...hero.holeCards, ...state.board]) {
            if (!card || !Number.isInteger(card.value) || card.value < 2 || card.value > 14 ||
                !["clubs", "diamonds", "hearts", "spades"].includes(card.suit)) {
                throw new Error("Une carte de l'état stratégique est invalide.");
            }
            const key = cardId(card);
            if (seen.has(key)) throw new Error("L'état stratégique contient des cartes dupliquées.");
            seen.add(key);
        }

        const chipValues = [
            state.pot, state.currentBet, state.lastFullRaise, state.minimumRaiseTo,
            state.blinds && state.blinds.smallBlind, state.blinds && state.blinds.bigBlind,
            ...state.players.flatMap(player => [
                player.stack, player.streetBet, player.totalContribution,
                player.amountToCall, player.lastActedBet
            ])
        ].filter(value => value !== undefined && value !== null);
        if (chipValues.some(value => !Number.isFinite(Number(value)) || Number(value) < 0 ||
            Math.abs(Number(value) * 2 - Math.round(Number(value) * 2)) > CHIP_EPSILON)) {
            throw new Error("L'état stratégique contient un montant qui ne respecte pas l'unité de 0,5 jeton.");
        }

        const allStreetBetsKnown = state.players.every(player =>
            Number.isFinite(Number(player.streetBet))
        );
        if (allStreetBetsKnown && Number.isFinite(Number(state.currentBet))) {
            const actualCurrentBet = Math.max(...state.players.map(player => Number(player.streetBet)));
            if (Math.abs(actualCurrentBet - Number(state.currentBet)) > CHIP_EPSILON) {
                throw new Error("La mise courante ne correspond pas aux contributions de la street.");
            }
        }
        if (Number.isFinite(Number(state.currentBet)) &&
            Number.isFinite(Number(hero.streetBet)) &&
            Number.isFinite(Number(hero.amountToCall))) {
            const expectedCall = Math.max(0, Number(state.currentBet) - Number(hero.streetBet));
            if (Math.abs(expectedCall - Number(hero.amountToCall)) > CHIP_EPSILON) {
                throw new Error("Le montant à égaliser du héros est incohérent.");
            }
        }
        if (Number.isFinite(Number(state.currentBet)) &&
            Number.isFinite(Number(state.lastFullRaise)) &&
            Number.isFinite(Number(state.minimumRaiseTo)) &&
            Math.abs(Number(state.minimumRaiseTo) -
                (Number(state.currentBet) + Number(state.lastFullRaise))) > CHIP_EPSILON) {
            throw new Error("Le minimum de relance ne correspond pas à la dernière relance complète.");
        }

        const contributionsKnown = state.players.every(player =>
            Number.isFinite(Number(player.totalContribution))
        );
        if (contributionsKnown && Number.isFinite(Number(state.pot))) {
            const actualPot = state.players.reduce(
                (sum, player) => sum + Number(player.totalContribution), 0
            );
            if (Math.abs(actualPot - Number(state.pot)) > CHIP_EPSILON) {
                throw new Error("Le pot ne correspond pas à la somme des contributions des joueurs.");
            }
        }
        for (const player of state.players) {
            if (Number.isFinite(Number(player.streetBet)) &&
                Number.isFinite(Number(player.totalContribution)) &&
                Number(player.streetBet) - Number(player.totalContribution) > CHIP_EPSILON) {
                throw new Error("Une mise de street dépasse la contribution totale du joueur.");
            }
        }

        const options = hero.actionOptions;
        if (options) {
            if (Number.isFinite(Number(options.callAmount)) &&
                Number.isFinite(Number(hero.amountToCall)) &&
                Math.abs(Number(options.callAmount) - Number(hero.amountToCall)) > CHIP_EPSILON) {
                throw new Error("Les options d'action ne correspondent pas au montant à égaliser.");
            }
            if (Number.isFinite(Number(options.minimumRaiseTo)) &&
                Number.isFinite(Number(state.minimumRaiseTo)) &&
                Math.abs(Number(options.minimumRaiseTo) - Number(state.minimumRaiseTo)) > CHIP_EPSILON) {
                throw new Error("Les options d'action ne correspondent pas au minimum de relance.");
            }
            if (Number.isFinite(Number(options.maximumRaiseTo)) &&
                Number.isFinite(Number(hero.streetBet)) &&
                Number.isFinite(Number(hero.stack)) &&
                Math.abs(Number(options.maximumRaiseTo) -
                    (Number(hero.streetBet) + Number(hero.stack))) > CHIP_EPSILON) {
                throw new Error("Les options d'action ne correspondent pas au tapis du héros.");
            }
            if (options.canCheck === true && Number(hero.amountToCall) > CHIP_EPSILON) {
                throw new Error("Le héros ne peut pas checker lorsqu'une mise reste à égaliser.");
            }
            if (options.canCall === true && Number(hero.amountToCall) <= CHIP_EPSILON) {
                throw new Error("Le moteur autorise un call alors qu'aucune mise n'est à égaliser.");
            }
            if (options.canBet === true && Number.isFinite(Number(state.currentBet)) &&
                Number(state.currentBet) > CHIP_EPSILON) {
                throw new Error("Le moteur autorise une mise d'ouverture alors qu'une mise existe déjà.");
            }
            if (Number.isFinite(Number(options.minimumBet)) &&
                state.blinds && Number.isFinite(Number(state.blinds.bigBlind)) &&
                Math.abs(Number(options.minimumBet) - Number(state.blinds.bigBlind)) > CHIP_EPSILON) {
                throw new Error("Les options d'action ne correspondent pas à la grosse blind.");
            }
        }
        return { hero:hero as StrategyPlayer & {holeCards:SolverCard[]}, opponent };
    }

    async function solvePostflop(input:unknown,history:HistoryEvent[]=[],options:{iterations?:number;samples?:number;seed?:number;evaluationSamples?:number;exploitabilitySamples?:number;experimentalCompiledPayoffs?:boolean}={}) {
        const resolved = global.PokerLabPostflopSolver &&
            typeof global.PokerLabPostflopSolver.resolveInput === "function"
            ? global.PokerLabPostflopSolver.resolveInput(input, history)
            : { state: input, history: Array.isArray(history) ? history : [] };
        const state = resolved.state as StrategyState;
        history = resolved.history;
        const { hero, opponent } = validate(state);
        const defaultsByStreet:Record<string,{iterations:number;samples:number}> = {
            flop: { iterations: 20, samples: 8 },
            turn: { iterations: 30, samples: 12 },
            river: { iterations: DEFAULT_ITERATIONS, samples: DEFAULT_SAMPLES }
        };
        const defaults=defaultsByStreet[state.street]!;
        const rangeInfo = await global.PokerLabPostflopSolver.getOpponentRange(state, history, opponent);
        const heroRangeInfo = typeof global.PokerLabPostflopSolver.getPlayerRange === "function"
            ? await global.PokerLabPostflopSolver.getPlayerRange(state, history, hero)
            : {
                label: "Range héro non renseignée (main réelle uniquement)",
                rangeUsed: false,
                actualHandInRange: true,
                combos: [{ cards: hero.holeCards, weight: 1 }]
            };
        const requestedIterations = Math.max(10, Math.min(1000, Number(options.iterations) || defaults!.iterations));
        const samples = Math.max(8, Math.min(160, Number(options.samples) || defaults!.samples));
        // Chaque itération reçoit une nouvelle main adverse et un nouveau runout.
        // Le budget total de traversées reste proche de l'ancienne version iterations × samples.
        const trainingIterations = Math.min(4000, requestedIterations * samples);
        const currentStreetActions = (history || [])
            .filter(event => event.type === "player_action" && event.street === state.street);
        const priorHistory = currentStreetActions.map(event => {
            const data = event.data || {};
            const player = state.players.find(item => item.id === data.playerId);
            return (player ? player.position || player.id : data.playerId) +
                ":" + data.action + (Number.isFinite(data.amount) ? ":" + data.amount : "");
        });
        const lastStreetAction = currentStreetActions[currentStreetActions.length - 1];
        const lastActorId = lastStreetAction && lastStreetAction.data
            ? lastStreetAction.data.playerId : null;
        const rootRaises = currentStreetActions.filter(event =>
            event.data && ["raise", "short_raise"].includes(event.data.action ?? "")
        ).length;
        const rootChecks = Number(hero.amountToCall) === 0 && lastStreetAction &&
            lastStreetAction.data && lastStreetAction.data.action === "check" &&
            lastActorId !== hero.id ? 1 : 0;

        let postflopFirstActorId = null;
        if (Number.isInteger(state.dealerIndex) && state.players.length > 0) {
            const activeIds = new Set([hero.id, opponent.id]);
            for (let offset = 1; offset <= state.players.length; offset++) {
                const seat = (state.dealerIndex! + offset) % state.players.length;
                if (activeIds.has(state.players[seat]!.id)) {
                    postflopFirstActorId = state.players[seat]!.id;
                    break;
                }
            }
        }
        const normalizedState = {
            ...state,
            players: [hero, opponent],
            postflopFirstActorId
        };
        // Legal actions, pot and stack transitions are independent of future
        // card values. Only the information-set key needs each sampled deal's
        // public board (see sampledBoardId). Reuse the first tree throughout
        // CFR training, EV evaluation and NashConv; it is never mutated.
        // Rust's serializer can consequently reuse one packed tree topology.
        let publicTreeTemplate:ReturnType<typeof buildDecisionTree>|null=null;
        const buildForRunout = (runout: SolverCard[]): ReturnType<typeof buildDecisionTree> => {
            if(!publicTreeTemplate){
                publicTreeTemplate=buildDecisionTree(
                    normalizedState, hero.actionOptions || {},
                    priorHistory, runout, rootChecks, rootRaises
                );
            }
            return publicTreeTemplate;
        };
        const random = Number.isInteger(options.seed)
            ? createRandom(options.seed!)
            : Math.random;
        // Prepare the joint hero/villain distribution once per solve. It is stable
        // across CFR steps; re-filtering every combination per step was costly.
        const trainingSampler = createDealSampler(
            hero.holeCards,state.board,rangeInfo.combos,
            rangeInfo.rangeUsed !== false,random,heroRangeInfo.combos
        );
        const maps = global.PokerLabCFRCore.createMaps();
        let rootTree:AbstractTreeNode|null=null;
        let expectedRootSignature:string|null=null;
        let averageNodeCount = 0;
        let sampledRangeUsed = true;
        let sampledHeroHands = 0;
        let sampledActualHeroHand = 0;
        let heroImportanceWeightSum = 0;
        let heroImportanceWeightSquares = 0;

        // Give the event loop a chance to process cancellation and progress
        // messages at bounded intervals, not after every individual CFR sample.
        // A zero-delay timer per deal otherwise introduces an O(iterations)
        // wall-time scheduling penalty independent of the actual CFR work.
        let nextCooperativeYield = performance.now() + 12;
        // Only the Rust adapter exposes runCfrBatch. Limit each unit of work to
        // eight samples and flush before yielding to preserve responsiveness.
        const trainingBatch:CFRBatchSample[]=[];
        let trainingBatchStart=1;
        const flushTrainingBatch=():void=>{
            if(!trainingBatch.length)return;
            global.PokerLabCFRCore.runCfrBatch!(trainingBatch,maps,trainingBatchStart);
            trainingBatch.length=0;
        };
        for (let iteration = 0; iteration < trainingIterations; iteration++) {
            const sampled = trainingSampler(1);
            const deal = sampled.deals[0]!;
            sampledRangeUsed = sampledRangeUsed && sampled.rangeUsed;
            sampledHeroHands++;
            sampledActualHeroHand += sampled.actualHeroSamples;
            heroImportanceWeightSum += deal.heroImportanceWeight;
            heroImportanceWeightSquares += deal.heroImportanceWeight * deal.heroImportanceWeight;
            deal.showdownResult = compareSampledShowdown(
                deal.hero,deal.villain,deal.finalBoard,global
            );
            const built = buildForRunout(deal.runout);
            if (built.tree.terminal || !built.tree.actions.length) {
                throw new Error("Aucune décision stratégique disponible dans cette situation.");
            }
            const signature = rootActionSignature(built.tree);
            if (expectedRootSignature !== null && signature !== expectedRootSignature) {
                throw new Error("Les actions légales à la racine changent entre les échantillons.");
            }
            expectedRootSignature = signature;
            rootTree = built.tree;
            averageNodeCount += built.nodeCount;

            // Each sample still receives exactly two ordered CFR+ traversals.
            // Sampling is independent of learned regrets, so batching cannot
            // change RNG consumption or the order of regret updates.
            if(global.PokerLabCFRCore.runCfrBatch){
                if(trainingBatch.length===0)trainingBatchStart=iteration+1;
                const importance=Number(deal.heroImportanceWeight);
                trainingBatch.push({
                    root:toCFR(built.tree),
                    deal,
                    callbacks:cfrCallbacks(deal.hero,state.board,global),
                    chanceWeight:importance>0?importance:1,
                    compilePokerPayoffs:options.experimentalCompiledPayoffs===true?true:undefined
                });
                if(trainingBatch.length===8)flushTrainingBatch();
            }else{
                runCfr(built.tree, deal, 0, [1, 1], maps, deal.hero, state.board, iteration + 1,global);
                runCfr(built.tree, deal, 1, [1, 1], maps, deal.hero, state.board, iteration + 1,global);
            }

            if (performance.now() >= nextCooperativeYield) {
                flushTrainingBatch();
                await new Promise<void>(resolve => setTimeout(resolve, 0));
                nextCooperativeYield = performance.now() + 12;
            }
        }
        flushTrainingBatch();

        const requestedEvaluationSamples = Number.isInteger(options.evaluationSamples)
            ? Math.max(16, Math.min(512, options.evaluationSamples!))
            : Math.max(64, Math.min(256, samples * 4));
        if(!rootTree||rootTree.terminal)throw new Error("Arbre vide après apprentissage.");
        const typedRoot=rootTree as Extract<AbstractTreeNode,{terminal:false}>;
        const rootStrategy = getRootStrategy(typedRoot, maps, hero.holeCards, state.board,global);
        const evaluationSampler = createDealSampler(
            hero.holeCards,state.board,rangeInfo.combos,
            rangeInfo.rangeUsed !== false,random
        );
        const actionValueSums:number[] = new Array(typedRoot.actions.length).fill(0);
        const actionValueSquares:number[] = new Array(typedRoot.actions.length).fill(0);
        let heroEVSum = 0;
        let heroEVSquares = 0;
        let evaluatedDeals = 0;

        for (let sampleIndex = 0; sampleIndex < requestedEvaluationSamples; sampleIndex++) {
            const sampled = evaluationSampler(1);
            const deal = sampled.deals[0]!;
            deal.showdownResult = compareSampledShowdown(
                hero.holeCards,deal.villain,deal.finalBoard,global
            );
            const built = buildForRunout(deal.runout);
            if (rootActionSignature(built.tree) !== expectedRootSignature) {
                throw new Error("L'arbre d'évaluation ne correspond pas aux actions légales apprises.");
            }

            const sampleActionValues:number[] = [];
            for (let actionIndex = 0; actionIndex < typedRoot.actions.length; actionIndex++) {
                const value = averageStrategy(
                    (built.tree as Extract<AbstractTreeNode,{terminal:false}>).actions[actionIndex]!.child,
                    deal,
                    maps,
                    hero.holeCards,
                    state.board,
                    global
                );
                sampleActionValues.push(value);
                actionValueSums[actionIndex]! += value;
                actionValueSquares[actionIndex]! += value * value;
            }

            const sampleHeroEV = sampleActionValues.reduce((sum, value, index) =>
                sum + rootStrategy[index]! * value, 0);
            heroEVSum += sampleHeroEV;
            heroEVSquares += sampleHeroEV * sampleHeroEV;
            evaluatedDeals++;

            if ((sampleIndex + 1) % 8 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        if (!evaluatedDeals) {
            throw new Error("Impossible d'évaluer la stratégie sur les échantillons indépendants.");
        }

        // Estimation indépendante du NashConv sur les ranges des deux joueurs.
        // Les meilleures réponses sont exactes dans l'arbre abstrait construit
        // pour ces deals, mais la mesure reste conditionnelle à cet échantillon.
        const requestedExploitabilitySamples = Number.isInteger(options.exploitabilitySamples)
            ? Math.max(8, Math.min(128, options.exploitabilitySamples!))
            : Math.max(12, Math.min(32, samples));
        const exploitabilityRandom = Number.isInteger(options.seed)
            ? createRandom((options.seed! ^ 0x9E3779B9) >>> 0)
            : Math.random;
        const exploitabilitySampler = createDealSampler(
            hero.holeCards,state.board,rangeInfo.combos,
            rangeInfo.rangeUsed !== false,exploitabilityRandom,heroRangeInfo.combos
        );
        const exploitabilityDeals:Array<{root:CFRNode;deal:ChanceDeal}>=[];

        for (let sampleIndex = 0; sampleIndex < requestedExploitabilitySamples; sampleIndex++) {
            const sampled = exploitabilitySampler(1);
            const deal = sampled.deals[0]!;
            deal.showdownResult = compareSampledShowdown(
                deal.hero,deal.villain,deal.finalBoard,global
            );
            const built = buildForRunout(deal.runout);
            if (rootActionSignature(built.tree) !== expectedRootSignature) {
                throw new Error("L'arbre de meilleure réponse ne correspond pas aux actions légales apprises.");
            }
            exploitabilityDeals.push({ root: toCFR(built.tree), deal });
            if ((sampleIndex + 1) % 4 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        const exploitability = global.PokerLabCFRCore.measureExploitability(
            exploitabilityDeals,
            maps,
            cfrCallbacks(hero.holeCards, state.board,global),
            deal => (deal as ChanceDeal).heroImportanceWeight
        );
        const exploitabilityWeightSum = exploitabilityDeals.reduce(
            (sum, entry) => sum + entry.deal.heroImportanceWeight, 0
        );
        const exploitabilityWeightSquares = exploitabilityDeals.reduce(
            (sum, entry) => sum + entry.deal.heroImportanceWeight ** 2, 0
        );
        const exploitabilityEffectiveSampleSize = exploitabilityWeightSquares > 0
            ? exploitabilityWeightSum ** 2 / exploitabilityWeightSquares
            : 0;

        const standardError = (sum:number, sumSquares:number):number => {
            if (evaluatedDeals < 2) return 0;
            const mean = sum / evaluatedDeals;
            const variance = Math.max(0, (sumSquares - evaluatedDeals * mean * mean) / (evaluatedDeals - 1));
            return Math.sqrt(variance / evaluatedDeals);
        };

        const actions = typedRoot.actions.map((entry, index) => {
            const ev = actionValueSums[index]! / evaluatedDeals;
            const evStandardError = standardError(actionValueSums[index]!, actionValueSquares[index]!);
            return {
                action: entry.action.label,
                frequency: rootStrategy[index]!,
                ev,
                evStandardError,
                evLower95: ev - 1.96 * evStandardError,
                evUpper95: ev + 1.96 * evStandardError
            };
        }).sort((a, b) => b.frequency - a.frequency);
        const heroEV = heroEVSum / evaluatedDeals;
        const heroEVStandardError = standardError(heroEVSum, heroEVSquares);
        const heroRangeEffectiveSampleSize = heroImportanceWeightSquares > 0
            ? heroImportanceWeightSum * heroImportanceWeightSum / heroImportanceWeightSquares
            : 0;

        return {
            algorithm: "CFR+ avec rééchantillonnage des chances",
            averageStrategyWeighting: "linéaire",
            street: state.street,
            abstraction: state.street.toUpperCase() +
                " → river HU · mises arrondies à 0,5 jeton · check · mises 33 % / 75 % pot · relance minimale et sizing 50 % du pot après call à la racine · sizing simplifié dans les réponses futures · tapis effectif · quatre relances maximales dans les réponses modélisées",
            iterations: trainingIterations,
            requestedIterations,
            samplesPerIteration: 1,
            randomSeed: Number.isInteger(options.seed) ? (options.seed! >>> 0) : null,
            sampledOpponentHands: trainingIterations,
            sampledHeroHands,
            sampledActualHeroHand,
            heroRangeEffectiveSampleSize,
            heroRangeLabel: heroRangeInfo.label,
            heroRangeUsed: heroRangeInfo.rangeUsed !== false,
            actualHandInHeroRange: heroRangeInfo.actualHandInRange !== false,
            evaluationSamples: evaluatedDeals,
            evaluationMethod: "Échantillons indépendants ; erreur standard conditionnelle à la stratégie moyenne apprise.",
            heroEVStandardError,
            heroEVLower95: heroEV - 1.96 * heroEVStandardError,
            heroEVUpper95: heroEV + 1.96 * heroEVStandardError,
            exploitabilitySamples: exploitabilityDeals.length,
            exploitabilityEffectiveSampleSize,
            exploitabilityMethod: "Meilleures réponses exactes dans l'arbre abstrait sur un échantillon indépendant pondéré par les ranges et les bloqueurs ; mesure conditionnelle à cet échantillon.",
            profileEV: exploitability.profileValue,
            heroBestResponseEV: exploitability.player0BestResponse,
            opponentBestResponseEV: exploitability.player1BestResponse,
            heroDeviationGain: exploitability.player0Gain,
            opponentDeviationGain: exploitability.player1Gain,
            nashConv: exploitability.nashConv,
            exploitability: exploitability.exploitability,
            treeNodes: Math.round(averageNodeCount / trainingIterations),
            rangeLabel: rangeInfo.rangeUsed === false
                ? rangeInfo.label
                : sampledRangeUsed
                    ? rangeInfo.label
                    : "Range large (combinaisons bloquées)",
            rangeConditioning: rangeInfo.conditioning || "aucune action postflop exploitable dans l'historique",
            profileModeledActions: rangeInfo.profileModeledActions || 0,
            rangeUsed: rangeInfo.rangeUsed === false ? false : sampledRangeUsed,
            postflopActionsUsed: rangeInfo.postflopActionsUsed || 0,
            heroEV,
            actions,
            convergence: "CFR+ échantillonné sur les ranges des deux joueurs. Le NashConv est estimé par meilleures réponses sur un échantillon indépendant et l'arbre abstrait ; il ne certifie pas l'exploitabilité du jeu complet ni la convergence globale. Les fréquences restent dépendantes de l'abstraction et du budget d'échantillonnage."
        };
    }


  return {
    solvePostflop,solveRiver:solvePostflop,validate,buildDecisionTree,
    buildUniformRange,sampleDeals
  };
}
export type StrategyApi=ReturnType<typeof createStrategy>;
/** Replace only the public V1 strategy entrypoints after parity.
 * Existing V1 script is kept for rollback and for its classic Worker.
 */
export function installStrategy():StrategyApi {
  const global=window as unknown as Window&StrategyGlobal&{PokerLabPostflopStrategy?:StrategyApi};
  if(!global.PokerLabCFRCore||!global.PokerLabHandEvaluator||!global.PokerLabPostflopSolver){
    throw new Error("Le moteur CFR+ dépend des modules de règles, ranges et évaluateur.");
  }
  const api=createStrategy(global);
  global.PokerLabPostflopStrategy=api;
  return api;
}
