export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export interface PokerCard { readonly value: number; readonly suit: Suit; }
export interface Evaluation { category: number; score: readonly number[]; }
