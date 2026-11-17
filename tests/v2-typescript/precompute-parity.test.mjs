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
    PokerLabV2:{createTypedPostflopWorker:()=>new FakeWorker()},
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
    const typed=await scenario(true),legacy=await scenario(false);
    if(label==="ineligible"){
      // Explicit multiway enablement intentionally expands the eligibility
      // contract and changes only the user-facing rejection explanation.
      assert.equal(typed.active,legacy.active);
      assert.equal(typed.workers,legacy.workers);
      assert.match(typed.error,/2–6 joueurs actifs/);
      assert.match(legacy.error,/heads-up/);
    }else assert.deepEqual(typed,legacy);
  });
}


test("typed Worker provisional frequencies are versioned and discarded on new game action",async()=>{
 const current={state:state(1)};
 const workers=[];
 class ControlledWorker {
   constructor(){this.sent=[];this.listeners=new Map();this.terminated=false;workers.push(this);}
   addEventListener(event,callback){
     const list=this.listeners.get(event)||[];
     list.push(callback);
     this.listeners.set(event,list);
   }
   postMessage(message){this.sent.push(message);}
   terminate(){this.terminated=true;}
   dispatch(data){
     for(const listener of this.listeners.get("message")||[])listener({data});
   }
 }
 const global={
   Worker:ControlledWorker,AbortController,
   PokerLabV2:{createTypedPostflopWorker:()=>new ControlledWorker()},
   PokerLabTraining:{getGameState:()=>current.state,getHandHistory:()=>[]},
   PokerLabPostflopSolver:{
     createInput:game=>({schemaVersion:1,state:JSON.parse(JSON.stringify(game)),history:[]})
   }
 };
 globalThis.window=global;
 let api;
 try{api=installSolverPrecompute();}
 finally{delete globalThis.window;}
 const snapshots=[];
 api.subscribe(snapshot=>snapshots.push(snapshot));
 api.onStateChange();
 assert.equal(workers.length,1);
 const first=workers[0];
 const oldEquity=first.sent[0].id;
 first.dispatch({id:oldEquity,ok:true,result:{equity:0.5}});
 const oldStrategy=first.sent.at(-1).id;
 first.dispatch({id:oldStrategy,progress:0.4,phase:"strategy_training",
   iterations:32,provisional:true,
   previewActions:[
     {action:"check",frequency:0.75},
     {action:"bet",frequency:0.25}
   ]});
 assert.equal(snapshots.at(-1).provisional,true);
 assert.equal(snapshots.at(-1).previewActions.length,2);
 assert.equal(snapshots.at(-1).progress,0.4);
 assert.equal(snapshots.at(-1).stage,"strategy_training");
 assert.equal(snapshots.at(-1).version,1);
 current.state=state(2);
 api.onStateChange();
 assert.equal(first.terminated,true);
 assert.equal(workers.length,2);
 first.dispatch({id:oldStrategy,ok:true,result:{actions:[{action:"obsolete"}]}});
 assert.notEqual(snapshots.at(-1).phase,"complete");
 const next=workers[1];
 const equityId=next.sent[0].id;
 next.dispatch({id:equityId,ok:true,result:{equity:0.6,handNumber:2}});
 const strategyId=next.sent.at(-1).id;
 next.dispatch({id:strategyId,progress:0.6,phase:"strategy_training",
   iterations:72,previewActions:[
     {action:"check",frequency:0.25},
     {action:"bet",frequency:0.75},
     {action:"invalid",frequency:-0.5}
   ]});
 const update=snapshots.at(-1);
 assert.equal(update.version,3);
 assert.equal(update.previewActions.length,2);
 assert.equal(update.previewActions[0].frequency,0.25);
 next.dispatch({id:strategyId,ok:true,result:{actions:[{action:"check",frequency:0.25}]}});
 const final=await api.getOrStart();
 assert.equal(final.equity.handNumber,2);
 assert.ok(!JSON.stringify(final).includes("obsolete"));
 assert.equal(api.getCacheSize(),1);
});


test("live controller exposes privacy-preserving strategic snapshots across table versions",()=>{
 const h=harness(true);
 const card=(value,suit)=>({value,suit});
 const board=[card(2,"clubs"),card(7,"diamonds"),card(9,"hearts")];
 const current={
   ...state(1),board,street:"flop",pot:6,currentBet:0,lastFullRaise:1,
   minimumRaiseTo:1,blinds:{smallBlind:0.5,bigBlind:1},dealerIndex:0,
   players:[
     {...state(1).players[0],name:"Hero",stack:40,streetBet:0,totalContribution:3,
       amountToCall:0,actionOptions:{canCheck:true,canBet:true,minimumBet:1,maximumBet:40}},
     {...state(1).players[1],name:"Opponent",stack:40,streetBet:0,totalContribution:3,
       holeCards:[card(10,"spades"),card(10,"clubs")]}
   ]
 };
 h.setState(current);
 const first=h.api.getStrategicState();
 assert.equal(first.capability.quality,"sampled_estimate");
 assert.equal(first.players[1].knownPrivateCards,null);
 assert.equal(first.board.length,3);
 assert.ok(!JSON.stringify(first).includes('"value":10,"suit":"spades"'));
 h.api.onStateChange();
 const versioned=h.api.getStrategicState();
 assert.equal(versioned.stateVersion,first.stateVersion);
 assert.equal(versioned.fingerprint,first.fingerprint);
 h.setState({...current,handNumber:2,board:[...board,card(11,"spades")],street:"turn"});
 h.api.onStateChange();
 const changed=h.api.getStrategicState();
 assert.ok(changed.stateVersion>versioned.stateVersion);
 assert.equal(changed.street,"turn");
 assert.notEqual(changed.fingerprint,first.fingerprint);
 assert.equal(changed.handId,"pokerlab-local:2");
 h.api.cancel();
});
