import { memo, useMemo, type CSSProperties } from "react";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

export type RangeFrequencies = Readonly<Record<string, number>>;
export interface MatrixOptions {
  interactive?: boolean;
  showFrequencies?: boolean;
  showLegend?: boolean;
  selectedHands?: string[];
  onSelect?: (selection: { hand: string; selected: boolean; selectedHands: string[] }) => void;
}
interface Props {
  range: RangeFrequencies;
  options: Required<Omit<MatrixOptions, "onSelect">>;
  onToggle: (hand: string) => void;
}
export function handAt(row: number, col: number): string {
  const first = RANKS[Math.min(row, col)];
  const second = RANKS[Math.max(row, col)];
  if (!first || !second) throw new RangeError("Coordonnées hors de la matrice");
  return first + second + (row === col ? "" : row < col ? "s" : "o");
}
const ALL_HANDS = Array.from({ length: 169 }, (_, index) => handAt(Math.floor(index / 13), index % 13));
export function allHands(): string[] { return [...ALL_HANDS]; }
export function normalizeHand(hand: string): string {
  const text = String(hand).trim();
  return text.slice(0, 2).toUpperCase() + text.slice(2).toLowerCase();
}
export function normalizeRange(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, number> = {};
  for (const [key, frequency] of Object.entries(value)) {
    const hand = normalizeHand(key);
    if (!ALL_HANDS.includes(hand)) continue;
    const numberValue: unknown = frequency && typeof frequency === "object" && "frequency" in frequency
      ? frequency.frequency : frequency;
    const parsed = typeof numberValue === "boolean" ? (numberValue ? 100 : 0) : Number(numberValue);
    result[hand] = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
  }
  return result;
}
const LEGEND = [
  ["0%", "inactive"], ["1–24%", "low"], ["25–49%", "medium"],
  ["50–74%", "high"], ["75–100%", "very-high"]
] as const;
function frequencyClass(value: number): string {
  return value <= 0 ? "inactive" : value < 25 ? "low" : value < 50 ? "medium" : value < 75 ? "high" : "very-high";
}
export const RangeMatrix = memo(function RangeMatrix({ range, options, onToggle }: Props) {
  const selected = useMemo(() => new Set(options.selectedHands), [options.selectedHands]);
  return <>
    <div className="pl-range-matrix" role="grid" aria-label="Matrice des 169 mains de poker">
      {RANKS.map((_, row) => <div key={row} role="row" className="pl-range-row">
        {RANKS.map((__, col) => {
          const hand = handAt(row, col);
          const frequency = range[hand] ?? 0;
          const pressed = selected.has(hand);
          return <button type="button" role="gridcell" key={hand} data-hand={hand}
            className={`pl-range-cell pl-range-cell--${frequencyClass(frequency)}${pressed ? " is-selected" : ""}`}
            aria-label={`${hand} : fréquence ${Math.round(frequency)}%`}
            aria-pressed={pressed} disabled={!options.interactive}
            style={{ "--fill": `${frequency}%` } as CSSProperties}
            onClick={() => onToggle(hand)}>
            <span className="pl-range-cell-hand">{hand}</span>
            {options.showFrequencies && <span className="pl-range-cell-frequency">{Math.round(frequency)}%</span>}
          </button>;
        })}
      </div>)}
    </div>
    {options.showLegend && <div className="pl-range-legend">{LEGEND.map(([label, name]) =>
      <div className="pl-range-legend-item" key={label}>
        <span className={`pl-range-legend-swatch pl-range-cell--${name}`} />
        <span className="pl-range-legend-label">{label}</span>
      </div>
    )}</div>}
  </>;
});
