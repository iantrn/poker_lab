import test from "node:test";
import assert from "node:assert/strict";
import {createStrategicGameState} from "../../frontend/src/solver/strategic-state.ts";
import {multiwayTerminalPayoffs} from "../../frontend/src/solver/multiway-tree.ts";
import {
  certifyExplicitMultiwayPokerSubgame,quantizePolicy,
  exactMultiwayTerminalPayoffs
} from "../../frontend/src/solver/finite-poker-certificate.ts";

const card=(value,suit)=>({value,suit});
const q=(numerator,denominator=1)=>({
  numerator:String(numerator),denominator:String(denominator)
});
const f=q=>Number(q.numerator)/Number(q.denominator);
const board=[
  card(2,"clubs"),card(7,"diamonds"),card(9,"hearts"),
  card(11,"spades"),card(13,"diamonds")
];
const hands=[
  [card(14,"spades"),card(14,"hearts")],
  [card(4,"hearts"),card(5,"hearts")],
  [card(6,"spades"),card(8,"spades")]
];
function state(street="river"){
  const players=Array.from({length:3},(_,seat)=>({
    id:"p"+seat,name:"Seat "+seat,
    position:["BTN","SB","BB"][seat],
    isHuman:seat===0,isBot:seat>0,folded:false,allIn:false,
    holeCards:seat===0?hands[0]:null,stack:20,
    streetBet:0,totalContribution:5,
    hasActed:false,lastActedBet:0,amountToCall:0,
    actionOptions:seat===0?{
      canFold:false,canCheck:true,canCall:false,canBet:true,
      canRaise:false,minimumBet:1,maximumBet:20
    }:null
  }));
  return createStrategicGameState({
    handNumber:77,street,
    board:board.slice(0,street==="flop"?3:5),
    pot:15,currentBet:0,lastFullRaise:1,minimumRaiseTo:1,
    blinds:{smallBlind:0.5,bigBlind:1},dealerIndex:0,
    currentPlayerId:"p0",pendingPlayers:[0,1,2],
    handComplete:false,players
  });
}
const evalCards=cards=>[cards[0].value+cards[1].value];
const compare=(a,b)=>a[0]-b[0];
function request(street="river"){
  return {
    state:state(street),compareScores:compare,evaluate:evalCards,
    scenarios:[{
      probability:q(1),holes:hands,
      board
    }],
    policyForInfoSet:(_key,actions)=>
      quantizePolicy(Array(actions.length).fill(1/actions.length))
  };
}
test("side-pot splits are rationally exact, including folded dead money and thirds",()=>{
 const terminal={
   terminal:true,
   contributions:[5,5,5,5],
   folded:[false,false,false,true]
 };
 const scores=[[10],[10],[10],null];
 const exact=exactMultiwayTerminalPayoffs(terminal,scores,compare);
 assert.deepEqual(exact.map(x=>f(x)),[
   5/3,5/3,5/3,-5
 ]);
 assert.equal(exact.reduce((sum,q)=>sum+BigInt(q.numerator),0n),0n);
 const float=multiwayTerminalPayoffs(terminal,scores,compare);
 for(let i=0;i<4;i++)assert.ok(Math.abs(f(exact[i])-float[i])<1e-12);
 assert.throws(()=>exactMultiwayTerminalPayoffs({
   ...terminal,contributions:[5,5,0.3,5]
 },scores,compare),/demi-jetons/);
});
test("quantization preserves an exactly normalized rational profile",()=>{
 const rounded=quantizePolicy([1/3,1/3,1/3]);
 assert.deepEqual(rounded,[q(333334,1_000_000),q(333333,1_000_000),
   q(333333,1_000_000)]);
 assert.equal(rounded.reduce((sum,v)=>sum+BigInt(v.numerator),0n),1_000_000n);
 assert.throws(()=>quantizePolicy([0.2,0.2]),/normalisée/);
 assert.throws(()=>quantizePolicy([0.2,NaN,0.8]),/invalides/);
});
test("actual 3-way PokerLab river betting abstraction gets an exact finite BR audit",()=>{
 const result=certifyExplicitMultiwayPokerSubgame(request());
 assert.equal(result.scope,"explicit_finite_game_only");
 assert.equal(result.fullNoLimitHoldemCertified,false);
 assert.equal(result.arithmetic,"exact_rational_bigint");
 assert.equal(result.perfectRecallVerified,true);
 assert.equal(result.players,3);
 assert.ok(result.nodes>3);
 assert.ok(result.informationSets>0);
 assert.ok(result.deviationGains.every(v=>BigInt(v.numerator)>=0n));
 assert.ok(result.playerValues.some(v=>v.numerator!=="0")||
   result.deviationGains.some(v=>v.numerator!=="0"));
 // Underlying NLHE with unknown opponent cards is NOT certified even when
 // every terminal and strategy was exactly audited for THIS fixed deal.
 assert.equal(result.fullNoLimitHoldemCertified,false);
});
test("two complete scenarios share flop infosets but separate turn infosets",()=>{
 const input=request("flop");
 const alternate=[
   ...board.slice(0,3),card(10,"clubs"),card(12,"diamonds")
 ];
 input.scenarios=[
   {probability:q(1,3),holes:hands,board},
   {probability:q(2,3),holes:hands,board:alternate}
 ];
 input.maxStreets=2;
 const calledKeys=new Set();
 const original=input.policyForInfoSet;
 input.policyForInfoSet=(key,actions)=>{
   calledKeys.add(key);
   return original(key,actions);
 };
 const result=certifyExplicitMultiwayPokerSubgame(input);
 assert.equal(result.scope,"explicit_finite_game_only");
 assert.ok(result.nodes>20);
 const root=[...calledKeys].filter(key=>key.startsWith("0|")&&
   key.endsWith("|flop:p0"));
 assert.equal(root.length,1,
   "Hero flop infoset must be identical across future chance runouts");
 const turns=[...calledKeys].filter(key=>key.includes("|turn|"));
 assert.ok(turns.length>1,
   "Different publicly revealed turns must create distinct decision infosets");
 assert.equal(result.fullNoLimitHoldemCertified,false);
});
test("missing private hands, chance-card collisions and altered public boards are rejected",()=>{
 const input=request();
 input.scenarios=[{probability:q(1),
   holes:[hands[0],hands[1],null],board}];
 assert.throws(()=>certifyExplicitMultiwayPokerSubgame(input),/Main privée active/);
 input.scenarios=[{probability:q(1),
   holes:[hands[0],hands[0],hands[2]],board}];
 assert.throws(()=>certifyExplicitMultiwayPokerSubgame(input),/Collision/);
 input.scenarios=[{probability:q(1),
   holes:hands,board:[card(10,"clubs"),...board.slice(1)]}];
 assert.throws(()=>certifyExplicitMultiwayPokerSubgame(input),/carte déjà publique/);
 input.scenarios=[{probability:q(1),
   holes:[hands[1],hands[0],hands[2]],board}];
 assert.throws(()=>certifyExplicitMultiwayPokerSubgame(input),/main du héros/);
});
