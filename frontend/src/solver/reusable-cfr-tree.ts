import type { AbstractTreeNode } from "./decision-tree";
import {
  flattenCfrTree,
  type CfrTreeCallbacks,
  type CfrInformationRegistry,
  type CfrInformationSet
} from "./tree-adapter.ts";

/**
 * Reuse the public betting topology while recomputing sampled private
 * information-set IDs and terminal utilities. The full string registry remains
 * authoritative for TypeScript CFR, EV and NashConv compatibility.
 */
export interface PreparedRustTree {
  actors: Int8Array;
  informationSets: Uint32Array;
  childOffsets: Uint32Array;
  childCounts: Uint8Array;
  children: Uint32Array;
  terminalUtilities: Float64Array;
  /** Undo only newly reserved information sets if WASM rejects a sample. */
  rollback(): void;
}
interface Shape {
  nodes: AbstractTreeNode[];
  signatures: Array<string | null>;
  actors: Int8Array;
  informationSets: Uint32Array;
  childOffsets: Uint32Array;
  childCounts: Uint8Array;
  children: Uint32Array;
  terminalUtilities: Float64Array;
}
interface NumericIndex {
  /** A shared prefix maps stable public-state suffixes to numeric Rust IDs. */
  byPrefix:Map<string,Map<string,CfrInformationSet>>;
  size:number;
}
function visitNodes(node: AbstractTreeNode, result: AbstractTreeNode[]): void {
  result.push(node);
  if (!node.terminal) {
    for (const entry of node.actions) visitNodes(entry.child,result);
  }
}
function signature(node: Extract<AbstractTreeNode,{terminal:false}>): string {
  // Match flattenCfrTree's validated action signature byte for byte.
  return JSON.stringify(node.actions.map(entry=>[
    entry.action.type,entry.action.label,Number(entry.action.amount)||0
  ]));
}
export function createReusableRustTreeSerializer() {
  const shapes=new WeakMap<AbstractTreeNode,Shape>();
  // A serializer may serve many independent Rust sessions; never share
  // numerical IDs between registries.
  const indices=new WeakMap<CfrInformationRegistry,NumericIndex>();
  return (
    root: AbstractTreeNode,
    callbacks: CfrTreeCallbacks,
    registry: CfrInformationRegistry
  ): PreparedRustTree => {
    const originalSize=registry.byKey.size;
    const reserved:string[]=[];
    const reservedParts:Array<readonly [string,string]>=[];
    const useNumeric=typeof callbacks.informationPrefix==="function" &&
      typeof callbacks.informationSuffix==="function";
    let index=indices.get(registry);
    if(!index){
      index={byPrefix:new Map(),size:originalSize};
      indices.set(registry,index);
    }else if(index.size!==originalSize){
      // Recover if an external consumer changed the registry between deals.
      index.byPrefix.clear();
      index.size=originalSize;
    }
    let shape=shapes.get(root);
    if (!shape) {
      // This validator checks cycles, depth, actions and utility range and
      // atomically rolls back IDs on malformed input.
      const flat=flattenCfrTree(root,callbacks,1,registry);
      const nodes:AbstractTreeNode[]=[];
      visitNodes(root,nodes);
      const request=flat.request;
      if(nodes.length!==request.actors.length)
        throw new Error("L'ordre des nœuds CFR+ n'est pas stable.");
      shape={
        nodes,
        signatures:nodes.map(node=>node.terminal?null:signature(node)),
        actors:Int8Array.from(request.actors),
        informationSets:Uint32Array.from(request.informationSets),
        childOffsets:Uint32Array.from(request.childOffsets),
        childCounts:Uint8Array.from(request.childCounts),
        children:Uint32Array.from(request.children),
        terminalUtilities:Float64Array.from(request.terminalUtilities)
      };
      shapes.set(root,shape);
      for(const [key,entry] of registry.byKey)
        if(entry.id>=originalSize)reserved.push(key);
    } else {
      try {
        for(let position=0;position<shape.nodes.length;position++){
          const node=shape.nodes[position]!;
          if(node.terminal){
            const value=callbacks.terminalUtility(node);
            if(!Number.isFinite(value))
              throw new RangeError("Une utilité terminale n'est pas finie.");
            shape.terminalUtilities[position]=value;
            continue;
          }
          if(node.actor!==shape.actors[position] ||
             node.actions.length!==shape.childCounts[position])
            throw new RangeError("L'arbre CFR+ réutilisé a changé d'actions.");
          const count=node.actions.length;
          const expected=shape.signatures[position]!;
          let current:CfrInformationSet|undefined;
          if(useNumeric){
            const prefix=callbacks.informationPrefix!(node);
            const suffix=callbacks.informationSuffix!(node);
            if(typeof prefix!=="string"||typeof suffix!=="string"||
               prefix.length+suffix.length===0)
              throw new RangeError("Identité d'information CFR+ invalide.");
            const matches=index.byPrefix.get(prefix);
            current=matches?.get(suffix);
            if(!current){
              // Full canonical keys are created only once, on first encounter.
              // This check prevents an incompatible split from silently merging
              // information sets with different private/public histories.
              const key=callbacks.informationKey(node);
              if(key!==prefix+suffix)
                throw new RangeError("Identité numérique CFR+ incompatible avec la clé canonique.");
              current=registry.byKey.get(key);
              if(!current){
                current={id:registry.byKey.size,actions:count,signature:expected};
                registry.byKey.set(key,current);
                reserved.push(key);
                reservedParts.push([prefix,suffix]);
              }
              let slots=matches;
              if(!slots){
                slots=new Map<string,CfrInformationSet>();
                index.byPrefix.set(prefix,slots);
              }
              slots.set(suffix,current);
            }
          }else{
            const key=callbacks.informationKey(node);
            if(typeof key!=="string"||key.length===0)
              throw new RangeError("Identité d'information CFR+ invalide.");
            current=registry.byKey.get(key);
            if(!current){
              current={id:registry.byKey.size,actions:count,signature:expected};
              registry.byKey.set(key,current);
              reserved.push(key);
            }
          }
          if(current.actions!==count||current.signature!==expected)
            throw new RangeError("Actions incompatibles dans un même information set CFR+.");
          shape.informationSets[position]=current.id;
        }
      }catch(error:unknown){
        // Never leave a cached numerical entry referring to rolled-back IDs.
        for(const [prefix,suffix] of reservedParts){
          const slots=index.byPrefix.get(prefix);
          slots?.delete(suffix);
          if(slots?.size===0)index.byPrefix.delete(prefix);
        }
        for(const key of reserved)registry.byKey.delete(key);
        index.size=registry.byKey.size;
        throw error;
      }
    }
    index.size=registry.byKey.size;
    let rolledBack=false;
    return {
      actors:shape.actors,
      informationSets:shape.informationSets,
      childOffsets:shape.childOffsets,
      childCounts:shape.childCounts,
      children:shape.children,
      terminalUtilities:shape.terminalUtilities,
      rollback(){
        if(rolledBack)return;
        rolledBack=true;
        for(const [prefix,suffix] of reservedParts){
          const slots=index.byPrefix.get(prefix);
          slots?.delete(suffix);
          if(slots?.size===0)index.byPrefix.delete(prefix);
        }
        for(const key of reserved)registry.byKey.delete(key);
        index.size=registry.byKey.size;
      }
    };
  };
}
