import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { RangeMatrix, allHands, handAt, normalizeRange, normalizeHand, type MatrixOptions } from "../ui/RangeMatrix";

interface LegacyMatrixApi {
  render(container: HTMLElement, range?: unknown, options?: MatrixOptions): {
    element: Element | null;
    getSelectedHands(): string[];
    clearSelection(): void;
    selectHands(hands: string[]): void;
  };
  getAllHands(): string[];
  getHandName(row: number, column: number): string;
  normalizeRange(range: unknown): Record<string, number>;
}
const roots = new WeakMap<HTMLElement, Root>();

// Replace only the pure view of the matrix; its legacy JS public API stays intact.
// flushSync guarantees that the old ranges-viewer can synchronously paint .pl-range-cell.
export function installRangeAdapter(): void {
  const target = window as Window & { PokerLabRangeMatrix?: LegacyMatrixApi };
  // No V1 script is required: all four public entrypoints are provided here.
  const original = target.PokerLabRangeMatrix;
  target.PokerLabRangeMatrix = {
    ...(original ?? {}),
    getAllHands: allHands,
    getHandName: handAt,
    normalizeRange,
    render(container, inputRange = {}, customOptions = {}) {
      if (!(container instanceof HTMLElement)) throw new Error("Conteneur de matrice invalide.");
      const range = normalizeRange(inputRange);
      const options: Required<Omit<MatrixOptions, "onSelect">> = {
        interactive: customOptions.interactive ?? true,
        showFrequencies: customOptions.showFrequencies ?? true,
        showLegend: customOptions.showLegend ?? true,
        selectedHands: []
      };
      // Initial selections are kept verbatim by the legacy API.
      // Only selectHands() normalizes names; non-array inputs are ignored.
      const selected = new Set(Array.isArray(customOptions.selectedHands)
        ? customOptions.selectedHands : []);
      roots.get(container)?.unmount();
      container.replaceChildren();
      container.classList.add("pl-range-matrix-container");
      const root = createRoot(container);
      roots.set(container, root);
      const renderMatrix = () => flushSync(() => root.render(
        <RangeMatrix range={range} options={{ ...options, selectedHands: [...selected] }}
          onToggle={(hand) => {
            if (selected.has(hand)) selected.delete(hand);
            else selected.add(hand);
            renderMatrix();
            customOptions.onSelect?.({ hand, selected: selected.has(hand), selectedHands: [...selected] });
          }} />
      ));
      renderMatrix();
      return {
        element: container.querySelector(".pl-range-matrix"),
        getSelectedHands: () => [...selected],
        clearSelection() { selected.clear(); renderMatrix(); },
        selectHands(hands: string[]) {
          selected.clear();
          for (const hand of hands) {
            const normalized = normalizeHand(hand);
            if (allHands().includes(normalized)) selected.add(normalized);
          }
          renderMatrix();
        }
      };
    }
  };
}
