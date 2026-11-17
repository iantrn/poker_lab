import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installEvaluator} from "../../frontend/src/core/evaluator.ts";
import {installCfrCore} from "../../frontend/src/solver/cfr-core.ts";
import {installStrategy} from "../../frontend/src/solver/strategy.ts";

const card=(value,suit)=>({value,suit});
const board=[14,13,12,11,10].map(value=>card(value,"spades"));
const hero=[card(2,"clubs"),card(3,"clubs")];
const combos=[
  {cards:[card(4,"clubs"),card(5,"clubs")],weight:1},
  {cards:[card(6,"clubs"),card(7,"clubs")],weight:2},
  {cards:[card(8,"diamonds"),card(9,"diamonds")],weight:3}
];
const heroCombos=[
  {cards:hero,weight:1},
  {cards:[card(8,"clubs"),card(9,"clubs")],weight:0.5}
];
const state=()=>({
  street:"river",board,pot:10,currentBet:0,lastFullRaise:1,minimumRaiseTo:1,
  blinds:{smallBlind:0.5,bigBlind:1},dealerIndex:1,
  currentPlayerId:"hero",handComplete:false,
  players:[
    {id:"hero",name:"Héros",isHuman:true,folded:false,position:"BU",
     stack:20,streetBet:0,totalContribution:5,lastActedBet:0,amountToCall:0,
     holeCards:hero,
     actionOptions:{canCheck:true,canBet:true,canCall:false,canRaise:false,minimumBet:1,maximumRaiseTo:20}},
    {id:"bot",name:"Bot",isHuman:false,folded:false,position:"BB",stack:20,
     streetBet:0,totalContribution:5,lastActedBet:0,amountToCall:0,holeCards:null}
  ]
});
function rangeApi() {
 return {
  resolveInput(input,history){return {state:input,history};},
  async getOpponentRange(){return {label:"range-opponent",rangeUsed:true,combos};},
  async getPlayerRange(){return {label:"range-hero",rangeUsed:true,
    actualHandInRange:true,combos:heroCombos};}
 };
}
const plain=x=>JSON.parse(JSON.stringify(x));
async function scenario(typed) {
 let strategy;
 if(typed) {
  globalThis.window={PokerLabPostflopSolver:rangeApi()};
  installEvaluator();
  installCfrCore();
  strategy=installStrategy();
 }else{
  const context={window:{},console,Math,Set,Map,Promise,Float64Array,Uint32Array,setTimeout};
  for(const file of ["js/core/evaluator.js","js/modules/cfr-core.js","js/modules/postflop-strategy.js"]){
   runInNewContext(readFileSync(file,"utf8"),context,{filename:file});
  }
  context.window.PokerLabPostflopSolver=rangeApi();
  strategy=context.window.PokerLabPostflopStrategy;
 }
 try{
  const valid=plain(strategy.validate(state()));
  const result=await strategy.solvePostflop(state(),[],{
   iterations:10,samples:8,seed:3721,evaluationSamples:16,exploitabilitySamples:8
  });
  return {valid,output:plain(result)};
 } finally {
  if(typed)delete globalThis.window;
 }
}
test("strict TypeScript CFR+ strategy retains full V1 frequencies, EV, NashConv and metadata",async()=>{
 const actual=await scenario(true);
 const reference=await scenario(false);
 assert.deepEqual(actual,reference);
 assert.equal(actual.output.iterations,80);
 assert.equal(actual.output.actions.length,4);
 assert.ok(Number.isFinite(actual.output.nashConv));
});
