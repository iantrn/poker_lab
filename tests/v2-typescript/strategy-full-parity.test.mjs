import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installStrategy} from "../../frontend/src/solver/strategy.ts";
import {installEvaluator} from "../../frontend/src/core/evaluator.ts";
import {installCfrCore} from "../../frontend/src/solver/cfr-core.ts";

const card=(value,suit)=>({value,suit});
const state=()=>{
  const board=[
    card(2,"clubs"),card(7,"diamonds"),card(9,"hearts"),
    card(11,"spades"),card(13,"diamonds")
  ];
  return {
    street:"river",board,handComplete:false,
    pot:10,currentBet:0,lastFullRaise:1,minimumRaiseTo:1,
    blinds:{smallBlind:.5,bigBlind:1},currentPlayerId:"hero",dealerIndex:0,
    players:[
      {id:"hero",name:"Hero",isHuman:true,isBot:false,folded:false,
        holeCards:[card(14,"spades"),card(14,"hearts")],stack:20,
        streetBet:0,totalContribution:5,amountToCall:0,lastActedBet:0,hasActed:false,
        position:"BTN",
        actionOptions:{canCheck:true,canBet:true,canCall:false,canRaise:false,
          callAmount:0,minimumBet:1,minimumRaiseTo:1,maximumRaiseTo:20}},
      {id:"villain",name:"Villain",isHuman:false,isBot:true,folded:false,
        holeCards:null,stack:20,streetBet:0,totalContribution:5,
        amountToCall:0,lastActedBet:0,hasActed:false,position:"BB"}
    ]
  };
};
function mockRanges(){
  return {
    resolveInput(input,history=[]){return {state:input,history};},
    async getOpponentRange(){return {
      label:"opponent-fixture",rangeUsed:true,
      combos:[
        {cards:[card(4,"clubs"),card(5,"clubs")],weight:1},
        {cards:[card(8,"clubs"),card(8,"diamonds")],weight:3},
        {cards:[card(12,"hearts"),card(10,"diamonds")],weight:2}
      ]
    };},
    async getPlayerRange(state,history,player){return {
      label:"hero-fixture",rangeUsed:true,actualHandInRange:true,
      combos:[
        {cards:player.holeCards,weight:1},
        {cards:[card(10,"hearts"),card(10,"spades")],weight:3}
      ]
    };}
  };
}
function makeLegacy(){
  const context={console,Math,Set,Map,WeakMap,JSON,Promise,Float64Array,
    Uint32Array,setTimeout};
  context.window=context;
  for(const path of [
    "js/core/evaluator.js","js/modules/cfr-core.js",
    "js/modules/postflop-strategy.js"
  ])runInNewContext(readFileSync(path,"utf8"),context,{filename:path});
  context.PokerLabPostflopSolver=mockRanges();
  return context.PokerLabPostflopStrategy;
}
function makeTyped(){
  const old=globalThis.window;
  const target={PokerLabPostflopSolver:mockRanges()};
  globalThis.window=target;
  try {
    installEvaluator();
    installCfrCore();
    return installStrategy();
  }finally{
    if(old===undefined)delete globalThis.window;
    else globalThis.window=old;
  }
}
const simplify=result=>JSON.parse(JSON.stringify({
  algorithm:result.algorithm,street:result.street,iterations:result.iterations,
  requestedIterations:result.requestedIterations,
  sampledHeroHands:result.sampledHeroHands,
  sampledActualHeroHand:result.sampledActualHeroHand,
  heroRangeEffectiveSampleSize:result.heroRangeEffectiveSampleSize,
  rangeUsed:result.rangeUsed,
  sampledOpponentHands:result.sampledOpponentHands,
  evaluationSamples:result.evaluationSamples,
  exploitabilitySamples:result.exploitabilitySamples,
  exploitabilityEffectiveSampleSize:result.exploitabilityEffectiveSampleSize,
  heroEV:result.heroEV,
  profileEV:result.profileEV,
  nashConv:result.nashConv,
  exploitability:result.exploitability,
  heroBestResponseEV:result.heroBestResponseEV,
  opponentBestResponseEV:result.opponentBestResponseEV,
  heroDeviationGain:result.heroDeviationGain,
  opponentDeviationGain:result.opponentDeviationGain,
  actions:result.actions.map(a=>({
    action:a.action,frequency:a.frequency,ev:a.ev,
    evStandardError:a.evStandardError,evLower95:a.evLower95,evUpper95:a.evUpper95
  }))
}));
test("fully typed chance-sampled postflop strategy reproduces V1 deterministic ranges, EV, frequencies and NashConv",async()=>{
  const legacy=makeLegacy();
  const typed=makeTyped();
  const opts={iterations:10,samples:8,seed:20261117,
    evaluationSamples:16,exploitabilitySamples:8};
  const legacyStarted=performance.now();
  const expected=simplify(await legacy.solvePostflop(state(),[],opts));
  const legacyMs=performance.now()-legacyStarted;
  const typedStarted=performance.now();
  const actual=simplify(await typed.solvePostflop(state(),[],opts));
  const typedMs=performance.now()-typedStarted;
  console.log("Full CFR+ river (80 chance samples, identical seeded fixture): JS V1 "+
    legacyMs.toFixed(1)+"ms; typed V2 "+typedMs.toFixed(1)+"ms; "+
    (legacyMs/Math.max(typedMs,0.001)).toFixed(2)+"x (CI runner, non-gating)");
  assert.equal(actual.iterations,80);
  assert.equal(actual.actions.length,expected.actions.length);
  assert.deepEqual(actual,expected);
});


test("typed CFR+ range-vs-range strategy preserves seeded turn and flop frequencies, EV and NashConv",async()=>{
  const opts={iterations:10,samples:8,seed:17052026,
    evaluationSamples:16,exploitabilitySamples:8};
  for(const street of ["turn","flop"]) {
    const spot=state();
    spot.street=street;
    spot.board=spot.board.slice(0,street==="turn"?4:3);
    // Short effective stacks keep the abstract tree small, with genuine
    // remaining runout chance sampling and a legal postflop betting branch.
    for(const player of spot.players)player.stack=4;
    spot.players[0].actionOptions.maximumRaiseTo=4;
    const old=makeLegacy();
    const migrated=makeTyped();
    const legacyBegin=performance.now();
    const reference=simplify(await old.solvePostflop(spot,[],opts));
    const legacyMs=performance.now()-legacyBegin;
    const typedBegin=performance.now();
    const result=simplify(await migrated.solvePostflop(spot,[],opts));
    const typedMs=performance.now()-typedBegin;
    console.log("Full CFR+ "+street+" (80 seeded samples, identical abstract tree): V1 "+
      legacyMs.toFixed(1)+"ms, V2 "+typedMs.toFixed(1)+"ms, speedup "+
      (legacyMs/Math.max(typedMs,0.001)).toFixed(2)+"x (runner-dependent, non-gating)");
    assert.deepEqual(result,reference,
      "typed full-street strategy diverged on "+street);
    assert.equal(result.iterations,80);
    assert.ok(Number.isFinite(result.heroEV));
    assert.ok(Number.isFinite(result.nashConv));
    assert.ok(Math.abs(result.actions.reduce((sum,action)=>sum+action.frequency,0)-1)<1e-9);
  }
});
