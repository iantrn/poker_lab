/** Exact ε-Nash audit adapter for a FINITELY ENUMERATED multiway PokerLab
 * abstraction. It cannot certify the unabstracted NLHE game.
 *
 * Caller supplies a COMPLETE finite scenario distribution and a complete
 * rational behavioral policy. Arbitrary sampling is NEVER promoted into
 * full-game certification; output scope is explicitly finite_game_only.
 */
import type {SolverCard} from "./input-contract.ts";
import type {StrategicGameState} from "./strategic-state.ts";
import {
  buildMultiwayTree,scoreMultiwayDeal,
  type MultiwayAction,type MultiwayNode,type MultiwayTerminal,
  type CompareScores
} from "./multiway-tree.ts";
import {
  certifyFiniteNash,type ExactFraction,type ExactNode,
  type FiniteNashCertificate
} from "./finite-nash-certificate.ts";

export interface ExplicitPokerScenario {
  readonly probability:ExactFraction;
  readonly board:readonly SolverCard[];
  /** All ACTIVE private hands, with folded seats null as needed. */
  readonly holes:ReadonlyArray<readonly SolverCard[]|null>;
}
export interface FinitePokerAuditInput {
  readonly state:StrategicGameState;
  readonly scenarios:readonly ExplicitPokerScenario[];
  readonly maxStreets?:number;
  readonly epsilon?:ExactFraction;
  readonly evaluate:(cards:SolverCard[])=>readonly number[];
  readonly compareScores:CompareScores;
  /** A policy at EVERY information set. A rounded CFR policy must be
   * explicitly represented as rational probabilities before auditing.
   */
  readonly policyForInfoSet:(
    key:string,actions:readonly MultiwayAction[]
  )=>readonly ExactFraction[];
}
const suits=new Set(["clubs","diamonds","hearts","spades"]);
function cardId(card:SolverCard):string{
  if(!card||!Number.isInteger(card.value)||card.value<2||card.value>14||
     !suits.has(card.suit))
    throw new Error("Carte invalide dans le scénario certifié.");
  return card.value+"_"+card.suit;
}
function sorted(hand:readonly SolverCard[]):string{
  return hand.map(cardId).sort().join(",");
}
function halfChipUnits(amount:number):bigint{
  if(!Number.isFinite(amount)||amount<0||
     !Number.isSafeInteger(Math.round(2*amount))||
     Math.abs(2*amount-Math.round(2*amount))>1e-8)
    throw new RangeError("La vérification exacte exige des mises en demi-jetons.");
  return BigInt(Math.round(2*amount));
}
/** Exact split of side pots. All amounts use 0.5-chip increments and at most
 * six winners. lcm(1..6)=60, so 120 is a common CHIP denominator; no
 * approximate floating-point fractions are used to construct utilities.
 */
export function exactMultiwayTerminalPayoffs(
  terminal:MultiwayTerminal,
  scores:ReadonlyArray<readonly number[]|null>,
  compareScores:CompareScores
):readonly ExactFraction[]{
  const seats=terminal.contributions.length;
  if(seats<2||seats>6||terminal.folded.length!==seats||
     scores.length!==seats)
    throw new RangeError("Terminal multiway de dimension invalide.");
  const units=terminal.contributions.map(halfChipUnits);
  const profits=units.map(v=>-v*60n);
  const levels=[...new Set(units.filter(v=>v>0n))].sort((a,b)=>
    a<b?-1:a>b?1:0);
  let last=0n;
  for(const level of levels){
    const contributorIds=units.map((v,i)=>v>=level?i:-1)
      .filter(i=>i>=0);
    const size=(level-last)*BigInt(contributorIds.length);
    let eligible=contributorIds.filter(i=>!terminal.folded[i]);
    if(!eligible.length){
      eligible=terminal.folded.map((folded,i)=>folded?-1:i)
        .filter(i=>i>=0);
    }
    if(!eligible.length)
      throw new Error("Pot secondaire sans joueur éligible.");
    let winners=[eligible[0]!];
    for(const candidate of eligible.slice(1)){
      const a=scores[candidate],b=scores[winners[0]!];
      if(!a||!b)throw new Error("Score de showdown requis pour le certificat.");
      const result=compareScores(a,b);
      if(!Number.isFinite(result))
        throw new Error("Comparaison de showdown non finie.");
      if(result>0)winners=[candidate];
      else if(result===0)winners.push(candidate);
    }
    const share=size*(60n/BigInt(winners.length));
    for(const seat of winners)profits[seat]!+=share;
    last=level;
  }
  if(profits.reduce((a,b)=>a+b,0n)!==0n)
    throw new Error("Certificat : les jetons doivent être conservés exactement.");
  return profits.map(num=>({
    numerator:String(num),denominator:"120"
  }));
}
/** Convert a floating CFR policy to a precisely specified rational profile
 * with transparent quantization. The certificate applies to this rounded
 * profile, not to the unrounded floating point table.
 */
export function quantizePolicy(
  frequencies:readonly number[],scale=1_000_000
):readonly ExactFraction[]{
  if(!Array.isArray(frequencies)||frequencies.length<1||
     frequencies.length>4||!Number.isSafeInteger(scale)||scale<1||
     scale>1_000_000_000||frequencies.some(v=>!Number.isFinite(v)||v<0||v>1))
    throw new RangeError("Fréquences ou précision de quantification invalides.");
  const total=frequencies.reduce((sum,v)=>sum+v,0);
  if(Math.abs(total-1)>1e-8)
    throw new RangeError("La stratégie CFR doit être normalisée.");
  const exact=frequencies.map(v=>v*scale);
  const integer=exact.map(Math.floor);
  let remainder=scale-integer.reduce((sum,n)=>sum+n,0);
  const ranked=exact.map((v,i)=>({i,fraction:v-Math.floor(v)}))
    .sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
  for(let i=0;i<remainder;i++)integer[ranked[i]!.i]!++;
  return integer.map(n=>({
    numerator:String(n),denominator:String(scale)
  }));
}
/** A complete explicit scenario corpus is required; the caller must never
 * treat Monte-Carlo draws as exhaustive real-world Hold'em chance outcomes.
 */
export function certifyExplicitMultiwayPokerSubgame(
  input:FinitePokerAuditInput
):FiniteNashCertificate{
  const {state,scenarios,evaluate,compareScores,policyForInfoSet}=input;
  if(typeof evaluate!=="function"||typeof compareScores!=="function"||
     typeof policyForInfoSet!=="function"||
     !Array.isArray(scenarios)||!scenarios.length||scenarios.length>32)
    throw new RangeError("Un modèle fini et une stratégie complète sont requis.");
  const tree=buildMultiwayTree(state,{
    maxStreets:input.maxStreets??(6-state.board.length)
  });
  if(tree.nodes*scenarios.length>16_000)
    throw new RangeError("Certificat exhaustif : budget mobile de nœuds dépassé.");
  const profile:Record<string,readonly ExactFraction[]>=Object.create(null);
  const hero=state.players.find(player=>player.isHuman);
  if(!hero?.knownPrivateCards||hero.knownPrivateCards.length!==2)
    throw new Error("Main réelle du héros indispensable à l'audit fini.");
  const heroIdentity=sorted(hero.knownPrivateCards);
  const outcomes=scenarios.map(scenario=>{
    if(scenario.board.length!==5||scenario.holes.length!==state.players.length)
      throw new Error("Scénario de hasard invalide.");
    const seen=new Set<string>();
    for(const card of scenario.board){
      const key=cardId(card);
      if(seen.has(key))throw new Error("Carte publique dupliquée.");
      seen.add(key);
    }
    for(let i=0;i<state.board.length;i++){
      if(cardId(scenario.board[i]!)!==cardId(state.board[i]!))
        throw new Error("Le scénario modifie une carte déjà publique.");
    }
    for(const seat of state.players){
      const hand=scenario.holes[seat.seat];
      if(seat.folded){
        if(hand!==null&&hand!==undefined)
          throw new Error("Les mains privées des joueurs couchés sont inutiles.");
        continue;
      }
      if(!hand||hand.length!==2)
        throw new Error("Main privée active manquante.");
      for(const card of hand){
        const key=cardId(card);
        if(seen.has(key))throw new Error("Collision de cartes du scénario.");
        seen.add(key);
      }
    }
    if(sorted(scenario.holes[hero.seat]!)!==heroIdentity)
      throw new Error("Le scénario change la main du héros.");
    const scores=scoreMultiwayDeal(
      state.players,scenario.holes,scenario.board,evaluate
    );
    function convert(node:MultiwayNode):ExactNode{
      if(node.terminal)return {
        kind:"terminal",
        payoffs:exactMultiwayTerminalPayoffs(node,scores,compareScores)
      };
      const privateCards=scenario.holes[node.actor];
      if(!privateCards||privateCards.length!==2)
        throw new Error("Acteur sans cartes privées dans le scénario.");
      const board=scenario.board.slice(0,node.boardLength).map(cardId).join(",");
      const key=node.actor+"|"+sorted(privateCards)+"|"+board+"|"+node.history;
      if(!(key in profile)){
        profile[key]=policyForInfoSet(
          key,node.actions.map(x=>x.action)
        );
      }
      return {
        kind:"decision",player:node.actor,informationSet:key,
        actions:node.actions.map(({action,child})=>({
          label:action.type+":"+action.target+":"+action.label,
          child:convert(child)
        }))
      };
    }
    return {probability:scenario.probability,child:convert(tree.root)};
  });
  return certifyFiniteNash({
    players:state.players.length,
    root:{
      kind:"chance",outcomes
    },
    profile
  },input.epsilon);
}
