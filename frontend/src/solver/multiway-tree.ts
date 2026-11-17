/** Bounded multi-street chance-sampled multiway NLHE game.
 * Each node exposes only the cards already dealt on its street. The sampled
 * runout enters the CFR information key at turn/river, never at the flop.
 * The poker engine supplies the authoritative ROOT legal actions and the
 * current pending queue; future streets use a documented coarse abstraction.
 * This is not an exact multiway Nash equilibrium model.
 */
import type {SolverCard} from "./input-contract.ts";
import type {StrategicGameState,StrategicPlayer} from "./strategic-state.ts";

const CHIP=0.5;
const MAX_NODES=12_000;
const MAX_DEPTH=64;
const MAX_MOBILE_INFO_SETS=60_000;
const MAX_RAISES=1; // keep 3–6 seat mobile abstractions tractable
const round=(amount:number)=>Math.round(amount/CHIP)*CHIP;

export interface MultiwayAction {
  readonly type:"fold"|"check"|"call"|"bet"|"raise";
  readonly label:string;
  readonly target:number;
}
export interface MultiwayTerminal {
  readonly terminal:true;
  readonly contributions:readonly number[];
  readonly folded:readonly boolean[];
}
export interface MultiwayDecision {
  readonly terminal:false;
  readonly actor:number;
  readonly history:string;
  /** Public board size at this decision; no future-card information leakage. */
  readonly boardLength:3|4|5;
  readonly street:"flop"|"turn"|"river";
  readonly actions:readonly {action:MultiwayAction;child:MultiwayNode}[];
}
export type MultiwayNode=MultiwayTerminal|MultiwayDecision;
interface MutableStreet {
  stacks:number[];
  bets:number[];
  contributions:number[];
  folded:boolean[];
  allIn:boolean[];
  pending:number[];
  currentBet:number;
  lastFullRaise:number;
  raises:number;
  boardLength:3|4|5;
  streetsVisited:number;
  openingSeat:number;
  path:string;
}
export interface MultiwayTree {
  readonly root:MultiwayDecision;
  readonly nodes:number;
  readonly players:number;
  readonly model:"single-street-checkdown"|"multi-street-sampled-runout";
  readonly streetsModeled:number;
  readonly decisionNodes:number;
  readonly raiseCap:number;
}
function clone(s:MutableStreet):MutableStreet {
  return {
    stacks:s.stacks.slice(),bets:s.bets.slice(),
    contributions:s.contributions.slice(),folded:s.folded.slice(),
    allIn:s.allIn.slice(),pending:s.pending.slice(),
    currentBet:s.currentBet,lastFullRaise:s.lastFullRaise,
    raises:s.raises,boardLength:s.boardLength,
    streetsVisited:s.streetsVisited,openingSeat:s.openingSeat,path:s.path
  };
}
function actionable(s:MutableStreet,seat:number):boolean {
  return !s.folded[seat]&&!s.allIn[seat]&&s.stacks[seat]!>0;
}
function nextSeats(s:MutableStreet,after:number):number[] {
  const seats:number[]=[];
  for(let distance=1;distance<s.stacks.length;distance++){
    const seat=(after+distance)%s.stacks.length;
    if(actionable(s,seat))seats.push(seat);
  }
  return seats;
}
function rootAllows(
  publicState:StrategicGameState,action:MultiwayAction
):boolean {
  const available=publicState.legalActions.filter(entry=>entry.action===action.type);
  if(!available.length)return false;
  if(action.type!=="bet"&&action.type!=="raise")return true;
  return available.some(entry=>{
    // Opening bet bounds represent *additional chips*; raiseTo bounds
    // represent absolute street contributions.
    const target=action.type==="bet"?
      action.target-publicState.players.find(p=>p.id===publicState.currentActor)!.streetBet:
      action.target;
    return target>=(entry.minTo??0)-1e-9 &&
      target<=(entry.maxTo??Number.POSITIVE_INFINITY)+1e-9;
  });
}
function options(s:MutableStreet,actor:number,
  publicState:StrategicGameState,root:boolean):MultiwayAction[]{
  const call=Math.max(0,s.currentBet-s.bets[actor]!);
  const pot=s.contributions.reduce((sum,value)=>sum+value,0);
  const maxTo=round(s.bets[actor]!+s.stacks[actor]!);
  const results:MultiwayAction[]=[];
  const add=(type:MultiwayAction["type"],label:string,target=0)=>{
    const entry:MultiwayAction={type,label,target};
    if(!root||rootAllows(publicState,entry))results.push(entry);
  };
  if(call>0){
    add("fold","Se coucher");
    add("call",s.stacks[actor]!<=call?"Suivre (tapis)":"Suivre");
    // From five seats onward, future streets intentionally disallow raises
    // to prevent the exponential multiway branch explosion on mobile.
    if(s.raises<MAX_RAISES && s.stacks[actor]!>call &&
       (s.streetsVisited===1||s.stacks.length<=4)){
      const minTo=round(s.currentBet+Math.max(publicState.bigBlind,s.lastFullRaise));
      if(maxTo>=minTo){
        add("raise","Relance minimale",minTo);
        if(s.stacks.length<=3){
          const size=round(Math.max(minTo,s.currentBet+pot*0.5));
          if(size>minTo&&size<=maxTo)add("raise","Relance 50 % pot",size);
        }
      }
    }
  }else{
    add("check","Checker");
    // For 5–6-seat tables, a future street may be opened only by
    // its first actionable player. Everyone else still chooses fold/call
    // facing the bet. This coarse future abstraction is shown in the UI.
    if(s.raises<MAX_RAISES &&
       (s.streetsVisited===1||s.stacks.length<=4||actor===s.openingSeat)){
      const minBet=Math.min(s.stacks[actor]!,publicState.bigBlind);
      const rootLimit=root?
        publicState.legalActions.find(action=>action.action==="bet")?.maxTo:
        undefined;
      const available=Math.min(s.stacks[actor]!,rootLimit??s.stacks[actor]!);
      const size=round(Math.min(available,
        Math.max(minBet,pot*0.5)));
      if(size>0){
        add("bet","Miser 50 % pot",s.bets[actor]!+size);
        if(s.stacks.length<=3 && s.streetsVisited===1){
          const full=(Math.min(available,Math.max(minBet,pot)));
          if(full>size)add("bet","Miser pot",s.bets[actor]!+full);
        }
      }
    }
  }
  // A forced call can be a single legal decision. Never synthesize a fold if
  // the real engine disallows it; Rust accepts one-action info sets.
  return results;
}
function transition(s:MutableStreet,actor:number,action:MultiwayAction):MutableStreet{
  const updated=clone(s);
  const current=updated.currentBet;
  const before=updated.bets[actor]!;
  updated.pending=updated.pending.filter(seat=>seat!==actor);
  const pay=(additional:number)=>{
    const amount=round(Math.min(Math.max(0,additional),updated.stacks[actor]!));
    updated.stacks[actor]=round(updated.stacks[actor]!-amount);
    updated.contributions[actor]=round(updated.contributions[actor]!+amount);
    updated.bets[actor]=round(updated.bets[actor]!+amount);
    if(updated.stacks[actor]===0)updated.allIn[actor]=true;
  };
  if(action.type==="fold")updated.folded[actor]=true;
  if(action.type==="call")pay(current-before);
  if(action.type==="bet"||action.type==="raise"){
    pay(action.target-before);
    updated.currentBet=Math.max(current,updated.bets[actor]!);
    updated.lastFullRaise=round(updated.currentBet-current);
    updated.raises++;
    updated.pending=nextSeats(updated,actor);
  }
  updated.path+="|"+actor+":"+action.type+":"+action.target;
  return updated;
}
/** Build a deterministic topology once; chance cards affect infoset keys
 * and terminal payoffs but not graph structure. maxStreets=1 preserves the
 * original one-street oracle for parity tests and rollback diagnostics.
 */
export function buildMultiwayTree(
  state:StrategicGameState,config:{maxStreets?:number}={}
):MultiwayTree {
  const players=state.players;
  const availableStreets=6-state.board.length;
  const maxStreets=config.maxStreets??1;
  if(!Number.isInteger(maxStreets)||maxStreets<1||maxStreets>availableStreets)
    throw new RangeError("Nombre de streets stratégiques invalide.");
  if(players.length<3||players.length>6||
     !["flop","turn","river"].includes(state.street)||
     state.handComplete)
    throw new RangeError("Arbre multiway disponible pour 3 à 6 sièges postflop.");
  const rootSeat=players.findIndex(p=>p.id===state.currentActor);
  if(rootSeat<0||!players[rootSeat]!.isHuman||
     players.filter(p=>!p.folded).length<3)
    throw new RangeError("Arbre multiway disponible au tour du héros avec 3+ joueurs actifs.");
  if(!state.legalActions.length)
    throw new RangeError("Aucune action légale multiway à la racine.");
  const pendingSource=state.pendingSeats.length?
    new Set(state.pendingSeats):new Set(players.map(p=>p.seat));
  // Rotate the queue starting from the actual current player. The public
  // engine's pending-seat set determines who still needs an action.
  const pending:number[]=[];
  for(let distance=0;distance<players.length;distance++){
    const seat=(rootSeat+distance)%players.length;
    const player=players[seat]!;
    if((distance===0||pendingSource.has(seat))&&
       !player.folded&&!player.allIn&&player.stack>0)pending.push(seat);
  }
  const initial:MutableStreet={
    stacks:players.map(p=>p.stack),
    bets:players.map(p=>p.streetBet),
    contributions:players.map(p=>p.totalContribution),
    folded:players.map(p=>p.folded),
    allIn:players.map(p=>p.allIn),
    pending,currentBet:state.currentBet,lastFullRaise:state.lastFullRaise,
    raises:0,boardLength:state.board.length as 3|4|5,
    streetsVisited:1,openingSeat:rootSeat,
    path:state.street+":"+state.currentActor
  };
  let nodes=0,decisionNodes=0;
  // New betting rounds reset street contributions but never the committed
  // pot/stack; action always resumes left of the dealer among live players.
  function nextStreet(s:MutableStreet):MutableStreet{
    const updated=clone(s);
    updated.boardLength=(s.boardLength+1) as 4|5;
    updated.streetsVisited++;
    updated.bets.fill(0);
    updated.currentBet=0;
    updated.lastFullRaise=state.bigBlind;
    updated.raises=0;
    const seats:number[]=[];
    for(let distance=1;distance<=updated.stacks.length;distance++){
      const seat=(state.dealerSeat+distance)%updated.stacks.length;
      if(actionable(updated,seat))seats.push(seat);
    }
    updated.openingSeat=seats[0]??-1;
    updated.pending=seats;
    updated.path+="|"+(updated.boardLength===4?"turn":"river");
    return updated;
  }
  function build(s:MutableStreet,depth:number):MultiwayNode {
    nodes++;
    if(nodes>MAX_NODES||depth>MAX_DEPTH)
      throw new RangeError("Arbre abstrait multiway trop grand pour le budget mobile.");
    const alive=s.folded.filter(value=>!value).length;
    const actor=s.pending.find(seat=>actionable(s,seat));
    if(alive>1&&actor===undefined&&s.boardLength<5&&
       s.streetsVisited<maxStreets &&
       s.stacks.filter((_,seat)=>actionable(s,seat)).length>=2){
      // Chance reveals exactly one additional card before anyone can act.
      // No information from that sampled card is placed in the previous
      // street's information sets.
      return build(nextStreet(s),depth+1);
    }
    if(alive<=1||actor===undefined){
      return {
        terminal:true,contributions:s.contributions.slice(),folded:s.folded.slice()
      };
    }
    decisionNodes++;
    const actions=options(s,actor,state,depth===0);
    if(!actions.length)
      throw new Error("Aucune action multiway légale dans une décision active.");
    return {
      terminal:false,actor,history:s.path,
      boardLength:s.boardLength,
      street:s.boardLength===3?"flop":s.boardLength===4?"turn":"river",
      actions:actions.map(action=>({
        action,child:build(transition(s,actor,action),depth+1)
      }))
    };
  }
  const root=build(initial,0);
  if(root.terminal)throw new Error("Arbre multiway sans décision.");
  return {root,nodes,decisionNodes,players:players.length,
    model:maxStreets>1?"multi-street-sampled-runout":"single-street-checkdown",
    streetsModeled:maxStreets,raiseCap:MAX_RAISES};
}
/** Choose the largest safe street horizon once, before training.
 * The worst-case number of distinct infosets is bounded by decision nodes ×
 * sample count; Rust has 65,536 slots, so reserve headroom for mobile.
 * If a full flop→river graph is too large, reduce ONLY the future horizon,
 * never silently exceed the WASM memory/CPU budget.
 */
export function buildAdaptiveMultiwayTree(
  state:StrategicGameState,requestedSamples:number
):{tree:MultiwayTree;trainingSamples:number}{
  if(!Number.isSafeInteger(requestedSamples)||requestedSamples<1)
    throw new RangeError("Budget multiway de sampling invalide.");
  const max=6-state.board.length;
  for(let horizon=max;horizon>=1;horizon--){
    let tree:MultiwayTree;
    try{tree=buildMultiwayTree(state,{maxStreets:horizon});}
    catch(error){
      if(error instanceof RangeError &&
         /Arbre abstrait multiway trop grand/.test(error.message))continue;
      throw error;
    }
    const cap=Math.floor(MAX_MOBILE_INFO_SETS/Math.max(1,tree.decisionNodes));
    if(cap<16&&horizon>1)continue;
    const samples=Math.min(requestedSamples,Math.max(1,cap));
    return {tree,trainingSamples:samples};
  }
  throw new RangeError("Aucun arbre multiway compatible avec le budget mobile.");
}
export type CompareScores=(a:readonly number[],b:readonly number[])=>number;
/** Net chips for EVERY seat, including already folded players. Tied pots are
 * split fractionally, preserving expected zero-sum equity exactly. The real
 * engine remains responsible for odd-chip distribution at showdown.
 */
export function multiwayTerminalPayoffs(
  terminal:MultiwayTerminal,scores:ReadonlyArray<readonly number[]|null>,
  compare:CompareScores
):number[]{
  const n=terminal.contributions.length;
  if(scores.length!==n||terminal.folded.length!==n)
    throw new RangeError("Invalid multiway showdown dimensions.");
  const contributions=terminal.contributions;
  const profits=contributions.map(value=>-value);
  const levels=[...new Set(contributions.filter(v=>v>0))].sort((a,b)=>a-b);
  let before=0;
  for(const level of levels){
    const contributors=contributions.map((value,seat)=>value>=level?seat:-1)
      .filter(seat=>seat>=0);
    const size=(level-before)*contributors.length;
    let eligible=contributors.filter(seat=>!terminal.folded[seat]);
    if(!eligible.length){
      eligible=terminal.folded.map((folded,seat)=>folded?-1:seat)
        .filter(seat=>seat>=0);
    }
    if(!eligible.length)throw new Error("Side pot without eligible contenders.");
    let winners=[eligible[0]!];
    for(const seat of eligible.slice(1)){
      const a=scores[seat],b=scores[winners[0]!];
      if(!a||!b)throw new Error("Missing multiway showdown score.");
      const result=compare(a,b);
      if(result>0)winners=[seat];
      else if(result===0)winners.push(seat);
    }
    const share=size/winners.length;
    for(const seat of winners)profits[seat]!+=share;
    before=level;
  }
  const sum=profits.reduce((value,profit)=>value+profit,0);
  if(profits.some(value=>!Number.isFinite(value))||Math.abs(sum)>1e-7)
    throw new Error("Multiway terminal utility must be zero-sum.");
  return profits;
}
/** The cache is per sampled private deal; only board+private cards are scored. */
export function scoreMultiwayDeal(
  seats:readonly StrategicPlayer[],holes:ReadonlyArray<readonly SolverCard[]|null>,
  board:readonly SolverCard[],
  evaluate:(cards:SolverCard[])=>readonly number[]
):(readonly number[]|null)[]{
  if(board.length!==5||holes.length!==seats.length)
    throw new RangeError("Multiway showdown needs 5 public cards and all sampled seats.");
  return seats.map((seat,i)=>{
    const hand=holes[i];
    return seat.folded?null:(hand&&hand.length===2?evaluate([...hand,...board]):null);
  });
}
