import test from "node:test";
import assert from "node:assert/strict";
import {createStrategicGameState} from "../../frontend/src/solver/strategic-state.ts";
import {createSolverInput} from "../../frontend/src/solver/input-contract.ts";

const card=(value,suit)=>({value,suit});
const board=[
  card(2,"clubs"),card(7,"diamonds"),card(9,"hearts"),
  card(11,"spades"),card(13,"diamonds")
];
function player(id,seat,contribution,extra={}){
  return {
    id,name:"Seat "+seat,position:["BTN","SB","BB","CO","HJ","UTG"][seat],
    stack:50,streetBet:0,totalContribution:contribution,
    folded:false,allIn:false,hasActed:false,lastActedBet:0,amountToCall:0,
    isHuman:false,isBot:true,
    holeCards:[card(14,"hearts"),card(14,"diamonds")],
    ...extra
  };
}
function makeState(){
  const players=[
    player("hero",0,20,{isHuman:true,isBot:false,
      holeCards:[card(14,"spades"),card(14,"clubs")],
      actionOptions:{canFold:false,canCheck:true,canCall:false,canBet:true,
        minimumBet:1,maximumBet:30,canRaise:false}}),
    player("villain",1,20)
  ];
  return {
    handNumber:7,street:"river",board,pot:40,currentBet:0,lastFullRaise:1,
    minimumRaiseTo:1,blinds:{smallBlind:0.5,bigBlind:1},dealerIndex:0,
    currentPlayerId:"hero",players,pendingPlayers:[0,1],handComplete:false
  };
}
test("immutable heads-up state retains legal actions and hides bot private cards",()=>{
 const state=makeState();
 const before=JSON.stringify(state);
 const snapshot=createStrategicGameState(state,{gameId:"g",stateVersion:42});
 assert.equal(snapshot.variant,"NLHE");
 assert.equal(snapshot.stateVersion,42);
 assert.equal(snapshot.handId,"g:7");
 assert.equal(snapshot.capability.quality,"sampled_estimate");
 assert.equal(snapshot.capability.solver,"heads-up-cfr-plus");
 assert.deepEqual(snapshot.activePlayerIds,["hero","villain"]);
 assert.deepEqual(snapshot.legalActions,[
   {action:"check"},{action:"bet",minTo:1,maxTo:30}
 ]);
 assert.deepEqual(snapshot.players[0].knownPrivateCards,
   [card(14,"spades"),card(14,"clubs")]);
 assert.equal(snapshot.players[1].knownPrivateCards,null);
 assert.deepEqual(snapshot.sidePots,[{
   amount:40,lowerLevel:0,upperLevel:20,
   contributors:["hero","villain"],eligiblePlayers:["hero","villain"],contested:true
 }]);
 assert.ok(Object.isFrozen(snapshot));
 assert.ok(Object.isFrozen(snapshot.players));
 assert.ok(Object.isFrozen(snapshot.players[0]));
 assert.ok(Object.isFrozen(snapshot.players[0].knownPrivateCards));
 assert.equal(JSON.stringify(state),before,"adapter must never mutate the game engine");
 assert.equal(snapshot.fingerprint,createStrategicGameState(
   state,{gameId:"g",stateVersion:43}).fingerprint);
});
test("3–6 player sidepot snapshots preserve folded dead money and never invent GTO",()=>{
 const players=[
   player("hero",0,20,{isHuman:true,isBot:false,
     holeCards:[card(14,"spades"),card(14,"clubs")]}),
   player("bot1",1,50),
   player("bot2",2,50),
   player("folded",3,30,{folded:true})
 ];
 const state={...makeState(),players,pot:150,currentPlayerId:"bot1",dealerIndex:3};
 const snapshot=createStrategicGameState(state);
 assert.equal(snapshot.capability.quality,"unavailable");
 assert.deepEqual(snapshot.activePlayerIds,["hero","bot1","bot2"]);
 assert.deepEqual(snapshot.foldedPlayerIds,["folded"]);
 assert.equal(snapshot.sidePots.length,3);
 assert.deepEqual(snapshot.sidePots.map(p=>p.amount),[80,30,40]);
 assert.deepEqual(snapshot.sidePots.map(p=>p.eligiblePlayers),[
   ["hero","bot1","bot2"],["bot1","bot2"],["bot1","bot2"]
 ]);
 assert.equal(snapshot.sidePots.reduce((s,p)=>s+p.amount,0),150);
 assert.equal(snapshot.players[1].knownPrivateCards,null);
 assert.equal(snapshot.players[3].knownPrivateCards,null);
 const seats=[...players,
   player("extra1",4,0),player("extra2",5,0)];
 const six=createStrategicGameState({...state,players:seats});
 assert.equal(six.players.length,6);
 assert.equal(six.capability.quality,"unavailable");
});
test("action history preserves raise-to separately from additional chips",()=>{
 const history=[
   {type:"player_action",street:"preflop",timestamp:12,
     data:{playerId:"hero",action:"raise",amount:7,raiseTo:12,
       privateHoleCards:[card(8,"spades"),card(9,"spades")],secret:"unsafe"}},
   {type:"player_action",street:"flop",timestamp:21,
     data:{playerId:"villain",action:"short_raise",amount:3,betTo:14}}
 ];
 const result=createStrategicGameState(makeState(),{history});
 assert.equal(result.history[0].amount,7);
 assert.equal(result.history[0].raiseTo,12);
 assert.equal(result.history[1].amount,3);
 assert.equal(result.history[1].raiseTo,14);
 assert.ok(!JSON.stringify(result).includes("privateHoleCards"));
 assert.ok(!JSON.stringify(result).includes("unsafe"));
 const versioned=createSolverInput(makeState(),history);
 versioned.state.players[1].holeCards=[card(8,"spades"),card(9,"spades")];
 const privacy=createStrategicGameState(versioned);
 assert.equal(privacy.players[1].knownPrivateCards,null);
 assert.equal(privacy.history[0].raiseTo,12);
});
test("invalid cards, chip amounts, IDs and pots fail closed without inventing a policy",()=>{
 const broken=[
   s=>{s.players[0].holeCards=[board[0],card(14,"clubs")];},
   s=>{s.players[1].id="hero";},
   s=>{s.pot=39;},
   s=>{s.players[0].stack=0.3;},
   s=>{s.currentBet=2;},
   s=>{s.dealerIndex=4;},
   s=>{s.board=s.board.slice(0,4);},
   s=>{s.street="mystery";}
 ];
 for(const change of broken){
   const state=makeState();
   change(state);
   assert.throws(()=>createStrategicGameState(state),
     undefined,"Expected fail-closed invalid strategic input");
 }
 assert.throws(()=>createStrategicGameState(makeState(),{stateVersion:0}));
});
test("preflop and nonhero turns are explicitly unavailable rather than simulated",()=>{
 const preflop=makeState();
 preflop.board=[];preflop.street="preflop";
 const pending=createStrategicGameState(preflop);
 assert.equal(pending.capability.quality,"unavailable");
 const opponentTurn=makeState();
 opponentTurn.currentPlayerId="villain";
 const result=createStrategicGameState(opponentTurn);
 assert.equal(result.capability.quality,"unavailable");
 assert.deepEqual(result.legalActions,[]);
});
test("uncontested contribution layers remain separate and carry honest labels",()=>{
 const state=makeState();
 state.players[0].totalContribution=20;
 state.players[1].totalContribution=40;
 state.pot=60;
 const result=createStrategicGameState(state);
 assert.deepEqual(result.sidePots.map(p=>({amount:p.amount,contested:p.contested})),[
   {amount:40,contested:true},
   {amount:20,contested:false}
 ]);
});
