import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { installEvaluator } from "../../frontend/src/core/evaluator.ts";
const oldContext={window:{}};
runInNewContext(readFileSync("js/core/evaluator.js","utf8"),oldContext);
const legacy=oldContext.window.PokerLabHandEvaluator;
globalThis.window={};
const typed=installEvaluator();
delete globalThis.window;
const suits=["clubs","diamonds","hearts","spades"];
const deck=Array.from({length:52},(_,i)=>({value:2+i%13,suit:suits[Math.floor(i/13)]}));
let seed=0x7edbeef;
const rand=max=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%max;};
const plain=value=>JSON.parse(JSON.stringify(value));
test("TypeScript evaluator matches V1 on 6,000 random 5/6/7-card hands",()=>{
  for(let count=5;count<=7;count++){
    for(let i=0;i<2000;i++){
      const cards=deck.slice();
      for(let j=0;j<count;j++){const k=j+rand(52-j);[cards[j],cards[k]]=[cards[k],cards[j]];}
      const sample=cards.slice(0,count);
      assert.deepEqual(plain(typed.evaluate(sample)),plain(legacy.evaluate(sample)),JSON.stringify(sample));
    }
  }
});
test("score comparison, ties, and duplicate rejection match V1",()=>{
  const hero=deck.slice(0,7),villain=deck.slice(20,27);
  const players=[{id:"a",cards:hero},{id:"b",cards:villain},{id:"c",cards:hero}];
  assert.deepEqual(plain(typed.findWinners(players)),plain(legacy.findWinners(players)));
  assert.equal(typed.compareHands(hero,villain),legacy.compareHands(hero,villain));
  const invalid=[hero[0],hero[0],...hero.slice(1,4)];
  for(const api of [typed,legacy])assert.throws(()=>api.evaluate(invalid),/carte en double/);
});
