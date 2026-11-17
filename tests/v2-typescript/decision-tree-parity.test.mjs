import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {buildDecisionTree,rootActionSignature} from "../../frontend/src/solver/decision-tree.ts";
const win={};
runInNewContext(readFileSync("js/modules/postflop-strategy.js","utf8"),{window:win,console,Math,Promise});
const original=win.PokerLabPostflopStrategy;
const c=(value,suit)=>({value,suit});
function fixture(street, facingBet, stack, actionRaiseRights, betSize) {
  const board=[c(2,"clubs"),c(7,"diamonds"),c(9,"hearts")];
  if(street!=="flop")board.push(c(11,"spades"));
  if(street==="river")board.push(c(14,"hearts"));
  const currentBet=facingBet?betSize:0;
  return {
    input:{
      pot:14+currentBet,board,players:[
        {id:"hero",position:"BTN",stack,streetBet:0,hasActed:!actionRaiseRights,lastActedBet:0},
        {id:"villain",position:"BB",stack,streetBet:currentBet,hasActed:true,lastActedBet:currentBet}
      ],lastFullRaise:2,blinds:{bigBlind:1},postflopFirstActorId:"villain"
    },
    options:{canRaise:actionRaiseRights,canBet:!facingBet,
      minimumBet:1,minimumRaiseTo:currentBet+2,maximumRaiseTo:stack}
  };
}
test("typed abstract decision tree exactly matches V1 nodes, betting and terminal payouts",()=>{
  let checked=0;
  for(const street of ["flop","turn","river"])
  for(const facingBet of [false,true])
  for(const stack of [2,3.5,6])
  for(const canRaise of [false,true]) {
    const {input,options}=fixture(street,facingBet,stack,canRaise,2);
    const runout=street==="flop"?[c(10,"clubs"),c(12,"diamonds")]:
      street==="turn"?[c(12,"diamonds")]:[];
    const checks=facingBet?0:0,raises=facingBet?1:0;
    const args=[input,options,[],runout,checks,raises];
    const actual=buildDecisionTree(...args);
    const expected=original.buildDecisionTree(...args);
    assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)),
      JSON.stringify({street,facingBet,stack,canRaise}));
    assert.equal(rootActionSignature(actual.tree),
      JSON.stringify((expected.tree.actions||[]).map(e=>[e.action.type,e.action.label,e.action.amount])));
    checked++;
  }
  assert.equal(checked,36);
});
