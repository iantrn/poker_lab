import test from "node:test";
import assert from "node:assert/strict";
import {certifyFiniteNash} from "../../frontend/src/solver/finite-nash-certificate.ts";

const q=(numerator,denominator=1)=>({
  numerator:String(numerator),denominator:String(denominator)
});
const terminal=values=>({kind:"terminal",payoffs:values.map(v=>
  typeof v==="object"?v:q(v))});
const decision=(player,informationSet,children)=>({
  kind:"decision",player,informationSet,actions:children.map((child,i)=>({
    label:"a"+i,child
  }))
});
const chance=(...outcomes)=>({
  kind:"chance",outcomes:outcomes.map(([numerator,denominator,child])=>({
    probability:q(numerator,denominator),child
  }))
});
const uniform=[q(1,2),q(1,2)];
function matchingPennies(profile0=uniform,profile1=uniform){
  const row=a=>decision(1,"p1_hidden",[
    terminal([a===0?1:-1,a===0?-1:1]),
    terminal([a===1?1:-1,a===1?-1:1])
  ]);
  return {
    players:2,root:decision(0,"p0_root",[row(0),row(1)]),
    profile:{p0_root:profile0,p1_hidden:profile1}
  };
}
test("exact rational 2-player mixed Nash certificate has zero deviation and zero NashConv",()=>{
  const result=certifyFiniteNash(matchingPennies());
  assert.equal(result.scope,"explicit_finite_game_only");
  assert.equal(result.fullNoLimitHoldemCertified,false);
  assert.equal(result.arithmetic,"exact_rational_bigint");
  assert.equal(result.perfectRecallVerified,true);
  assert.equal(result.exactNashCertified,true);
  assert.equal(result.epsilonNashCertified,true);
  assert.deepEqual(result.playerValues,[q(0),q(0)]);
  assert.deepEqual(result.bestResponseValues,[q(0),q(0)]);
  assert.deepEqual(result.deviationGains,[q(0),q(0)]);
  assert.deepEqual(result.nashConv,q(0));
  assert.equal(result.nodes,7);
  assert.equal(result.informationSets,2);
});
test("exact verifier rejects exploitable strategy even if table values are zero",()=>{
  const game=matchingPennies([q(1),q(0)],uniform);
  const result=certifyFiniteNash(game);
  assert.deepEqual(result.playerValues,[q(0),q(0)]);
  assert.deepEqual(result.deviationGains,[q(0),q(1)]);
  assert.deepEqual(result.maxDeviationGain,q(1));
  assert.deepEqual(result.nashConv,q(1));
  assert.equal(result.exactNashCertified,false);
  assert.equal(result.epsilonNashCertified,false);
  const certified=certifyFiniteNash(game,q(1));
  assert.equal(certified.epsilonNashCertified,true);
  assert.equal(certified.exactNashCertified,false);
  assert.equal(certified.fullNoLimitHoldemCertified,false);
});
function threePlayerCyclicGame(){
  const outcome=(a,b,c)=>{
    const u0=a===b?1:-1;
    const u1=b===c?1:-1;
    return terminal([u0,u1,-u0-u1]);
  };
  return {
    players:3,
    root:decision(0,"p0",Array.from({length:2},(_,a)=>
      decision(1,"p1_hidden",Array.from({length:2},(_,b)=>
        decision(2,"p2_hidden",Array.from({length:2},(_,c)=>
          outcome(a,b,c)
        ))
      ))
    )),
    profile:{p0:uniform,p1_hidden:uniform,p2_hidden:uniform}
  };
}
test("3-player zero-sum imperfect-information game certifies exact rational mixed Nash",()=>{
  const result=certifyFiniteNash(threePlayerCyclicGame());
  assert.equal(result.players,3);
  assert.equal(result.exactNashCertified,true);
  assert.deepEqual(result.deviationGains,[q(0),q(0),q(0)]);
  assert.deepEqual(result.maxDeviationGain,q(0));
  assert.deepEqual(result.nashConv,q(0));
  assert.equal(result.informationSets,3);
  assert.equal(result.nodes,15);
});
test("6-player game gives exact independent best-response gains for ALL seats",()=>{
  // Each decision is visible to its owner but not to subsequent actors.
  // All terminals have zero utility and no player can profit from deviating.
  const build=(player)=>player===6?terminal(Array(6).fill(0)):
    decision(player,"seat_"+player,[build(player+1),build(player+1)]);
  const profile=Object.fromEntries(Array.from({length:6},(_,i)=>
    ["seat_"+i,uniform]));
  const result=certifyFiniteNash({players:6,root:build(0),profile});
  assert.equal(result.players,6);
  assert.equal(result.exactNashCertified,true);
  assert.equal(result.nodes,127);
  assert.equal(result.informationSets,6);
  assert.ok(result.deviationGains.every(g=>g.numerator==="0"));
});
test("hidden chance outcomes share one infoset and prevent clairvoyant best responses",()=>{
  // A clairvoyant player could win +1 in BOTH outcomes. A valid BR must
  // choose the same action in states indistinguishable to the actor.
  const pick=(bestAction)=>decision(0,"unknown_card",[
    terminal([bestAction===0?1:-1,bestAction===0?-1:1]),
    terminal([bestAction===1?1:-1,bestAction===1?-1:1])
  ]);
  const game={players:2,
    root:chance([1,3,pick(0)],[2,3,pick(1)]),
    profile:{unknown_card:uniform}
  };
  const result=certifyFiniteNash(game);
  assert.deepEqual(result.playerValues,[q(0),q(0)]);
  assert.deepEqual(result.bestResponseValues,[q(1,3),q(0)]);
  assert.deepEqual(result.deviationGains,[q(1,3),q(0)]);
  assert.equal(result.epsilonNashCertified,false);
  assert.equal(certifyFiniteNash(game,q(1,3)).epsilonNashCertified,true);
});
test("exact chance ratios, utilities and policy probabilities are normalized or fail closed",()=>{
  const base=matchingPennies();
  assert.throws(()=>certifyFiniteNash({
    ...base,profile:{...base.profile,p0_root:[q(3,4),q(3,4)]}
  }),/probabilités/);
  assert.throws(()=>certifyFiniteNash({
    ...base,profile:{...base.profile,p0_root:[q(-1),q(2)]}
  }),/probabilités/);
  assert.throws(()=>certifyFiniteNash({
    ...base,profile:{...base.profile,p0_root:[q(1,0),q(0)]}
  }),/fraction/);
  assert.throws(()=>certifyFiniteNash({
    players:2,root:terminal([1,0]),profile:{}
  }),/Conservation/);
  assert.throws(()=>certifyFiniteNash({
    players:2,root:chance([1,2,terminal([1,-1])],
      [1,3,terminal([0,0])]),profile:{}
  }),/probabilités/);
  assert.throws(()=>certifyFiniteNash(base,q(-1)),/non négatif/);
});
test("perfect recall enforcement prevents false certificates from forgotten own actions",()=>{
  const game={
    players:2,
    root:decision(0,"first",[
      decision(0,"forgot",[
        terminal([1,-1]),terminal([-1,1])
      ]),
      decision(0,"forgot",[
        terminal([-1,1]),terminal([1,-1])
      ])
    ]),
    profile:{first:uniform,forgot:uniform}
  };
  assert.throws(()=>certifyFiniteNash(game),/Imperfect recall/);
});
test("reusing an information set with inconsistent actor or action labels is rejected",()=>{
  const game={
    players:2,
    root:chance([
      1,2,decision(0,"same",[
        terminal([1,-1]),terminal([-1,1])
      ])
    ],[
      1,2,decision(1,"same",[
        terminal([1,-1]),terminal([-1,1])
      ])
    ]),
    profile:{same:uniform}
  };
  assert.throws(()=>certifyFiniteNash(game),/incohérents/);
});
test("invalid enormous proof trees and cycles fail closed before any GTO claim",()=>{
  const cycle={kind:"chance",outcomes:[]};
  cycle.outcomes=[{probability:q(1),child:cycle}];
  assert.throws(()=>certifyFiniteNash({players:2,root:cycle,profile:{}}),/cyclique/);
  assert.throws(()=>certifyFiniteNash({
    players:7,root:terminal(Array(7).fill(0)),profile:{}
  }),/2 à 6/);
  const huge={
    players:2,profile:{},
    root:{kind:"chance",outcomes:Array.from({length:53},()=>
      ({probability:q(1,53),child:terminal([0,0])}))}
  };
  assert.throws(()=>certifyFiniteNash(huge),/Chance/);
});
