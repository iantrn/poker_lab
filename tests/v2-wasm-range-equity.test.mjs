import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const wasm = require(path.join(root, "engine", "pkg-node"));
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root, "js/core/evaluator.js"), "utf8"), context);
const evaluator = context.window.PokerLabHandEvaluator;
const suits = ["clubs","diamonds","hearts","spades"];
const deck = Array.from({length:52},(_,i)=>({value:i%13+2,suit:suits[Math.floor(i/13)]}));
const pack = card => card.value | (suits.indexOf(card.suit) << 4);
let rng = 0x5a7a8c9b;
function random(upper) {
  rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;
  return (rng>>>0)%upper;
}
test("weighted river equity exactly matches V1 on 120 randomized boards and blocker-heavy ranges",()=>{
  for(let trial=0;trial<120;trial++) {
    const cards=deck.slice();
    for(let index=0;index<cards.length;index++) {
      const at=index+random(cards.length-index);
      [cards[index],cards[at]]=[cards[at],cards[index]];
    }
    const hero=cards.slice(0,2), board=cards.slice(2,7);
    const opponents=[], weights=[];
    let heroWins=0, ties=0, villainWins=0, total=0;
    const heroScore=evaluator.evaluate([...hero,...board]).score;
    for(let index=0;index<35;index++) {
      const a=cards[(index*3+7)%52],b=cards[(index*7+13)%52];
      const weight=(index%7+1)*0.25;
      opponents.push(pack(a),pack(b));
      weights.push(weight);
      if(hero.includes(a)||hero.includes(b)||board.includes(a)||board.includes(b))continue;
      const result=evaluator.compareScores(heroScore,evaluator.evaluate([a,b,...board]).score);
      if(result>0)heroWins+=weight;
      else if(result<0)villainWins+=weight;
      else ties+=weight;
      total+=weight;
    }
    assert.ok(total>0);
    const actual=Array.from(wasm.equity_range_monte_carlo(
      Uint8Array.from(hero.map(pack)),Uint8Array.from(board.map(pack)),
      Uint8Array.from(opponents),Float64Array.from(weights),1000,10n));
    const expected=[heroWins/total,ties/total,villainWins/total];
    for(let outcome=0;outcome<3;outcome++)
      assert.ok(Math.abs(actual[outcome]-expected[outcome])<1e-12,
        "trial="+trial+" expected="+expected+" received="+actual);
  }
});
test("sampled flop/turn equity is seeded, normalized and rejects invalid weights",()=>{
  const hero=new Uint8Array([0x0e,0x1e]);
  const opponents=new Uint8Array([0x02,0x13,0x03,0x14,0x04,0x15]);
  const weights=new Float64Array([0.1,0.3,0.6]);
  for(const board of [new Uint8Array([0x22,0x33,0x07]),new Uint8Array([0x22,0x33,0x07,0x18])]){
    const one=Array.from(wasm.equity_range_monte_carlo(hero,board,opponents,weights,2000,12345n));
    const two=Array.from(wasm.equity_range_monte_carlo(hero,board,opponents,weights,2000,12345n));
    assert.deepEqual(one,two);
    assert.ok(Math.abs(one.reduce((a,b)=>a+b,0)-1)<1e-12);
  }
  assert.throws(()=>wasm.equity_range_monte_carlo(hero,new Uint8Array([0x22,0x33,0x07]),
    opponents,new Float64Array([0.1,-1,0.6]),100,11n));
  assert.throws(()=>wasm.equity_range_monte_carlo(hero,new Uint8Array([0x22,0x33,0x07]),
    new Uint8Array([0x0e,0x14]),new Float64Array([1]),100,11n));
});
