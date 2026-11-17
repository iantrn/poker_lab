/* =========================================================
   POKERLAB - GENERIC CFR+ CORE
   Imperfect-information, two-player, zero-sum extensive games.
   ========================================================= */
"use strict";

export interface CFRAction { child: CFRNode; action?: CFRActionDetails; type?:string; label?:string; id?:string; amount?:number; raiseTo?:number; }
export interface CFRActionDetails { type?:string; label?:string; id?:string; amount?:number; raiseTo?:number; }
export interface CFRNode { terminal?:boolean; actor:number; actions:CFRAction[]; [attribute:string]:unknown; }
export interface CFRDeal { root:CFRNode; deal:unknown; }
export interface CFRCallbacks { informationKey(node:CFRNode,deal:unknown):string; utility(node:CFRNode,deal:unknown):number; }
export interface CFRMaps { regrets:Map<string,Float64Array>; strategy:Map<string,Float64Array>; actionSignatures:Map<string,string>; }
interface CFRWorkspace { strategies:Float64Array[];actionValues:Float64Array[]; }
interface ResponseRecord {
  terminal:boolean; depth:number; value:number; node?:CFRNode; deal?:unknown; reach?:number;
  key?:string; strategy?:Float64Array | []; children?:ResponseRecord[];
}
interface WeightedRoot {weight:number;record:ResponseRecord;}
type WeightOf = (deal:unknown, entry:CFRDeal)=>number;
function createCore() {
    function regretMatchedInto(regrets:Float64Array | null | undefined, actionCount:number, strategy:Float64Array):Float64Array {
        let total = 0;
        if (regrets) {
            for (let index = 0; index < actionCount; index++) {
                const positive = Math.max(0, regrets[index]!);
                strategy[index] = positive;
                total += positive;
            }
        } else {
            for (let index = 0; index < actionCount; index++) strategy[index] = 0;
        }
        if (!(total > 0)) {
            strategy.fill(1 / actionCount, 0, actionCount);
            return strategy;
        }
        for (let index = 0; index < actionCount; index++) {
            strategy[index] = strategy[index]!! / total;
        }
        return strategy;
    }

    function regretMatched(regrets:Float64Array | null | undefined, actionCount:number):Float64Array {
        return regretMatchedInto(regrets, actionCount, new Float64Array(actionCount));
    }

    // One scratch buffer per recursion depth. A parent keeps its strategy and
    // action values while children execute at the next depth, so sibling
    // branches can safely reuse the same child-level buffers.
    const cfrWorkspaceByMaps = new WeakMap<CFRMaps,CFRWorkspace>();

    function getCfrWorkspace(maps:CFRMaps):CFRWorkspace {
        let workspace = cfrWorkspaceByMaps.get(maps);
        if (!workspace) {
            workspace = { strategies: [], actionValues: [] };
            cfrWorkspaceByMaps.set(maps, workspace);
        }
        return workspace;
    }

    function getWorkspaceBuffer(buffers:Float64Array[],depth:number,length:number):Float64Array {
        let buffer = buffers[depth];
        if (!buffer || buffer.length < length) {
            buffer = new Float64Array(length);
            buffers[depth] = buffer;
        }
        return buffer;
    }

    const actionSignatureCache = new WeakMap<CFRAction[],string>();

    const informationKeyCache = new WeakMap<CFRNode,WeakMap<object,string>>();

    function getInformationKey(node:CFRNode, deal:unknown, callbacks:CFRCallbacks):string {
        if (!node || typeof node !== "object" ||
            !deal || typeof deal !== "object") {
            return callbacks.informationKey(node, deal);
        }
        let dealKeys = informationKeyCache.get(node);
        if (!dealKeys) {
            dealKeys = new WeakMap<object,string>();
            informationKeyCache.set(node, dealKeys);
        }
        if (dealKeys.has(deal)) return dealKeys.get(deal)!;
        const key = callbacks.informationKey(node, deal);
        dealKeys.set(deal, key);
        return key;
    }


    function actionSignature(actions:CFRAction[]):string {
        const cached = actionSignatureCache.get(actions);
        if (cached !== undefined) return cached;
        const signature = JSON.stringify(actions.map(entry => {
            const action: CFRActionDetails = entry && entry.action ? entry.action : (entry || {});
            const numeric = (value:unknown) => value === undefined || value === null
                ? null
                : Number.isFinite(Number(value)) ? Number(value) : String(value);
            return [
                String(action.type || ""),
                String(action.label || action.id || ""),
                numeric(action.amount),
                numeric(action.raiseTo)
            ];
        }));
        actionSignatureCache.set(actions, signature);
        return signature;
    }

    function ensureInfoSet(key:string, actions:CFRAction[], maps:CFRMaps):{regrets:Float64Array;strategySum:Float64Array} {
        const actionCount = actions.length;
        if (!(maps.actionSignatures instanceof Map)) {
            maps.actionSignatures = new Map();
        }
        const signature = actionSignature(actions);
        const previousSignature = maps.actionSignatures.get(key);
        if (previousSignature !== undefined && previousSignature !== signature) {
            throw new Error("Un même information set ne peut pas avoir des ensembles d'actions différents (type, ordre, label ou sizing).");
        }
        maps.actionSignatures.set(key, signature);

        let regrets = maps.regrets.get(key);
        if (!regrets) {
            regrets = new Float64Array(actionCount);
            maps.regrets.set(key, regrets);
        } else if (regrets.length !== actionCount) {
            throw new Error("Un même information set ne peut pas avoir des ensembles d'actions différents.");
        }

        let strategySum = maps.strategy.get(key);
        if (!strategySum) {
            strategySum = new Float64Array(actionCount);
            maps.strategy.set(key, strategySum);
        } else if (strategySum.length !== actionCount) {
            throw new Error("Un même information set ne peut pas avoir des ensembles d'actions différents.");
        }

        return { regrets, strategySum };
    }

    function runCfrRecursive(
        node:CFRNode, deal:unknown, traverser:number, reach:number[], maps:CFRMaps, callbacks:CFRCallbacks,
        averageWeight:number, chanceWeight:number, workspace:CFRWorkspace, depth:number
    ):number {
        if (node.terminal) return callbacks.utility(node, deal);
        if (node.actor !== 0 && node.actor !== 1) {
            throw new Error("Un nœud CFR doit appartenir au joueur 0 ou au joueur 1.");
        }
        if (!Array.isArray(node.actions) || node.actions.length === 0) {
            throw new Error("Un nœud CFR non terminal doit proposer au moins une action.");
        }

        const actionCount = node.actions.length;
        const key = getInformationKey(node, deal, callbacks);
        const { regrets, strategySum } = ensureInfoSet(key, node.actions, maps);
        const strategy = getWorkspaceBuffer(workspace.strategies, depth, actionCount);
        regretMatchedInto(regrets, actionCount, strategy);
        const actionValues = getWorkspaceBuffer(workspace.actionValues, depth, actionCount);
        const ownReach = reach[node.actor]!;

        if (traverser === 0) {
            for (let index = 0; index < actionCount; index++) {
                strategySum[index]! += averageWeight * ownReach * strategy[index]! * chanceWeight;
            }
        }

        let nodeValue = 0;
        for (let index = 0; index < actionCount; index++) {
            reach[node.actor] = ownReach * strategy[index]!;
            actionValues[index] = runCfrRecursive(
                node.actions[index]!.child,
                deal,
                traverser,
                reach,
                maps,
                callbacks,
                averageWeight,
                chanceWeight,
                workspace,
                depth + 1
            );
            reach[node.actor] = ownReach;
            nodeValue += strategy[index]! * actionValues[index]!;
        }

        if (node.actor === traverser) {
            const opponentReach = reach[1 - node.actor]!;
            const utilitySign = node.actor === 0 ? 1 : -1;
            for (let index = 0; index < actionCount; index++) {
                const instantaneousRegret = utilitySign *
                    opponentReach *
                    (actionValues[index]! - nodeValue) *
                    chanceWeight;
                regrets[index] = Math.max(0, regrets[index]! + instantaneousRegret);
            }
        }

        return nodeValue;
    }

    function runCfr(node:CFRNode,deal:unknown,traverser:number,reach:readonly number[],maps:CFRMaps,callbacks:CFRCallbacks,averageWeight=1,chanceWeight=1):number {
        const workingReach = [Number(reach[0]!), Number(reach[1]!)];
        const workspace = getCfrWorkspace(maps);
        return runCfrRecursive(
            node,
            deal,
            traverser,
            workingReach,
            maps,
            callbacks,
            averageWeight,
            chanceWeight,
            workspace,
            0
        );
    }

    function averageStrategy(node:CFRNode,deal:unknown,maps:CFRMaps,callbacks:CFRCallbacks):number {
        if (node.terminal) return callbacks.utility(node, deal);
        const key = getInformationKey(node, deal, callbacks);
        const { strategySum: sums } = ensureInfoSet(key, node.actions, maps);
        let total = 0;
        for (let index = 0; index < sums.length; index++) total += sums[index]!;

        let value = 0;
        const fallback = 1 / node.actions.length;
        for (let index = 0; index < node.actions.length; index++) {
            const probability = total > 0 ? sums[index]! / total : fallback;
            value += probability * averageStrategy(
                node.actions[index]!.child, deal, maps, callbacks
            );
        }
        return value;
    }

    function getStrategy(node:CFRNode,deal:unknown,maps:CFRMaps,callbacks:CFRCallbacks):Float64Array | [] {
        if (node.terminal) return [];
        const key = getInformationKey(node, deal, callbacks);
        const { strategySum: sums } = ensureInfoSet(key, node.actions, maps);
        let total = 0;
        for (let index = 0; index < sums.length; index++) total += sums[index]!;

        const strategy = new Float64Array(node.actions.length);
        if (total > 0) {
            for (let index = 0; index < sums.length; index++) {
                strategy[index] = sums[index]! / total;
            }
        } else {
            strategy.fill(1 / node.actions.length);
        }
        return strategy;
    }

    function evaluateProfile(deals:readonly CFRDeal[],maps:CFRMaps,callbacks:CFRCallbacks,weightOf:WeightOf = () => 1):number {
        let weightedValue = 0;
        let totalWeight = 0;

        for (const entry of deals) {
            const weight = Number(weightOf(entry.deal, entry));
            if (!Number.isFinite(weight) || weight < 0) {
                throw new Error("Le poids d'un échantillon CFR doit être positif ou nul.");
            }
            if (weight === 0) continue;
            weightedValue += weight * averageStrategy(entry.root, entry.deal, maps, callbacks);
            totalWeight += weight;
        }

        if (!(totalWeight > 0)) {
            throw new Error("Aucun poids d'échantillon exploitable pour évaluer la stratégie.");
        }
        return weightedValue / totalWeight;
    }

    // Approximate best response over an explicit collection of chance deals.
    // Utility is expressed from player 0's perspective: player 0 maximizes,
    // player 1 minimizes. Opponent reach and chance weights are included in
    // information-set aggregation; the responder's own reach is excluded.
    function bestResponseValue(deals:readonly CFRDeal[],maps:CFRMaps,callbacks:CFRCallbacks,responder:number,weightOf:WeightOf = () => 1) {
        if (responder !== 0 && responder !== 1) {
            throw new Error("Le joueur répondant doit être 0 ou 1.");
        }

        const records:ResponseRecord[] = [];
        // Group decision nodes while traversing. Filtering every node at every
        // depth makes NashConv diagnostics O(tree nodes × tree depth).
        const decisionRecordsByDepth:ResponseRecord[][] = [];
        const roots:WeightedRoot[] = [];
        let maximumDepth = 0;

        function collect(node:CFRNode,deal:unknown,depth:number,reach:number):ResponseRecord {
            maximumDepth = Math.max(maximumDepth, depth);
            if (node.terminal) {
                const record: ResponseRecord = {
                    terminal: true,
                    value: callbacks.utility(node, deal),
                    depth
                };
                records.push(record);
                return record;
            }
            if (node.actor !== 0 && node.actor !== 1) {
                throw new Error("Un nœud CFR doit appartenir au joueur 0 ou au joueur 1.");
            }
            if (!Array.isArray(node.actions) || node.actions.length === 0) {
                throw new Error("Un nœud CFR non terminal doit proposer au moins une action.");
            }

            const strategy = getStrategy(node, deal, maps, callbacks);
            const record:ResponseRecord = {
                terminal: false,
                node,
                deal,
                depth,
                reach,
                key: getInformationKey(node, deal, callbacks),
                strategy,
                children: [],
                value: 0
            };
            records.push(record);
            (decisionRecordsByDepth[depth] ??= []).push(record);

            for (let index = 0; index < node.actions.length; index++) {
                const childReach = node.actor === responder
                    ? reach
                    : reach * strategy[index]!;
                record.children!.push(collect(
                    node.actions[index]!.child,
                    deal,
                    depth + 1,
                    childReach
                ));
            }
            return record;
        }

        for (const entry of deals) {
            const weight = Number(weightOf(entry.deal, entry));
            if (!Number.isFinite(weight) || weight < 0) {
                throw new Error("Le poids d'un échantillon CFR doit être positif ou nul.");
            }
            if (weight === 0) continue;
            roots.push({
                weight,
                record: collect(entry.root, entry.deal, 0, weight)
            });
        }

        if (!roots.length) {
            throw new Error("Aucun échantillon exploitable pour calculer la meilleure réponse.");
        }

        for (let depth = maximumDepth; depth >= 0; depth--) {
            const level = decisionRecordsByDepth[depth] ?? [];
            const responseGroups = new Map<string, ResponseRecord[]>();

            for (const record of level) {
                if (record.node!.actor !== responder) continue;
                let group = responseGroups.get(record.key!);
                if (!group) {
                    group = [];
                    responseGroups.set(record.key!, group);
                }
                group.push(record);
            }

            for (const group of responseGroups.values()) {
                const signature = actionSignature(group[0]!.node!.actions);
                const actionCount = group[0]!.node!.actions.length;
                const actionValues = new Float64Array(actionCount);

                for (const record of group) {
                    if (actionSignature(record.node!.actions) !== signature) {
                        throw new Error("Un information set de meilleure réponse contient des actions différentes.");
                    }
                    for (let index = 0; index < actionCount; index++) {
                        actionValues[index]! += record.reach! * record.children![index]!.value;
                    }
                }

                let bestIndex = 0;
                for (let index = 1; index < actionCount; index++) {
                    const isBetter = responder === 0
                        ? actionValues[index]! > actionValues[bestIndex]!
                        : actionValues[index]! < actionValues[bestIndex]!;
                    if (isBetter) bestIndex = index;
                }
                for (const record of group) {
                    record.value = record.children![bestIndex]!.value;
                }
            }

            for (const record of level) {
                if (record.node!.actor === responder) continue;
                record.value = record.children!.reduce(
                    (sum, child, index) => sum + record.strategy![index]!! * child.value,
                    0
                );
            }
        }

        const totalWeight = roots.reduce((sum, entry) => sum + entry.weight, 0);
        const weightedValue = roots.reduce(
            (sum, entry) => sum + entry.weight * entry.record.value,
            0
        );
        return {
            value: weightedValue / totalWeight,
            totalWeight,
            informationSets: new Set(records
                .filter(record => !record.terminal && record.node!.actor === responder)
                .map(record => record.key!)).size
        };
    }

    function measureExploitability(deals:readonly CFRDeal[],maps:CFRMaps,callbacks:CFRCallbacks,weightOf:WeightOf = () => 1) {
        const profileValue = evaluateProfile(deals, maps, callbacks, weightOf);
        const player0BestResponse = bestResponseValue(deals, maps, callbacks, 0, weightOf);
        const player1BestResponse = bestResponseValue(deals, maps, callbacks, 1, weightOf);
        const player0Gain = player0BestResponse.value - profileValue;
        const player1Gain = profileValue - player1BestResponse.value;
        const nashConv = player0Gain + player1Gain;

        return {
            profileValue,
            player0BestResponse: player0BestResponse.value,
            player1BestResponse: player1BestResponse.value,
            player0Gain,
            player1Gain,
            nashConv,
            exploitability: nashConv / 2,
            player0InformationSets: player0BestResponse.informationSets,
            player1InformationSets: player1BestResponse.informationSets,
            sampleWeight: player0BestResponse.totalWeight
        };
    }

    function createMaps():CFRMaps {
        return { regrets: new Map(), strategy: new Map(), actionSignatures: new Map() };
    }

    return {
        regretMatched,
        runCfr,
        averageStrategy,
        getStrategy,
        evaluateProfile,
        bestResponseValue,
        measureExploitability,
        createMaps
    };
}
/** One completed chance sample: both CFR+ traversers must be applied in order. */
export interface CFRBatchSample {
  root:CFRNode;
  deal:unknown;
  callbacks:CFRCallbacks;
  chanceWeight:number;
  /** Explicit PokerLab payoff convention: fold winner + showdown net chip EV. */
  compilePokerPayoffs?:true;
}
export type CFRCoreApi = ReturnType<typeof createCore> & {
  /** Optional Rust accelerator; TypeScript keeps its established single-step path. */
  runCfrBatch?:(samples:readonly CFRBatchSample[],maps:CFRMaps,averageWeightStart:number)=>void;
};
export function installCfrCore():CFRCoreApi {
  const target = window as Window & {PokerLabCFRCore?:CFRCoreApi};
  if (!target.PokerLabCFRCore) target.PokerLabCFRCore = createCore();
  return target.PokerLabCFRCore;
}
