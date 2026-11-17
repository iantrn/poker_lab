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


test("Rust bridge groups eight weighted chance deals per WASM transfer without strategy drift",()=>{
 const oldWindow=globalThis.window;
 globalThis.window={};
 let baseline;
 try{baseline=installCfrCore();}
 finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
 const counters={prepare:0,batch:0,single:0};
 const optimized=createRustCfrStrategyCore(baseline,()=>{
   const engine=new wasm.CfrSession();
   return {
     prepare_tree(...args){counters.prepare++;return engine.prepare_tree(...args);},
     step_prepared_batch(...args){counters.batch++;return engine.step_prepared_batch(...args);},
     step_prepared(...args){counters.single++;return engine.step_prepared(...args);},
     step:(...args)=>engine.step(...args),
     average_strategy:()=>engine.average_strategy(),
     iterations:()=>engine.iterations(),
     information_set_count:()=>engine.information_set_count()
   };
 });
 const baselineMaps=baseline.createMaps();
 const batchedMaps=optimized.createMaps();
 const root=makeTree([1,-1,-1,1]);
 const makeCallbacks={
   informationKey:(node,deal)=>node.key+"|"+deal.hand,
   utility:(node,deal)=>node.value*deal.sign
 };
 for(let start=0;start<80;start+=8){
   const batch=[];
   for(let i=start;i<start+8;i++){
     const deal={hand:["a","b","c"][i%3],sign:i%2===0?1:-1};
     const weight=i%4===0?2.5:0.75;
     batch.push({root,deal,callbacks:makeCallbacks,chanceWeight:weight});
     baseline.runCfr(root,deal,0,[1,1],baselineMaps,makeCallbacks,i+1,weight);
     baseline.runCfr(root,deal,1,[1,1],baselineMaps,makeCallbacks,i+1,weight);
   }
   optimized.runCfrBatch(batch,batchedMaps,start+1);
 }
 assert.deepEqual(counters,{prepare:1,batch:10,single:0});
 for(const hand of ["a","b","c"]){
   for(const node of [root,root.actions[0].child]){
     const deal={hand,sign:1};
     const expected=baseline.getStrategy(node,deal,baselineMaps,makeCallbacks);
     const actual=optimized.getStrategy(node,deal,batchedMaps,makeCallbacks);
     assert.equal(actual.length,expected.length);
     for(let i=0;i<actual.length;i++)
       assert.ok(Math.abs(actual[i]-expected[i])<1e-11,
         "batched CFR+ mismatch at "+hand+"/"+node.key+"/"+i);
   }
 }
});
test("Rust bridge batches safely on an old WASM session without the new batch method",()=>{
 const oldWindow=globalThis.window;
 globalThis.window={};
 let baseline;
 try{baseline=installCfrCore();}
 finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
 let singleSteps=0;
 const optimized=createRustCfrStrategyCore(baseline,()=>{
   const engine=new wasm.CfrSession();
   return {
     prepare_tree:(...args)=>engine.prepare_tree(...args),
     step_prepared(...args){singleSteps++;return engine.step_prepared(...args);},
     step:(...args)=>engine.step(...args),
     average_strategy:()=>engine.average_strategy(),
     iterations:()=>engine.iterations(),
     information_set_count:()=>engine.information_set_count()
   };
 });
 const maps=optimized.createMaps(),reference=baseline.createMaps();
 const root=makeTree([1,-1,-1,1]);
 const entries=[];
 for(let i=0;i<8;i++){
   const deal={hand:"a",sign:i%2===0?1:-1};
   entries.push({root,deal,
     callbacks:{
       informationKey:(node,deal)=>node.key+"|"+deal.hand,
       utility:(node,deal)=>node.value*deal.sign
     },
     chanceWeight:i%3===0?2:1});
   baseline.runCfr(root,deal,0,[1,1],reference,entries[i].callbacks,i+1,entries[i].chanceWeight);
   baseline.runCfr(root,deal,1,[1,1],reference,entries[i].callbacks,i+1,entries[i].chanceWeight);
 }
 optimized.runCfrBatch(entries,maps,1);
 assert.equal(singleSteps,8);
 const cb=entries[0].callbacks,deal=entries[0].deal;
 for(const node of [root,root.actions[0].child]){
   const expected=baseline.getStrategy(node,deal,reference,cb);
   const actual=optimized.getStrategy(node,deal,maps,cb);
   assert.ok(Math.abs(actual[0]-expected[0])<1e-11);
 }
});
