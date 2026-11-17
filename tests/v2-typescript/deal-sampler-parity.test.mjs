import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {buildUniformRange,sampleDeals,createDealSampler} from "../../frontend/src/solver/deal-sampler.ts";

const legacy={window:{},Uint32Array,Math,Set,Map,Promise,console};
runInNewContext(readFileSync("js/modules/postflop-strategy.js","utf8"),legacy);
const old=legacy.window.PokerLabPostflopStrategy;
const card=(value,suit)=>({value,suit});
const board=[card(2,"spades"),card(9,"diamonds"),card(12,"clubs")];
const actualHero=[card(14,"clubs"),card(14,"hearts")];
const heroRange=[
 {cards:actualHero,weight:0.6},
 {cards:[card(13,"clubs"),card(13,"hearts")],weight:0.4},
 {cards:[card(7,"clubs"),card(7,"hearts")],weight:0.02}
];
const villainRange=[
 {cards:[card(10,"diamonds"),card(10,"clubs")],weight:1},
 {cards:[card(14,"clubs"),card(10,"clubs")],weight:2},
 {cards:[card(4,"hearts"),card(3,"diamonds")],weight:0.1}
];
function rng(seed) {
 let state=seed|0;
 return ()=>{
  state=(state+0x6D2B79F5)|0;
  let value=state;
  value=Math.imul(value^(value>>>15),value|1);
  value^=value+Math.imul(value^(value>>>7),value|61);
  return ((value^(value>>>14))>>>0)/4294967296;
 };
}
const plain=x=>JSON.parse(JSON.stringify(x));
test("typed uniform range generates exactly the same combinations in V1 order",()=>{
 const positions=[[],board,[...board,...actualHero]];
 for(const known of positions){
  assert.deepEqual(plain(buildUniformRange(known)),plain(old.buildUniformRange(known)));
 }
});
test("typed chance sampler preserves 5 seeded V1 sampling scenarios and importance weights",()=>{
 const cases=[
  [actualHero,board,villainRange,60,true,heroRange],
  [actualHero,board,villainRange,60,false,heroRange],
  [actualHero,board,null,45,false,heroRange],
  [actualHero,board,null,25,true,null],
  [actualHero,board,[{cards:actualHero,weight:2}],50,true,heroRange],
 ];
 for(let i=0;i<cases.length;i++){
  const args=cases[i];
  const expected=old.sampleDeals(args[0],args[1],args[2],args[3],args[4],rng(15+i),args[5]);
  const current=sampleDeals(args[0],args[1],args[2],args[3],args[4],rng(15+i),args[5]);
  assert.deepEqual(plain(current),plain(expected),"V1 sampler mismatch scenario "+i);
 }
});
test("typed chance sampler never leaks blocked combos or repeats cards in a deal",()=>{
 const result=sampleDeals(actualHero,board,villainRange,180,true,rng(80),heroRange);
 for(const entry of result.deals){
  const keys=[...entry.hero,...entry.villain,...entry.finalBoard].map(c=>c.value+"_"+c.suit);
  assert.equal(new Set(keys).size,9);
  assert.ok(entry.heroImportanceWeight>0);
 }
});

test("prepared chance sampler exactly matches repeated independent V1 calls and RNG order",()=>{
 const river=[...board,card(6,"hearts"),card(8,"spades")];
 const cases=[
  {board,opponentRange:villainRange,heroRange,rangeUsedHint:true},
  {board:river,opponentRange:villainRange,heroRange,rangeUsedHint:true},
  {board,opponentRange:null,heroRange,rangeUsedHint:false},
  {board,opponentRange:[{cards:actualHero,weight:2}],heroRange,rangeUsedHint:true},
  {board,opponentRange:villainRange,heroRange:null,rangeUsedHint:true},
 ];
 for(let scenario=0;scenario<cases.length;scenario++){
  const {board:community,opponentRange,heroRange:heroes,rangeUsedHint}=cases[scenario];
  const before=rng(4001+scenario),after=rng(4001+scenario);
  const sampler=createDealSampler(actualHero,community,opponentRange,rangeUsedHint,after,heroes);
  for(const [step,count] of [1,4,1,7,0,2,15,1,10,3,1,2,17,1].entries()){
   const expected=old.sampleDeals(actualHero,community,opponentRange,count,rangeUsedHint,before,heroes);
   const actual=sampler(count);
   assert.deepEqual(plain(actual),plain(expected),
     "prepared/V1 divergence in scenario "+scenario+" step "+step);
  }
 }
});

test("prepared chance sampler cache eviction preserves exact V1 draws across many hero hands",()=>{
 const distinct=[{cards:actualHero,weight:1},...buildUniformRange(board)
   .filter(combo=>combo.cards.every(c=>!actualHero.some(h=>h.value===c.value&&h.suit===c.suit)))
   .slice(0,45)];
 const villains=buildUniformRange(board);
 const before=rng(9007),after=rng(9007);
 const sampler=createDealSampler(actualHero,board,villains,true,after,distinct);
 const visited=new Set();
 for(let i=0;i<240;i++){
  const expected=old.sampleDeals(actualHero,board,villains,1,true,before,distinct);
  const actual=sampler(1);
  assert.deepEqual(plain(actual),plain(expected),"V1 divergence after cache reuse/eviction draw "+i);
  visited.add(actual.deals[0].hero.map(c=>c.value+"_"+c.suit).join(","));
 }
 assert.ok(visited.size>32,"the fixture must exercise the bounded cache eviction");
});
