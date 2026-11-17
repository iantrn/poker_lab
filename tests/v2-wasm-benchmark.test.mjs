import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const wasm = require("../engine/pkg-node");
const target={window:{}};
runInNewContext(readFileSync("js/core/evaluator.js","utf8"),target);
const legacy=target.window.PokerLabHandEvaluator;
const SUITS=["clubs","diamonds","hearts","spades"];
const deck=Array.from({length:52},(_,index)=>({value:2+index%13,suit:SUITS[Math.floor(index/13)]}));
let state=12345;
function random(max) { state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)%max; }
const hands=Array.from({length:1200},()=>{
  const copy=deck.slice();
  for(let j=0;j<7;j++){const at=j+random(52-j);[copy[j],copy[at]]=[copy[at],copy[j]];}
  return copy.slice(0,7);
});
const packed=hands.map(hand=>Uint8Array.from(hand.map(c=>c.value|(SUITS.indexOf(c.suit)<<4))));
test("non-gating evaluator benchmark measures JS vs Rust/WASM at identical seven-card workload",()=>{
  for(let i=0;i<100;i++) {
    legacy.evaluate(hands[i]); wasm.evaluate_score(packed[i]);
  }
  const a=performance.now();
  let jsChecksum=0;
  for(const hand of hands)jsChecksum+=legacy.evaluate(hand).score[0];
  const b=performance.now();
  let rustChecksum=0;
  for(const hand of packed)rustChecksum+=wasm.evaluate_score(hand)[0];
  const c=performance.now();
  assert.equal(rustChecksum,jsChecksum,"Must be identical result categories");
  const jsMs=b-a,wasmMs=c-b;
  console.log("WASM benchmark: "+hands.length+" seven-card hands, JS "+jsMs.toFixed(2)+
    "ms, Rust/WASM "+wasmMs.toFixed(2)+"ms, speedup "+
    (jsMs/Math.max(wasmMs,0.001)).toFixed(2)+"x (runner-specific, non-gating)");
});
