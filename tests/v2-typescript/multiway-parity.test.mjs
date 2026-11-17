import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {createStrategicGameState} from "../../frontend/src/solver/strategic-state.ts";
import {
  buildMultiwayTree,buildAdaptiveMultiwayTree,multiwayTerminalPayoffs
} from "../../frontend/src/solver/multiway-tree.ts";
import {
  solveMultiway,analyzeMultiwayEquity
} from "../../frontend/src/solver/multiway.ts";

const require=createRequire(import.meta.url);
const {MultiwayCfrSession}=require("../../engine/pkg-node");
const card=(value,suit)=>({value,suit});
const board=[
  card(2,"clubs"),card(7,"diamonds"),card(9,"hearts"),
  card(11,"spades"),card(13,"diamonds")
];
const hands=[
  [card(14,"spades"),card(14,"hearts")],
  [card(4,"hearts"),card(5,"hearts")],
  [card(6,"spades"),card(8,"spades")],
  [card(10,"clubs"),card(12,"clubs")],
  [card(2,"hearts"),card(3,"hearts")],
  [card(7,"clubs"),card(9,"clubs")]
];
function makeInput(players=3,street="river"){
 const seats=Array.from({length:players},(_,seat)=>({
   id:"p"+seat,name:"Player "+seat,position:["BTN","SB","BB","CO","HJ","UTG"][seat],
   isHuman:seat===0,isBot:seat!==0,folded:false,allIn:false,
   holeCards:seat===0?hands[0]:null,stack:20,
   streetBet:0,totalContribution:5,hasActed:false,lastActedBet:0,amountToCall:0,
   actionOptions:seat===0?
     {canFold:false,canCheck:true,canCall:false,canBet:true,canRaise:false,
       minimumBet:1,maximumBet:20}:null
 }));
 return {
   handNumber:21,street,board:board.slice(0,street==="flop"?3:street==="turn"?4:5),
   pot:players*5,currentBet:0,lastFullRaise:1,minimumRaiseTo:1,
   blinds:{smallBlind:0.5,bigBlind:1},dealerIndex:0,
   currentPlayerId:"p0",pendingPlayers:seats.map((_,index)=>index),
   handComplete:false,players:seats
 };
}
function env(){
 return {
   newSession:players=>new MultiwayCfrSession(players),
   loadRange:async id=>{
     const seat=Number(id.slice(1));
     assert.ok(seat>0&&seat<=5);
     return {
       label:"fixture-"+id,rangeUsed:true,
       combos:[{cards:hands[seat],weight:1}]
     };
   },
   evaluate:cards=>[cards[0].value+cards[1].value],
   compareScores:(a,b)=>a[0]-b[0]
 };
}
test("true 3–6 player Rust/WASM CFR+ instances accept zero-sum terminal utilities",()=>{
 for(let players=3;players<=6;players++){
   const s=new MultiwayCfrSession(players);
   const terminal=Float64Array.from([
     ...Array(players).fill(0),
     players-1,...Array(players-1).fill(-1),
     -(players-1),...Array(players-1).fill(1)
   ]);
   assert.equal(s.step(
     Int8Array.from([0,-1,-1]),Uint32Array.from([0,0,0]),
     Uint32Array.from([0,2,2]),Uint8Array.from([2,0,0]),
     Uint32Array.from([1,2]),terminal,1
   ),1);
   assert.equal(s.player_count(),players);
   assert.equal(s.information_set_count(),1);
   assert.equal(s.iterations(),1);
   assert.deepEqual([...s.strategy_for_info_set(0)],[0.5,0.5]);
   assert.throws(()=>s.strategy_for_info_set(10));
   assert.throws(()=>s.step(
     Int8Array.from([0,-1,-1]),Uint32Array.from([0,0,0]),
     Uint32Array.from([0,2,2]),Uint8Array.from([2,0,0]),
     Uint32Array.from([1,2]),
     Float64Array.from([...terminal.slice(0,players),999,
       ...terminal.slice(players+1)]),1
   ));
   assert.equal(s.iterations(),1);
 }
});
test("3-player side pots pay only eligible tiers and preserve all net-chip utility",()=>{
 const terminal={
   terminal:true,folded:[false,false,false],
   contributions:[10,20,20]
 };
 const compare=(a,b)=>a[0]-b[0];
 assert.deepEqual(multiwayTerminalPayoffs(terminal,[[10],[9],[8]],compare),
   [20,0,-20]);
 assert.deepEqual(multiwayTerminalPayoffs(terminal,[[10],[10],[8]],compare),
   [5,15,-20]);
 assert.deepEqual(multiwayTerminalPayoffs(
   {...terminal,folded:[true,false,false]},[null,[9],[8]],compare),
   [-10,30,-20]);
});
test("public multiway tree uses real pending queue, position and legal action options",()=>{
 const input=makeInput(4);
 input.players[0].actionOptions.maximumBet=8;
 const strategic=createStrategicGameState(input);
 assert.equal(strategic.capability.solver,"multiway-cfr-plus");
 const tree=buildMultiwayTree(strategic);
 assert.equal(tree.players,4);
 assert.ok(tree.nodes>3&&tree.nodes<=12_000);
 assert.equal(tree.root.actor,0);
 assert.equal(tree.model,"single-street-checkdown");
 assert.equal(tree.raiseCap,1);
 assert.ok(tree.root.actions.some(a=>a.action.type==="check"));
 assert.ok(tree.root.actions.some(a=>a.action.type==="bet"));
 for(const entry of tree.root.actions){
   if(entry.action.type==="bet")assert.ok(entry.action.target<=8);
 }
});
test("multiway river resolver emits valid frequencies EV and honest non-Nash metadata",async()=>{
 for(const players of [3,4,5,6]){
   const snapshot=createStrategicGameState(makeInput(players));
   const progress=[];
   const result=await solveMultiway(snapshot,env(),{
     iterations:16,samples:1,evaluationSamples:16,seed:5252,
     onProgress:update=>progress.push(update)
   });
   assert.equal(result.quality,"sampled_estimate");
   assert.equal(result.iterations,16);
   assert.equal(result.evaluationSamples,16);
   assert.ok(result.treeNodes>1);
   assert.equal(result.nashConv,null);
   assert.equal(result.exploitability,null);
   assert.equal(result.actions.length>=2,true);
   assert.ok(Math.abs(result.actions.reduce((sum,a)=>sum+a.frequency,0)-1)<1e-10);
   assert.ok(result.actions.every(a=>a.frequency>=0&&a.frequency<=1));
   assert.ok(Number.isFinite(result.heroEV));
   assert.ok(result.heroEVLower95<=result.heroEV);
   assert.ok(result.heroEV<=result.heroEVUpper95);
   assert.equal(result.modeledStreets,1);
   assert.match(result.abstraction,/1 street\(s\) de mises/);
   assert.ok(progress.some(update=>update.phase==="training"&&
     update.provisional&&update.actions?.length));
   assert.ok(progress.some(update=>update.phase==="evaluation"&&update.provisional));
   assert.equal(progress.at(-1).progress,1);
 }
});
test("multiway sampled showdown equity uses no hidden bot hand from game state",async()=>{
 const state=createStrategicGameState(makeInput(3));
 const result=await analyzeMultiwayEquity(state,env(),{iterations:300,seed:99});
 assert.equal(result.iterations,300);
 assert.equal(result.wins,300);
 assert.equal(result.equity,1);
 assert.equal(result.rangeLabel.includes("fixture-p1"),true);
 assert.ok(result.note.includes("mises futures"));
});
test("flop and turn multiway solve across future betting streets without Nash claims",async()=>{
 for(const street of ["flop","turn"]){
   const state=createStrategicGameState(makeInput(3,street));
   const result=await solveMultiway(state,env(),{
     iterations:16,samples:1,evaluationSamples:16,seed:40
   });
   assert.ok(result.modeledStreets>=2,
     "a 3-way future street should fit the bounded multi-street budget");
   assert.match(result.abstraction,/cartes futures révélées progressivement/);
   assert.equal(result.quality,"sampled_estimate");
   assert.equal(result.street,street);
   assert.equal(result.nashConv,null);
 }
});


test("multiway money-equity excludes side pots the hero cannot win",async()=>{
 const state=makeInput(3);
 state.players[0].totalContribution=5;
 state.players[1].totalContribution=20;
 state.players[2].totalContribution=20;
 state.pot=45;
 const strategic=createStrategicGameState(state);
 const result=await analyzeMultiwayEquity(strategic,env(),{
   iterations:300,seed:1
 });
 // Hero has the best hand in every sample but can collect only the 15-chip
 // main pot; the remaining 30-chip side pot is reserved for opponents.
 assert.equal(result.wins,300);
 assert.ok(Math.abs(result.equity-1/3)<1e-12);
 assert.match(result.note,/pots secondaires/);
});


test("multiway position rotation solves for a non-button hero without changing seat identities",async()=>{
 const input=makeInput(4);
 const opts=input.players[0].actionOptions;
 input.players[0].isHuman=false;
 input.players[0].isBot=true;
 input.players[0].holeCards=null;
 input.players[0].actionOptions=null;
 input.players[2].isHuman=true;
 input.players[2].isBot=false;
 input.players[2].holeCards=hands[0];
 input.players[2].actionOptions=opts;
 input.currentPlayerId="p2";
 input.pendingPlayers=[2,3,0,1];
 const strategic=createStrategicGameState(input);
 assert.equal(strategic.capability.solver,"multiway-cfr-plus");
 assert.equal(buildMultiwayTree(strategic).root.actor,2);
 const distinctHands={
   p0:hands[1],p1:hands[2],p3:hands[3]
 };
 const custom={
   ...env(),
   loadRange:async id=>({
     rangeUsed:true,label:"seat-"+id,
     combos:[{cards:distinctHands[id],weight:1}]
   })
 };
 const result=await solveMultiway(strategic,custom,{
   iterations:16,samples:1,evaluationSamples:16,seed:200
 });
 assert.equal(result.quality,"sampled_estimate");
 assert.equal(result.iterations,16);
 assert.ok(Math.abs(result.actions.reduce((sum,entry)=>
   sum+entry.frequency,0)-1)<1e-12);
});
test("blocked or invalid private ranges fail over to the explicitly labeled uniform pool",async()=>{
 const strategic=createStrategicGameState(makeInput(3));
 const custom={
   ...env(),
   loadRange:async id=>id==="p1"
     ?{rangeUsed:true,label:"invalid-range",combos:[
       {cards:[board[0],card(15,"spades")],weight:9},
       {cards:[hands[0][0],hands[0][1]],weight:1}
      ]}
     :{rangeUsed:true,label:"valid-other",combos:[
       {cards:hands[2],weight:1}
      ]}
 };
 const result=await solveMultiway(strategic,custom,{
   iterations:16,samples:1,evaluationSamples:16,seed:120
 });
 assert.equal(result.quality,"sampled_estimate");
 assert.equal(result.rangeUsed,false);
 assert.match(result.rangeLabel,/invalid-range/);
 assert.ok(Number.isFinite(result.heroEV));
});
test("four-seat all-in contribution tiers preserve net chips exactly",()=>{
 const utility=multiwayTerminalPayoffs({
   terminal:true,folded:[false,false,false,false],
   contributions:[5,10,20,20]
 },[[10],[9],[8],[7]],(a,b)=>a[0]-b[0]);
 assert.deepEqual(utility,[15,5,0,-20]);
 assert.equal(utility.reduce((sum,x)=>sum+x,0),0);
});


test("importance correction removes sequential card-blocker bias in the multiway joint range",async()=>{
 const input=makeInput(3);
 // All three legal private-hand assignments have identical product-range
 // weight, hence are each 1/3 in the properly conditioned JOINT range:
 // P1=A/P2=D, P1=B/P2=C, P1=B/P2=D. A sequential sampler without
 // importance correction draws 1/2, 1/4, 1/4 respectively.
 const A=[card(3,"clubs"),card(4,"clubs")];
 const B=[card(5,"clubs"),card(6,"clubs")];
 const C=[card(3,"clubs"),card(8,"clubs")];
 const D=[card(10,"clubs"),card(12,"clubs")];
 const environment={
   newSession:players=>new MultiwayCfrSession(players),
   loadRange:async id=>({
     label:"two-combo-"+id,rangeUsed:true,
     combos:(id==="p1"?[A,B]:[C,D]).map(cards=>({cards,weight:1}))
   }),
   evaluate:cards=>{
     const first=cards.slice(0,2).map(c=>c.value).sort((a,b)=>a-b).join(",");
     // Hero wins whenever P1 holds B. When P1 holds A it beats the hero.
     if(first==="3,4")return [20];
     if(first==="14,14")return [10];
     return [0];
   },
   compareScores:(a,b)=>a[0]-b[0]
 };
 const state=createStrategicGameState(input);
 const result=await analyzeMultiwayEquity(state,environment,{
   iterations:3000,seed:20261117
 });
 assert.ok(Math.abs(result.equity-2/3)<0.035,
   "corrected P(hero wins) should approach 2/3, not biased proposal 1/2: "+result.equity);
 assert.ok(result.effectiveSampleSize>2400);
 assert.ok(result.effectiveSampleSize<3000);
 assert.match(result.note,/pondérée/);
 const solve=await solveMultiway(state,environment,{
   iterations:80,samples:1,evaluationSamples:128,seed:20261117
 });
 assert.equal(solve.quality,"sampled_estimate");
 assert.ok(solve.evaluationEffectiveSampleSize>90);
 assert.ok(solve.evaluationEffectiveSampleSize<128);
 assert.ok(solve.heroRangeEffectiveSampleSize>0);
 assert.ok(solve.heroRangeEffectiveSampleSize<=solve.iterations);
 assert.ok(solve.heroRangeEffectiveSampleSize<solve.iterations);
 assert.ok(Number.isFinite(solve.heroEV));
 assert.ok(solve.heroEVLower95<=solve.heroEV);
 assert.ok(solve.heroEV<=solve.heroEVUpper95);
 assert.match(solve.evaluationMethod,/ESS de Kish/);
});
test("disjoint fixed multiway ranges retain unit importance weights and exact side-pot equity",async()=>{
 const state=createStrategicGameState(makeInput(4));
 const eq=await analyzeMultiwayEquity(state,env(),{iterations:300,seed:7});
 assert.equal(eq.effectiveSampleSize,300);
 assert.equal(eq.equity,1);
 const solution=await solveMultiway(state,env(),{
   iterations:32,samples:1,evaluationSamples:32,seed:7
 });
 assert.equal(solution.evaluationEffectiveSampleSize,32);
 assert.equal(solution.heroRangeEffectiveSampleSize,32);
 assert.equal(solution.iterations,32);
});


test("multi-street tree resets street bets, respects clockwise postflop order and preserves chip conservation",()=>{
 const strategic=createStrategicGameState(makeInput(3,"flop"));
 const tree=buildMultiwayTree(strategic,{maxStreets:3});
 assert.equal(tree.model,"multi-street-sampled-runout");
 assert.equal(tree.streetsModeled,3);
 assert.ok(tree.nodes<=12_000);
 const nodes=[];
 const visit=node=>{
   nodes.push(node);
   if(!node.terminal)for(const child of node.actions)visit(child.child);
 };
 visit(tree.root);
 assert.ok(nodes.some(node=>!node.terminal&&node.street==="flop"));
 assert.ok(nodes.some(node=>!node.terminal&&node.street==="turn"));
 assert.ok(nodes.some(node=>!node.terminal&&node.street==="river"));
 const firstTurn=nodes.find(node=>!node.terminal&&node.street==="turn");
 const firstRiver=nodes.find(node=>!node.terminal&&node.street==="river");
 assert.equal(firstTurn.actor,1,"action must start left of the dealer on turn");
 assert.equal(firstRiver.actor,1,"action must start left of the dealer on river");
 assert.equal(firstTurn.boardLength,4);
 assert.equal(firstRiver.boardLength,5);
 assert.ok(firstTurn.history.includes("|turn"));
 assert.ok(firstRiver.history.includes("|turn"));
 assert.ok(firstRiver.history.includes("|river"));
 // The tree is built without a future runout and cannot leak its card IDs.
 assert.ok(!firstTurn.history.includes("14_spades"));
 assert.ok(!firstRiver.history.includes("13_hearts"));
 const score=Array.from({length:3},(_,i)=>[i]);
 let checked=0;
 for(const node of nodes){
   if(!node.terminal)continue;
   const winnings=multiwayTerminalPayoffs(node,score,(a,b)=>a[0]-b[0]);
   assert.ok(Math.abs(winnings.reduce((a,b)=>a+b,0))<1e-7);
   assert.ok(node.contributions.every((contribution,i)=>
     contribution>=strategic.players[i].totalContribution));
   checked++;
 }
 assert.ok(checked>8);
});
test("flop policies cannot peek at future sampled cards while turn strategies distinguish runouts",async()=>{
 const strategic=createStrategicGameState(makeInput(3,"flop"));
 const {tree}=buildAdaptiveMultiwayTree(strategic,24);
 assert.ok(tree.streetsModeled>=2);
 const nodes=[];
 const walk=node=>{
   nodes.push(node);
   if(!node.terminal)for(const child of node.actions)walk(child.child);
 };
 walk(tree.root);
 const turnIndex=nodes.findIndex(node=>!node.terminal&&node.boardLength===4);
 assert.ok(turnIndex>0);
 const seenRoot=[],seenTurn=[];
 const custom={
   ...env(),
   newSession:players=>{
     const inner=new MultiwayCfrSession(players);
     return {
       step(actors,ids,offsets,counts,children,payoffs,weight){
         seenRoot.push(ids[0]);
         seenTurn.push(ids[turnIndex]);
         return inner.step(actors,ids,offsets,counts,children,payoffs,weight);
       },
       strategy_for_info_set:id=>inner.strategy_for_info_set(id),
       average_strategy:()=>inner.average_strategy(),
       iterations:()=>inner.iterations(),
       information_set_count:()=>inner.information_set_count()
     };
   }
 };
 const result=await solveMultiway(strategic,custom,{
   iterations:24,samples:1,evaluationSamples:16,seed:212
 });
 assert.ok(result.modeledStreets>=2);
 assert.ok(seenRoot.length>=16);
 assert.equal(new Set(seenRoot).size,1,
   "every flop sample with fixed hole cards must reuse the same root infoset");
 assert.ok(new Set(seenTurn).size>1,
   "turn infoset must condition on the newly revealed fourth board card");
});
test("mobile bounded horizon retains at least two betting streets for 3–6 seats",()=>{
 for(const count of [3,4,5,6]){
   const strategic=createStrategicGameState(makeInput(count,"flop"));
   const plan=buildAdaptiveMultiwayTree(strategic,256);
   assert.ok(plan.tree.nodes<=12_000);
   assert.ok(plan.tree.streetsModeled>=2,
     count+"-seat flop horizon must include at least one future betting round");
   assert.ok(plan.trainingSamples>=16);
   assert.ok(plan.trainingSamples*plan.tree.decisionNodes<=60_000);
   assert.equal(plan.tree.model,"multi-street-sampled-runout");
 }
});
test("river planning never invents another street and invalid horizons fail closed",()=>{
 for(const count of [3,6]){
   const state=createStrategicGameState(makeInput(count,"river"));
   const {tree,trainingSamples}=buildAdaptiveMultiwayTree(state,32);
   assert.equal(tree.streetsModeled,1);
   assert.equal(tree.model,"single-street-checkdown");
   assert.ok(trainingSamples>0);
   assert.throws(()=>buildMultiwayTree(state,{maxStreets:2}),RangeError);
 }
});
