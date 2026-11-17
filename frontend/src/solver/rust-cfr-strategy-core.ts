/** Experimental, opt-in bridge for chance-sampled CFR+ regret updates in Rust.
 * The existing TypeScript solver remains authoritative until strategy parity,
 * offline tests and end-to-end performance benchmarks confirm an improvement.
 */
import type {CFRCoreApi,CFRMaps,CFRNode} from "./cfr-core";
import type {AbstractTreeNode} from "./decision-tree";
import {flattenCfrTree,createCfrInformationRegistry,
  type CfrInformationRegistry} from "./tree-adapter.ts";

export interface RustCfrSession {
  step(actors:Int8Array,infos:Uint32Array,offsets:Uint32Array,counts:Uint8Array,
    children:Uint32Array,payoffs:Float64Array,chanceWeight:number):number;
  average_strategy():Float64Array | number[];
  iterations():number;
  information_set_count():number;
}
interface Session {
  engine:RustCfrSession;
  registry:CfrInformationRegistry;
  dirty:boolean;
}
export function createRustCfrStrategyCore(
  original:CFRCoreApi,
  newSession:()=>RustCfrSession
):CFRCoreApi {
  const sessions=new WeakMap<CFRMaps,Session>();
  function sync(maps:CFRMaps):void {
    const session=sessions.get(maps);
    if(!session||!session.dirty)return;
    const values=Array.from(session.engine.average_strategy());
    let offset=0;
    for(const [key,entry] of session.registry.byKey){
      const probabilities=values.slice(offset,offset+entry.actions);
      if(probabilities.length!==entry.actions){
        throw new Error("La session CFR+ Rust a retourné des probabilités incomplètes.");
      }
      maps.regrets.set(key,new Float64Array(entry.actions));
      maps.strategy.set(key,Float64Array.from(probabilities));
      offset+=entry.actions;
    }
    if(offset!==values.length){
      throw new Error("La session CFR+ Rust a retourné un nombre inattendu de fréquences.");
    }
    session.dirty=false;
  }
  return {
    ...original,
    createMaps(){
      const maps=original.createMaps();
      sessions.set(maps,{engine:newSession(),registry:createCfrInformationRegistry(),dirty:false});
      return maps;
    },
    runCfr(...args:Parameters<CFRCoreApi["runCfr"]>){
      const [root,deal,traverser,reach,maps,callbacks,averageWeight=1,chanceWeight=1]=args;
      const session=sessions.get(maps);
      if(!session)return original.runCfr(...args);
      // The two V1 traverser calls are paired. One Rust step executes both
      // in the same order, so the second JS call is intentionally a no-op.
      if(traverser===1)return 0;
      if(traverser!==0||reach[0]!==1||reach[1]!==1||
          Math.abs(averageWeight-(session.engine.iterations()+1))>1e-8){
        throw new Error("CFR+ Rust exige des itérations complètes et séquentielles.");
      }
      const request=flattenCfrTree(root as unknown as AbstractTreeNode,{
        informationKey:node=>callbacks.informationKey(node as unknown as CFRNode,deal),
        terminalUtility:node=>callbacks.utility(node as unknown as CFRNode,deal)
      },1,session.registry).request;
      session.engine.step(
        Int8Array.from(request.actors),
        Uint32Array.from(request.informationSets),
        Uint32Array.from(request.childOffsets),
        Uint8Array.from(request.childCounts),
        Uint32Array.from(request.children),
        Float64Array.from(request.terminalUtilities),
        chanceWeight
      );
      session.dirty=true;
      return 0;
    },
    getStrategy(...args:Parameters<CFRCoreApi["getStrategy"]>){
      sync(args[2]);return original.getStrategy(...args);
    },
    averageStrategy(...args:Parameters<CFRCoreApi["averageStrategy"]>){
      sync(args[2]);return original.averageStrategy(...args);
    },
    evaluateProfile(...args:Parameters<CFRCoreApi["evaluateProfile"]>){
      sync(args[1]);return original.evaluateProfile(...args);
    },
    bestResponseValue(...args:Parameters<CFRCoreApi["bestResponseValue"]>){
      sync(args[1]);return original.bestResponseValue(...args);
    },
    measureExploitability(...args:Parameters<CFRCoreApi["measureExploitability"]>){
      sync(args[1]);return original.measureExploitability(...args);
    }
  };
}
