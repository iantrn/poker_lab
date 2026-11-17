/** V1-compatible, strictly typed range-matrix data model.
 * No JSX or DOM dependencies; parity-tested against the legacy module.
 */
export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
export type RangeFrequencies = Readonly<Record<string, number>>;
export function handAt(row: number, col: number): string {
  const first = RANKS[Math.min(row, col)];
  const second = RANKS[Math.max(row, col)];
  if (!first || !second) throw new RangeError("Coordonnées hors de la matrice");
  return first + second + (row === col ? "" : row < col ? "s" : "o");
}
const ALL_HANDS = Array.from({ length: 169 }, (_, index) => handAt(Math.floor(index / 13), index % 13));
const ALL_HANDS_SET = new Set(ALL_HANDS);
export function allHands(): string[] { return [...ALL_HANDS]; }
export function normalizeHand(hand: unknown): string {
  const text = String(hand).trim();
  return text.slice(0, 2).toUpperCase() + text.slice(2).toLowerCase();
}
function frequency(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.min(100, numberValue)) : 0;
}
export function normalizeRange(input: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!input || typeof input !== "object") return result;
  for (const [key, value] of Object.entries(input)) {
    const hand = normalizeHand(key);
    if (!ALL_HANDS_SET.has(hand)) continue;
    if (typeof value === "number") { result[hand] = frequency(value); continue; }
    if (typeof value === "boolean") { result[hand] = value ? 100 : 0; continue; }
    if (value && typeof value === "object") {
      result[hand] = frequency((value as { frequency?: unknown }).frequency);
    }
  }
  return result;
}
