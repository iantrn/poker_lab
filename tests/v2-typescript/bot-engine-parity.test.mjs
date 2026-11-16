import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installBotEngine} from "../../frontend/src/bots/engine.ts";
const oldMath=Object.create(Math);
let oldRandom=()=>0.5;oldMath.random=()=>oldRandom();
const ctx={window:{},Math:oldMath,console,Number,Array,Object,Map,Set,JSON,Error};
ctx.window.window=ctx.window;
for(const name of ["js/bots/bot-profiles.js","js/core/evaluator.js","js/bots/bot-engine.js"])
 runInNewContext(readFileSync(name,"utf8"),ctx);
const legacy=ctx.window.PokerLabBotEngine;
globalThis.window=ctx.window;
const typed=installBotEngine();
const plain=value=>JSON.parse(JSON.stringify(value));
test("700 deterministic bot decisions match V1 with identical RNG streams",()=>{
 const originalRandom=Math.random;
 let seed=128;
 const seeded=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
 try{
  for(let scenario=0;scenario<700;scenario++){
   const rank=2+scenario%13;
   const profile=["nit","tag","lag","balanced"][scenario%4];
   const difficulty=["easy","medium","hard"][scenario%3];
   const street=["preflop","flop","turn","river"][scenario%4];
   const board=[{value:2,suit:"clubs"},{value:3,suit:"clubs"},{value:7,suit:"diamonds"},
                {value:8,suit:"diamonds"},{value:9,suit:"spades"}].slice(0,street==="preflop"?0:street==="flop"?3:street==="turn"?4:5);
   const input={profile,difficulty,street,holeCards:[{value:rank,suit:"hearts"},{value:14,suit:"spades"}],
    communityCards:board,pot:5+scenario%18,stack:10+scenario%40,callAmount:scenario%3===0?0:2,
    currentBet:scenario%3===0?0:2,currentContribution:0,minRaise:2,bigBlind:1,
    opponentsRemaining:1+scenario%5,canRaise:scenario%7!==0,position:["BB","CO","BTN"][scenario%3]};
   seed=0xdeadbeef+scenario;oldRandom=seeded;
   const expected=plain(legacy.decide(input));
   seed=0xdeadbeef+scenario;Math.random=seeded;
   assert.deepEqual(plain(typed.decide(input)),expected,"scenario "+scenario);
  }
 }finally{Math.random=originalRandom;}
});
