import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {flattenCfrTree,createCfrInformationRegistry} from
  "../../frontend/src/solver/tree-adapter.ts";
const require=createRequire(import.meta.url);
const wasm=require("../../engine/pkg-node");
const term=value=>({terminal:true,type:"showdown",winner:null,
  pot:value,heroInvested:0,value});
const decision=(actor,key,left,right)=>({
  terminal:false,actor,key,
  actions:[
    {action:{type:"check",label:"left",amount:0},child:left},
    {action:{type:"bet",label:"right",amount:1},child:right}
  ]
});
const cb={informationKey:n=>n.key,terminalUtility:n=>n.value};
const first=decision(0,"hero",decision(1,"villain",term(1),term(-1)),
  decision(1,"villain",term(-1),term(1)));
const second=decision(0,"hero",decision(1,"villain-deep",term(3),term(-1)),
  decision(1,"villain",term(-2),term(2)));
test("typed tree serializer maintains stable infosets across separate runouts",()=>{
 const registry=createCfrInformationRegistry();
 const session=new wasm.CfrSession();
 for(let iteration=0;iteration<30;iteration++) {
  const tree=iteration===0?first:second;
  const packed=flattenCfrTree(tree,cb,1,registry);
  const p=packed.request;
  assert.equal(p.informationSets[0],0);
  assert.equal(p.informationSets[1],iteration===0?1:2);
  assert.equal(session.step(
    new Int8Array(p.actors),new Uint32Array(p.informationSets),
    new Uint32Array(p.childOffsets),new Uint8Array(p.childCounts),
    new Uint32Array(p.children),new Float64Array(p.terminalUtilities),
    iteration%3===0?2:1
  ),iteration+1);
 }
 assert.equal(session.information_set_count(),3);
 assert.equal(registry.byKey.size,3);
 assert.equal(session.iterations(),30);
 const result=Array.from(session.average_strategy());
 assert.equal(result.length,6);
 assert.ok(result.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
 for(let i=0;i<6;i+=2)
   assert.ok(Math.abs(result[i]+result[i+1]-1)<1e-9);
});
test("a malformed sample rolls back all newly reserved information set IDs",()=>{
 const registry=createCfrInformationRegistry();
 flattenCfrTree(first,cb,1,registry);
 const size=registry.byKey.size;
 const bad=decision(0,"hero",
   decision(1,"brand-new",term(2),term(-2)),
   decision(1,"brand-new",term(2),term(-2)));
 bad.actions[1].child.actions[1].action.label="wrong";
 assert.throws(()=>flattenCfrTree(bad,cb,1,registry),/incompatibles/);
 assert.equal(registry.byKey.size,size);
 assert.equal(registry.byKey.get("brand-new"),undefined);
});
