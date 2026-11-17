import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const {CfrSession}=require("../engine/pkg-node");

const actors=new Int8Array([0,1,1,-1,-1,-1,-1]);
const offsets=new Uint32Array([0,2,4,6,6,6,6]);
const counts=new Uint8Array([2,2,2,0,0,0,0]);
const edges=new Uint32Array([1,2,3,4,5,6]);
const alternateEdges=new Uint32Array([2,1,6,5,4,3]);
const ids=[
  new Uint32Array([0,1,1,0,0,0,0]),
  new Uint32Array([2,3,3,0,0,0,0]),
  new Uint32Array([4,5,5,0,0,0,0])
];
const payoffs=[
  new Float64Array([0,0,0,1,-1,-1,1]),
  new Float64Array([0,0,0,-1,1,1,-1]),
  new Float64Array([0,0,0,1.5,0.5,-0.25,-1.75])
];

test("prepared WASM topologies preserve exact CFR+ strategy across deals, IDs and runout shapes",()=>{
  const prepared=new CfrSession();
  const baseline=new CfrSession();
  const handles=[
    prepared.prepare_tree(actors,offsets,counts,edges),
    prepared.prepare_tree(actors,offsets,counts,alternateEdges)
  ];
  assert.equal(handles[0],0);
  assert.equal(handles[1],1);
  for(let i=0;i<600;i++){
    const hand=ids[i%3];
    const values=payoffs[(i*7)%3];
    const weight=i%7===0?2.75:0.75;
    const shape=i%5===0?1:0;
    const topology=shape===0?edges:alternateEdges;
    assert.equal(prepared.step_prepared(handles[shape],hand,values,weight),i+1);
    assert.equal(baseline.step(actors,hand,offsets,counts,topology,values,weight),i+1);
    if(i%37===0){
      assert.deepEqual(Array.from(prepared.average_strategy()),
        Array.from(baseline.average_strategy()));
    }
  }
  assert.equal(prepared.information_set_count(),6);
  assert.deepEqual(Array.from(prepared.average_strategy()),
    Array.from(baseline.average_strategy()));
});

test("invalid prepared trees and samples never corrupt the session",()=>{
  const session=new CfrSession();
  assert.throws(()=>session.prepare_tree(actors,offsets,counts,
    new Uint32Array([1,2,3,4,5,0])));
  assert.throws(()=>session.prepare_tree(actors,offsets,
    new Uint8Array([2,2,6,0,0,0,0]),edges));
  const handle=session.prepare_tree(actors,offsets,counts,edges);
  session.step_prepared(handle,ids[0],payoffs[0],1);
  const snapshot=Array.from(session.average_strategy());
  assert.throws(()=>session.step_prepared(handle,new Uint32Array([0,3,3,0,0,0,0]),
    payoffs[1],1));
  assert.throws(()=>session.step_prepared(handle,ids[0],
    new Float64Array([0,0,0,NaN,-1,-1,1]),1));
  assert.throws(()=>session.step_prepared(handle+3,ids[0],payoffs[0],1));
  assert.deepEqual(Array.from(session.average_strategy()),snapshot);
  assert.equal(session.iterations(),1);
  assert.equal(session.step_prepared(handle,ids[0],payoffs[0],1),2);
});

// Benchmarks are diagnostic, not gates. Compare exactly the same work and
// report raw timings, distribution summaries and the resulting strategy.
test("non-gating prepared vs legacy Rust CFR+ throughput benchmark",()=>{
  const rounds=5;
  const samples=4000;
  function benchmark(usePrepared){
    const timings=[];
    let finalStrategy=[];
    for(let round=0;round<rounds;round++){
      const session=new CfrSession();
      const handle=usePrepared?session.prepare_tree(actors,offsets,counts,edges):null;
      const start=performance.now();
      for(let i=0;i<samples;i++){
        const id=ids[i%3], payoff=payoffs[(i*7)%3];
        const weight=i%7===0?2.75:0.75;
        if(usePrepared)session.step_prepared(handle,id,payoff,weight);
        else session.step(actors,id,offsets,counts,edges,payoff,weight);
      }
      timings.push(performance.now()-start);
      finalStrategy=Array.from(session.average_strategy());
    }
    const ordered=[...timings].sort((a,b)=>a-b);
    return {timings,p50:ordered[2],p95:ordered[4],finalStrategy};
  }
  const legacy=benchmark(false);
  const prepared=benchmark(true);
  assert.deepEqual(prepared.finalStrategy,legacy.finalStrategy);
  console.log("WASM CFR+ prepared benchmark: "+JSON.stringify({
    nodes:actors.length,samplesPerRound:samples,rounds,
    baselineMs:legacy.timings.map(x=>+x.toFixed(3)),
    preparedMs:prepared.timings.map(x=>+x.toFixed(3)),
    baselineP50Ms:+legacy.p50.toFixed(3),
    baselineP95Ms:+legacy.p95.toFixed(3),
    preparedP50Ms:+prepared.p50.toFixed(3),
    preparedP95Ms:+prepared.p95.toFixed(3),
    speedupP50:+(legacy.p50/Math.max(prepared.p50,0.0001)).toFixed(3),
    correctness:"identical strategy"
  }));
});
