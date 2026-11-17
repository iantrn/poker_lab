import test from "node:test";
import assert from "node:assert/strict";
import { installSolverPrecompute } from "../../frontend/src/solver/precompute.ts";

const state = () => ({
  handNumber:10, street:"river", handComplete:false, currentPlayerId:"hero",
  players:[
    {id:"hero",isHuman:true,folded:false,
      holeCards:[{value:14,suit:"hearts"},{value:14,suit:"spades"}]},
    {id:"villain",isHuman:false,folded:false,holeCards:null}
  ]
});

function harness(mode) {
  const created=[], events=[];
  class FakeWorker {
    constructor(kind="classic") {
      this.kind=kind;this.terminated=false;this.handlers=new Map();
      this.messages=[];
      created.push(this);
    }
    addEventListener(type,callback) {
      const handlers=this.handlers.get(type)??[];
      handlers.push(callback);
      this.handlers.set(type,handlers);
    }
    terminate() {this.terminated=true;}
    emit(type,event) {
      if(this.terminated)return;
      for(const fn of this.handlers.get(type)??[])fn(event);
    }
    postMessage(request) {
      this.messages.push(request);
      queueMicrotask(()=>{
        if(this.terminated)return;
        if(this.kind==="typed" && mode!=="success") {
          if(mode==="event")this.emit("error",{message:"Worker script failed to load"});
          else this.emit("message",{data:{id:request.id,ok:false,error:"Typed worker unavailable"}});
          return;
        }
        this.emit("message",{data:{id:request.id,ok:true,result:
          request.task==="equity"
            ? {equity:0.5,iterations:300}
            : {actions:[{action:"check",frequency:1}]}
        }});
      });
    }
  }
  const global={
    AbortController,
    Worker:class extends FakeWorker{constructor(){super("classic");}},
    PokerLabV2:{createTypedPostflopWorker(){return new FakeWorker("typed");}},
    PokerLabTraining:{getGameState:state,getHandHistory:()=>[]},
    PokerLabPostflopSolver:{createInput(next){return {schemaVersion:1,state:next,history:[]};}}
  };
  globalThis.window=global;
  const api=installSolverPrecompute();
  delete globalThis.window;
  api.subscribe(snapshot=>events.push(snapshot.phase));
  return {api,created,events};
}

for (const mode of ["response","event"]) {
  test("typed precompute retries a failing "+mode+" worker exactly once and keeps protocol order",async()=>{
    const {api,created,events}=harness(mode);
    api.onStateChange();
    const result=await api.getOrStart();
    assert.equal(result.equity.equity,0.5);
    assert.deepEqual(result.strategy.actions,[{action:"check",frequency:1}]);
    assert.equal(result.strategyError,null);
    assert.equal(created.length,2,"One typed worker and one classic fallback");
    assert.equal(created[0].kind,"typed");
    assert.equal(created[0].terminated,true);
    assert.equal(created[1].kind,"classic");
    assert.deepEqual(created[1].messages.map(m=>m.task),["equity","strategy"]);
    assert.equal(api.getActiveKey(),null);
    assert.equal(api.getCacheSize(),1);
    const cached=await api.getOrStart();
    assert.deepEqual(cached,result);
    assert.deepEqual(events.filter(phase=>phase==="complete"),["complete"]);
  });
}


test("successful typed Web Worker is preferred and never opens a classic Worker",async()=>{
  const {api,created,events}=harness("success");
  api.onStateChange();
  const result=await api.getOrStart();
  assert.equal(result.equity.equity,0.5);
  assert.deepEqual(result.strategy.actions,[{action:"check",frequency:1}]);
  assert.equal(created.length,1,"Successful typed mode never initializes fallback");
  assert.equal(created[0].kind,"typed");
  assert.deepEqual(created[0].messages.map(m=>m.task),["equity","strategy"]);
  assert.deepEqual(events.filter(phase=>phase==="complete"),["complete"]);
  assert.equal(api.getActiveKey(),null);
  assert.equal(api.getCacheSize(),1);
});

test("V2 worker backend can be rolled back to TypeScript without changing normal task protocol",async()=>{
  const originalLocalStorage=globalThis.localStorage;
  const {api,created}=harness("success");
  globalThis.localStorage={
    getItem(key){return key==="pokerlab_v2_cfr_backend"?"typescript":null;}
  };
  try{
    api.onStateChange();
    const value=await api.getOrStart();
    assert.equal(value.strategyError,null);
    assert.equal(created.length,1);
    assert.deepEqual(created[0].messages.map(msg=>msg.task),["equity","strategy"]);
    assert.equal(Object.hasOwn(created[0].messages[0],"experimentalRustCfr"),false);
    assert.equal(created[0].messages[1].experimentalRustCfr,false,
      "Persisted rollback must force the TypeScript solver");
  }finally{
    if(originalLocalStorage===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=originalLocalStorage;
  }
});

test("V2 explicit Rust override is carried only by postflop strategy tasks",async()=>{
  const originalLocalStorage=globalThis.localStorage;
  const {api,created}=harness("success");
  globalThis.localStorage={
    getItem(key){return key==="pokerlab_v2_cfr_backend"?"rust":null;}
  };
  try{
    api.onStateChange();
    await api.getOrStart();
    assert.equal(created[0].messages[1].experimentalRustCfr,true);
    assert.equal(Object.hasOwn(created[0].messages[0],"experimentalRustCfr"),false);
  }finally{
    if(originalLocalStorage===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=originalLocalStorage;
  }
});
