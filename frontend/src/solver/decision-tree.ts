/** Typed abstraction of the established V1 heads-up postflop betting tree.
 * The abstract tree's legality and all-in/side-pot boundaries are conserved;
 * this is not a certified full-game equilibrium model.
 */
import type { SolverCard } from "./input-contract";

export interface AbstractPokerAction { label: string; type: "fold"|"check"|"call"|"bet"|"raise"; amount: number; }
interface AbstractTreeTerminal {
  terminal: true; type: string; winner: number | null;
  pot: number; heroInvested: number;
}
interface AbstractTreeDecision {
  terminal: false; actor: number; board: SolverCard[]; pot: number;
  stacks: number[]; bets: number[]; hasActed: boolean[];
  lastActedBets: number[]; lastFullRaise: number;
  raises: number; checks: number; history: string;
  actions: Array<{ action: AbstractPokerAction; child: AbstractTreeNode }>;
}
export type AbstractTreeNode = AbstractTreeTerminal | AbstractTreeDecision;
interface AbstractState {
  actor: number; pot: number; stacks: number[]; bets: number[];
  hasActed: boolean[]; lastActedBets: number[]; lastFullRaise: number;
  bigBlind: number; heroInvested: number; raises: number; checks: number;
  history: string[]; root: boolean;
}
interface AbstractPlayer {
  id: string; position?: string | null; stack: number; streetBet: number;
  hasActed?: boolean; lastActedBet?: number;
}
export interface AbstractTreeInput {
  pot: number; board: SolverCard[]; players: AbstractPlayer[];
  lastFullRaise?: number; blinds?: {bigBlind?: number} | null;
  postflopFirstActorId?: string | null;
}
export interface AbstractRootOptions {
  canRaise?: boolean; canBet?: boolean;
  minimumRaiseTo?: number; maximumRaiseTo?: number; minimumBet?: number;
}
const BET_FRACTION = 0.5;
const BET_SIZINGS = [0.33,0.75] as const;
const ACTION_LIMIT = 5;
const MAX_RAISES_PER_STREET = 4;
const CHIP_UNIT = 0.5;
const CHIP_EPSILON = 0.000001;

    function roundChips(amount: unknown): number {
        return Math.round((Number(amount) || 0) / CHIP_UNIT) * CHIP_UNIT;
    }

    function ceilChips(amount: unknown): number {
        return Math.ceil((Number(amount) || 0) / CHIP_UNIT - CHIP_EPSILON) * CHIP_UNIT;
    }

    function floorChips(amount: unknown): number {
        return Math.floor((Number(amount) || 0) / CHIP_UNIT + CHIP_EPSILON) * CHIP_UNIT;
    }

    function cardId(card: SolverCard): string {
        return card.value + "_" + card.suit;
    }

    function handId(cards: SolverCard[]): string {
        return cards.map(cardId).sort().join(",");
    }

    function boardId(cards: SolverCard[]): string {
        return cards.map(cardId).sort().join(",");
    }

    function cloneState(state: AbstractState): AbstractState {
        return {
            actor: state.actor,
            pot: state.pot,
            stacks: state.stacks.slice(),
            bets: state.bets.slice(),
            hasActed: state.hasActed.slice(),
            lastActedBets: state.lastActedBets.slice(),
            lastFullRaise: state.lastFullRaise,
            bigBlind: state.bigBlind,
            heroInvested: state.heroInvested,
            raises: state.raises,
            checks: state.checks,
            history: state.history.slice(),
            root: state.root
        };
    }

    function amountToCall(state: AbstractState, actor: number): number {
        return roundChips(Math.max(0, state.bets[1 - actor]! - state.bets[actor]!));
    }

    function terminal(type: string, state: AbstractState, winner: number | null = null): AbstractTreeTerminal {
        return {
            terminal: true,
            type,
            winner,
            pot: state.pot,
            heroInvested: state.heroInvested
        };
    }

    function applyContribution(state: AbstractState, actor: number, amount: number): number {
        const paid = floorChips(Math.max(0, Math.min(state.stacks[actor]!, amount)));
        state.stacks[actor] = state.stacks[actor]! - paid;
        state.bets[actor] = state.bets[actor]! + paid;
        state.pot += paid;
        if (actor === 0) state.heroInvested += paid;
        return paid;
    }

    function makeAction(label: string, type: AbstractPokerAction["type"], amount = 0): AbstractPokerAction {
        return { label, type, amount };
    }

    export function rootActionSignature(tree: AbstractTreeNode): string {
        return JSON.stringify((tree.terminal ? [] : tree.actions).map(entry => [
            entry.action.type,
            entry.action.label,
            Number(entry.action.amount) || 0
        ]));
    }

    export function buildDecisionTree(input: AbstractTreeInput, rootOptions: AbstractRootOptions, priorHistory: string[] = [], runout: SolverCard[] = [], rootChecks = 0, rootRaises = 0): { tree: AbstractTreeNode; nodeCount: number } {
        const initial: AbstractState = {
            actor: 0,
            pot: roundChips(input.pot),
            stacks: input.players.map(player => floorChips(player.stack)),
            bets: input.players.map(player => roundChips(player.streetBet)),
            hasActed: input.players.map(player => Boolean(player.hasActed)),
            lastActedBets: input.players.map(player => roundChips(player.lastActedBet)),
            lastFullRaise: roundChips(input.lastFullRaise) || 1,
            bigBlind: roundChips(input.blinds && input.blinds.bigBlind) || 1,
            heroInvested: 0,
            raises: Math.max(0, Math.floor(Number(rootRaises) || 0)),
            checks: rootChecks,
            history: priorHistory.slice(),
            root: true
        };
        const nodes = { count: 0 };

        function firstToAct(): number {
            if (input.postflopFirstActorId) {
                const firstIndex = input.players.findIndex(player =>
                    player.id === input.postflopFirstActorId
                );
                if (firstIndex >= 0) return firstIndex;
            }
            const index = input.players.findIndex(player =>
                ["BTN/SB", "SB", "BTN"].includes(player.position ?? "")
            );
            return index >= 0 ? index : 0;
        }

        function advanceStreet(state: AbstractState, board: SolverCard[], runoutIndex: number, depth: number): AbstractTreeNode {
            if (state.stacks[0]! <= 0 || state.stacks[1]! <= 0 || runoutIndex >= runout.length) {
                return terminal("showdown", state);
            }
            const nextBoard = [...board, runout[runoutIndex]!];
            const next = cloneState(state);
            next.actor = firstToAct();
            next.bets = [0, 0];
            next.hasActed = [false, false];
            next.lastActedBets = [0, 0];
            next.lastFullRaise = next.bigBlind;
            next.raises = 0;
            next.checks = 0;
            next.root = false;
            const streetName = nextBoard.length === 4 ? "turn" : "river";
            next.history.push("street:" + streetName);
            return build(next, nextBoard, runoutIndex + 1, depth + 1);
        }

        function build(state: AbstractState, board: SolverCard[], runoutIndex: number, depth: number): AbstractTreeNode {
            nodes.count++;
            if (depth > 18 || state.stacks[state.actor]! <= 0) {
                return terminal("showdown", state);
            }

            const actor = state.actor;
            const other = 1 - actor;
            const toCall = amountToCall(state, actor);

            if (toCall === 0 && state.checks >= 2) {
                return advanceStreet(state, board, runoutIndex, depth);
            }

            const actions: AbstractPokerAction[] = [];
            const currentBet = Math.max(state.bets[0]!, state.bets[1]!);
            const actorRaiseRights = !state.hasActed[actor]! ||
                currentBet - state.lastActedBets[actor]! >= state.lastFullRaise - CHIP_EPSILON;
            const canContinueAggression = state.stacks[other]! > 0 &&
                actorRaiseRights &&
                (state.root || state.raises < MAX_RAISES_PER_STREET);
            const canRaise = canContinueAggression &&
                (!state.root || rootOptions.canRaise === true);

            if (toCall > 0) {
                actions.push(makeAction("fold", "fold"));
                actions.push(makeAction("call", "call", toCall));

                const requiredRaiseTotal = ceilChips(state.root && Number.isFinite(rootOptions.minimumRaiseTo)
                    ? Math.max(toCall, rootOptions.minimumRaiseTo! - state.bets[actor]!)
                    : toCall + state.lastFullRaise);
                const effectiveMaximum = floorChips(toCall + state.stacks[other]!);
                const maximumRaiseTotal = floorChips(state.root && Number.isFinite(rootOptions.maximumRaiseTo)
                    ? Math.min(state.stacks[actor]!, rootOptions.maximumRaiseTo! - state.bets[actor]!, effectiveMaximum)
                    : Math.min(state.stacks[actor]!, effectiveMaximum));
                if (canRaise && state.stacks[actor]! > toCall) {
                    if (state.root) {
                        const minimumRaiseIncrement = Math.max(
                            state.lastFullRaise,
                            requiredRaiseTotal - toCall
                        );
                        const rootRaiseOptions = [
                            {
                                label: "min_raise",
                                amount: ceilChips(toCall + minimumRaiseIncrement)
                            },
                            {
                                label: "raise_50",
                                amount: ceilChips(toCall + Math.max(
                                    minimumRaiseIncrement,
                                    toCall,
                                    (state.pot + toCall) * BET_FRACTION
                                ))
                            }
                        ];
                        const uniqueRaises = new Map<number,string>();

                        for (const option of rootRaiseOptions) {
                            if (option.amount <= toCall + CHIP_EPSILON ||
                                option.amount > maximumRaiseTotal + CHIP_EPSILON) continue;
                            let label = option.label;
                            if (Math.abs(option.amount - state.stacks[actor]!) <= CHIP_EPSILON) {
                                label = "all_in_raise";
                            } else if (Math.abs(option.amount - effectiveMaximum) <= CHIP_EPSILON) {
                                label = "raise_effective";
                            }
                            if (!uniqueRaises.has(option.amount)) {
                                uniqueRaises.set(option.amount, label);
                            }
                        }

                        if (maximumRaiseTotal > toCall + CHIP_EPSILON) {
                            const maximumLabel =
                                Math.abs(maximumRaiseTotal - state.stacks[actor]!) <= CHIP_EPSILON
                                    ? "all_in_raise"
                                    : "raise_effective";
                            uniqueRaises.set(maximumRaiseTotal, maximumLabel);
                        }

                        for (const [amount, label] of uniqueRaises) {
                            actions.push(makeAction(label, "raise", amount));
                        }
                    } else {
                        const desiredRaiseTotal = ceilChips(toCall + Math.max(
                            toCall,
                            state.pot * BET_FRACTION,
                            requiredRaiseTotal - toCall,
                            state.lastFullRaise
                        ));
                        if (desiredRaiseTotal <= maximumRaiseTotal + CHIP_EPSILON) {
                            const isAllIn = Math.abs(desiredRaiseTotal - state.stacks[actor]!) <= CHIP_EPSILON;
                            actions.push(makeAction(
                                isAllIn ? "all_in_raise" : "raise",
                                "raise",
                                desiredRaiseTotal
                            ));
                        } else if (maximumRaiseTotal > toCall) {
                            const maximumIsAllIn = Math.abs(maximumRaiseTotal - state.stacks[actor]!) <= CHIP_EPSILON;
                            actions.push(makeAction(
                                maximumIsAllIn ? "all_in_raise" : "raise_effective",
                                "raise",
                                maximumRaiseTotal
                            ));
                        }
                    }
                }
            } else {
                actions.push(makeAction("check", "check"));
                const rootBetAllowed = !state.root || rootOptions.canBet;
                if (canContinueAggression && rootBetAllowed && state.stacks[actor]! > 0) {
                    const minimumBet = ceilChips(state.root && Number.isFinite(rootOptions.minimumBet)
                        ? rootOptions.minimumBet! : 1);
                    const effectiveBetStack = floorChips(Math.min(state.stacks[actor]!, state.stacks[other]!));
                    const addedBetAmounts = new Set<number>();
                    let largestBet = 0;
                    for (const fraction of BET_SIZINGS) {
                        const amount = floorChips(Math.min(effectiveBetStack, Math.max(minimumBet, roundChips(state.pot * fraction))));
                        if (amount <= 0 || addedBetAmounts.has(amount)) continue;
                        addedBetAmounts.add(amount);
                        largestBet = Math.max(largestBet, amount);
                        const isAllInSizing = Math.abs(amount - effectiveBetStack) <= CHIP_EPSILON;
                        const label = isAllInSizing
                            ? "all_in"
                            : "bet_" + Math.round(fraction * 100);
                        actions.push(makeAction(label, "bet", amount));
                    }
                    if (largestBet > 0 && effectiveBetStack > largestBet * 1.25) {
                        actions.push(makeAction("all_in", "bet", effectiveBetStack));
                    }
                }
            }

            const node: AbstractTreeDecision = {
                terminal: false,
                actor,
                board: board.slice(),
                pot: state.pot,
                stacks: state.stacks.slice(),
                bets: state.bets.slice(),
                hasActed: state.hasActed.slice(),
                lastActedBets: state.lastActedBets.slice(),
                lastFullRaise: state.lastFullRaise,
                raises: state.raises,
                checks: state.checks,
                history: state.history.join("/"),
                actions: []
            };

            for (const action of actions.slice(0, ACTION_LIMIT)) {
                const next = cloneState(state);
                next.root = false;
                next.history.push(actor + ":" + action.label);

                if (action.type === "fold") {
                    node.actions.push({ action, child: terminal("fold", next, other) });
                    continue;
                }

                if (action.type === "check") {
                    next.checks++;
                    next.hasActed[actor] = true;
                    next.lastActedBets[actor] = next.bets[actor]!;
                    next.actor = other;
                    node.actions.push({ action, child: build(next, board, runoutIndex, depth + 1) });
                    continue;
                }

                if (action.type === "call") {
                    const paid = applyContribution(next, actor, action.amount);
                    if (paid + 0.000001 < action.amount) {
                        const uncalled = action.amount - paid;
                        next.pot -= uncalled;
                        next.bets[other] = next.bets[other]! - uncalled;
                        next.stacks[other] = next.stacks[other]! + uncalled;
                        if (other === 0) next.heroInvested -= uncalled;
                    }
                    next.hasActed[actor] = true;
                    next.lastActedBets[actor] = next.bets[actor]!;
                    const child = next.stacks[0]! <= 0 || next.stacks[1]! <= 0
                        ? terminal("showdown", next)
                        : advanceStreet(next, board, runoutIndex, depth + 1);
                    node.actions.push({ action, child });
                    continue;
                }

                if (action.type === "bet") {
                    const paid = applyContribution(next, actor, action.amount);
                    next.checks = 0;
                    if (paid >= next.bigBlind - CHIP_EPSILON) {
                        next.lastFullRaise = paid;
                    }
                    next.hasActed[actor] = true;
                    next.lastActedBets[actor] = next.bets[actor]!;
                    next.actor = other;
                    node.actions.push({ action, child: build(next, board, runoutIndex, depth + 1) });
                    continue;
                }

                if (action.type === "raise") {
                    const paid = applyContribution(next, actor, action.amount);
                    const raiseIncrement = Math.max(0, paid - toCall);
                    if (raiseIncrement >= next.lastFullRaise - CHIP_EPSILON) {
                        next.lastFullRaise = raiseIncrement;
                    }
                    next.hasActed[actor] = true;
                    next.lastActedBets[actor] = next.bets[actor]!;
                    next.raises++;
                    next.checks = 0;
                    next.actor = other;
                    node.actions.push({ action, child: build(next, board, runoutIndex, depth + 1) });
                }
            }

            if (!node.actions.length) return terminal("showdown", state);
            return node;
        }

        const tree = build(initial, input.board, 0, 0);
        return { tree, nodeCount: nodes.count };
    }


/** Replace only the public V1 decision-tree API. The old solver remains
 * available internally until its entire chance-sampled CFR+ loop is ported.
 */
type StrategyGlobal = Window & {
  PokerLabPostflopStrategy?: {buildDecisionTree: typeof buildDecisionTree};
};
export function installDecisionTree(): void {
  const target = window as StrategyGlobal;
  if (!target.PokerLabPostflopStrategy) {
    throw new Error("Le module stratégique est absent.");
  }
  target.PokerLabPostflopStrategy.buildDecisionTree = buildDecisionTree;
}
