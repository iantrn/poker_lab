import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {createStrategicGameState} from "../../frontend/src/solver/strategic-state.ts";
import {
  buildMultiwayTree,multiwayTerminalPayoffs
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
   assert.ok(result.abstraction.includes("une seule street"));
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
test("flop and turn multiway games are labeled checkdown, not full-street GTO",async()=>{
 for(const street of ["flop","turn"]){
   const state=createStrategicGameState(makeInput(3,street));
   const result=await solveMultiway(state,env(),{
     iterations:16,samples:1,evaluationSamples:16,seed:40
   });
   assert.ok(result.abstraction.includes("checkdown"));
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
