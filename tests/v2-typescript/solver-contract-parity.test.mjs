import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {createSolverInput,resolveSolverInput} from "../../frontend/src/solver/input-contract.ts";
const window={};
runInNewContext(readFileSync("js/modules/postflop-solver.js","utf8"),{window,Uint32Array,console});
const original=window.PokerLabPostflopSolver;
const makeState=(value=1)=>({
 handNumber:3,street:"turn",board:[{value:2,suit:"clubs"},{value:3,suit:"hearts"},{value:4,suit:"diamonds"},{value:5,suit:"spades"}],
 currentPlayerId:"hero",dealerIndex:1,pot:20.5,currentBet:2,lastFullRaise:2,minimumRaiseTo:4,blinds:{smallBlind:0.5,bigBlind:1},pendingPlayers:[0,1],handComplete:false,
 players:[{id:"hero",name:"Hero",isHuman:true,stack:value*40,streetBet:2,totalContribution:3.5,
  amountToCall:2,lastActedBet:2,holeCards:[{value:14,suit:"hearts"},{value:14,suit:"clubs"}],
  actionOptions:{canRaise:true,minimumRaiseTo:4}},
 {id:"villain",name:"Villain",isBot:true,botProfile:"tag",stack:40,holeCards:[{value:13,suit:"hearts"},{value:13,suit:"clubs"}]}]
});
const history=[{type:"player_action",street:"preflop",timestamp:123,data:{
 playerId:"hero",action:"raise",amount:3,board:[{value:2,suit:"clubs",secret:"x"}],secret:"hidden",potAfter:12
}}];
const plain=(value)=>JSON.parse(JSON.stringify(value));
test("typed solver contract precisely mirrors V1 snapshots and strips private opponent cards",()=>{
  for(const amount of [0,0.5,1,20,300]){
    const state=makeState(amount);
    const old=original.createInput(state,history);
    const current=createSolverInput(state,history);
    assert.deepEqual(plain(current),plain(old));
    assert.equal(current.state.players[1].holeCards,null);
    assert.equal("secret" in current.history[0].data,false);
    assert.deepEqual(plain(resolveSolverInput(current)),plain(original.resolveInput(old)));
  }
});
test("legacy and TS contract reject illegal chip increments and unsupported schema",()=>{
  for(const invalid of [NaN,-1,0.3,Infinity]){
    const state=makeState(1);state.players[0].stack=invalid;
    assert.throws(()=>createSolverInput(state,history),{message:/incréments de 0,5/});
    assert.throws(()=>original.createInput(state,history),{message:/incréments de 0,5/});
  }
  for(const value of [null,{schemaVersion:2,state:{}},{schemaVersion:1}]) {
    const typed=()=>resolveSolverInput(value);
    const legacy=()=>original.resolveInput(value);
    if(value && "schemaVersion" in value) {
      assert.throws(typed,{message:/contrat de données/});
      assert.throws(legacy,{message:/contrat de données/});
    } else {
      assert.deepEqual(plain(typed()),plain(legacy()));
    }
  }
});
test("unversioned and versioned input history fallback is unchanged",()=>{
  assert.deepEqual(plain(resolveSolverInput(makeState(),history)),
    plain(original.resolveInput(makeState(),history)));
  assert.deepEqual(plain(resolveSolverInput({schemaVersion:1,state:makeState(),history:null})),
    plain(original.resolveInput({schemaVersion:1,state:makeState(),history:null})));
});
