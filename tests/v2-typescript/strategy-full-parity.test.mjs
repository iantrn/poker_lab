import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installStrategy,createStrategy} from "../../frontend/src/solver/strategy.ts";
import {createRustCfrStrategyCore} from "../../frontend/src/solver/rust-cfr-strategy-core.ts";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const wasm=require("../../engine/pkg-node");
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
function makeRustTyped(sessionFactory=()=>new wasm.CfrSession(),bridgeOptions={}){
  const old=globalThis.window;
  const target={PokerLabPostflopSolver:mockRanges()};
  globalThis.window=target;
  try {
    installEvaluator();
    const cfr=installCfrCore();
    target.PokerLabCFRCore=createRustCfrStrategyCore(cfr,sessionFactory,bridgeOptions);
    return createStrategy(target);
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

function assertNumericallyEquivalent(actual,expected,path="result"){
 if(typeof expected==="number"){
  assert.equal(typeof actual,"number",path+" must stay numeric");
  assert.ok(Number.isFinite(actual)&&Number.isFinite(expected),path+" must stay finite");
  assert.ok(Math.abs(actual-expected)<1e-6,
   path+" differs between sampled Rust CFR+ and typed solver: "+actual+" vs "+expected);
 }else if(Array.isArray(expected)){
  assert.ok(Array.isArray(actual),path+" must stay an array");
  assert.equal(actual.length,expected.length,path+" length changed");
  for(let index=0;index<expected.length;index++)
   assertNumericallyEquivalent(actual[index],expected[index],path+"["+index+"]");
 }else if(expected!==null&&typeof expected==="object"){
  assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),path+" keys changed");
  for(const key of Object.keys(expected))
   assertNumericallyEquivalent(actual[key],expected[key],path+"."+key);
 }else assert.deepEqual(actual,expected,path+" changed");
}

test("persistent Rust CFR+ strategy matches full TypeScript flop, turn and river EV and NashConv",async()=>{
 const opts={iterations:10,samples:8,seed:20261117,
   evaluationSamples:16,exploitabilitySamples:8};
 for(const [street,length] of [["flop",3],["turn",4],["river",5]]){
  const spot=state();
  spot.street=street;
  spot.board=spot.board.slice(0,length);
  for(const player of spot.players)player.stack=4;
  spot.players[0].actionOptions.maximumRaiseTo=4;
  const baseline=makeTyped();
  const rust=makeRustTyped();
  const reference=simplify(await baseline.solvePostflop(spot,[],opts));
  const accelerated=simplify(await rust.solvePostflop(spot,[],opts));
  assertNumericallyEquivalent(accelerated,reference,street);
  assert.equal(accelerated.iterations,80);
 }
});


test("full PokerLab river solve uses compiled payoff batches without changing EV or NashConv",async()=>{
 const calls={prepareTree:0,preparePayouts:0,compact:0,plain:0,single:0,samples:0};
 const rust=makeRustTyped(()=>{
   const engine=new wasm.CfrSession();
   return {
     prepare_tree(...args){calls.prepareTree++;return engine.prepare_tree(...args);},
     prepare_payoffs(...args){calls.preparePayouts++;return engine.prepare_payoffs(...args);},
     step_prepared_outcome_batch(...args){
       calls.compact++;calls.samples+=args[2].length;
       return engine.step_prepared_outcome_batch(...args);
     },
     step_prepared_batch(...args){calls.plain++;return engine.step_prepared_batch(...args);},
     step_prepared(...args){calls.single++;return engine.step_prepared(...args);},
     step:(...args)=>engine.step(...args),
     average_strategy:()=>engine.average_strategy(),
     iterations:()=>engine.iterations(),
     information_set_count:()=>engine.information_set_count()
   };
 });
 const opts={iterations:10,samples:8,seed:20261117,
   evaluationSamples:16,exploitabilitySamples:8,
   experimentalCompiledPayoffs:true};
 const baseline=makeTyped();
 const original=simplify(await baseline.solvePostflop(state(),[],opts));
 const optimized=simplify(await rust.solvePostflop(state(),[],opts));
 assertNumericallyEquivalent(optimized,original,"compiled-river");
 assert.equal(calls.prepareTree,1);
 assert.equal(calls.preparePayouts,1);
 assert.equal(calls.samples,80);
 assert.ok(calls.compact>0,"the compact WASM path must be exercised");
 assert.equal(calls.plain,0);
 assert.equal(calls.single,0);
});


test("diagnostic full-solver benchmark compares compact and normal Rust batches on same seeded river",async()=>{
 const opts={iterations:10,samples:8,seed:20261117,
   evaluationSamples:16,exploitabilitySamples:8};
 function vanillaRustFactory(){
   const engine=new wasm.CfrSession();
   // Deliberately hide the new payoff API to compare against the exact same
   // prepared/batched Rust solver without the compact terminal model.
   return {
     prepare_tree:(...args)=>engine.prepare_tree(...args),
     step_prepared_batch:(...args)=>engine.step_prepared_batch(...args),
     step_prepared:(...args)=>engine.step_prepared(...args),
     step:(...args)=>engine.step(...args),
     average_strategy:()=>engine.average_strategy(),
     iterations:()=>engine.iterations(),
     information_set_count:()=>engine.information_set_count()
   };
 }
 const results={plain:[],compact:[]};
 let expected=null;
 for(let attempt=0;attempt<3;attempt++){
   const order=attempt%2===0?["plain","compact"]:["compact","plain"];
   for(const mode of order){
     const solver=mode==="compact"?makeRustTyped():makeRustTyped(vanillaRustFactory);
     const t0=performance.now();
     const result=simplify(await solver.solvePostflop(state(),[],mode==="compact"
       ?{...opts,experimentalCompiledPayoffs:true}:opts));
     results[mode].push(performance.now()-t0);
     if(!expected)expected=result;
     else assertNumericallyEquivalent(result,expected,mode+"-run-"+attempt);
   }
 }
 const median=list=>[...list].sort((a,b)=>a-b)[1];
 console.log("Full river Rust compact-payout diagnostic: "+JSON.stringify({
   iterations:80,repetitions:3,
   plainMs:results.plain.map(x=>+x.toFixed(2)),
   compactMs:results.compact.map(x=>+x.toFixed(2)),
   plainMedianMs:+median(results.plain).toFixed(2),
   compactMedianMs:+median(results.compact).toFixed(2),
   relativeP50:+(median(results.plain)/median(results.compact)).toFixed(3),
   parity:"frequencies EV NashConv identical"
 }));
});


test("default postflop Rust solver does not enable slower compiled payouts",async()=>{
 const counters={compiled:0,plain:0,prepared:0};
 const rust=makeRustTyped(()=>{
   const engine=new wasm.CfrSession();
   return {
     prepare_tree:(...args)=>engine.prepare_tree(...args),
     prepare_payoffs(...args){counters.prepared++;return engine.prepare_payoffs(...args);},
     step_prepared_outcome_batch(...args){
       counters.compiled++;return engine.step_prepared_outcome_batch(...args);
     },
     step_prepared_batch(...args){
       counters.plain++;return engine.step_prepared_batch(...args);
     },
     step_prepared:(...args)=>engine.step_prepared(...args),
     step:(...args)=>engine.step(...args),
     average_strategy:()=>engine.average_strategy(),
     iterations:()=>engine.iterations(),
     information_set_count:()=>engine.information_set_count()
   };
 });
 const result=await rust.solvePostflop(state(),[],{
   iterations:10,samples:8,seed:20261117,evaluationSamples:16,exploitabilitySamples:8
 });
 assert.equal(result.iterations,80);
 assert.ok(counters.plain>0,"default batching path must execute");
 assert.equal(counters.compiled,0);
 assert.equal(counters.prepared,0);
});


test("diagnostic numeric info-set index matches full HU solver on flop, turn and river",async()=>{
 const opts={iterations:10,samples:8,seed:20261117,
   evaluationSamples:16,exploitabilitySamples:8};
 const samples={};
 for(const [street,boardLength] of [["flop",3],["turn",4],["river",5]]){
   const spot=state();
   spot.street=street;
   spot.board=spot.board.slice(0,boardLength);
   for(const player of spot.players)player.stack=4;
   spot.players[0].actionOptions.maximumRaiseTo=4;
   const timings={canonical:[],numeric:[]};
   let baseline=null;
   for(let repeat=0;repeat<3;repeat++){
     const order=repeat%2===0?["canonical","numeric"]:["numeric","canonical"];
     for(const mode of order){
       const solver=makeRustTyped(()=>new wasm.CfrSession(),
         {numericInformationIndex:mode==="numeric"});
       const t0=performance.now();
       const result=simplify(await solver.solvePostflop(spot,[],opts));
       timings[mode].push(performance.now()-t0);
       if(!baseline)baseline=result;
       else assertNumericallyEquivalent(result,baseline,street+"-"+mode);
     }
   }
   const median=times=>[...times].sort((a,b)=>a-b)[1];
   samples[street]={
     canonicalMs:timings.canonical.map(t=>+t.toFixed(2)),
     numericMs:timings.numeric.map(t=>+t.toFixed(2)),
     canonicalP50Ms:+median(timings.canonical).toFixed(2),
     numericP50Ms:+median(timings.numeric).toFixed(2),
     speedupP50:+(median(timings.canonical)/median(timings.numeric)).toFixed(3),
     parity:"frequency EV NashConv identical"
   };
 }
 console.log("Full CFR+ numeric index diagnostic: "+JSON.stringify(samples));
});


test("CFR+ reports bounded provisional policies and monotonic phase progress without changing final strategy",async()=>{
 const snapshots=[];
 const opts={iterations:10,samples:8,seed:20261117,
   evaluationSamples:16,exploitabilitySamples:8};
 const baseline=makeTyped();
 const original=simplify(await baseline.solvePostflop(state(),[],opts));
 const traced=makeRustTyped();
 const result=simplify(await traced.solvePostflop(state(),[],{
   ...opts,onProgress:snapshot=>snapshots.push(snapshot)
 }));
 assertNumericallyEquivalent(result,original,"progress-final");
 assert.ok(snapshots.length>=4,"expected staged progress snapshots");
 assert.ok(snapshots.length<=32,"progress must remain bounded on mobile");
 assert.ok(snapshots.some(s=>s.phase==="training"));
 assert.ok(snapshots.some(s=>s.phase==="evaluation"));
 assert.ok(snapshots.some(s=>s.phase==="diagnostics"));
 for(let i=0;i<snapshots.length;i++){
   const snapshot=snapshots[i];
   assert.equal(snapshot.provisional,true);
   assert.ok(snapshot.progress>=0&&snapshot.progress<=1);
   if(i>0)assert.ok(snapshot.progress>=snapshots[i-1].progress);
   if(snapshot.actions){
     assert.equal(snapshot.phase,"training");
     assert.equal(snapshot.actions.length,original.actions.length);
     const sum=snapshot.actions.reduce((s,a)=>s+a.frequency,0);
     assert.ok(Math.abs(sum-1)<1e-9);
     for(const item of snapshot.actions){
       assert.ok(item.frequency>=0&&item.frequency<=1);
     }
   }
 }
 assert.equal(snapshots.at(-1).phase,"diagnostics");
});
