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


test("numeric prefix/suffix IDs preserve canonical keys across private hands and public boards",()=>{
  const fast=createReusableRustTreeSerializer();
  const plain=createReusableRustTreeSerializer();
  const indexed=createCfrInformationRegistry();
  const canonical=createCfrInformationRegistry();
  let concatenations=0;
  for(let i=0;i<240;i++){
    const hand=["AhAs","KdKc","8h7h"][i%3];
    const board=["2c7d9h","2c7d9hTs"][i%2];
    const utilityScale=i%2?1.5:-0.75;
    const cb={
      informationKey(node){concatenations++;return node.key+"|"+hand+"|"+board;},
      informationPrefix:node=>node.key+"|"+hand+"|",
      informationSuffix:()=>board,
      terminalUtility:node=>node.value*utilityScale
    };
    const before=concatenations;
    const efficient=fast(tree,cb,indexed);
    const exact=plain(tree,{
      informationKey:cb.informationKey,
      terminalUtility:cb.terminalUtility
    },canonical);
    assert.deepEqual([...efficient.informationSets],[...exact.informationSets]);
    assert.deepEqual([...efficient.terminalUtilities],[...exact.terminalUtilities]);
    // After the first visit of a hand/board pair, the numeric index should
    // not construct ANY full string key for an existing info set.
    if(i>=6)assert.equal(concatenations,before);
  }
  assert.deepEqual([...indexed.byKey],[...canonical.byKey]);
  assert.equal(indexed.byKey.size,12);
});
test("numeric registry isolation and batch rollback reject orphan IDs",()=>{
  const build=createReusableRustTreeSerializer();
  const a=createCfrInformationRegistry();
  const b=createCfrInformationRegistry();
  const callbacks=hand=>({
    informationKey:node=>node.key+"|"+hand,
    informationPrefix:node=>node.key+"|",
    informationSuffix:()=>hand,
    terminalUtility:node=>node.value
  });
  const first=build(tree,callbacks("a"),a);
  const repeat=build(tree,callbacks("a"),a);
  repeat.rollback();
  first.rollback();
  assert.equal(a.byKey.size,0);
  const fresh=build(tree,callbacks("b"),b);
  const retry=build(tree,callbacks("a"),a);
  assert.deepEqual([...retry.informationSets],[...fresh.informationSets]);
  assert.deepEqual([...a.byKey].map(([k,v])=>[k,v.id]),
    [["hero|a",0],["villain|a",1]]);
  retry.rollback();
  assert.equal(a.byKey.size,0);
  assert.equal(b.byKey.size,2);
  // A failed sample must clean up newly indexed numerical IDs and allow
  // their exact reuse, including when terminal utility validation fails.
  const invalid=callbacks("bad");
  invalid.terminalUtility=()=>Number.NaN;
  assert.throws(()=>build(tree,invalid,a),/terminale n'est pas finie/);
  assert.equal(a.byKey.size,0);
  const recovered=build(tree,callbacks("bad"),a);
  assert.deepEqual([...recovered.informationSets],[0,1,1,0,0,0,0]);
  assert.equal(a.byKey.size,2);
});
test("numeric split rejects noncanonical identities without reserving IDs",()=>{
  const build=createReusableRustTreeSerializer();
  const registry=createCfrInformationRegistry();
  const initial=build(tree,{
    informationKey:node=>node.key+"|a",
    informationPrefix:node=>node.key+"|",
    informationSuffix:()=>"a",
    terminalUtility:node=>node.value
  },registry);
  initial.rollback();
  assert.equal(registry.byKey.size,0);
  assert.throws(()=>build(tree,{
    informationKey:node=>node.key+"|private-new",
    informationPrefix:node=>node.key+"|",
    informationSuffix:()=>"not-the-real-key",
    terminalUtility:node=>node.value
  },registry),/incompatible/);
  assert.equal(registry.byKey.size,0);
  const valid=build(tree,{
    informationKey:node=>node.key+"|a",
    informationPrefix:node=>node.key+"|",
    informationSuffix:()=>"a",
    terminalUtility:node=>node.value
  },registry);
  assert.equal(registry.byKey.size,2);
  assert.deepEqual([...valid.informationSets],[0,1,1,0,0,0,0]);
});
test("non-gating reusable CFR numeric key benchmark compares equal serializations",()=>{
  const {performance}=globalThis;
  const prefixSamples=180;
  function makeTree(depth,actor=0,path=""){
    if(depth===0)return terminal(path.length%2?1:-1);
    return decision(actor,actor+":"+path,
      makeTree(depth-1,1-actor,path+"L"),
      makeTree(depth-1,1-actor,path+"R"));
  }
  const root=makeTree(7); // 127 distinct decision nodes, 255 total
  function measure(fast){
    const run=createReusableRustTreeSerializer();
    const registry=createCfrInformationRegistry();
    const durations=[];
    const hands=Array.from({length:15},(_,i)=>"hand-"+i);
    let lastSize=0;
    for(let round=0;round<5;round++){
      const begin=performance.now();
      for(let sample=0;sample<prefixSamples;sample++){
        const hand=hands[sample%hands.length],board="board-"+sample%3;
        const prefixes=["0|"+hand+"|"+board,"1|"+hand+"|"+board];
        const key=node=>prefixes[node.actor]+"|"+node.key;
        run(root,{
          informationKey:key,
          ...(fast?{
            informationPrefix:node=>prefixes[node.actor],
            informationSuffix:node=>"|"+node.key
          }:{}),
          terminalUtility:node=>node.value*(sample%2?1:-1)
        },registry);
      }
      durations.push(performance.now()-begin);
      lastSize=registry.byKey.size;
    }
    const ordered=[...durations].sort((a,b)=>a-b);
    return {p50:ordered[2],times:durations,lastSize};
  }
  const original=measure(false),indexed=measure(true);
  assert.equal(indexed.lastSize,original.lastSize);
  console.log("CFR+ numeric information-key benchmark: "+JSON.stringify({
    topologyNodes:255,samplesPerRound:prefixSamples,rounds:5,
    normalMs:original.times.map(x=>+x.toFixed(2)),
    indexedMs:indexed.times.map(x=>+x.toFixed(2)),
    normalP50Ms:+original.p50.toFixed(2),
    indexedP50Ms:+indexed.p50.toFixed(2),
    speedupP50:+(original.p50/indexed.p50).toFixed(2),
    matchingInformationSets:indexed.lastSize
  }));
});
