/** Rust/WASM bridge for chance-sampled heads-up CFR+.
 * Keep the proven TypeScript implementation as the fallback and diagnostic oracle.
 */
import type {CFRBatchSample,CFRCoreApi,CFRMaps,CFRNode,CFRCallbacks} from "./cfr-core";
import type {AbstractTreeNode} from "./decision-tree";
import {createCfrInformationRegistry,
  type CfrInformationRegistry} from "./tree-adapter.ts";
import {createReusableRustTreeSerializer,
  type PreparedRustTree} from "./reusable-cfr-tree.ts";

export interface RustCfrSession {
  step(actors:Int8Array,infos:Uint32Array,offsets:Uint32Array,counts:Uint8Array,
    children:Uint32Array,payoffs:Float64Array,chanceWeight:number):number;
  /** Optional methods preserve compatibility with old installed WASM bundles. */
  prepare_tree?(actors:Int8Array,offsets:Uint32Array,counts:Uint8Array,
    children:Uint32Array):number;
  step_prepared?(handle:number,infos:Uint32Array,payoffs:Float64Array,
    chanceWeight:number):number;
  step_prepared_batch?(handle:number,infos:Uint32Array,payoffs:Float64Array,
    chanceWeights:Float64Array):number;
  prepare_payoffs?(handle:number,kinds:Uint8Array,pots:Float64Array,
    heroInvested:Float64Array):void;
  step_prepared_outcome_batch?(handle:number,infos:Uint32Array,
    outcomes:Int8Array,chanceWeights:Float64Array):number;
  average_strategy():Float64Array | number[];
  iterations():number;
  information_set_count():number;
}
interface Session {
  engine:RustCfrSession;
  registry:CfrInformationRegistry;
  dirty:boolean;
  prepared:WeakMap<AbstractTreeNode,number>;
  unprepared:WeakSet<AbstractTreeNode>;
  compiledPayoffs:WeakSet<AbstractTreeNode>;
}
const MAX_BATCH_SAMPLES=16;
const MAX_BATCH_BYTES=2*1024*1024;
const MAX_BATCH_ELEMENTS=174_762;
interface PayoutModel {
  kinds:Uint8Array;
  pots:Float64Array;
  heroInvested:Float64Array;
}

export function createRustCfrStrategyCore(
  original:CFRCoreApi,
  newSession:()=>RustCfrSession
):CFRCoreApi {
  const sessions=new WeakMap<CFRMaps,Session>();
  const serialize=createReusableRustTreeSerializer();
  const payoutModels=new WeakMap<AbstractTreeNode,PayoutModel|null>();

  // Compute terminal metadata from an immutable PokerLab public tree once.
  // Never silently apply this model to another solver callback convention.
  function payoutModel(root:AbstractTreeNode):PayoutModel|null {
    const cached=payoutModels.get(root);
    if(cached!==undefined)return cached;
    const kinds:number[]=[],pots:number[]=[],invested:number[]=[];
    let valid=true;
    function visit(node:AbstractTreeNode):void {
      if(node.terminal){
        if(!Number.isFinite(node.pot)||!Number.isFinite(node.heroInvested)){
          valid=false;return;
        }
        const kind=node.type==="fold"
          ? node.winner===0?1:node.winner===1?2:0
          : node.type==="showdown"?3:0;
        if(kind===0){valid=false;return;}
        kinds.push(kind);pots.push(node.pot);invested.push(node.heroInvested);
      }else{
        kinds.push(0);pots.push(0);invested.push(0);
        for(const entry of node.actions)visit(entry.child);
      }
    }
    visit(root);
    const model=valid?{
      kinds:Uint8Array.from(kinds),
      pots:Float64Array.from(pots),
      heroInvested:Float64Array.from(invested)
    }:null;
    payoutModels.set(root,model);
    return model;
  }
  function sampledShowdown(sample:CFRBatchSample):number|null {
    const deal=sample.deal as {showdownResult?:unknown}|null|undefined;
    const result=deal?.showdownResult;
    return result===1||result===0||result===-1?result:null;
  }

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
  function pack(
    session:Session,root:CFRNode,deal:unknown,callbacks:CFRCallbacks,
    compiledPayouts=false
  ):PreparedRustTree {
    return serialize(root as unknown as AbstractTreeNode,{
      informationKey:node=>callbacks.informationKey(node as unknown as CFRNode,deal),
      terminalUtility:node=>compiledPayouts?0:
        callbacks.utility(node as unknown as CFRNode,deal)
    },session.registry);
  }
  function preparedHandle(session:Session,root:CFRNode,request:PreparedRustTree):number|undefined {
    const publicTree=root as unknown as AbstractTreeNode;
    let handle=session.prepared.get(publicTree);
    if(session.engine.prepare_tree&&session.engine.step_prepared&&
        handle===undefined&&!session.unprepared.has(publicTree)){
      try {
        handle=session.engine.prepare_tree(
          request.actors,request.childOffsets,request.childCounts,request.children
        );
        session.prepared.set(publicTree,handle);
      }catch(error:unknown){
        // A memory-budget cache miss is not a CFR failure: use old step().
        if(!String(error).includes("oversized prepared CFR+ topology"))throw error;
        session.unprepared.add(publicTree);
      }
    }
    return handle;
  }
  function stepPacked(
    session:Session,root:CFRNode,request:PreparedRustTree,chanceWeight:number
  ):void {
    const handle=preparedHandle(session,root,request);
    if(handle!==undefined&&session.engine.step_prepared){
      session.engine.step_prepared(
        handle,request.informationSets,request.terminalUtilities,chanceWeight
      );
    } else {
      session.engine.step(
        request.actors,request.informationSets,request.childOffsets,
        request.childCounts,request.children,request.terminalUtilities,chanceWeight
      );
    }
  }
  function stepOne(session:Session,sample:CFRBatchSample):void {
    const request=pack(session,sample.root,sample.deal,sample.callbacks);
    try {
      stepPacked(session,sample.root,request,sample.chanceWeight);
      session.dirty=true;
    } catch(error:unknown){
      request.rollback();
      throw error;
    }
  }
  function assertSequential(session:Session,averageWeightStart:number):void {
    if(!Number.isSafeInteger(averageWeightStart)||
       averageWeightStart!==session.engine.iterations()+1){
      throw new Error("CFR+ Rust exige des itérations complètes et séquentielles.");
    }
  }
  function batchStep(
    samples:readonly CFRBatchSample[],maps:CFRMaps,averageWeightStart:number
  ):void {
    if(!samples.length)return;
    const session=sessions.get(maps);
    if(!session){
      // External CFR maps: keep the original TypeScript semantics.
      for(let i=0;i<samples.length;i++){
        const sample=samples[i]!;
        original.runCfr(sample.root,sample.deal,0,[1,1],maps,sample.callbacks,
          averageWeightStart+i,sample.chanceWeight);
        original.runCfr(sample.root,sample.deal,1,[1,1],maps,sample.callbacks,
          averageWeightStart+i,sample.chanceWeight);
      }
      return;
    }
    assertSequential(session,averageWeightStart);
    for(const sample of samples){
      if(!Number.isFinite(sample.chanceWeight)||sample.chanceWeight<0){
        throw new Error("Poids CFR+ invalide.");
      }
    }
    const firstRoot=samples[0]!.root;
    const engine=session.engine;
    // Never batch across different public trees or exceed bounded payloads.
    // Old WASM versions transparently execute the same sequential Rust steps.
    if(samples.length===1||samples.length>MAX_BATCH_SAMPLES||
       !engine.step_prepared_batch||!engine.prepare_tree||!engine.step_prepared||
       samples.some(sample=>sample.root!==firstRoot)){
      for(const sample of samples)stepOne(session,sample);
      return;
    }
    // The first serialization gives the exact node count. The returned arrays
    // are reused/mutated on every deal, so each sample must be copied into the
    // contiguous batch immediately after serialization.
    const model=engine.prepare_payoffs&&engine.step_prepared_outcome_batch&&
      samples.every(sample=>sample.compilePokerPayoffs===true &&
        sampledShowdown(sample)!==null)
      ? payoutModel(firstRoot as unknown as AbstractTreeNode):null;
    const compact=Boolean(model);
    const first=pack(session,samples[0]!.root,samples[0]!.deal,
      samples[0]!.callbacks,compact);
    const rollbacks=[first.rollback];
    let executed=false;
    try {
      const n=first.actors.length;
      if(n*samples.length>MAX_BATCH_ELEMENTS||
         n*samples.length*(compact?4:12)>MAX_BATCH_BYTES){
        // Roll back reservations before the sequential fallback, otherwise
        // new IDs could be seen out of sequence by the Rust session.
        first.rollback();
        executed=true;
        for(const sample of samples)stepOne(session,sample);
        return;
      }
      const handle=preparedHandle(session,firstRoot,first);
      if(handle===undefined){
        first.rollback();
        executed=true;
        for(const sample of samples)stepOne(session,sample);
        return;
      }
      const ids=new Uint32Array(n*samples.length);
      const payoffs=compact?null:new Float64Array(n*samples.length);
      const outcomes=compact?new Int8Array(samples.length):null;
      const weights=new Float64Array(samples.length);
      if(model&&!session.compiledPayoffs.has(firstRoot as unknown as AbstractTreeNode)){
        engine.prepare_payoffs!(handle,model.kinds,model.pots,model.heroInvested);
        session.compiledPayoffs.add(firstRoot as unknown as AbstractTreeNode);
      }
      ids.set(first.informationSets,0);
      payoffs?.set(first.terminalUtilities,0);
      if(outcomes)outcomes[0]=sampledShowdown(samples[0]!)!;
      weights[0]=samples[0]!.chanceWeight;
      for(let i=1;i<samples.length;i++){
        const sample=samples[i]!;
        const request=pack(session,sample.root,sample.deal,sample.callbacks,compact);
        rollbacks.push(request.rollback);
        if(request.informationSets.length!==n){
          throw new Error("La topologie CFR+ a changé pendant le lot.");
        }
        ids.set(request.informationSets,i*n);
        payoffs?.set(request.terminalUtilities,i*n);
        if(outcomes)outcomes[i]=sampledShowdown(sample)!;
        weights[i]=sample.chanceWeight;
      }
      if(outcomes){
        engine.step_prepared_outcome_batch!(handle,ids,outcomes,weights);
      }else{
        engine.step_prepared_batch(handle,ids,payoffs!,weights);
      }
      session.dirty=true;
      executed=true;
    }finally{
      // On error, Rust's batch preflight guarantees no regret update. Undo
      // all newly reserved JS information-set IDs in reverse chronological order.
      if(!executed)for(let i=rollbacks.length-1;i>=0;i--)rollbacks[i]!();
    }
  }

  return {
    ...original,
    createMaps(){
      const maps=original.createMaps();
      sessions.set(maps,{engine:newSession(),registry:createCfrInformationRegistry(),
        dirty:false,prepared:new WeakMap<AbstractTreeNode,number>(),
        unprepared:new WeakSet<AbstractTreeNode>(),
        compiledPayoffs:new WeakSet<AbstractTreeNode>()});
      return maps;
    },
    runCfr(...args:Parameters<CFRCoreApi["runCfr"]>){
      const [root,deal,traverser,reach,maps,callbacks,averageWeight=1,chanceWeight=1]=args;
      const session=sessions.get(maps);
      if(!session)return original.runCfr(...args);
      // The two TypeScript traverser calls are paired. Rust performs both
      // traversers in a single step, in the original order.
      if(traverser===1)return 0;
      if(traverser!==0||reach[0]!==1||reach[1]!==1){
        throw new Error("CFR+ Rust exige des itérations complètes et séquentielles.");
      }
      assertSequential(session,averageWeight);
      stepOne(session,{root,deal,callbacks,chanceWeight});
      return 0;
    },
    runCfrBatch(samples:readonly CFRBatchSample[],maps:CFRMaps,averageWeightStart:number){
      batchStep(samples,maps,averageWeightStart);
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
