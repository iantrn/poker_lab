import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installEvaluator} from "../../frontend/src/core/evaluator.ts";
import {installPostflopSolver} from "../../frontend/src/solver/postflop.ts";

const card=(value,suit)=>({value,suit});
const B=[card(14,"spades"),card(13,"spades"),card(12,"spades"),card(11,"spades"),card(10,"spades")];
const state=()=>({
  street:"river",board:B,pot:10,currentPlayerId:"hero",handComplete:false,
  players:[
    {id:"hero",isHuman:true,folded:false,holeCards:[card(2,"clubs"),card(3,"clubs")],stack:90,
      amountToCall:0,actionOptions:{canBet:true,canRaise:false}},
    {id:"villain",isHuman:false,folded:false,holeCards:null,stack:90,position:"BB"}
  ]
});
const fetcher=async url=>({ok:true,json:async()=>url.endsWith("index.json")?
  {version:1,spots:[]}:{version:1,ranges:{}}});
const normalize=value=>JSON.parse(JSON.stringify(value));
function env(typed){
  if(typed){
    globalThis.window={};
    globalThis.fetch=fetcher;
    installEvaluator();
    return {api:installPostflopSolver(),done(){
      delete globalThis.window;delete globalThis.fetch;
    }};
  }
  const mock={window:{},Uint32Array,console,fetch:fetcher,Math,Promise,Map,Set};
  runInNewContext(readFileSync("js/core/evaluator.js","utf8"),mock);
  runInNewContext(readFileSync("js/modules/postflop-solver.js","utf8"),mock);
  return {api:mock.window.PokerLabPostflopSolver,done(){}};
}
async function run(typed){
  const {api,done}=env(typed);
  try {
    const active=normalize(api.validateState(state()));
    const opponent=normalize(await api.getOpponentRange(state(),[],state().players[1]));
    const output=normalize(await api.analyse(state(),[],{iterations:300}));
    const weighted={
      combos:[
        {cards:[card(4,"clubs"),card(5,"clubs")],weight:2},
        {cards:[card(6,"hearts"),card(7,"hearts")],weight:1}
      ],label:"crafted"
    };
    const postflopState=state();
    postflopState.street="flop";
    postflopState.board=B.slice(0,3);
    const history=[{type:"player_action",street:"flop",
      data:{playerId:"villain",action:"call",currentBetBefore:2,lastFullRaiseBefore:2,
        streetBetBefore:0,stackBefore:20,potBefore:8}}];
    const conditioned=normalize(api.conditionRangeOnPostflopActions(
      postflopState,history,postflopState.players[1],weighted));
    return {active,opponentCount:opponent.combos.length,firstRangeCombos:opponent.combos.slice(0,3),
      lastRangeCombo:opponent.combos.at(-1),labels:opponent.label,
      output,conditioned};
  }finally{done();}
}
test("TypeScript postflop solver preserves V1 result contract and range-conditioning weights",async()=>{
  const actual=await run(true),expected=await run(false);
  assert.deepEqual(actual,expected);
});
