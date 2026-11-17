import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installEvaluator} from "../../frontend/src/core/evaluator.ts";
import {installCfrCore} from "../../frontend/src/solver/cfr-core.ts";
import {installStrategy} from "../../frontend/src/solver/strategy.ts";

function card(value,suit){return {value,suit};}
const state=()=>({
  street:"river",
  board:[card(10,"spades"),card(11,"spades"),card(12,"spades"),card(13,"spades"),card(14,"spades")],
  handComplete:false,handNumber:1,pot:10,
  currentBet:0,lastFullRaise:1,minimumRaiseTo:1,
  blinds:{smallBlind:0.5,bigBlind:1},dealerIndex:0,currentPlayerId:"hero",
  players:[
    {id:"hero",name:"Hero",isHuman:true,folded:false,stack:20,
      streetBet:0,totalContribution:5,lastActedBet:0,amountToCall:0,
      holeCards:[card(2,"clubs"),card(3,"clubs")],
      actionOptions:{canCheck:true,canBet:true,canCall:false,canRaise:false,
        canFold:false,minimumBet:1,maximumBet:20}},
    {id:"bot",name:"Bot",isHuman:false,folded:false,stack:20,
      streetBet:0,totalContribution:5,lastActedBet:0,amountToCall:0,
      position:"BB",holeCards:null}
  ]
});
const options={iterations:10,samples:8,evaluationSamples:16,exploitabilitySamples:16,seed:123456};
function rangeApi(){
  return {
    resolveInput(input,history=[]){return {state:input,history};},
    async getOpponentRange(){return {label:"fixed villain range",rangeUsed:true,combos:[
      {cards:[card(4,"clubs"),card(5,"clubs")],weight:1},
      {cards:[card(6,"clubs"),card(7,"clubs")],weight:1},
      {cards:[card(8,"clubs"),card(9,"clubs")],weight:1},
      {cards:[card(2,"diamonds"),card(3,"diamonds")],weight:1}
    ]};},
    async getPlayerRange(_,__,player){return {label:"fixed hero range",rangeUsed:true,actualHandInRange:true,combos:[
      {cards:player.holeCards,weight:1},
      {cards:[card(4,"diamonds"),card(5,"diamonds")],weight:3},
      {cards:[card(6,"diamonds"),card(7,"diamonds")],weight:3},
      {cards:[card(8,"diamonds"),card(9,"diamonds")],weight:3}
    ]};}
  };
}
const plain = value=>JSON.parse(JSON.stringify(value));
async function execute(typed) {
  let strategy;
  if (typed) {
    const window={PokerLabPostflopSolver:rangeApi()};
    globalThis.window=window;
    try {
      installEvaluator();installCfrCore();
      strategy=installStrategy();
    } finally {delete globalThis.window;}
  } else {
    const context={console,Math,Set,Map,Promise,Float64Array,setTimeout,Uint32Array};
    context.window=context;
    for(const path of ["js/core/evaluator.js","js/modules/cfr-core.js","js/modules/postflop-strategy.js"])
      runInNewContext(readFileSync(path,"utf8"),context,{filename:path});
    context.PokerLabPostflopSolver=rangeApi();
    strategy=context.PokerLabPostflopStrategy;
  }
  return plain(await strategy.solvePostflop(state(),[],options));
}
test("strict TS postflop range-vs-range strategy preserves V1 CFR+ frequencies, EV and exploitability on a seeded river",async()=>{
  const expected=await execute(false),actual=await execute(true);
  const checks=[
    ["algorithm",actual.algorithm,expected.algorithm],
    ["iterations",actual.iterations,expected.iterations],
    ["sampledHeroHands",actual.sampledHeroHands,expected.sampledHeroHands],
    ["sampledOpponentHands",actual.sampledOpponentHands,expected.sampledOpponentHands],
    ["rangeLabel",actual.rangeLabel,expected.rangeLabel],
    ["heroRangeLabel",actual.heroRangeLabel,expected.heroRangeLabel],
  ];
  for(const [key,a,b] of checks)assert.equal(a,b,key);
  assert.deepEqual(actual.actions.map(a=>a.action),expected.actions.map(a=>a.action));
  for(const field of ["heroEV","nashConv","exploitability","heroDeviationGain","opponentDeviationGain"]){
    assert.ok(Math.abs(actual[field]-expected[field])<1e-7,
      field+" TS="+actual[field]+" V1="+expected[field]);
  }
  for(let i=0;i<actual.actions.length;i++){
    for(const field of ["frequency","ev","evLower95","evUpper95"]){
      assert.ok(Math.abs(actual.actions[i][field]-expected.actions[i][field])<1e-7,
        "action="+i+" "+field+" TS="+actual.actions[i][field]+" V1="+expected.actions[i][field]);
    }
  }
});
