import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { PokerLabDeck, installDeck } from "../../frontend/src/core/deck.ts";
const oldWindow={};
runInNewContext(readFileSync("js/core/deck.js","utf8"),{window:oldWindow,Math,Number,Error,Uint32Array});
const Original=oldWindow.PokerLabDeck;
globalThis.window={};
installDeck();
const clean=value=>JSON.parse(JSON.stringify(value));
test("all 52 cards and constants have the exact V1 representation",()=>{
  assert.deepEqual(clean(globalThis.window.PokerLabCardConstants),clean(oldWindow.PokerLabCardConstants));
  assert.deepEqual(clean(new PokerLabDeck({autoShuffle:false}).cards),clean(new Original({autoShuffle:false}).cards));
});
test("drawing and reset preserve every state transition and errors",()=>{
  const a=new Original({autoShuffle:false}),b=new PokerLabDeck({autoShuffle:false});
  for(const n of [1,2,5,7,13,24]){
    assert.deepEqual(clean(b.draw(n)),clean(a.draw(n)));
    assert.deepEqual(clean(b.getState()),clean(a.getState()));
    assert.deepEqual(clean(b.getRemainingCards()),clean(a.getRemainingCards()));
  }
  for(const n of [-1,0,1.5,10]){
    let oldError,newError;
    try{a.draw(n)}catch(e){oldError=e.message}
    try{b.draw(n)}catch(e){newError=e.message}
    assert.equal(newError,oldError);
  }
  assert.deepEqual(clean(b.reset({shuffle:false}).getState()),clean(a.reset({shuffle:false}).getState()));
});
test("Fisher-Yates shuffle and rejection validation match V1",()=>{
  const a=new Original({autoShuffle:false}),b=new PokerLabDeck({autoShuffle:false});
  a.draw(6);b.draw(6);
  for(const pick of [n=>n-1,n=>0]){
    a.randomInteger=pick;b.randomInteger=pick;
    a.shuffle();b.shuffle();
    assert.deepEqual(clean(b.cards),clean(a.cards));
  }
  for(const max of [0,-3,1.5,NaN]){
    let oldError,newError;
    try{a.randomInteger(max)}catch(e){oldError=e.message}
    try{b.randomInteger(max)}catch(e){newError=e.message}
    assert.equal(newError,oldError);
  }
});
