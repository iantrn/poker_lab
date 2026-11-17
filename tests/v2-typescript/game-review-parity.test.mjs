import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installGameReview} from "../../frontend/src/training/game-review.ts";
const sample={id:"sample-hand",players:[{id:"hero",name:"Hero",startingStack:100},
  {id:"bot",name:"Bot",startingStack:100}],
  board:[],actions:[
    {street:"preflop",playerId:"hero",type:"raise",amount:3},
    {street:"preflop",playerId:"bot",type:"fold"}
  ],result:"win",theoreticalAnalysis:{ev:.8}};
const NativeDate = Date;
const fakeDate = class extends NativeDate {
  constructor(...args){super(args.length?args[0]:"2026-11-17T07:00:00Z");}
  static now(){return Date.parse("2026-11-17T07:00:00Z");}
};
function environment(){
 const events=[],data=new Map();
 const document={querySelector(){return null;}};
 const window={dispatchEvent(e){events.push(e.type);},crypto:{randomUUID:()=>"fixed-uuid"}};
 const localStorage={
   setItem(k,v){data.set(k,String(v));},
   getItem(k){return data.get(k)??null;},
   removeItem(k){data.delete(k);}
 };
 class CustomEvent{constructor(type,opts){this.type=type;this.detail=opts?.detail;}}
 return {events,data,document,window,localStorage,CustomEvent,Date:fakeDate};
}
function scenario(typed){
 const env=environment();
 let api;
 if(typed){
  for(const name of ["window","document","localStorage","CustomEvent","Date"])globalThis[name]=env[name];
  api=installGameReview();
 }else{
  runInNewContext(readFileSync("js/modules/game-review.js","utf8"),{...env,console,Math,Promise});
  api=env.window.PokerLabGameReview;
 }
 try {
  api.init();
  const validation=api.validateHand(sample);
  const saved=api.saveHand(sample);
  const all=api.getAllHands();
  const selected=api.selectHand("sample-hand");
  const analysis=api.analyzeActions(sample);
  const theory=api.getTheoreticalAnalysis(sample);
  const filtered=api.filterHands({playerId:"hero"});
  const deleted=api.deleteHand("sample-hand");
  const current=api.getCurrentHand();
  const clear=api.clearHistory();
  return JSON.parse(JSON.stringify({validation,saved,all,selected,analysis,theory,filtered,deleted,current,clear,
    events:env.events,store:[...env.data.entries()]}));
 }finally{
  if(typed){for(const name of ["window","document","localStorage","CustomEvent"])delete globalThis[name];globalThis.Date=NativeDate;}
 }
}
test("game review save, analysis, history and theoretical payload retain V1 semantics",()=>{
 assert.deepEqual(scenario(true),scenario(false));
});
