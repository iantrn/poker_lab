import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installPuzzles} from "../../frontend/src/training/puzzles.ts";
const SAMPLE=[
 {id:"a",title:"RFI",question:"Action ?",category:"préflop",difficulty:"easy",position:"BTN",
  solution:{action:"raise",amount:3},options:["fold",{action:"raise",label:"Relancer"}]},
 {id:"b",title:"Défense",question:"Action ?",category:"postflop",difficulty:"medium",
  solution:{action:"fold"},options:["fold","call"]}
];
function environment() {
 const events=[];
 const window={dispatchEvent(e){events.push(e.type);}};
 const document={querySelector(){return null;},querySelectorAll(){return [];}};
 class CustomEvent{constructor(type,opts){this.type=type;this.detail=opts?.detail;}}
 const fetch=async()=>({ok:true,json:async()=>SAMPLE});
 return {events,window,document,CustomEvent,fetch};
}
async function scenario(typed){
 const env=environment();
 let api;
 if(typed){
  Object.assign(globalThis,{window:env.window,document:env.document,CustomEvent:env.CustomEvent,fetch:env.fetch});
  api=installPuzzles();
 }else{
  runInNewContext(readFileSync("js/modules/puzzles.js","utf8"),{...env,console,Set,Map,Math,Promise,
   HTMLElement:class {}});
  api=env.window.PokerLabPuzzles;
 }
 try{
  await api.init();
  const initial=api.getStatistics();
  const filtered=api.filterPuzzles({category:"préflop"});
  const started=api.selectPuzzle("a");
  const visible=api.getCurrentPuzzle();
  const answered=api.submitAnswer("raise",3);
  const again=api.submitAnswer("fold");
  const stats=api.getStatistics();
  const reset=api.resetStatistics();
  const invalid=api.validatePuzzle({id:"x",title:"Missing"});
  return JSON.parse(JSON.stringify({initial,filtered,started,visible,answered,again,stats,reset,invalid,events:env.events}));
 }finally{
  if(typed){for(const key of ["window","document","CustomEvent","fetch"])delete globalThis[key];}
 }
}
test("typed puzzles preserve V1 filtering, decisions, validation, events and stats",async()=>{
 assert.deepEqual(await scenario(true),await scenario(false));
});
