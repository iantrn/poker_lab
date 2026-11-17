import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {flattenCfrTree} from "../../frontend/src/solver/tree-adapter.ts";
const require=createRequire(import.meta.url);
const wasm=require("../engine/pkg-node");
const old={};
runInNewContext(readFileSync("js/modules/cfr-core.js","utf8"),{window:old,Float64Array,Map,WeakMap,Math,JSON});
const core=old.PokerLabCFRCore;

function terminal(value) {return {terminal:true,type:"showdown",winner:null,pot:value,heroInvested:0,payout:value};}
function decision(actor,key,left,right) {
 return {terminal:false,actor,key,actions:[
  {action:{type:"check",label:"first",amount:0},child:left},
  {action:{type:"bet",label:"second",amount:1},child:right}
 ]};
}
const root=decision(0,"P0",
  decision(1,"P1",terminal(1),terminal(-1)),
  decision(1,"P1",terminal(-1),terminal(1))
);
const callbacks={
  informationKey: node=>node.key,
  terminalUtility: node=>node.payout,
};
test("typed flat tree matches V1 imperfect-information CFR+ profile",()=>{
 const packed=flattenCfrTree(root,callbacks,1500);
 const p=Array.from(wasm.cfr_plus_tree(
   new Int8Array(packed.request.actors),
   new Uint32Array(packed.request.informationSets),
   new Uint32Array(packed.request.childOffsets),
   new Uint8Array(packed.request.childCounts),
   new Uint32Array(packed.request.children),
   new Float64Array(packed.request.terminalUtilities),
   packed.request.iterations
 ));
 const map=core.createMaps();
 const cb={informationKey:node=>node.key,utility:node=>node.payout};
 for(let i=1;i<=1500;i++){
  core.runCfr(root,null,0,[1,1],map,cb,i);
  core.runCfr(root,null,1,[1,1],map,cb,i);
 }
 const expected=[...core.getStrategy(root,null,map,cb),
   ...core.getStrategy(root.actions[0].child,null,map,cb)];
 assert.equal(p.length,expected.length);
 for(let i=0;i<p.length;i++)assert.ok(Math.abs(p[i]-expected[i])<1e-10,
   "CFR profile disagreement at "+i+" Rust="+p+" JS="+expected);
});
test("serializer rejects mismatched action signatures under shared information key",()=>{
 const incompatible=decision(0,"root",
   decision(1,"same",terminal(1),terminal(-1)),
   {terminal:false,actor:1,key:"same",actions:[
     {action:{type:"fold",label:"different",amount:0},child:terminal(-1)}
   ]}
 );
 assert.throws(()=>flattenCfrTree(incompatible,callbacks,100),/incompatibles/);
});
test("serializer rejects cyclic references and nonfinite terminal utilities",()=>{
 const loop=decision(0,"root",terminal(0),terminal(0));
 loop.actions[0].child=loop;
 assert.throws(()=>flattenCfrTree(loop,callbacks,10));
 assert.throws(()=>flattenCfrTree(decision(0,"root",terminal(NaN),terminal(1)),callbacks,10));
});
