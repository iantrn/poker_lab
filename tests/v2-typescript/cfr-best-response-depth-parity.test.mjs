import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installCfrCore} from "../../frontend/src/solver/cfr-core.ts";

const legacyTarget={};
runInNewContext(readFileSync("js/modules/cfr-core.js","utf8"),{
  window:legacyTarget,Map,Set,WeakMap,Float64Array,Number,Math,JSON
});
globalThis.window={};
const typed=installCfrCore();
delete globalThis.window;
const original=legacyTarget.PokerLabCFRCore;
const leaf=payoff=>({terminal:true,payoff});
function node(actor,key,labels,children) {
  return {terminal:false,actor,key,actions:labels.map((label,i)=>({
    action:{type:label,label,amount:i},child:children[i]
  }))};
}
function dealTree(offset) {
  return node(0,"root",["check","bet"],[
    node(1,"response-check",["check","bet"],[
      leaf(1+offset),
      node(0,"facing-bet",["fold","call"],[
        leaf(-2+offset),leaf(3+offset)
      ])
    ]),
    node(1,"response-bet",["fold","call"],[
      leaf(2+offset),leaf(-1+offset)
    ])
  ]);
}
const callbacks={
  informationKey:node=>node.key,
  utility:node=>node.payoff
};
const deals=[
  {root:dealTree(0),deal:{weight:1}},
  {root:dealTree(2),deal:{weight:3}},
  {root:dealTree(-1),deal:{weight:0.5}}
];
function training(core) {
  const maps=core.createMaps();
  for(let iter=1;iter<=300;iter++)for(const {root,deal} of deals) {
    core.runCfr(root,deal,0,[1,1],maps,callbacks,iter,deal.weight);
    core.runCfr(root,deal,1,[1,1],maps,callbacks,iter,deal.weight);
  }
  const weight=deal=>deal.weight;
  return JSON.parse(JSON.stringify({
    profile:core.measureExploitability(deals,maps,callbacks,weight),
    best0:core.bestResponseValue(deals,maps,callbacks,0,weight),
    best1:core.bestResponseValue(deals,maps,callbacks,1,weight),
    strategies:deals.map(x=>Array.from(core.getStrategy(x.root,x.deal,maps,callbacks)))
  }));
}
test("optimized depth-indexed NashConv and best responses match legacy for unequal tree depths and weighted deals",()=>{
  assert.deepEqual(training(typed),training(original));
});
