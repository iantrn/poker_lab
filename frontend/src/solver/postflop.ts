/* =========================================================
   POKERLAB - POSTFLOP EQUITY ANALYSER
   Version : 0.1.0
   Monte-Carlo equity engine for heads-up postflop spots.
   ========================================================= */
"use strict";

import type { PokerCard, PokerHandEvaluation } from "../core/evaluator";
import type { BotProfilesApi } from "../bots/profiles";
import { createSolverInput, resolveSolverInput } from "./input-contract.ts";
import type { SolverStateInput, SolverHistoryEvent } from "./input-contract";

interface PostflopPlayer {
  id: string; name?: string; isHuman?: boolean; isBot?: boolean;
  botProfile?: string | null; botDifficulty?: string | null;
  position?: string | null; folded?: boolean; allIn?: boolean;
  stack: number; holeCards?: PokerCard[] | null;
  amountToCall?: number; actionOptions?: { canBet?: boolean; canRaise?: boolean };
  [attribute: string]: unknown;
}
interface PostflopState {
  street: string; board: PokerCard[]; players: PostflopPlayer[];
  pot: number; currentBet?: number; handComplete?: boolean;
  [attribute: string]: unknown;
}
interface HistoryData {
  playerId: string; action: string;
  allIn?: boolean; amount?: number;
  potBefore?: number; currentBetBefore?: number; lastFullRaiseBefore?: number;
  streetBetBefore?: number; stackBefore?: number;
  betTo?: number; raiseSize?: number;
  [attribute: string]: unknown;
}
interface HistoryEvent {
  type: string; street: string; timestamp?: number;
  data: HistoryData; canRaiseBefore?: boolean;
}
interface WeightedCombo { cards: PokerCard[]; weight: number; }
interface RichCard extends PokerCard {id:string;rank:string;symbol:string|undefined;}
interface RangeInfo {
  combos: WeightedCombo[] | null; label: string;
  rangeUsed?: boolean; rangeError?: string;
  postflopActionsUsed?: number; profileModeledActions?: number;
  conditioning?: string; actualHandInRange?: boolean;
}
interface MatrixIndex { version: number; spots: Array<{id:string;p:string;a:string;s?:string}>; }
interface MatrixData {index:MatrixIndex; ranges:Record<string,Record<string,number>>;}
interface PostflopGlobals {
  crypto?: Crypto;
  PokerLabHandEvaluator: {evaluate(cards:PokerCard[]):PokerHandEvaluation;compareScores(a:number[],b:number[]):number};
  PokerLabBotProfiles?: BotProfilesApi;
}
function createPostflopSolver(global: PostflopGlobals) {
    const SUITS = ["clubs", "diamonds", "hearts", "spades"];
    const SUIT_CODES: Record<string,string> = { clubs: "c", diamonds: "d", hearts: "h", spades: "s" };
    const RANKS = "23456789TJQKA";
    const MATRIX_URL = "./data/ranges/preflop/matrix/";
    const DEFAULT_ITERATIONS = 1800;
    const randomBuffer = new Uint32Array(1);
    let matrixIndexPromise: Promise<MatrixIndex> | null = null;
    let matrixBundlePromise: Promise<Record<string,Record<string,number>>> | null = null;

    function cardKey(card: PokerCard | null | undefined): string | null {
        return card && Number.isInteger(card.value) && SUIT_CODES[card.suit]
            ? card.value + "_" + card.suit : null;
    }

    function toCard(value: number, suit: string): RichCard {
        const labels: Record<number,string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
        return {
            id: value + "_" + suit, value, suit,
            rank: labels[value] || String(value),
            symbol: ( {clubs:"♣",diamonds:"♦",hearts:"♥",spades:"♠"} as Record<string,string> )[suit]
        };
    }

    function makeDeck(excluded: Set<string | null>): PokerCard[] {
        const deck: PokerCard[] = [];
        for (const suit of SUITS) for (let value = 2; value <= 14; value++) {
            const card = toCard(value, suit);
            if (!excluded.has(cardKey(card))) deck.push(card);
        }
        return deck;
    }

    function randomInt(max: number): number {
        if (global.crypto && global.crypto.getRandomValues) {
            const limit = 0x100000000 - (0x100000000 % max);
            do { global.crypto.getRandomValues(randomBuffer); } while (randomBuffer[0]! >= limit);
            return randomBuffer[0]! % max;
        }
        return Math.floor(Math.random() * max);
    }

    function shuffle<T>(array: T[], length: number = array.length): T[] {
        for (let i = length - 1; i > 0; i--) {
            const j = randomInt(i + 1);
            const value = array[i]!;
            array[i] = array[j]!;
            array[j] = value;
        }
        return array;
    }

    function score(hero: PokerCard[], villain: PokerCard[], board: PokerCard[], heroCardsBuffer: PokerCard[], villainCardsBuffer: PokerCard[]): number {
        const evaluator = global.PokerLabHandEvaluator;
        heroCardsBuffer[0] = hero[0]!;
        heroCardsBuffer[1] = hero[1]!;
        villainCardsBuffer[0] = villain[0]!;
        villainCardsBuffer[1] = villain[1]!;
        for (let index = 0; index < board.length; index++) {
            heroCardsBuffer[index + 2] = board[index]!;
            villainCardsBuffer[index + 2] = board[index]!;
        }
        const a = evaluator.evaluate(heroCardsBuffer).score;
        const b = evaluator.evaluate(villainCardsBuffer).score;
        return evaluator.compareScores(a, b);
    }

    function handClass(rankA: number, rankB: number, suited: boolean): string {
        const high = Math.max(rankA, rankB);
        const low = Math.min(rankA, rankB);
        if (high === low) return RANKS[high - 2] + RANKS[low - 2];
        return RANKS[high - 2] + RANKS[low - 2] + (suited ? "s" : "o");
    }

    async function loadMatrix(): Promise<MatrixData> {
        if (!matrixIndexPromise) {
            matrixIndexPromise = fetch(MATRIX_URL + "index.json")
                .then(r => { if (!r.ok) throw new Error("Index de ranges indisponible."); return r.json() as Promise<unknown>; })
                .then(raw => {
                    const data = raw as MatrixIndex;
                    if (data.version !== 1 || !Array.isArray(data.spots)) throw new Error("Index de ranges invalide.");
                    return data;
                }).catch(error => { matrixIndexPromise = null; throw error; });
        }
        if (!matrixBundlePromise) {
            matrixBundlePromise = fetch(MATRIX_URL + "ranges.json")
                .then(r => { if (!r.ok) throw new Error("Bundle de ranges indisponible."); return r.json(); })
                 .then(raw => {
                    const data = raw as {version:number;ranges:Record<string,Record<string,number>>};
                    if (data.version !== 1 || !data.ranges) throw new Error("Bundle de ranges invalide.");
                    return data.ranges;
                }).catch(error => { matrixBundlePromise = null; throw error; });
        }
        const [index, ranges] = await Promise.all([matrixIndexPromise, matrixBundlePromise]);
        return { index, ranges };
    }

    function actionCode(action: string, aggressorNumber: number, data: Partial<HistoryData> = {}): string | null {
        if (action === "call" || action === "all_in_call") return "call";
        if (action === "fold") return "fold";
        if (action === "check") return "check";
        if (!["bet", "raise", "short_raise", "short_all_in_bet"].includes(action)) return null;
        if (aggressorNumber === 1) return "RFI";
        if (aggressorNumber === 2) return "3bet";
        if (aggressorNumber === 3) return "4bet";
        if (aggressorNumber === 4) return data.allIn ? "5bet" : "5bet_small";
        return "6bet";
    }

    function matrixPosition(position: string | null | undefined): string | null | undefined {
        const aliases: Record<string,string> = {
            "BTN": "BU",
            "BTN/SB": "BU",
            "HJ": "MP"
        };
        return aliases[position ?? ""] || position;
    }

    function findOpponentRange(state: PostflopState, history: HistoryEvent[], opponent: PostflopPlayer, matrix: MatrixData): RangeInfo {
        const preflop = history.filter(event => event.type === "player_action" && event.street === "preflop");
        const actorIndex = preflop.map(event => event.data.playerId).lastIndexOf(opponent.id);
        if (actorIndex < 0) return { combos: null, label: "Range large (non renseignée)" };

        const positions = new Map<string,string|null|undefined>(state.players.map(player => [player.id, player.position] as const));
        const prefix: string[] = [];
        let aggressorNumber = 0;
        let targetCode = null;

        for (let index = 0; index <= actorIndex; index++) {
            const event = preflop[index]!;
            const action = event.data.action;
            const isAggressive = ["bet", "raise", "short_raise", "short_all_in_bet"].includes(action);
            if (isAggressive) aggressorNumber++;
            const code = actionCode(action, aggressorNumber, event.data || {});
            if (index === actorIndex) {
                targetCode = code;
                break;
            }
            const position = matrixPosition(positions.get(event.data.playerId));
            if (position && code) prefix.push(position + " " + code);
        }

        if (!targetCode) return { combos: null, label: "Range large (action non couverte)" };
        const sequence = prefix.join(" › ");
        const opponentPosition = matrixPosition(opponent.position);
        const candidates = matrix.index.spots.filter(item =>
            item.p === opponentPosition && item.a === targetCode
        );
        // Never substitute a merely similar sequence: a different preflop line
        // can represent a materially different range. If the exact line is absent,
        // analyse against the explicit uniform fallback instead.
        const spot = candidates.find(item => (item.s || "") === sequence);

        if (!spot || !matrix.ranges[spot.id]) {
            return { combos: null, label: "Range large (spot absent)" };
        }

        const weighted: WeightedCombo[] = [];
        const range = matrix.ranges[spot.id]!;
        for (let a = 2; a <= 14; a++) for (let b = 2; b <= a; b++) {
            const pairClass = handClass(a, b, true);
            const suitedClass = handClass(a, b, true);
            const offClass = handClass(a, b, false);
            const frequency = Number(range[pairClass] ?? 0);
            const offFrequency = Number(range[offClass] ?? 0);
            if (a === b) {
                if (frequency > 0) addClassCombos(weighted, a, b, frequency, false);
            } else {
                if (frequency > 0) addClassCombos(weighted, a, b, frequency, true);
                if (offFrequency > 0) addClassCombos(weighted, a, b, offFrequency, false);
            }
        }
        return { combos: weighted.length ? weighted : null, label: spot.id };
    }

    function addClassCombos(target: WeightedCombo[], rankA: number, rankB: number, frequency: number, suited: boolean): void {
        for (const suitA of SUITS) for (const suitB of SUITS) {
            if (suited && suitA !== suitB) continue;
            if (!suited && suitA === suitB) continue;
            if (rankA === rankB && SUITS.indexOf(suitB) <= SUITS.indexOf(suitA)) continue;
            target.push({
                cards: [toCard(rankA, suitA), toCard(rankB, suitB)],
                weight: frequency
            });
        }
    }

    function weightedChoice(items: WeightedCombo[]): PokerCard[] {
        const total = items.reduce((sum, item) => sum + item.weight, 0);
        let cursor = Math.random() * total;
        for (const item of items) {
            cursor -= item.weight;
            if (cursor <= 0) return item.cards;
        }
        return items[items.length - 1]!.cards;
    }

    function sampleOpponentHand(deck: PokerCard[], weightedRange: WeightedCombo[] | null): PokerCard[] {
        if (!weightedRange || weightedRange.length === 0) {
            shuffle(deck);
            return [deck[0]!, deck[1]!];
        }
        // The range is filtered against the fixed base deck once in analyse().
        // Repeating this filter in every Monte-Carlo iteration created avoidable arrays.
        return weightedChoice(weightedRange);
    }

    // Snapshot serialization is shared with the TypeScript scheduler.
    const resolveInput = (input:unknown, history:HistoryEvent[]=[]):{state:PostflopState;history:HistoryEvent[]} =>
      resolveSolverInput(input,history) as {state:PostflopState;history:HistoryEvent[]};
    const createInput = (state:SolverStateInput|null, history:SolverHistoryEvent[]=[]) =>
      createSolverInput(state,history);

    function validateState(state: PostflopState): {hero:PostflopPlayer & {holeCards:PokerCard[]};opponent:PostflopPlayer} {
        if (!state || !Array.isArray(state.board) || state.board.length < 3 || state.board.length > 5) {
            throw new Error("Le solveur est disponible à partir du flop.");
        }
        if (!Array.isArray(state.players)) {
            throw new Error("La liste des joueurs est invalide.");
        }
        const active = state.players.filter(player => !player.folded && player.stack >= 0);
        if (active.length !== 2) throw new Error("La première version du solveur est limitée au heads-up.");
        const hero = state.players.find(player => player.isHuman);
        if (!hero || !Array.isArray(hero.holeCards) || hero.holeCards.length !== 2) {
            throw new Error("Les cartes du joueur sont indisponibles.");
        }
        return { hero: hero as PostflopPlayer & {holeCards:PokerCard[]}, opponent: active.find(player => player.id !== hero.id)! };
    }

    function recommend(equity: number, state: PostflopState, hero: PostflopPlayer) {
        const amount = Number(hero.amountToCall) || 0;
        const pot = Number(state.pot) || 0;
        const potOdds = amount > 0 ? amount / (pot + amount) : 0;
        const margin = equity - potOdds;
        const options = hero.actionOptions || {};
        let action: string, explanation: string;
        if (amount > 0) {
            if (equity >= potOdds + 0.08 && (options.canRaise || options.canBet)) {
                action = "Relance envisageable";
                explanation = "L'équité estimée dépasse nettement le seuil du call. Une relance peut extraire de la value, mais le sizing et les ranges restent déterminants.";
            } else if (equity >= potOdds) {
                action = "Suivre";
                explanation = "L'équité estimée atteint le seuil de rentabilité immédiat du call, avant prise en compte des mises futures.";
            } else {
                action = "Se coucher";
                explanation = "L'équité estimée est inférieure aux pot odds. Le call est défavorable à long terme dans ce modèle simplifié.";
            }
        } else if (equity >= 0.65 && (options.canBet || options.canRaise)) {
            action = "Miser pour value";
            explanation = "L'équité estimée est élevée. Une mise peut être intéressante, sous réserve de la texture du board et de la range adverse.";
        } else {
            action = "Checker";
            explanation = "Sans mise à payer, le check conserve le pot. La décision d'ouvrir dépend aussi de l'avantage de range et de la stratégie.";
        }
        return { action, explanation, potOdds, margin };
    }

    function buildUniformCombos(knownCards: PokerCard[]): WeightedCombo[] {
        const deck = makeDeck(new Set(knownCards.map(cardKey)));
        const combos: WeightedCombo[] = [];
        for (let first = 0; first < deck.length; first++) {
            for (let second = first + 1; second < deck.length; second++) {
                combos.push({ cards: [deck[first], deck[second]], weight: 1 });
            }
        }
        return combos;
    }

    function estimateBotHandStrength(holeCards: PokerCard[], board: PokerCard[]): number {
        const result = global.PokerLabHandEvaluator.evaluate([...holeCards, ...board]);
        const categoryStrength = [0.24, 0.40, 0.56, 0.68, 0.78, 0.84, 0.91, 0.96, 0.985, 0.995];
        let strength = categoryStrength[result.score[0] ?? 0] ?? 0.5;
        if (Array.isArray(result.score) && result.score.length > 1) {
            const kickerSum = result.score.slice(1).reduce((sum, value) =>
                sum + (Number.isFinite(value) ? value : 0), 0);
            strength += Math.max(0, Math.min(0.025, kickerSum / 1000));
        }
        return Math.max(0.05, Math.min(0.995, strength));
    }

    function clampProbability(value: unknown): number {
        return Math.max(0, Math.min(1, Number(value) || 0));
    }

    function attachRaiseRights(history: HistoryEvent[]): HistoryEvent[] {
        const lastActionByPlayerStreet = new Map<string, HistoryData>();
        return (history || []).map(event => {
            if (!event || event.type !== "player_action" || !event.data) return event;
            const data = event.data;
            const key = String(data.playerId) + "|" + String(event.street || "");
            const previous = lastActionByPlayerStreet.get(key);
            let canRaiseBefore = true;

            const currentBetBefore = Number(data.currentBetBefore);
            const lastFullRaiseBefore = Number(data.lastFullRaiseBefore);
            if (previous && Number.isFinite(currentBetBefore) && Number.isFinite(lastFullRaiseBefore)) {
                const previousStreetBet = Number.isFinite(Number(previous.streetBetAfter))
                    ? Number(previous.streetBetAfter)
                    : (Number(previous.streetBetBefore) || 0) + (Number(previous.amount) || 0);
                canRaiseBefore =
                    currentBetBefore - previousStreetBet >= lastFullRaiseBefore - 0.000001;
            }

            lastActionByPlayerStreet.set(key, data);
            return { ...event, canRaiseBefore };
        });
    }

    function createBotActionModel(opponent: PostflopPlayer, event: HistoryEvent): ((strength:number)=>number) | null {
        const profiles = global.PokerLabBotProfiles;
        if (!profiles || !opponent || opponent.isHuman ||
            !opponent.botProfile || typeof profiles.getProfile !== "function") {
            return null;
        }

        const profile = profiles.getProfile(opponent.botProfile);
        const difficulty = profiles.getDifficulty(opponent.botDifficulty || "medium");
        if (!profile || !difficulty || !profile.stats) return null;

        const data = event.data || ({} as HistoryData);
        const potBefore = Number(data.potBefore);
        const currentBetBefore = Number(data.currentBetBefore);
        const streetBetBefore = Number(data.streetBetBefore);
        const stackBefore = Number(data.stackBefore);
        if (![potBefore, currentBetBefore, streetBetBefore, stackBefore].every(Number.isFinite)) {
            return null;
        }

        const callAmount = Math.max(0, currentBetBefore - streetBetBefore);
        const effectiveCall = Math.min(callAmount, stackBefore);
        const potOdds = effectiveCall / Math.max(0.5, potBefore + effectiveCall);
        const showdownAdjustment = (Number(profile.stats.showdownFrequency) - 27) * 0.001;
        const continueThreshold = Math.max(0.10, Math.min(0.78, potOdds + 0.07 + showdownAdjustment));
        const aggression = Number(profile.stats.aggression) || 3;
        const raiseThreshold = Math.max(0.65, Math.min(0.85, 0.78 - (aggression - 2.5) * 0.035));
        const continuationBet = Number(profile.stats.continuationBet) || 68;
        const bettingFrequency = Math.max(
            0.15,
            Math.min(0.90, continuationBet / 100 + (aggression - 2.5) * 0.05)
        );
        const foldToBet = clampProbability((Number(profile.stats.foldToBet) || 0) / 100);
        const noise = Math.max(0, Math.min(0.5, (Number(difficulty.decisionNoise) || 0) / 100));
        const mistakeRate = clampProbability((Number(difficulty.mistakeRate) || 0) / 100);
        let bluffProbability = clampProbability(
            (Number(profile.stats.bluffFrequency) || 0) / 100 +
            (Number(difficulty.bluffAdjustment) || 0) / 100
        );
        if (event.street === "river") bluffProbability *= 0.8;

        const action = data.action;
        const target = ["bet", "short_all_in_bet"].includes(action)
            ? "bet"
            : ["raise", "short_raise"].includes(action)
                ? "raise"
                : ["call", "all_in_call"].includes(action)
                    ? "call"
                    : action;
        if (!["check", "bet", "raise", "call", "fold"].includes(target)) return null;

        const isFacingBet = callAmount > 0.000001;
        const canRaise = event.canRaiseBefore !== false;
        const noiseSamples = 7;
        const mistakeSamples = 5;

        function probabilityForStrength(strength: number, isBluff: boolean): number {
            if (!isFacingBet) {
                const shouldBet = strength >= 0.58 || (isBluff && strength >= 0.30);
                if (!shouldBet) return target === "check" ? 1 : 0;
                const betProbability = strength < 0.75 && !isBluff ? bettingFrequency : 1;
                return target === "bet"
                    ? betProbability
                    : target === "check" ? 1 - betProbability : 0;
            }

            const shouldFold = strength < continueThreshold && !isBluff;
            if (shouldFold) return target === "fold" ? 1 : 0;
            if (stackBefore <= effectiveCall + 0.000001) {
                return target === "call" ? 1 : 0;
            }

            const shouldRaise = canRaise &&
                (strength >= raiseThreshold || (isBluff && strength >= 0.40));
            if (shouldRaise) return target === "raise" ? 1 : 0;

            const secondaryFoldProbability =
                strength < 0.50 && !isBluff ? foldToBet * 0.15 : 0;
            if (target === "fold") return secondaryFoldProbability;
            if (target === "call") return 1 - secondaryFoldProbability;
            return 0;
        }

        return (strength:number):number => {
            let likelihood = 0;
            for (let noiseIndex = 0; noiseIndex < noiseSamples; noiseIndex++) {
                const noiseOffset = noise === 0
                    ? 0
                    : (((noiseIndex + 0.5) / noiseSamples) * 2 - 1) * noise;
                const noisyStrength = Math.max(0, Math.min(1, strength + noiseOffset));

                likelihood += (1 - mistakeRate) / noiseSamples * (
                    (1 - bluffProbability) * probabilityForStrength(noisyStrength, false) +
                    bluffProbability * probabilityForStrength(noisyStrength, true)
                );

                if (mistakeRate > 0) {
                    for (let mistakeIndex = 0; mistakeIndex < mistakeSamples; mistakeIndex++) {
                        const mistakeOffset = ((mistakeIndex + 0.5) / mistakeSamples * 2 - 1) * 0.25;
                        const mistakenStrength = Math.max(0, Math.min(1, noisyStrength + mistakeOffset));
                        likelihood += mistakeRate / (noiseSamples * mistakeSamples) * (
                            (1 - bluffProbability) * probabilityForStrength(mistakenStrength, false) +
                            bluffProbability * probabilityForStrength(mistakenStrength, true)
                        );
                    }
                }
            }
            return Math.max(0.01, likelihood);
        };
    }

    function conditionRangeOnPostflopActions(state: PostflopState, history: HistoryEvent[], opponent: PostflopPlayer, range: RangeInfo): RangeInfo {
        if (!range || !Array.isArray(range.combos)) return range;
        const streetOrder:Record<string,number> = { flop: 3, turn: 4, river: 5 };
        const enrichedHistory = attachRaiseRights(history);
        const actions = enrichedHistory.filter(event =>
            event.type === "player_action" &&
            event.data &&
            event.data.playerId === opponent.id &&
            Object.prototype.hasOwnProperty.call(streetOrder, event.street) &&
            streetOrder[event.street]! <= state.board.length &&
            ["check", "call", "all_in_call", "bet", "raise", "short_raise", "short_all_in_bet"].includes(event.data.action)
        );
        if (!actions.length) return { ...range, postflopActionsUsed: 0 };

        const actionModels = actions.map(event => ({
            event,
            model: createBotActionModel(opponent, event)
        }));
        const profileModeledActions = actionModels.filter(item => item.model).length;

        const conditioned = range.combos.map(item => {
            let logWeight = Math.log(Math.max(Number(item.weight) || 0, 1e-12));
            for (const actionModel of actionModels) {
                const event = actionModel.event;
                const boardLength = streetOrder[event.street]!;
                const board = state.board.slice(0, boardLength);
                let strength = 0.5;
                try {
                    strength = estimateBotHandStrength(item.cards, board);
                } catch (error: unknown) {
                    // An invalid historical board must not silently discard a combo.
                    strength = 0.5;
                }

                const action = event.data.action;
                let likelihood = actionModel.model
                    ? actionModel.model(strength)
                    : null;

                if (typeof likelihood !== "number" || !Number.isFinite(likelihood)) {
                    if (action === "check") {
                        likelihood = 0.25 + (1 - strength) * 0.75;
                    } else if (action === "call" || action === "all_in_call") {
                        likelihood = 0.20 + strength * 0.80;
                    } else {
                        likelihood = 0.12 + strength * 0.88;
                    }
                }

                if (["bet", "raise", "short_raise", "short_all_in_bet"].includes(action)) {
                    // Le sizing observé complète le modèle d'action sans exclure les bluffs.
                    const potBefore = Number(event.data.potBefore);
                    const sizeAmount = Number(
                        action === "bet" || action === "short_all_in_bet"
                            ? (event.data.betTo ?? event.data.amount)
                            : (event.data.raiseSize ?? event.data.amount)
                    );
                    if (Number.isFinite(potBefore) && potBefore > 0 &&
                        Number.isFinite(sizeAmount) && sizeAmount > 0) {
                        const sizeRatio = sizeAmount / potBefore;
                        const sizingSignal = Math.min(1, Math.log1p(sizeRatio) / Math.LN2);
                        const sizingMultiplier = Math.exp((strength - 0.5) * 0.8 * sizingSignal);
                        likelihood *= Math.max(0.5, Math.min(1.5, sizingMultiplier));
                    }
                }

                const minimumLikelihood = actionModel.model ? 0.01 : 0.05;
                logWeight += Math.log(Math.max(minimumLikelihood, likelihood));
            }
            return { cards: item.cards, logWeight };
        });

        const maxLogWeight = Math.max(...conditioned.map(item => item.logWeight));
        const combos = conditioned.map(item => ({
            cards: item.cards,
            weight: Math.exp(item.logWeight - maxLogWeight)
        })).filter(item => item.weight > 0);

        return {
            ...range,
            combos,
            postflopActionsUsed: actions.length,
            profileModeledActions,
            conditioning: profileModeledActions === actions.length
                ? "modèle probabiliste fondé sur le profil et la difficulté du bot, les actions et les sizings"
                : profileModeledActions > 0
                    ? "modèle mixte : profil du bot et heuristique générique"
                    : "heuristique générique fondée sur la force de main, les actions et les sizings"
        };
    }

    function sameHand(first:PokerCard[]|null|undefined, second:PokerCard[]|null|undefined):boolean {
        if (!Array.isArray(first) || !Array.isArray(second) || first.length !== 2 || second.length !== 2) {
            return false;
        }
        const key = (cards: PokerCard[]): string => cards.map(cardKey).sort().join("|");
        return key(first) === key(second);
    }

    async function getPlayerRange(state:PostflopState, history:HistoryEvent[], player:PostflopPlayer):Promise<RangeInfo> {
        let baseRange;
        try {
            const matrix = await loadMatrix();
            baseRange = findOpponentRange(state, history, player, matrix);
        } catch (error: unknown) {
            baseRange = {
                combos: null,
                label: "Range large (bundle préflop indisponible)",
                rangeError: error instanceof Error ? error.message : "Chargement des ranges impossible."
            };
        }

        let rangeUsed = Array.isArray(baseRange.combos) && baseRange.combos.length > 0;
        let sourceRange = rangeUsed ? baseRange : {
            ...baseRange,
            // Une range source adverse ne doit pas être bloquée par la main réelle
            // du héros : sampleDeals applique les bloqueurs pour chaque main héros tirée.
            combos: buildUniformCombos(state.board)
        };

        // The known human hand must belong to the modeled hero range. If the
        // selected preflop spot excludes it, do not silently solve a different
        // hand: fall back to a broad range that contains the observed holding.
        const actualHandInRange = !player.isHuman ||
            sourceRange.combos!.some(item => sameHand(item.cards, player.holeCards));
        if (player.isHuman && !actualHandInRange) {
            rangeUsed = false;
            sourceRange = {
                ...baseRange,
                label: "Range large (main réelle absente de la range préflop)",
                combos: buildUniformCombos(state.board)
            };
        }

        const conditioned = conditionRangeOnPostflopActions(state, history, player, sourceRange);
        conditioned.rangeUsed = rangeUsed;
        conditioned.actualHandInRange = !player.isHuman ||
            conditioned.combos!.some(item => sameHand(item.cards, player.holeCards));
        if (conditioned.postflopActionsUsed > 0 && conditioned.combos) {
            conditioned.label += " · ajustée postflop";
        }
        return conditioned;
    }

    async function getOpponentRange(state:PostflopState, history:HistoryEvent[], opponent:PostflopPlayer):Promise<RangeInfo> {
        return getPlayerRange(state, history, opponent);
    }

    async function analyse(input:unknown, history:HistoryEvent[] = [], options:{iterations?:number} = {}) {
        const resolved = resolveInput(input, history);
        const state = resolved.state;
        history = resolved.history;
        const { hero, opponent } = validateState(state);
        const known = [...hero.holeCards, ...state.board];
        const seen = new Set<string | null>();
        for (const card of known) {
            const key = cardKey(card);
            if (!key || seen.has(key)) throw new Error("Cartes connues invalides ou dupliquées.");
            seen.add(key);
        }
        const range = await getOpponentRange(state, history, opponent);
        const baseDeck = makeDeck(seen);
        const availableCombos = Array.isArray(range.combos)
            ? range.combos.filter(item =>
                item.cards.every(card => baseDeck.some(candidate => cardKey(candidate) === cardKey(card)))
            )
            : [];
        const weightedRange = availableCombos.length ? availableCombos : null;
        const preflopRangeUsed = range.rangeUsed !== false && availableCombos.length > 0;
        const iterations = Math.max(300, Math.min(10000, Number(options.iterations) || DEFAULT_ITERATIONS));
        let wins = 0, ties = 0, losses = 0;
        const simulationDeck = new Array<PokerCard>(baseDeck.length);
        const villainCards: Array<PokerCard|null> = [null, null];
        const fullBoard = state.board.slice();
        const heroCardsBuffer = new Array<PokerCard>(7);
        const villainCardsBuffer = new Array<PokerCard>(7);
        const runoutCount = 5 - state.board.length;

        for (let i = 0; i < iterations; i++) {
            let deckLength = 0;
            if (weightedRange) {
                const villain = sampleOpponentHand(baseDeck, weightedRange);
                villainCards[0] = villain[0];
                villainCards[1] = villain[1];
                const firstKey = cardKey(villainCards[0]);
                const secondKey = cardKey(villainCards[1]);
                for (let cardIndex = 0; cardIndex < baseDeck.length; cardIndex++) {
                    const card = baseDeck[cardIndex];
                    const key = cardKey(card);
                    if (key !== firstKey && key !== secondKey) simulationDeck[deckLength++] = card;
                }
            } else {
                for (let cardIndex = 0; cardIndex < baseDeck.length; cardIndex++) simulationDeck[cardIndex] = baseDeck[cardIndex];
                deckLength = baseDeck.length;
                shuffle(simulationDeck, deckLength);
                villainCards[0] = simulationDeck[0]!;
                villainCards[1] = simulationDeck[1]!;
                deckLength -= 2;
                for (let cardIndex = 0; cardIndex < deckLength; cardIndex++) {
                    simulationDeck[cardIndex] = simulationDeck[cardIndex + 2]!;
                }
            }
            if (weightedRange) shuffle(simulationDeck, deckLength);
            for (let cardIndex = 0; cardIndex < runoutCount; cardIndex++) {
                fullBoard[state.board.length + cardIndex] = simulationDeck[cardIndex]!;
            }
            const result = score(hero.holeCards, villainCards as PokerCard[], fullBoard, heroCardsBuffer, villainCardsBuffer);
            if (result > 0) wins++;
            else if (result === 0) ties++;
            else losses++;
        }
        const equity = (wins + ties / 2) / iterations;
        const decision = recommend(equity, state, hero);
        return {
            iterations, wins, ties, losses, equity,
            rangeLabel: range.rangeUsed === false
                ? range.label
                : preflopRangeUsed
                    ? range.label
                    : "Range large (combinaisons bloquées)",
            rangeUsed: preflopRangeUsed,
            rangeConditioning: range.conditioning || "aucune action postflop exploitable dans l'historique",
            profileModeledActions: range.profileModeledActions || 0,
            decision,
            note: "Équité Monte-Carlo contre une range préflop, éventuellement ajustée par un modèle heuristique non calibré des actions et des sizings postflop observés. Les fréquences stratégiques proviennent d'un arbre CFR+ abstrait ; elles ne constituent pas un équilibre GTO certifié."
        };
    }

    return { analyse, validateState, getOpponentRange, getPlayerRange, createInput, resolveInput, conditionRangeOnPostflopActions };
}
export type PostflopSolverApi = ReturnType<typeof createPostflopSolver>;
export function installPostflopSolver(): PostflopSolverApi {
    const target = window as unknown as Window & PostflopGlobals & { PokerLabPostflopSolver?: PostflopSolverApi };
    if (target.PokerLabPostflopSolver) return target.PokerLabPostflopSolver;
    const api = createPostflopSolver(target);
    target.PokerLabPostflopSolver = api;
    return api;
}
