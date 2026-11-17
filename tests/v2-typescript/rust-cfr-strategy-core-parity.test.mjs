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


test("numeric batch rollback restores canonical and numerical IDs after a rejected WASM call",()=>{
 const oldWindow=globalThis.window;
 globalThis.window={};
 let base;
 try{base=installCfrCore();}
 finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
 const reference=base.createMaps();
 let reject=true;
 const bridge=createRustCfrStrategyCore(base,()=>{
   const rust=new wasm.CfrSession();
   return {
     prepare_tree:(...args)=>rust.prepare_tree(...args),
     step_prepared_batch(...args){
       if(reject){reject=false;throw new Error("synthetic atomic rejection");}
       return rust.step_prepared_batch(...args);
     },
     step_prepared:(...args)=>rust.step_prepared(...args),
     step:(...args)=>rust.step(...args),
     iterations:()=>rust.iterations(),
     information_set_count:()=>rust.information_set_count(),
     average_strategy:()=>rust.average_strategy()
   };
 });
 const maps=bridge.createMaps();
 const root=makeTree([1,-1,-1,1]);
 const callbacks={
   informationKey:(node,deal)=>node.key+"|"+deal.hand+"|"+deal.board,
   informationPrefix:(node,deal)=>node.key+"|"+deal.hand+"|",
   informationSuffix:(node,deal)=>deal.board,
   utility:(node,deal)=>node.value*deal.sign
 };
 const entries=[];
 for(let i=0;i<8;i++){
   const deal={hand:["a","b","a","c"][i%4],
     board:["flop","turn"][i%2],sign:i%2===0?1:-1};
   const sample={root,deal,callbacks,chanceWeight:i%3===0?3:0.5};
   entries.push(sample);
   base.runCfr(root,deal,0,[1,1],reference,callbacks,i+1,sample.chanceWeight);
   base.runCfr(root,deal,1,[1,1],reference,callbacks,i+1,sample.chanceWeight);
 }
 assert.throws(()=>bridge.runCfrBatch(entries,maps,1),/synthetic atomic rejection/);
 assert.equal(reject,false);
 assert.doesNotThrow(()=>bridge.runCfrBatch(entries,maps,1));
 for(const hand of ["a","b","c"]){
   for(const board of ["flop","turn"]){
     const deal={hand,board,sign:1};
     for(const node of [root,root.actions[0].child]){
       const lhs=base.getStrategy(node,deal,reference,callbacks);
       const rhs=bridge.getStrategy(node,deal,maps,callbacks);
       assert.equal(lhs.length,rhs.length);
       for(let a=0;a<lhs.length;a++)
         assert.ok(Math.abs(lhs[a]-rhs[a])<1e-11,
           "recovered strategy mismatch at "+hand+"/"+board+"/"+node.key+"/"+a);
     }
   }
 }
});


test("Rust partial root policy avoids full-strategy copies during progressive CFR+",()=>{
 const previous=globalThis.window;
 globalThis.window={};
 let baseline;
 try{baseline=installCfrCore();}
 finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
 let fullExports=0,subsetExports=0;
 const rust=createRustCfrStrategyCore(baseline,()=>{
   const engine=new wasm.CfrSession();
   return {
     prepare_tree:(...args)=>engine.prepare_tree(...args),
     step_prepared:(...args)=>engine.step_prepared(...args),
     step:(...args)=>engine.step(...args),
     average_strategy(){fullExports++;return engine.average_strategy();},
     strategy_for_info_set(id){subsetExports++;return engine.strategy_for_info_set(id);},
     iterations:()=>engine.iterations(),
     information_set_count:()=>engine.information_set_count()
   };
 });
 const baselineMaps=baseline.createMaps(),optimizedMaps=rust.createMaps();
 const root=makeTree([1,-1,-1,1]);
 for(let iteration=1;iteration<=96;iteration++){
   const weight=iteration%5===0?2.5:1;
   baseline.runCfr(root,null,0,[1,1],baselineMaps,callbacks,iteration,weight);
   baseline.runCfr(root,null,1,[1,1],baselineMaps,callbacks,iteration,weight);
   rust.runCfr(root,null,0,[1,1],optimizedMaps,callbacks,iteration,weight);
   rust.runCfr(root,null,1,[1,1],optimizedMaps,callbacks,iteration,weight);
   if(iteration%12===0){
     const expected=baseline.getStrategy(root,null,baselineMaps,callbacks);
     const found=rust.getStrategy(root,null,optimizedMaps,callbacks);
     for(let j=0;j<expected.length;j++)
       assert.ok(Math.abs(expected[j]-found[j])<1e-11);
   }
 }
 assert.equal(fullExports,0,"live policy must not export every Rust information set");
 assert.equal(subsetExports,8);
 assert.ok(Number.isFinite(rust.averageStrategy(root,null,optimizedMaps,callbacks)));
 assert.equal(fullExports,1,"full strategy export deferred to EV evaluation");
 assert.equal(rust.information_set_count,undefined);
});
