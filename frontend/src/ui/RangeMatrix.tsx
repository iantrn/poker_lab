import { memo, useMemo, type CSSProperties } from "react";

import { RANKS, handAt, type RangeFrequencies } from "../ranges/matrix-model";
export { handAt, allHands, normalizeRange, normalizeHand } from "../ranges/matrix-model";
export type { RangeFrequencies } from "../ranges/matrix-model";
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
