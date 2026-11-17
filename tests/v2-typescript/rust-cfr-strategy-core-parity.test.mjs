import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {installCfrCore} from "../../frontend/src/solver/cfr-core.ts";
import {createRustCfrStrategyCore} from "../../frontend/src/solver/rust-cfr-strategy-core.ts";
const require=createRequire(import.meta.url);
const wasm=require("../../engine/pkg-node");
const terminal=value=>({terminal:true,value});
const makeTree=(p)=>({
 terminal:false,actor:0,key:"hero",
 actions:[
  {action:{type:"check",label:"left",amount:0},child:{
   terminal:false,actor:1,key:"villain",
   actions:[
    {action:{type:"check",label:"left",amount:0},child:terminal(p[0])},
    {action:{type:"bet",label:"right",amount:1},child:terminal(p[1])}
   ]
  }},
  {action:{type:"bet",label:"right",amount:1},child:{
   terminal:false,actor:1,key:"villain",
   actions:[
    {action:{type:"check",label:"left",amount:0},child:terminal(p[2])},
    {action:{type:"bet",label:"right",amount:1},child:terminal(p[3])}
   ]
  }}
 ]
});
const callbacks={informationKey:node=>node.key,utility:node=>node.value};
test("Rust incremental CFR+ bridge matches TypeScript strategy sums, EV and NashConv after 160 weighted deals",()=>{
 const existingWindow=globalThis.window;
 globalThis.window={};
 let baseline;
 try{baseline=installCfrCore();}
 finally{if(existingWindow===undefined)delete globalThis.window;else globalThis.window=existingWindow;}
 const optimized=createRustCfrStrategyCore(baseline,()=>new wasm.CfrSession());
 const expected=baseline.createMaps();
 const actual=optimized.createMaps();
 let finalTree=null;
 for(let i=0;i<160;i++){
  const payoffs=i%2===0?[1,-1,-1,1]:[-1,1,1,-1];
  const weight=i%4===0?3:.75;
  const root=makeTree(payoffs);
  finalTree=root;
  baseline.runCfr(root,null,0,[1,1],expected,callbacks,i+1,weight);
  baseline.runCfr(root,null,1,[1,1],expected,callbacks,i+1,weight);
  optimized.runCfr(root,null,0,[1,1],actual,callbacks,i+1,weight);
  optimized.runCfr(root,null,1,[1,1],actual,callbacks,i+1,weight);
 }
 const left=finalTree.actions[0].child;
 const expectedProb=[
   ...baseline.getStrategy(finalTree,null,expected,callbacks),
   ...baseline.getStrategy(left,null,expected,callbacks)
 ];
 const actualProb=[
   ...optimized.getStrategy(finalTree,null,actual,callbacks),
   ...optimized.getStrategy(left,null,actual,callbacks)
 ];
 assert.equal(actualProb.length,4);
 for(let i=0;i<expectedProb.length;i++)
  assert.ok(Math.abs(expectedProb[i]-actualProb[i])<1e-11,
    "CFR+ sampled information set divergence at index "+i);
 const deals=[{root:finalTree,deal:null}];
 const v1=baseline.measureExploitability(deals,expected,callbacks);
 const rust=optimized.measureExploitability(deals,actual,callbacks);
 for(const key of ["nashConv","exploitability","profileValue",
   "player0BestResponse","player1BestResponse"]){
  assert.ok(Math.abs(v1[key]-rust[key])<1e-10,"Exploitability mismatch: "+key);
 }
});
