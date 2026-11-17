import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {flattenCfrTree,createCfrInformationRegistry}
  from "../../frontend/src/solver/tree-adapter.ts";
import {createReusableRustTreeSerializer}
  from "../../frontend/src/solver/reusable-cfr-tree.ts";

const require=createRequire(import.meta.url);
const {CfrSession}=require("../../engine/pkg-node");
const terminal=value=>({terminal:true,value});
const decision=(actor,key,a,b)=>({
  terminal:false,actor,key,
  actions:[
    {action:{type:"check",label:"check",amount:0},child:a},
    {action:{type:"bet",label:"bet",amount:1},child:b}
  ]
});
const tree=decision(0,"hero",
  decision(1,"villain",terminal(1),terminal(-1)),
  decision(1,"villain",terminal(-1),terminal(1))
);
function step(session,shape,weight){
  return session.step(
    shape.actors,shape.informationSets,shape.childOffsets,
    shape.childCounts,shape.children,shape.terminalUtilities,weight
  );
}
test("reusable packed CFR+ shape matches fresh validated serialization for 300 changing deals",()=>{
  const build=createReusableRustTreeSerializer();
  const registry=createCfrInformationRegistry();
  const referenceRegistry=createCfrInformationRegistry();
  const rust=new CfrSession();
  const reference=new CfrSession();
  for(let index=0;index<300;index++){
    const hand=["AhAs","KdKc","8h7h"][index%3];
    const scale=index%2?1.5:-0.75;
    const callbacks={
      informationKey:node=>node.key+"|"+hand,
      terminalUtility:node=>node.value*scale
    };
    const cached=build(tree,callbacks,registry);
    const fresh=flattenCfrTree(tree,callbacks,1,referenceRegistry).request;
    for(const [current,expected] of [
      [cached.actors,fresh.actors],
      [cached.informationSets,fresh.informationSets],
      [cached.childOffsets,fresh.childOffsets],
      [cached.childCounts,fresh.childCounts],
      [cached.children,fresh.children],
      [cached.terminalUtilities,fresh.terminalUtilities]
    ])assert.deepEqual([...current],[...expected]);
    const weight=index%7===0?2.75:1;
    assert.equal(step(rust,cached,weight),index+1);
    assert.equal(reference.step(
      Int8Array.from(fresh.actors),Uint32Array.from(fresh.informationSets),
      Uint32Array.from(fresh.childOffsets),Uint8Array.from(fresh.childCounts),
      Uint32Array.from(fresh.children),Float64Array.from(fresh.terminalUtilities),
      weight
    ),index+1);
  }
  assert.equal(registry.byKey.size,referenceRegistry.byKey.size);
  assert.deepEqual(Array.from(rust.average_strategy()),
    Array.from(reference.average_strategy()));
});
test("new information set IDs are reverted on invalid sampled payoff",()=>{
  const build=createReusableRustTreeSerializer();
  const registry=createCfrInformationRegistry();
  const good={informationKey:node=>node.key+"|a",terminalUtility:node=>node.value};
  build(tree,good,registry);
  const size=registry.byKey.size;
  const bad={informationKey:node=>node.key+"|b",terminalUtility:()=>Number.NaN};
  assert.throws(()=>build(tree,bad,registry),/terminale n'est pas finie/);
  assert.equal(registry.byKey.size,size);
  const prepared=build(tree,{informationKey:node=>node.key+"|b",
    terminalUtility:node=>node.value},registry);
  assert.equal(registry.byKey.size,size+2);
  prepared.rollback(); // Simulates WASM rejecting a sample after serialization.
  assert.equal(registry.byKey.size,size);
  assert.equal(registry.byKey.has("hero|b"),false);
});
