import { packCards } from "./cards";
import type { PokerCard } from "../../../shared/types/poker";
import type { EngineRequest } from "../../../shared/models/solver";

export interface WeightedOpponentCombo {
  /** One explicit two-card combination, never a 169-class hand label. */
  readonly cards: readonly PokerCard[];
  /** Relative weight (e.g. preflop frequency adjusted for observed actions). */
  readonly weight: number;
}

/** A range-vs-known-hand task for the Rust/WASM Worker.
 *
 * The V1 solver returns opponent ranges as {cards: [Card, Card], weight}.
 * Keeping this typed adapter separate from UI and workers allows the same
 * blocker-aware engine to be reused in strategy evaluation and training.
 */
export function createRangeEquityRequest(
  hero: readonly PokerCard[],
  board: readonly PokerCard[],
  combos: readonly WeightedOpponentCombo[],
  iterations = 2000,
  seed = 1
): Extract<EngineRequest, { kind: "equityRange" }> {
  if (hero.length !== 2 || board.length < 3 || board.length > 5) {
    throw new RangeError("Équité postflop : deux cartes héros et trois à cinq cartes communes requises.");
  }
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 10_000_000) {
    throw new RangeError("Nombre de simulations invalide.");
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Graine aléatoire invalide.");
  }
  if (!Array.isArray(combos) || combos.length === 0) {
    throw new RangeError("Range adverse vide.");
  }
  const known = packCards([...hero, ...board]); // also checks duplicate blockers
  const blocked = new Set<number>(known);
  const villainPairs: number[] = [];
  const weights: number[] = [];
  for (const combo of combos) {
    if (!combo || !Array.isArray(combo.cards) || combo.cards.length !== 2) {
      throw new RangeError("Combinaison adverse invalide.");
    }
    const pair = packCards(combo.cards); // rejects identical physical cards
    if (!Number.isFinite(combo.weight) || combo.weight < 0) {
      throw new RangeError("Poids de range adverse invalide.");
    }
    if (combo.weight === 0 || blocked.has(pair[0]!) || blocked.has(pair[1]!)) continue;
    villainPairs.push(pair[0]!, pair[1]!);
    weights.push(combo.weight);
  }
  if (weights.length === 0) {
    throw new RangeError("Aucune combinaison adverse admissible après application des bloqueurs.");
  }
  return {
    kind: "equityRange",
    hero: [...known.slice(0, 2)],
    board: [...known.slice(2)],
    villainPairs,
    weights,
    iterations,
    seed
  };
}
