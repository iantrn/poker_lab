import { SUITS } from "../../../shared/constants/poker";
import type { PokerCard } from "../../../shared/types/poker";

/** Contract shared with engine/src/evaluator/mod.rs: low nibble = value; high = suit. */
export function packCard(card: PokerCard): number {
  const suit = SUITS.indexOf(card.suit);
  if (!Number.isInteger(card.value) || card.value < 2 || card.value > 14 || suit < 0) {
    throw new TypeError("Carte invalide.");
  }
  return card.value | (suit << 4);
}
export function packCards(cards: readonly PokerCard[]): Uint8Array {
  const result = new Uint8Array(cards.length);
  const unique = new Set<number>();
  cards.forEach((card, index) => {
    const packed = packCard(card);
    if (unique.has(packed)) throw new TypeError("Carte dupliquée.");
    unique.add(packed);
    result[index] = packed;
  });
  return result;
}
