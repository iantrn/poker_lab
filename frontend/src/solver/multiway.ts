/** Chance-sampled multiway (3–6 active seats) CFR+.
 *
 * Deliberately bounded to one abstract betting street; remaining cards are
 * sampled and future betting is checked down. This is NOT exact multiway GTO.
 * Ranges are seat-specific and conditioned on prior observable actions by the
 * existing PokerLab range provider; hidden cards are sampled, never peeked.
 */
import type {SolverCard} from "./input-contract.ts";
import type {StrategicGameState} from "./strategic-state.ts";
import {
  buildMultiwayTree,multiwayTerminalPayoffs,scoreMultiwayDeal,
  type MultiwayTree,type MultiwayNode,type MultiwayDecision,
  type MultiwayTerminal,type CompareScores
} from "./multiway-tree.ts";

type Card=SolverCard;
interface WeightedCombo{cards:Card[];weight:number}
export interface MultiwayRangeInfo {
  readonly combos:readonly WeightedCombo[]|null;
  readonly label:string;
  readonly rangeUsed?:boolean;
}
export interface MultiwayDeal {
  readonly holes:ReadonlyArray<readonly Card[]|null>;
  readonly board:readonly Card[];
  /** Corrects the sequential blocker-aware proposal toward the joint
   * distribution proportional to the product of seat-specific range weights.
   * The ratio lies in (0, 1] and is safe for Rust/WASM chance weighting.
   */
  readonly importanceWeight:number;
}
export interface MultiwayCfrKernel {
  step(actors:Int8Array,ids:Uint32Array,offsets:Uint32Array,
    counts:Uint8Array,children:Uint32Array,payoffs:Float64Array,weight:number):number;
  strategy_for_info_set(id:number):Float64Array|number[];
  average_strategy():Float64Array|number[];
  iterations():number;
  information_set_count():number;
}
export interface MultiwayEnvironment {
  newSession:(players:number)=>MultiwayCfrKernel;
  loadRange:(playerId:string)=>Promise<MultiwayRangeInfo>;
  evaluate:(cards:Card[])=>readonly number[];
  compareScores:CompareScores;
}
export interface MultiwaySolveOptions{
  iterations?:number;
  samples?:number;
  evaluationSamples?:number;
  seed?:number;
  onProgress?:(update:{
    phase:"training"|"evaluation";
    progress:number;
    provisional:true;
    iterations:number;
    actions?:Array<{action:string;frequency:number}>;
  })=>void;
}
type Registry=Map<string,{id:number;actions:number;signature:string}>;
interface FlatTree {
  actors:Int8Array;ids:Uint32Array;offsets:Uint32Array;
  counts:Uint8Array;children:Uint32Array;payoffs:Float64Array;
  rootInfo:number;
  rollback():void;
}
const suits=["clubs","diamonds","hearts","spades"] as const;
function boundedInt(value:unknown,fallback:number,minimum:number,maximum:number):number{
  if(value===undefined||value===null)return fallback;
  const number=Number(value);
  return Number.isSafeInteger(number)
    ?Math.max(minimum,Math.min(maximum,number)):fallback;
}
function id(card:Card):string{return card.value+"_"+card.suit;}
function validCard(card:Card|undefined):boolean{
  return Boolean(card&&Number.isInteger(card.value)&&card.value>=2&&card.value<=14&&
    suits.includes(card.suit as typeof suits[number]));
}
function sortedHand(hand:readonly Card[]):string{
  return hand.map(id).sort().join(",");
}
function rng(seed:number):()=>number{
  let state=(seed>>>0)||0xA3A3D3D3;
  return ()=>{
    state^=state<<13;state^=state>>>17;state^=state<<5;
    return (state>>>0)/0x100000000;
  };
}
function uniformHands(excluded:ReadonlySet<string>):WeightedCombo[]{
  const deck:Card[]=[];
  for(const suit of suits)for(let value=2;value<=14;value++){
    const card={suit,value};
    if(!excluded.has(id(card)))deck.push(card);
  }
  const combos:WeightedCombo[]=[];
  for(let i=0;i<deck.length;i++)for(let j=i+1;j<deck.length;j++)
    combos.push({cards:[deck[i]!,deck[j]!],weight:1});
  return combos;
}
interface Sampler {
  readonly labels:readonly string[];
  readonly rangeUsed:boolean;
  deal():MultiwayDeal;
}
function sampler(
  state:StrategicGameState,info:ReadonlyMap<number,MultiwayRangeInfo>,
  random:()=>number
):Sampler{
  const hero=state.players.find(player=>player.isHuman)!;
  const active=state.players.filter(player=>!player.folded);
  const reserved=new Set(state.board.map(id));
  for(const card of hero.knownPrivateCards??[]){
    if(reserved.has(id(card)))throw new Error("Cartes héro/board dupliquées.");
    reserved.add(id(card));
  }
  const uniform=uniformHands(reserved);
  const pools=new Map<number,readonly WeightedCombo[]>();
  const baseMasses=new Map<number,number>();
  const labels:string[]=[];
  let rangeUsed=true;
  for(const player of active){
    if(player.isHuman)continue;
    const range=info.get(player.seat);
    const valid=(range?.combos??[]).filter(combo=>combo.cards.length===2 &&
      Number.isFinite(combo.weight)&&combo.weight>0 &&
      combo.cards.every(card=>validCard(card)&&!reserved.has(id(card)))&&
      id(combo.cards[0]!)!==id(combo.cards[1]!));
    const pool=!valid.length||range?.rangeUsed===false?uniform:valid;
    if(pool===uniform){
      rangeUsed=false;
      labels.push(player.position+" : "+(range?.label??"Range uniforme"));
    }else labels.push(player.position+" : "+range!.label);
    pools.set(player.seat,pool);
    const mass=pool.reduce((sum,combo)=>sum+combo.weight,0);
    if(!(mass>0)||!Number.isFinite(mass))
      throw new RangeError("Range multiway : somme des poids invalide.");
    baseMasses.set(player.seat,mass);
  }
  return {
    labels,rangeUsed,
    deal(){
      // Sequential card-blocker rejection approximates the conditional joint
      // range, not a fully enumerated Bayesian multiway joint distribution.
      for(let attempt=0;attempt<32;attempt++){
        const holes:Array<readonly Card[]|null>=new Array(state.players.length).fill(null);
        const used=new Set(reserved);
        holes[hero.seat]=hero.knownPrivateCards;
        let feasible=true;
        let importanceWeight=1;
        for(const player of active){
          if(player.isHuman)continue;
          const pool=pools.get(player.seat)!;
          let total=0;
          for(const combo of pool){
            if(!used.has(id(combo.cards[0]!))&&!used.has(id(combo.cards[1]!)))
              total+=combo.weight;
          }
          if(total<=0){feasible=false;break;}
          // q_i = comboWeight / feasibleMass_i; the target joint range is
          // proportional to product(comboWeight) under card disjointness.
          // The proposal correction is product(feasibleMass_i / baseMass_i).
          importanceWeight*=total/baseMasses.get(player.seat)!;
          let draw=random()*total;
          let selected:readonly Card[]|null=null;
          for(const combo of pool){
            if(used.has(id(combo.cards[0]!))||used.has(id(combo.cards[1]!)))continue;
            draw-=combo.weight;
            if(draw<=0){selected=combo.cards;break;}
            selected=combo.cards;
          }
          if(!selected){feasible=false;break;}
          holes[player.seat]=selected;
          for(const card of selected)used.add(id(card));
        }
        if(!feasible)continue;
        const runout=state.board.map(card=>({...card}));
        if(runout.length<5){
          const remaining:Card[]=[];
          for(const suit of suits)for(let value=2;value<=14;value++){
            const card={value,suit};
            if(!used.has(id(card)))remaining.push(card);
          }
          for(let i=0;i<5-state.board.length;i++){
            const selection=i+Math.floor(random()*(remaining.length-i));
            [remaining[i],remaining[selection]]=[remaining[selection]!,remaining[i]!];
            runout.push(remaining[i]!);
          }
        }
        if(!(importanceWeight>0)||!Number.isFinite(importanceWeight))
          throw new Error("Poids joint multiway non fini.");
        return {holes,board:runout,importanceWeight};
      }
      throw new Error("Impossible d'échantillonner des mains multiway sans collisions.");
    }
  };
}
function infoKey(node:MultiwayDecision,deal:MultiwayDeal,board:string):string{
  const hole=deal.holes[node.actor];
  if(!hole)throw new Error("Main privée multiway manquante.");
  return node.actor+"|"+sortedHand(hole)+"|"+board+"|"+node.history;
}
function flatten(
  game:MultiwayTree,deal:MultiwayDeal,board:string,
  scores:ReadonlyArray<readonly number[]|null>,compare:CompareScores,
  registry:Registry
):FlatTree{
  const actors:number[]=[],ids:number[]=[],offsets:number[]=[],counts:number[]=[];
  const children:number[]=[],payoffs:number[]=[];
  const reserved:string[]=[];
  let rootInfo=-1;
  const players=game.players;
  function visit(node:MultiwayNode):number {
    const index=actors.length;
    actors.push(-1);ids.push(0);offsets.push(0);counts.push(0);
    for(let i=0;i<players;i++)payoffs.push(0);
    if(node.terminal){
      const net=multiwayTerminalPayoffs(node,scores,compare);
      for(let i=0;i<players;i++)payoffs[index*players+i]=net[i]!;
      return index;
    }
    actors[index]=node.actor;
    const key=infoKey(node,deal,board);
    const signature=node.actions.map(({action})=>
      action.type+":"+action.target+":"+action.label).join("|");
    const known=registry.get(key);
    if(known && (known.actions!==node.actions.length||known.signature!==signature))
      throw new Error("Actions incompatibles pour une même information multiway.");
    let entry=known;
    if(!entry){
      entry={id:registry.size,actions:node.actions.length,signature};
      registry.set(key,entry);
      reserved.push(key);
    }
    ids[index]=entry.id;
    if(index===0)rootInfo=entry.id;
    offsets[index]=children.length;
    counts[index]=node.actions.length;
    const base=children.length;
    for(let i=0;i<node.actions.length;i++)children.push(0);
    for(let i=0;i<node.actions.length;i++)
      children[base+i]=visit(node.actions[i]!.child);
    return index;
  }
  try{visit(game.root);}
  catch(error){
    for(const key of reserved)registry.delete(key);
    throw error;
  }
  return {
    actors:Int8Array.from(actors),ids:Uint32Array.from(ids),
    offsets:Uint32Array.from(offsets),counts:Uint8Array.from(counts),
    children:Uint32Array.from(children),payoffs:Float64Array.from(payoffs),
    rootInfo,
    rollback(){for(const key of reserved)registry.delete(key);}
  };
}
function averageForNode(
  node:MultiwayDecision,deal:MultiwayDeal,board:string,
  strategy:ReadonlyMap<string,readonly number[]>
):readonly number[]{
  const value=strategy.get(infoKey(node,deal,board));
  if(value)return value;
  return Array.from({length:node.actions.length},()=>1/node.actions.length);
}
function evaluatePolicy(
  node:MultiwayNode,deal:MultiwayDeal,board:string,hero:number,
  scores:ReadonlyArray<readonly number[]|null>,compare:CompareScores,
  strategy:ReadonlyMap<string,readonly number[]>
):number{
  if(node.terminal)return multiwayTerminalPayoffs(node,scores,compare)[hero]!;
  const probabilities=averageForNode(node,deal,board,strategy);
  let expected=0;
  for(let i=0;i<node.actions.length;i++){
    expected+=probabilities[i]!*evaluatePolicy(
      node.actions[i]!.child,deal,board,hero,scores,compare,strategy
    );
  }
  return expected;
}
/** Importance-weighted moments and Kish effective sample size. */
class WeightedMoments {
  sum=0;
  sumSquared=0;
  weight=0;
  weightSquared=0;
  count=0;
  add(value:number,importance:number):void{
    if(!Number.isFinite(value)||!Number.isFinite(importance)||importance<=0)
      throw new RangeError("Échantillon multiway pondéré invalide.");
    this.sum+=importance*value;
    this.sumSquared+=importance*value*value;
    this.weight+=importance;
    this.weightSquared+=importance*importance;
    this.count++;
  }
  get mean():number{return this.sum/this.weight;}
  get effectiveSamples():number{
    return this.weightSquared>0?this.weight*this.weight/this.weightSquared:0;
  }
  get radius95():number{
    const ess=this.effectiveSamples;
    if(ess<=1+1e-9)return Number.NaN;
    const variance=Math.max(0,this.sumSquared/this.weight-this.mean*this.mean);
    return 1.96*Math.sqrt(variance/(ess-1));
  }
}
async function createSampler(
  state:StrategicGameState,environment:MultiwayEnvironment,seed:number
):Promise<Sampler>{
  const ranges=new Map<number,MultiwayRangeInfo>();
  for(const player of state.players){
    if(player.folded||player.isHuman)continue;
    ranges.set(player.seat,await environment.loadRange(player.id));
  }
  return sampler(state,ranges,rng(seed));
}
function scoresFor(
  state:StrategicGameState,deal:MultiwayDeal,
  environment:MultiwayEnvironment
):ReadonlyArray<readonly number[]|null>{
  return scoreMultiwayDeal(state.players,deal.holes,deal.board,environment.evaluate);
}
export async function solveMultiway(
  state:StrategicGameState,environment:MultiwayEnvironment,
  options:MultiwaySolveOptions={}
){
  if(state.capability.solver!=="multiway-cfr-plus")
    throw new Error("La configuration n'est pas éligible au solveur multiway.");
  const game=buildMultiwayTree(state);
  const hero=state.players.find(player=>player.isHuman)!;
  const requested=boundedInt(options.iterations,32,16,384)*
    boundedInt(options.samples,2,1,4);
  const seed=Number.isSafeInteger(options.seed)?options.seed!>>>0:0x2357127;
  const training=await createSampler(state,environment,seed);
  const registry:Registry=new Map();
  const session=environment.newSession(state.players.length);
  const board=state.board.map(id).join(",");
  let rootInfo=-1;
  const progress=(phase:"training"|"evaluation",amount:number,iterations:number,
    preview?:Array<{action:string;frequency:number}>)=>{
    if(typeof options.onProgress==="function")
      options.onProgress({phase,progress:amount,iterations,provisional:true,
        ...(preview?{actions:preview}:{})});
  };
  for(let iteration=0;iteration<requested;iteration++){
    const deal=training.deal();
    const scores=scoresFor(state,deal,environment);
    const packed=flatten(game,deal,board,scores,environment.compareScores,registry);
    try{
      session.step(packed.actors,packed.ids,packed.offsets,packed.counts,
        packed.children,packed.payoffs,deal.importanceWeight);
      rootInfo=packed.rootInfo;
    }catch(error){packed.rollback();throw error;}
    const completed=iteration+1;
    if(completed%Math.max(8,Math.floor(requested/8))===0||completed===requested){
      const frequencies=Array.from(session.strategy_for_info_set(rootInfo));
      const preview=game.root.actions.map((entry,index)=>({
        action:entry.action.label,frequency:frequencies[index]!
      }));
      progress("training",0.8*completed/requested,completed,preview);
      // Event-loop fairness allows Worker termination when a table action
      // invalidates the current public state.
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
  }
  const rootPolicy=Array.from(session.strategy_for_info_set(rootInfo));
  const flattened=Array.from(session.average_strategy());
  const policy=new Map<string,readonly number[]>();
  let offset=0;
  for(const [key,entry] of registry){
    policy.set(key,flattened.slice(offset,offset+entry.actions));
    offset+=entry.actions;
  }
  if(offset!==flattened.length)
    throw new Error("Table multiway Rust incohérente avec les information sets.");
  const evaluationSamples=boundedInt(options.evaluationSamples,32,16,128);
  const evaluation=await createSampler(state,environment,seed^0x9e3779b9);
  const actionSamples=game.root.actions.map(()=>new WeightedMoments());
  const evSamples=new WeightedMoments();
  for(let i=0;i<evaluationSamples;i++){
    const deal=evaluation.deal(),scores=scoresFor(state,deal,environment);
    let heroEV=0;
    game.root.actions.forEach((entry,index)=>{
      const ev=evaluatePolicy(entry.child,deal,board,hero.seat,
        scores,environment.compareScores,policy);
      actionSamples[index]!.add(ev,deal.importanceWeight);
      heroEV+=rootPolicy[index]!*ev;
    });
    evSamples.add(heroEV,deal.importanceWeight);
    if((i+1)%8===0){
      progress("evaluation",0.8+0.2*(i+1)/evaluationSamples,requested);
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
  }
  const actions=game.root.actions.map((entry,index)=>{
    const values=actionSamples[index]!;
    const ev=values.mean,range=values.radius95;
    return {
      action:entry.action.label,frequency:rootPolicy[index]!,
      ev,evLower95:ev-range,evUpper95:ev+range
    };
  }).sort((a,b)=>b.frequency-a.frequency);
  const heroEV=evSamples.mean,band=evSamples.radius95;
  return {
    algorithm:"CFR+ multiway échantillonné",
    quality:"sampled_estimate" as const,provisional:false,
    street:state.street,iterations:session.iterations(),
    sampledHeroHands:requested,sampledOpponentHands:requested,
    sampledActualHeroHand:requested,heroRangeEffectiveSampleSize:requested,
    heroRangeLabel:"Main réelle du héros (range conditionnelle)",
    actualHandInHeroRange:true,
    evaluationSamples,
    evaluationEffectiveSampleSize:evSamples.effectiveSamples,
    treeNodes:game.nodes,
    rangeLabel:training.labels.join(" · "),
    rangeConditioning:"Ranges adverses par siège, tirage successif sans collisions, corrigé par importance pour la distribution jointe conditionnelle.",
    rangeUsed:training.rangeUsed,
    heroEV,heroEVLower95:heroEV-band,heroEVUpper95:heroEV+band,
    evaluationMethod:"EV Monte-Carlo indépendante pondérée par importance, intervalle 95 % approximatif selon ESS de Kish (hors biais de stratégie).",
    nashConv:null,exploitability:null,
    exploitabilitySamples:0,exploitabilityEffectiveSampleSize:0,
    heroDeviationGain:null,opponentDeviationGain:null,
    exploitabilityMethod:"Non disponible : NashConv HU et garantie d'équilibre non transposables au multiway.",
    postflopActionsUsed:0,actions,
    abstraction:"MULTIWAY "+state.players.filter(p=>!p.folded).length+
      " joueurs actifs, "+state.players.length+
      " sièges : une seule street stratégique, checkdown ensuite, 50 % pot"+
      (state.players.length<=3?" / pot":"")+
      ", une relance maximum, side pots et partage à égalité modélisés.",
    convergence:"Aucune garantie de convergence GTO en 3+ joueurs. Estimation CFR+ sur sous-jeu abstrait avec tirage indépendant conditionnel approximatif des ranges."
  };
}
export async function analyzeMultiwayEquity(
  state:StrategicGameState,environment:MultiwayEnvironment,
  options:{iterations?:number;seed?:number}={}
){
  if(state.capability.solver!=="multiway-cfr-plus")
    throw new Error("Équité multiway requiert 3+ joueurs actifs.");
  const seed=Number.isSafeInteger(options.seed)?options.seed!>>>0:0x4387721;
  if(state.pot<=0)throw new RangeError("L'équité multiway exige un pot positif.");
  const sample=await createSampler(state,environment,seed);
  const iterations=boundedInt(options.iterations,1_200,300,3_000);
  const hero=state.players.find(p=>p.isHuman)!;
  let wins=0,losses=0,ties=0;
  const equityMoments=new WeightedMoments();
  const baseTerminal:MultiwayTerminal={
    terminal:true,
    contributions:state.players.map(player=>player.totalContribution),
    folded:state.players.map(player=>player.folded)
  };
  for(let i=0;i<iterations;i++){
    const deal=sample.deal(),scores=scoresFor(state,deal,environment);
    const shares=multiwayTerminalPayoffs(
      baseTerminal,scores,environment.compareScores
    );
    const gross=shares[hero.seat]!+hero.totalContribution;
    // Money-equity is the share of ALL chips in the pot, including layers
    // from which the hero is ineligible. Showdown win/tie counts are only
    // descriptive of hand ranking, not side-pot payouts.
    equityMoments.add(gross/state.pot,deal.importanceWeight);
    const heroScore=scores[hero.seat];
    if(!heroScore)throw new Error("Score héro manquant pour le multiway.");
    let top=heroScore,winners=1,heroBest=true;
    for(const seat of state.activePlayerIds){
      if(seat===hero.id)continue;
      const other=state.players.find(p=>p.id===seat)!;
      const score=scores[other.seat];
      if(!score)throw new Error("Score adverse manquant.");
      const comparison=environment.compareScores(score,top);
      if(comparison>0){top=score;winners=1;heroBest=false;}
      else if(comparison===0)winners++;
    }
    if(heroBest){
      if(winners===1)wins++;else ties++;
    }else losses++;
    if((i+1)%128===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  const equity=equityMoments.mean;
  const potOdds=(hero.amountToCall>0)
    ?Math.min(hero.amountToCall,hero.stack)/
      (state.pot+Math.min(hero.amountToCall,hero.stack)):0;
  return {
    equity,wins,ties,losses,iterations,
    effectiveSampleSize:equityMoments.effectiveSamples,
    rangeLabel:sample.labels.join(" · "),
    decision:{
      potOdds,action:"Équité indicative multiway",
      explanation:"L'équité de showdown n'est pas une stratégie de mise. La réalisation de l'équité, les side pots et les mises futures changent les décisions."
    },
    note:"Équité = fraction moyenne pondérée du pot attribuée au héros, range jointe corrigée par importance, pots secondaires et bloqueurs inclus (mises futures non modélisées). Victoires/égalités/défaites sont des comptes bruts de tirages, pas des probabilités pondérées ni le partage des side pots."
  };
}
