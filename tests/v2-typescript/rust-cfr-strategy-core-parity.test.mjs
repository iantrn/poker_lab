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


test("stable public tree is prepared once while changing private infosets and terminal utilities",()=>{
 const existingWindow=globalThis.window;
 globalThis.window={};
 let baseline;
 try{baseline=installCfrCore();}
 finally{if(existingWindow===undefined)delete globalThis.window;else globalThis.window=existingWindow;}
 let prepareCalls=0,preparedSteps=0,legacySteps=0;
 const rust=createRustCfrStrategyCore(baseline,()=>{
   const engine=new wasm.CfrSession();
   return {
     prepare_tree(...args){prepareCalls++;return engine.prepare_tree(...args);},
     step_prepared(...args){preparedSteps++;return engine.step_prepared(...args);},
     step(...args){legacySteps++;return engine.step(...args);},
     average_strategy:()=>engine.average_strategy(),
     iterations:()=>engine.iterations(),
     information_set_count:()=>engine.information_set_count()
   };
 });
 const expected=baseline.createMaps(),actual=rust.createMaps();
 const root=makeTree([1,-1,-1,1]);
 const leaves=[
   root.actions[0].child.actions[0].child,
   root.actions[0].child.actions[1].child,
   root.actions[1].child.actions[0].child,
   root.actions[1].child.actions[1].child
 ];
 let hand="a";
 const cb={
   informationKey:node=>node.key+"|"+hand,
   utility:node=>node.value
 };
 for(let i=0;i<240;i++){
   hand=["a","b","c"][i%3];
   const values=i%2===0?[1,-1,-1,1]:[-1,1,1,-1];
   leaves.forEach((leaf,index)=>{leaf.value=values[index];});
   const weight=i%5===0?2.5:0.75;
   for(const [core,maps] of [[baseline,expected],[rust,actual]]){
     core.runCfr(root,null,0,[1,1],maps,cb,i+1,weight);
     core.runCfr(root,null,1,[1,1],maps,cb,i+1,weight);
   }
 }
 assert.equal(prepareCalls,1);
 assert.equal(preparedSteps,240);
 assert.equal(legacySteps,0);
 // The TypeScript map stores unnormalized strategy sums, whereas Rust
 // exports normalized averages. Compare the public probability API instead.
 for(const key of ["a","b","c"]){
   hand=key;
   for(const node of [root,root.actions[0].child]){
     const expectedProb=baseline.getStrategy(node,null,expected,cb);
     const actualProb=rust.getStrategy(node,null,actual,cb);
     assert.equal(actualProb.length,expectedProb.length);
     for(let j=0;j<actualProb.length;j++)
       assert.ok(Math.abs(actualProb[j]-expectedProb[j])<1e-11,
         "strategy mismatch for "+key+" at "+node.key+"/"+j);
   }
 }
});
