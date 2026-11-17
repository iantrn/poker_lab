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


test("batched prepared WASM CFR+ reproduces sequential weighted updates exactly",()=>{
  const serial=new CfrSession(),batched=new CfrSession();
  const s=serial.prepare_tree(actors,offsets,counts,edges);
  const b=batched.prepare_tree(actors,offsets,counts,edges);
  for(let group=0;group<60;group++){
    const size=group%4===0?1:group%4===1?3:group%4===2?7:16;
    const batchIds=new Uint32Array(size*actors.length);
    const batchPayoffs=new Float64Array(size*actors.length);
    const weights=new Float64Array(size);
    for(let i=0;i<size;i++){
      const index=(group*16+i)%111;
      // Information sets appear in first-encounter order, even when multiple
      // samples share a previously learned private hand.
      const hand=ids[index%ids.length];
      const values=payoffs[(index*7)%payoffs.length];
      const weight=index%5===0?2.5:0.75;
      batchIds.set(hand,i*actors.length);
      batchPayoffs.set(values,i*actors.length);
      weights[i]=weight;
      serial.step_prepared(s,hand,values,weight);
    }
    assert.equal(batched.step_prepared_batch(b,batchIds,batchPayoffs,weights),
      serial.iterations());
    assert.equal(batched.information_set_count(),serial.information_set_count());
    assert.deepEqual(Array.from(batched.average_strategy()),
      Array.from(serial.average_strategy()));
  }
});
test("invalid WASM batch rolls back all new IDs and regret changes",()=>{
  const session=new CfrSession();
  const handle=session.prepare_tree(actors,offsets,counts,edges);
  session.step_prepared(handle,ids[0],payoffs[0],1);
  const before=Array.from(session.average_strategy());
  const batchIds=new Uint32Array([...ids[0],0,5,5,0,0,0,0]);
  const batchPayoffs=new Float64Array([...payoffs[0],...payoffs[1]]);
  assert.throws(()=>session.step_prepared_batch(handle,batchIds,batchPayoffs,
    new Float64Array([1,1])),/information set IDs contain gaps/);
  assert.equal(session.iterations(),1);
  assert.equal(session.information_set_count(),2);
  assert.deepEqual(Array.from(session.average_strategy()),before);
  batchIds.set(ids[1],actors.length);
  batchPayoffs[actors.length+3]=NaN;
  assert.throws(()=>session.step_prepared_batch(handle,batchIds,batchPayoffs,
    new Float64Array([1,1])));
  batchPayoffs[actors.length+3]=payoffs[1][3];
  assert.throws(()=>session.step_prepared_batch(handle,batchIds,batchPayoffs,
    new Float64Array([1,-1])));
  assert.throws(()=>session.step_prepared_batch(handle,batchIds,batchPayoffs,
    new Float64Array([1])));
  assert.throws(()=>session.step_prepared_batch(handle,batchIds,batchPayoffs,
    new Float64Array(17)));
  assert.equal(session.iterations(),1);
  assert.deepEqual(Array.from(session.average_strategy()),before);
  assert.equal(session.step_prepared_batch(handle,batchIds,batchPayoffs,
    new Float64Array([1,1])),3);
});

test("non-gating WASM batch benchmark compares equal sample streams and strategies",()=>{
  const sampleCount=4096,chunk=8,rounds=5;
  function measure(batched){
    const times=[];
    let results=[];
    for(let run=0;run<rounds;run++){
      const session=new CfrSession();
      const handle=session.prepare_tree(actors,offsets,counts,edges);
      const batchIds=new Uint32Array(chunk*actors.length);
      const batchPayoffs=new Float64Array(chunk*actors.length);
      const weights=new Float64Array(chunk);
      const start=performance.now();
      for(let i=0;i<sampleCount;i+=chunk){
        for(let j=0;j<chunk;j++){
          const at=i+j;
          const hand=ids[at%ids.length];
          const values=payoffs[(at*7)%payoffs.length];
          const weight=at%11===0?2.25:0.5;
          if(batched){
            batchIds.set(hand,j*actors.length);
            batchPayoffs.set(values,j*actors.length);
            weights[j]=weight;
          }else session.step_prepared(handle,hand,values,weight);
        }
        if(batched)session.step_prepared_batch(handle,batchIds,batchPayoffs,weights);
      }
      times.push(performance.now()-start);
      results=Array.from(session.average_strategy());
    }
    const ordered=times.toSorted((a,b)=>a-b);
    return {times,p50:ordered[2],p95:ordered[4],results};
  }
  const before=measure(false),after=measure(true);
  assert.deepEqual(after.results,before.results);
  console.log("WASM CFR+ batching benchmark: "+JSON.stringify({
    samples:sampleCount,chunk,rounds,
    serialMs:before.times.map(v=>+v.toFixed(3)),
    batchMs:after.times.map(v=>+v.toFixed(3)),
    serialP50Ms:+before.p50.toFixed(3),batchP50Ms:+after.p50.toFixed(3),
    serialP95Ms:+before.p95.toFixed(3),batchP95Ms:+after.p95.toFixed(3),
    speedupP50:+(before.p50/Math.max(after.p50,0.00001)).toFixed(2),
    parity:"identical"
  }));
});


test("compiled Rust fold/showdown payouts match explicit per-deal utilities",()=>{
  const explicit=new CfrSession(),compact=new CfrSession();
  const handle1=explicit.prepare_tree(actors,offsets,counts,edges);
  const handle2=compact.prepare_tree(actors,offsets,counts,edges);
  const kinds=new Uint8Array([0,0,0,3,3,1,2]);
  const pots=new Float64Array([0,0,0,10,22,25,17]);
  const invested=new Float64Array([0,0,0,3,7,9,4]);
  compact.prepare_payoffs(handle2,kinds,pots,invested);
  for(let group=0;group<50;group++){
    const flatIds=new Uint32Array(8*actors.length);
    const flatPayoffs=new Float64Array(8*actors.length);
    const outcomes=new Int8Array(8);
    const weights=new Float64Array(8);
    for(let i=0;i<8;i++){
      const index=group*8+i;
      const outcome=[1,0,-1][index%3];
      const weight=index%7===0?2.5:0.75;
      const payoff=(pot,invest)=>outcome>0?pot-invest:
        outcome===0?pot/2-invest:-invest;
      flatIds.set(ids[index%ids.length],i*actors.length);
      flatPayoffs.set(new Float64Array([
        0,0,0,payoff(10,3),payoff(22,7),25-9,-4
      ]),i*actors.length);
      outcomes[i]=outcome;
      weights[i]=weight;
    }
    explicit.step_prepared_batch(handle1,flatIds,flatPayoffs,weights);
    compact.step_prepared_outcome_batch(handle2,flatIds,outcomes,weights);
    assert.deepEqual(Array.from(compact.average_strategy()),
      Array.from(explicit.average_strategy()));
  }
  assert.equal(compact.iterations(),400);
});
test("compiled payout metadata rejects incompatible and invalid input transactionally",()=>{
  const session=new CfrSession();
  const handle=session.prepare_tree(actors,offsets,counts,edges);
  const kinds=new Uint8Array([0,0,0,3,3,1,2]);
  const pots=new Float64Array([0,0,0,10,22,25,17]);
  const invested=new Float64Array([0,0,0,3,7,9,4]);
  assert.throws(()=>session.prepare_payoffs(handle,
    new Uint8Array([0,0,0,0,3,1,2]),pots,invested));
  assert.throws(()=>session.prepare_payoffs(handle,kinds,
    new Float64Array([0,0,0,NaN,22,25,17]),invested));
  session.prepare_payoffs(handle,kinds,pots,invested);
  session.step_prepared_outcome_batch(handle,ids[0],new Int8Array([1]),
    new Float64Array([1]));
  const before=Array.from(session.average_strategy());
  assert.throws(()=>session.step_prepared_outcome_batch(handle,ids[0],
    new Int8Array([2]),new Float64Array([1])));
  assert.throws(()=>session.step_prepared_outcome_batch(handle,
    new Uint32Array([0,3,3,0,0,0,0]),new Int8Array([1]),new Float64Array([1])));
  assert.equal(session.iterations(),1);
  assert.deepEqual(Array.from(session.average_strategy()),before);
});
