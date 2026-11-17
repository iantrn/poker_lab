import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installTable} from "../../frontend/src/components/table.ts";
import {installEvaluator} from "../../frontend/src/core/evaluator.ts";
const legacyWindow={};
runInNewContext(readFileSync("js/core/evaluator.js","utf8"),{window:legacyWindow});
runInNewContext(readFileSync("js/components/table.js","utf8"),{window:legacyWindow});
globalThis.window={};
installEvaluator();
const typed=installTable();
delete globalThis.window;
const old=legacyWindow.PokerLabTable;
const cards=["clubs","diamonds","hearts","spades"].flatMap(suit=>
 Array.from({length:13},(_,index)=>({value:index+2,suit})));
const plain=value=>JSON.parse(JSON.stringify(value));
test("1,326 distinct preflop starting hands retain precisely the same visual hand analysis",()=>{
 for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
  const hand=[cards[i],cards[j]];
  assert.deepEqual(plain(typed.evaluatePreflop(hand)),plain(old.evaluatePreflop(hand)));
 }
});
test("postflop descriptive hand evaluations match V1",()=>{
 for(let i=0;i<200;i++){
  const hand=cards.slice(i%30,i%30+2);
  const board=cards.slice(32+i%12,35+i%12);
  assert.deepEqual(plain(typed.evaluateHeroHand(hand,board)),plain(old.evaluateHeroHand(hand,board)));
 }
});
