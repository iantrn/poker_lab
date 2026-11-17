import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {installCfrCore} from "../frontend/src/solver/cfr-core.ts";

const require=createRequire(import.meta.url);
const wasm=require("../engine/pkg-node");
const previousWindow=globalThis.window;
globalThis.window={};
const legacy=installCfrCore();
if(previousWindow===undefined)delete globalThis.window;
else globalThis.window=previousWindow;

const actors=new Int8Array([0,1,1,-1,-1,-1,-1]);
const infos=new Uint32Array([0,1,1,0,0,0,0]);
const offsets=new Uint32Array([0,2,4,6,6,6,6]);
const counts=new Uint8Array([2,2,2,0,0,0,0]);
const edges=new Uint32Array([1,2,3,4,5,6]);
function payoffTree(values){
  const terminal=(value)=>({terminal:true,value});
  const opponent=(a,b)=>({terminal:false,actor:1,key:"opponent",
    actions:[
      {action:{type:"check",label:"left",amount:0},child:terminal(a)},
      {action:{type:"bet",label:"right",amount:1},child:terminal(b)}
    ]});
  return {terminal:false,actor:0,key:"hero",
    actions:[
      {action:{type:"check",label:"left",amount:0},
        child:opponent(values[0],values[1])},
      {action:{type:"bet",label:"right",amount:1},
        child:opponent(values[2],values[3])}
    ]};
}
test("stateful WASM CFR+ exactly matches sampled V2 TypeScript regret updates with chance importance weights",()=>{
  const session=new wasm.CfrSession();
  const maps=legacy.createMaps();
  const callbacks={
    informationKey:node=>node.key,
    utility:node=>node.value
  };
  let last=null;
  for(let iteration=0;iteration<300;iteration++){
    const values=iteration%2===0?[1,-1,-1,1]:[-1,1,1,-1];
    const weight=iteration%3===0?2.5:0.75;
    const utility=new Float64Array([0,0,0,...values]);
    const n=session.step(actors,infos,offsets,counts,edges,utility,weight);
    assert.equal(n,iteration+1);
    const tree=payoffTree(values);
    legacy.runCfr(tree,null,0,[1,1],maps,callbacks,iteration+1,weight);
    legacy.runCfr(tree,null,1,[1,1],maps,callbacks,iteration+1,weight);
    last=tree;
  }
  const rust=Array.from(session.average_strategy());
  const js=[
    ...legacy.getStrategy(last,null,maps,callbacks),
    ...legacy.getStrategy(last.actions[0].child,null,maps,callbacks)
  ];
  assert.equal(session.information_set_count(),2);
  assert.equal(session.iterations(),300);
  assert.equal(rust.length,js.length);
  for(let i=0;i<rust.length;i++)
    assert.ok(Math.abs(rust[i]-js[i])<1e-12,
      "Sampled CFR+ mismatch at "+i+" wasm="+rust+" TS="+js);
});
test("CFR+ session rejects cyclic deals and preserves last good average",()=>{
  const session=new wasm.CfrSession();
  const utilities=new Float64Array([0,0,0,1,-1,-1,1]);
  session.step(actors,infos,offsets,counts,edges,utilities,1);
  const before=Array.from(session.average_strategy());
  assert.throws(()=>session.step(new Int8Array([0,-1]),new Uint32Array([0,0]),
    new Uint32Array([0,1]),new Uint8Array([1,0]),
    new Uint32Array([0]),new Float64Array([0,1]),1));
  assert.deepEqual(Array.from(session.average_strategy()),before);
});
