import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installLessons} from "../../frontend/src/training/lessons.ts";
const SAMPLE=[
 {id:"alpha",title:"Bases",category:"préflop",content:"Jouer les bonnes mains."},
 {id:"beta",title:"Flop",category:"postflop",sections:[
   {title:"Équité",content:"Comparer les ranges.",items:["Range","Board"],tip:"Attention"}]}
];
function environment(){
 const data=new Map(),events=[];
 const document={querySelector(){return null;}};
 const window={dispatchEvent(event){events.push(event.type);}};
 const localStorage={
   getItem(key){return data.get(key)??null;},
   setItem(key,value){data.set(key,String(value));},
   removeItem(key){data.delete(key);}
 };
 class CustomEvent{constructor(type,options){this.type=type;this.detail=options?.detail;}}
 const fetch=async()=>({ok:true,json:async()=>SAMPLE});
 return {data,events,document,window,localStorage,CustomEvent,fetch};
}
async function scenario(typed) {
 const env=environment();
 let api;
 if(typed){
  Object.assign(globalThis,{window:env.window,document:env.document,
    localStorage:env.localStorage,CustomEvent:env.CustomEvent,fetch:env.fetch});
  api=installLessons();
 } else {
  runInNewContext(readFileSync("js/modules/lessons.js","utf8"),{...env,console,Set,JSON,Promise,HTMLElement:class {}});
  api=env.window.PokerLabLessons;
 }
 try {
  await api.init();
  const loaded=api.getAllLessons();
  const opened=api.openLesson("alpha");
  const completed=api.completeLesson("alpha");
  const progress=api.getProgress();
  const next=api.getNextLesson();
  const reset=api.resetProgress();
  const validation=api.validateLesson({id:"a",title:"b",content:"c"});
  const bad=api.validateLesson({id:"x"});
  const inCategory=api.getLessonsByCategory("postflop");
  return JSON.parse(JSON.stringify({loaded,opened,completed,progress,next,reset,
    validation,bad,inCategory,events:env.events,stored:[...env.data.entries()]}));
 } finally {
  if(typed){for(const key of ["window","document","localStorage","CustomEvent","fetch"])delete globalThis[key];}
 }
}
test("lesson catalog, events and completion persistence exactly match V1",async()=>{
 assert.deepEqual(await scenario(true),await scenario(false));
});
