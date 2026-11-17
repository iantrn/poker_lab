import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { installSolverPrecompute } from '../../frontend/src/solver/precompute.ts';

const source = readFileSync('js/modules/solver-precompute.js', 'utf8');
function state(handNumber=1) {
  return {handNumber,street:'flop',handComplete:false,currentPlayerId:'hero',players:[
    {id:'hero',isHuman:true,folded:false,holeCards:[{value:14,suit:'spades'},{value:14,suit:'hearts'}]},
    {id:'villain',isHuman:false,folded:false,holeCards:null}
  ]};
}
function harness(typed,delay=0) {
  let current=state();
  const workers=[];
  class FakeWorker {
    constructor(){this.listeners=new Map();this.terminated=false;workers.push(this);}
    addEventListener(type,callback){const callbacks=this.listeners.get(type)||[];callbacks.push(callback);this.listeners.set(type,callbacks);}
    postMessage(msg){setTimeout(()=>{
      if(this.terminated)return;
      const result=msg.task==='equity'?{equity:.5,handNumber:msg.input.state.handNumber}
        :{actions:[],handNumber:msg.input.state.handNumber};
      for(const callback of this.listeners.get('message')||[])callback({data:{id:msg.id,ok:true,result}});
    },delay);}
    terminate(){this.terminated=true;}
  }
  const global={Worker:FakeWorker,AbortController,
    PokerLabTraining:{getGameState:()=>current,getHandHistory:()=>[]},
    PokerLabPostflopSolver:{createInput(s){return {schemaVersion:1,state:JSON.parse(JSON.stringify(s)),history:[]};}}};
  let api;
  if(typed){
    globalThis.window=global;
    api=installSolverPrecompute();
    delete globalThis.window;
  }else{
    global.window=global;
    runInNewContext(source,{window:global,console,Map,Set,Promise,Error,AbortController,setTimeout,clearTimeout,JSON});
    api=global.PokerLabSolverPrecompute;
  }
  return {api,workers,setState(next){current=next;}};
}
async function cache(typed){
  const h=harness(typed),snapshots=[];
  h.api.subscribe(s=>snapshots.push({phase:s.phase,progress:s.progress,cached:s.cached}));
  h.api.onStateChange();
  const result=await h.api.getOrStart();
  const cached=await h.api.getOrStart();
  return JSON.parse(JSON.stringify({result,cached,workers:h.workers.length,cacheSize:h.api.getCacheSize(),snapshots}));
}
async function cancel(typed){
  const h=harness(typed,15);
  h.api.onStateChange();
  const old=h.api.getOrStart();
  h.setState(state(2));h.api.onStateChange();
  let abortName;
  try{await old;}catch(e){abortName=e.name;}
  const current=await h.api.getOrStart();
  return JSON.parse(JSON.stringify({abortName,current,workers:h.workers.length,terminated:h.workers[0].terminated}));
}
async function ineligible(typed){
  const h=harness(typed);h.setState({...state(),street:'preflop'});h.api.onStateChange();
  let error;
  try{await h.api.getOrStart();}catch(e){error=e.message;}
  return {error,workers:h.workers.length,active:h.api.getActiveKey()};
}
for(const [label,scenario] of Object.entries({cache,cancel,ineligible})){
  test('typed precompute matches JS '+label,async()=>{
    assert.deepEqual(await scenario(true),await scenario(false));
  });
}
