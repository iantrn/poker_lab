import type { AbstractTreeNode } from "./decision-tree";
import type { EngineRequest } from "../../../shared/models/solver";

/** Explicit information-set identity is supplied by the strategy caller.
 * A repeated key must have exactly the same legal actions and ordering.
 */
export interface CfrTreeCallbacks {
  informationKey(node: Extract<AbstractTreeNode, {terminal: false}>): string;
  terminalUtility(node: Extract<AbstractTreeNode, {terminal: true}>): number;
}
export interface FlattenedCfrTree {
  request: Extract<EngineRequest, {kind: "cfrTree"}>;
  /** Information set IDs are assigned on first occurrence in DFS order. */
  informationSets: Array<{id: number; key: string; actions: number}>;
}
const MAX_ACTIONS = 5;
const MAX_NODES = 250_000;

/** Lossless serializer for the Rust extensive-form CFR+ kernel.
 * Keeps V1 action signatures and information-set separation intact.
 */
export function flattenCfrTree(
  root: AbstractTreeNode,
  callbacks: CfrTreeCallbacks,
  iterations: number
): FlattenedCfrTree {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 1_000_000) {
    throw new RangeError("Budget CFR+ invalide.");
  }
  const actors: number[] = [];
  const informationSetIds: number[] = [];
  const childOffsets: number[] = [];
  const childCounts: number[] = [];
  const children: number[] = [];
  const terminalUtilities: number[] = [];
  const keys = new Map<string,{id:number; signature:string; actions:number}>();
  const active = new Set<AbstractTreeNode>();

  function visit(node: AbstractTreeNode, depth: number): number {
    if (!node || typeof node !== "object" || depth > 128 ||
        actors.length >= MAX_NODES || active.has(node)) {
      throw new RangeError("Arbre CFR+ cyclique, trop profond ou trop grand.");
    }
    active.add(node);
    const id = actors.length;
    if (node.terminal) {
      const utility = callbacks.terminalUtility(node);
      if (!Number.isFinite(utility)) {
        throw new RangeError("Une utilité terminale n'est pas finie.");
      }
      actors.push(-1);
      informationSetIds.push(0);
      childOffsets.push(children.length);
      childCounts.push(0);
      terminalUtilities.push(utility);
    } else {
      if ((node.actor !== 0 && node.actor !== 1) ||
          !Array.isArray(node.actions) ||
          node.actions.length === 0 || node.actions.length > MAX_ACTIONS) {
        throw new RangeError("Actions d'arbre CFR+ invalides.");
      }
      const key = callbacks.informationKey(node);
      if (typeof key !== "string" || key.length === 0) {
        throw new RangeError("Identité d'information CFR+ invalide.");
      }
      const signature = JSON.stringify(node.actions.map(entry => [
        entry.action.type, entry.action.label, Number(entry.action.amount) || 0
      ]));
      let entry = keys.get(key);
      if (entry && (entry.signature !== signature || entry.actions !== node.actions.length)) {
        throw new RangeError("Actions incompatibles dans un même information set CFR+.");
      }
      if (!entry) {
        entry = {id:keys.size,signature,actions:node.actions.length};
        keys.set(key,entry);
      }
      actors.push(node.actor);
      informationSetIds.push(entry.id);
      childOffsets.push(children.length);
      childCounts.push(node.actions.length);
      terminalUtilities.push(0);
      const base = children.length;
      for (let i=0;i<node.actions.length;i++) children.push(0);
      for (let i=0;i<node.actions.length;i++) {
        children[base+i] = visit(node.actions[i]!.child,depth+1);
      }
    }
    active.delete(node);
    return id;
  }

  if (root.terminal) {
    throw new RangeError("Un arbre CFR+ sans décision ne peut pas être entraîné.");
  }
  visit(root,0);
  return {
    request: {
      kind:"cfrTree", actors, informationSets:informationSetIds,
      childOffsets,childCounts,children,terminalUtilities,iterations
    },
    informationSets:[...keys.entries()].map(([key,info])=>({
      id:info.id,key,actions:info.actions
    }))
  };
}
