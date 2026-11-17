/** Blocker-aware range-vs-range chance sampler used by the postflop CFR+ solver.
 *
 * Exact V1 joint-distribution and importance-weight semantics, with per-hero
 * opponent-candidate caching to avoid repeatedly filtering the same ranges.
 * Sampling uses the caller's RNG verbatim, preserving deterministic fixtures.
 */
import type { SolverCard } from "./input-contract";
import { createWeightedPicker } from "./weighted-picker.ts";

export interface HandCombo {
  cards: SolverCard[];
  weight: number;
  [attribute: string]: unknown;
}
interface HeroCandidate extends HandCombo {
  opponentMass?: number;
}
interface ProposalHero extends HeroCandidate {
  priorProbability: number;
  proposalProbability: number;
}
export interface ChanceDeal {
  hero: SolverCard[];
  villain: SolverCard[];
  runout: SolverCard[];
  finalBoard: SolverCard[];
  heroImportanceWeight: number;
  isActualHero: boolean;
  showdownResult?: number;
}
export interface ChanceSample {
  deals: ChanceDeal[];
  rangeUsed: boolean;
  heroRangeUsed: boolean;
  actualHeroInRange: boolean;
  actualHeroSamples: number;
}
export type PokerRandom = () => number;

const cardId = (card: SolverCard): string => card.value + "_" + card.suit;
const handId = (cards: SolverCard[]): string => cards.map(cardId).sort().join(",");

export function buildUniformRange(knownCards: SolverCard[]): HandCombo[] {
  const blocked = new Set(knownCards.map(cardId));
  const suits = ["clubs", "diamonds", "hearts", "spades"];
  const deck: SolverCard[] = [];
  for (const suit of suits) for (let value = 2; value <= 14; value++) {
    const card = {value,suit};
    if (!blocked.has(cardId(card))) deck.push(card);
  }
  const combos: HandCombo[] = [];
  for (let first = 0; first < deck.length; first++) {
    for (let second = first + 1; second < deck.length; second++) {
      combos.push({cards: [deck[first]!, deck[second]!],weight:1});
    }
  }
  return combos;
}
function validCombos(range: unknown, blocked: Set<string>): HandCombo[] {
  return Array.isArray(range) ?
    range.filter((item: HandCombo | null | undefined) =>
      item?.cards && item.cards.length === 2 &&
      item.cards.every(card => card && !blocked.has(cardId(card))) &&
      cardId(item.cards[0]!) !== cardId(item.cards[1]!) &&
      Number.isFinite(Number(item.weight)) && Number(item.weight) > 0
    ).map((item: HandCombo) => ({...item,weight:Number(item.weight)}))
    : [];
}
export function createDealSampler(
  actualHero:SolverCard[],
  board:SolverCard[],
  opponentRange:HandCombo[]|null,
  rangeUsedHint=true,
  random:PokerRandom=Math.random,
  heroRange:HandCombo[]|null=null
): (sampleCount:number)=>ChanceSample {
  const boardBlocked=new Set(board.map(cardId));
  const opponentBaseCandidates=validCombos(opponentRange,boardBlocked);
  let useOpponentRange=opponentBaseCandidates.length>0;
  let heroCandidates:HeroCandidate[]=validCombos(heroRange,boardBlocked);
  if (!heroCandidates.length) heroCandidates=[{cards:actualHero,weight:1}];

  if(useOpponentRange){
    heroCandidates=heroCandidates.map(item=>{
      const blockedByHero=new Set(item.cards.map(cardId));
      const opponentMass=opponentBaseCandidates
        .filter(candidate=>candidate.cards.every(card=>!blockedByHero.has(cardId(card))))
        .reduce((sum,candidate)=>sum+Number(candidate.weight),0);
      return {...item,opponentMass};
    }).filter(item=>(item.opponentMass??0)>0);
    if(!heroCandidates.some(item=>handId(item.cards)===handId(actualHero))){
      heroCandidates=[{cards:actualHero,weight:1,opponentMass:0}];
      useOpponentRange=false;
    }
  }

  const heroTotal=heroCandidates.reduce((sum,item)=>sum+Number(item.weight),0);
  const actualHeroKey=handId(actualHero);
  const actualHeroEntry=heroCandidates.find(item=>handId(item.cards)===actualHeroKey);
  const actualHandBoost=actualHeroEntry?0.25:0;
  const proposalHeroRange:ProposalHero[]=heroCandidates.map(item=>{
    const priorProbability=Number(item.weight)/heroTotal;
    const isActual=handId(item.cards)===actualHeroKey;
    return {
      ...item,priorProbability,
      proposalProbability:(1-actualHandBoost)*priorProbability+(isActual?actualHandBoost:0)
    };
  });
  // Equivalent to the V1 map created for each draw; preparing once removes
  // small-object allocation per CFR sample without changing RNG consumption.
  const proposal=proposalHeroRange.map(item=>({
    cards:item.cards,weight:item.proposalProbability,
    priorProbability:item.priorProbability,
    proposalProbability:item.proposalProbability,
    opponentMass:item.opponentMass
  }));
  // Preserve the range proposal and the bounded opponent cache for the whole solve.
  // The RNG is still consumed exactly once per weighted choice and per shuffle step.
  const suits=["clubs","diamonds","hearts","spades"];
  const pickHero=createWeightedPicker(proposal,random);
  const villainCache=new Map<string,HandCombo[]>();
  const villainPickers=new Map<string,()=>HandCombo>();
  const MAX_CACHED_HERO_HANDS=32;
  return (sampleCount:number):ChanceSample=>{
    const deals:ChanceDeal[]=[];
    let actualHeroSamples=0,opponentRangeSamples=0;
    for(let i=0;i<sampleCount;i++){
      const selectedHero=pickHero();
      const hero=selectedHero.cards;
      const selectedKey=handId(hero);
      const isActualHero=selectedKey===actualHeroKey;
      if(isActualHero)actualHeroSamples++;
      const heroProposalImportance=selectedHero.proposalProbability>0
        ? selectedHero.priorProbability/selectedHero.proposalProbability : 1;
      const blocked=new Set([...hero,...board].map(cardId));
      let villainCandidates=villainCache.get(selectedKey);
      if(!villainCandidates){
        villainCandidates=useOpponentRange
          ? validCombos(opponentRange,blocked)
          : buildUniformRange([...hero,...board]);
        villainCache.set(selectedKey,villainCandidates);
        if(villainCache.size>MAX_CACHED_HERO_HANDS) {
          const expiredKey=villainCache.keys().next().value!;
          villainCache.delete(expiredKey);
          villainPickers.delete(expiredKey);
        }
      }
      if(!villainCandidates.length){
        throw new Error("Aucune combinaison adverse disponible pour le calcul CFR.");
      }
      // Uniform fallback has weight 1 per valid combo; summing all weights
      // on each independent draw would cost O(1,000) unnecessarily.
      const opponentConditionalMass=useOpponentRange
        ? selectedHero.opponentMass
        : villainCandidates.length;
      const heroImportanceWeight=heroProposalImportance*Number(opponentConditionalMass);
      let pickVillain=villainPickers.get(selectedKey);
      if(!pickVillain){
        pickVillain=createWeightedPicker(villainCandidates,random);
        villainPickers.set(selectedKey,pickVillain);
      }
      const villain=pickVillain().cards;
      if(useOpponentRange && rangeUsedHint)opponentRangeSamples++;
      const excluded=new Set([...hero,...board,...villain].map(cardId));
      let runout:SolverCard[];
      if(board.length===5 && excluded.size===9){
        // A river has no future board cards. V1 still shuffled the 43-card
        // remainder; consume its 42 RNG calls to retain seeded CFR parity,
        // but skip 43 card allocations and 42 unnecessary array swaps.
        for(let index=42;index>0;index--)random();
        runout=[];
      }else{
        // The entire Fisher-Yates shuffle is required on flop/turn to keep
        // the identical ordered runout and RNG state as the V1 sampler.
        const deck:SolverCard[]=[];
        for(const suit of suits)for(let value=2;value<=14;value++){
          const card={value,suit};
          if(!excluded.has(cardId(card)))deck.push(card);
        }
        for(let index=deck.length-1;index>0;index--){
          const swap=Math.floor(random()*(index+1));
          [deck[index],deck[swap]]=[deck[swap]!,deck[index]!];
        }
        runout=deck.slice(0,5-board.length);
      }
      deals.push({
        hero,villain,runout,finalBoard:[...board,...runout],
        heroImportanceWeight,isActualHero
      });
    }
    return {
      deals,rangeUsed:opponentRangeSamples===sampleCount && rangeUsedHint,
      heroRangeUsed:Array.isArray(heroRange)&&heroRange.length>0&&Boolean(actualHeroEntry),
      actualHeroInRange:Boolean(actualHeroEntry),actualHeroSamples
    };
  };
}
/** Stateless compatibility entry point; the strategic solver uses the prepared
 * sampler to avoid repeated O(hero-range × villain-range) blocker filtering.
 */
export function sampleDeals(
  actualHero:SolverCard[],
  board:SolverCard[],
  opponentRange:HandCombo[]|null,
  sampleCount:number,
  rangeUsedHint=true,
  random:PokerRandom=Math.random,
  heroRange:HandCombo[]|null=null
):ChanceSample {
  return createDealSampler(actualHero,board,opponentRange,rangeUsedHint,random,heroRange)(sampleCount);
}

/** Compatibly replace only public sampling; internal V1 chance traversals
 * remain V1 until the full solvePostflop orchestration is ported.
 */
export function installDealSampler():void{
  const target=window as Window & {PokerLabPostflopStrategy?:{
    buildUniformRange:typeof buildUniformRange;
    sampleDeals:typeof sampleDeals;
  }};
  if(!target.PokerLabPostflopStrategy) throw new Error("PokerLabPostflopStrategy is not initialized.");
  target.PokerLabPostflopStrategy.buildUniformRange=buildUniformRange;
  target.PokerLabPostflopStrategy.sampleDeals=sampleDeals;
}
