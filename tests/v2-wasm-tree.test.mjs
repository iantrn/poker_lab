import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const wasm=require("../engine/pkg-node");
const matching = {
  actors: new Int8Array([0,1,1,-1,-1,-1,-1]),
  infos: new Uint32Array([0,1,1,0,0,0,0]),
  offsets: new Uint32Array([0,2,4,6,6,6,6]),
  counts: new Uint8Array([2,2,2,0,0,0,0]),
  children: new Uint32Array([1,2,3,4,5,6]),
  values: new Float64Array([0,0,0,1,-1,-1,1])
};
test("WASM CFR+ over flattened imperfect-information tree approaches Matching Pennies equilibrium",()=>{
  const x=Array.from(wasm.cfr_plus_tree(matching.actors,matching.infos,matching.offsets,
    matching.counts,matching.children,matching.values,20000));
  assert.equal(x.length,4);
  for(const p of x)assert.ok(Math.abs(p-.5)<.03,"CFR+ profile should be near 50/50: "+x);
});
test("WASM CFR+ tree rejects invalid actions and cyclic references",()=>{
  assert.throws(()=>wasm.cfr_plus_tree(new Int8Array([0,-1]),new Uint32Array([0,0]),
    new Uint32Array([0,1]),new Uint8Array([1,0]),new Uint32Array([0]),
    new Float64Array([0,1]),20));
});
