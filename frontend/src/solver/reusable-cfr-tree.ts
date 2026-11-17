import type { AbstractTreeNode } from "./decision-tree";
import {
  flattenCfrTree,
  type CfrTreeCallbacks,
  type CfrInformationRegistry
} from "./tree-adapter.ts";

/**
 * Cache the public betting topology for Rust's sampled CFR+ kernel.
 * Private cards change information-set IDs and terminal utilities on each
 * deal; they do NOT change the public action tree for a given runout.
 *
 * The caller must keep each cached decision tree immutable, as does
 * strategy.ts's bounded public-tree cache. The WeakMap releases abandoned
 * flop/turn runouts when the outer LRU evicts them.
 */
export interface PreparedRustTree {
  actors: Int8Array;
  informationSets: Uint32Array;
  childOffsets: Uint32Array;
  childCounts: Uint8Array;
  children: Uint32Array;
  terminalUtilities: Float64Array;
  /** Undo only newly reserved info-set IDs if WASM rejects this sample. */
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
  return (
    root: AbstractTreeNode,
    callbacks: CfrTreeCallbacks,
    registry: CfrInformationRegistry
  ): PreparedRustTree => {
    const originalSize=registry.byKey.size;
    const reserved:string[]=[];
    let shape=shapes.get(root);
    if (!shape) {
      // This validator checks cycles, depth, legal actions and utility range
      // and atomically rolls back all IDs if the input is malformed.
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
        for(let index=0;index<shape.nodes.length;index++){
          const node=shape.nodes[index]!;
          if(node.terminal){
            const value=callbacks.terminalUtility(node);
            if(!Number.isFinite(value))
              throw new RangeError("Une utilité terminale n'est pas finie.");
            shape.terminalUtilities[index]=value;
            continue;
          }
          if(node.actions.length!==shape.childCounts[index])
            throw new RangeError("L'arbre CFR+ réutilisé a changé d'actions.");
          const key=callbacks.informationKey(node);
          if(typeof key!=="string"||key.length===0)
            throw new RangeError("Identité d'information CFR+ invalide.");
          const current=registry.byKey.get(key);
          const count=node.actions.length;
          const expected=shape.signatures[index]!;
          if(current&&(current.actions!==count||current.signature!==expected))
            throw new RangeError("Actions incompatibles dans un même information set CFR+.");
          let id:number;
          if(current){id=current.id;}
          else{
            id=registry.byKey.size;
            registry.byKey.set(key,{id,actions:count,signature:expected});
            reserved.push(key);
          }
          shape.informationSets[index]=id;
        }
      }catch(error:unknown){
        for(const key of reserved)registry.byKey.delete(key);
        throw error;
      }
    }
    return {
      actors:shape.actors,
      informationSets:shape.informationSets,
      childOffsets:shape.childOffsets,
      childCounts:shape.childCounts,
      children:shape.children,
      terminalUtilities:shape.terminalUtilities,
      rollback(){
        for(const key of reserved)registry.byKey.delete(key);
      }
    };
  };
}
