import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {installCfrCore} from '../../frontend/src/solver/cfr-core.ts';
const legacyWindow={};
runInNewContext(readFileSync('js/modules/cfr-core.js','utf8'),{window:legacyWindow,Map,Set,WeakMap,Float64Array,Number,Math,JSON});
const legacy=legacyWindow.PokerLabCFRCore;
globalThis.window={};
const typed=installCfrCore();
delete globalThis.window;
const plain=x=>JSON.parse(JSON.stringify(x));
const showdown=(gain)=>({terminal:true,payoff:gain});
const root={terminal:false,actor:0,actions:[
  {action:{label:'heads'},child:{terminal:false,actor:1,actions:[
    {action:{label:'heads'},child:showdown(1)},{action:{label:'tails'},child:showdown(-1)}]}},
  {action:{label:'tails'},child:{terminal:false,actor:1,actions:[
    {action:{label:'heads'},child:showdown(-1)},{action:{label:'tails'},child:showdown(1)}]}}]};
const callbacks={informationKey:n=>'player-'+n.actor,utility:n=>n.payoff};
function training(core){
 const maps=core.createMaps(),deal={};
 for(let i=0;i<1000;i++){
   core.runCfr(root,deal,0,[1,1],maps,callbacks,i+1);
   core.runCfr(root,deal,1,[1,1],maps,callbacks,i+1);
 }
 const profile=core.measureExploitability([{root,deal}],maps,callbacks);
 const strategy=Array.from(core.getStrategy(root,deal,maps,callbacks));
 return {strategy,profile,regrets:Array.from(maps.regrets.entries()).map(([k,v])=>[k,Array.from(v)])};
}
test('Typed CFR+ matches the legacy algorithm after 1000 complete iterations',()=>{
 assert.deepEqual(plain(training(typed)),plain(training(legacy)));
});
test('CFR+ preserves signatures and regret matching',()=>{
 const regrets=new Float64Array([-1,0,2]);
 assert.deepEqual(Array.from(typed.regretMatched(regrets,3)),Array.from(legacy.regretMatched(regrets,3)));
 for(const core of [typed,legacy]){
  const maps=core.createMaps();
  const context={informationKey:()=> 'same',utility:()=>0};
  const one={terminal:false,actor:0,actions:[{action:{label:'call'},child:showdown(1)}]};
  const two={terminal:false,actor:0,actions:[{action:{label:'fold'},child:showdown(1)}]};
  core.runCfr(one,{},0,[1,1],maps,context);
  assert.throws(()=>core.runCfr(two,{},0,[1,1],maps,context),/actions différentes|ensembles d'actions différents/);
 }
});
