/* =========================================================
   POKERLAB - RANGES VIEWER
   Version : 1.0.0
   Description : Sélection d'un spot préflop et affichage de sa matrice 13 x 13
   Données     : ./data/ranges/preflop/matrix/index.json + ranges.json
   ========================================================= */

"use strict";

import type { MatrixOptions } from "../ui/RangeMatrix";
interface RangeSpot { id: string; p: string; a: string; s?: string; r: number; }
interface RangeIndex { spots: RangeSpot[]; positions: string[]; }
type HandRange = Record<string, number>;
interface RangeBundle { version: number; ranges: Record<string, HandRange>; }
interface ViewerState { position: string; action: string; query: string; spotId: string | null; }
interface RangeMatrixHandle { getSelectedHands(): string[]; }
interface RangeMatrixApi { render(container: HTMLElement, range: HandRange, options: MatrixOptions): RangeMatrixHandle; }
interface ViewerUI {
  positions: HTMLDivElement; action: HTMLSelectElement; search: HTMLInputElement;
  count: HTMLParagraphElement; list: HTMLDivElement; title: HTMLHeadingElement;
  summary: HTMLParagraphElement; matrix: HTMLDivElement;
  detail: HTMLParagraphElement; error: HTMLParagraphElement;
}
export interface RangesViewerApi { init(): Promise<void>; getState(): ViewerState; }
export function installRangesViewer(): RangesViewerApi {
    const target = window as Window & {
      PokerLabRangesViewer?: RangesViewerApi; PokerLabRangeMatrix?: RangeMatrixApi;
    };
    if (target.PokerLabRangesViewer) return target.PokerLabRangesViewer;

    const BASE_URL = "./data/ranges/preflop/matrix/";
    const STORAGE_KEY = "pokerlab_ranges_viewer";
    const MAX_LIST_ITEMS = 150;

    const ACTION_LABELS: Record<string, string> = {
        RFI: "Open (RFI)",
        call: "Call",
        "3bet": "3-bet",
        "4bet": "4-bet",
        "5bet": "5-bet",
        "5bet_small": "5-bet small",
        "6bet": "6-bet"
    };

    const POSITION_ORDER = ["UTG", "MP", "CO", "BU", "SB", "BB"];
    const ACTION_ORDER = ["RFI", "call", "3bet", "4bet", "5bet_small", "5bet", "6bet"];

    let initialized = false;
    let index: RangeIndex | null = null;
    let root: HTMLElement | null = null;
    let matrixHandle: RangeMatrixHandle | null = null;
    const spotCache = new Map<string, Promise<HandRange>>();
    let bundlePromise: Promise<Record<string, HandRange>> | null = null;

    const state: ViewerState = {
        position: "BB",
        action: "all",
        query: "",
        spotId: null
    };

    const ui = {} as ViewerUI;


    /* ---------- Outils ---------- */

    function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text: unknown = undefined): HTMLElementTagNameMap[K] {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function actionLabel(action: string): string {
        return ACTION_LABELS[action] || String(action).replace(/_/g, " ");
    }

    function spotLabel(spot: RangeSpot): string {
        const action = String(spot.a).replace(/_/g, " ");
        return spot.s ? `${spot.p} ${action} vs ${spot.s}` : `${spot.p} ${action}`;
    }

    function formatPercent(value: number): string {
        const rounded = Math.round(value * 10) / 10;
        return `${rounded.toLocaleString("fr-FR")} %`;
    }

    function loadPrefs(): void {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<ViewerState> | null;
            if (saved && typeof saved === "object") {
                if (typeof saved.position === "string") state.position = saved.position;
                if (typeof saved.action === "string") state.action = saved.action;
                if (typeof saved.spotId === "string") state.spotId = saved.spotId;
            }
        } catch (error) {
            /* stockage indisponible : valeurs par défaut */
        }
    }

    function savePrefs(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                position: state.position,
                action: state.action,
                spotId: state.spotId
            }));
        } catch (error) {
            /* ignoré */
        }
    }

    async function fetchJson(url: string): Promise<unknown> {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Chargement impossible (${response.status}) : ${url}`);
        return response.json() as Promise<unknown>;
    }

    function loadSpot(id: string): Promise<HandRange> {
        if (!spotCache.has(id)) {
            const promise: Promise<HandRange> = (async () => {
                if (!bundlePromise) {
                    bundlePromise = fetchJson(`${BASE_URL}ranges.json`)
                        .then(raw => {
                            const bundle = raw as RangeBundle | null;
                            if (
                                !bundle ||
                                bundle.version !== 1 ||
                                !bundle.ranges ||
                                typeof bundle.ranges !== "object" ||
                                Array.isArray(bundle.ranges)
                            ) {
                                throw new Error("Bundle de ranges invalide.");
                            }
                            return bundle.ranges;
                        })
                        .catch(error => {
                            bundlePromise = null; // retry a transient failure on the next attempt
                            throw error;
                        });
                }

                const bundledRanges = await bundlePromise;
                if (!Object.prototype.hasOwnProperty.call(bundledRanges, id)) {
                    throw new Error(`Range absente du bundle : ${id}`);
                }
                return bundledRanges[id]!;
            })().catch(error => {
                spotCache.delete(id);
                throw error;
            });

            spotCache.set(id, promise);
        }
        return spotCache.get(id)!;
    }


    /* ---------- Filtrage ---------- */

    function getFilteredSpots(): RangeSpot[] {
        const query = state.query.trim().toLowerCase();
        return index!.spots
            .filter(spot => spot.p === state.position)
            .filter(spot => state.action === "all" || spot.a === state.action)
            .filter(spot => !query || spotLabel(spot).toLowerCase().includes(query))
            .sort((a, b) => {
                const depthA = a.s ? a.s.split("›").length : 0;
                const depthB = b.s ? b.s.split("›").length : 0;
                return depthA - depthB || a.id.localeCompare(b.id);
            });
    }


    /* ---------- Rendu ---------- */

    function paintCells(range: HandRange): void {
        const cells = ui.matrix.querySelectorAll<HTMLElement>(".pl-range-cell");
        cells.forEach(cell => {
            const frequency = Number(range[cell.dataset.hand ?? ""]) || 0;
            cell.style.setProperty("--fill", `${Math.max(0, Math.min(100, frequency))}%`);
        });
    }

    function showHandDetail(hand: string, range: HandRange): void {
        const frequency = Number(range[hand]) || 0;
        ui.detail.textContent = `${hand} : ${formatPercent(frequency)}`;
    }

    async function showSpot(id: string): Promise<void> {
        const spot = index!.spots.find(item => item.id === id);
        if (!spot) return;

        state.spotId = id;
        savePrefs();
        highlightActiveSpot();

        ui.title.textContent = spotLabel(spot);
        ui.summary.textContent = `${formatPercent(spot.r)} des mains jouées`;
        ui.detail.textContent = "Touche une case pour voir sa fréquence.";
        ui.error.hidden = true;

        try {
            const range = await loadSpot(id);
            if (state.spotId !== id) return;

            matrixHandle = target.PokerLabRangeMatrix!.render(ui.matrix, range, {
                showFrequencies: false,
                showLegend: false,
                onSelect: ({ hand }) => showHandDetail(hand, range)
            });
            paintCells(range);
        } catch (error) {
            ui.error.textContent = "Cette range n'est pas disponible. Vérifie que les données ont été téléchargées ou réessaie avec une connexion Internet.";
            ui.error.hidden = false;
            console.error("[PokerLab] Range :", error);
        }
    }

    function highlightActiveSpot(): void {
        ui.list.querySelectorAll<HTMLButtonElement>("[data-spot-id]").forEach(button => {
            const active = button.dataset.spotId === state.spotId;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function renderList(): RangeSpot[] {
        const spots = getFilteredSpots();
        ui.list.replaceChildren();

        if (!spots.length) {
            ui.count.textContent = "Aucun spot ne correspond.";
            return spots;
        }

        const shown = spots.slice(0, MAX_LIST_ITEMS);
        ui.count.textContent = spots.length > shown.length
            ? `${spots.length} spots (${shown.length} affichés, affine avec la recherche)`
            : `${spots.length} spot${spots.length > 1 ? "s" : ""}`;

        shown.forEach(spot => {
            const button = el("button", "pl-rv-spot");
            button.type = "button";
            button.dataset.spotId = spot.id;
            button.appendChild(el("span", "pl-rv-spot-name", spotLabel(spot)));
            button.appendChild(el("span", "pl-rv-spot-pct", formatPercent(spot.r)));
            button.addEventListener("click", () => showSpot(spot.id));
            ui.list.appendChild(button);
        });

        highlightActiveSpot();
        return spots;
    }

    function renderPositions(): void {
        ui.positions.replaceChildren();
        const positions = POSITION_ORDER.filter(position => index!.positions.includes(position));
        positions.forEach(position => {
            const button = el("button", "pl-rv-tab", position);
            button.type = "button";
            button.setAttribute("aria-pressed", String(position === state.position));
            button.classList.toggle("is-active", position === state.position);
            button.addEventListener("click", () => {
                state.position = position;
                refreshFilters(true);
            });
            ui.positions.appendChild(button);
        });
    }

    function renderActions(): void {
        const available = new Set(index!.spots.filter(spot => spot.p === state.position).map(spot => spot.a));
        ui.action.replaceChildren();

        const all = el("option", "", "Toutes les actions");
        all.value = "all";
        ui.action.appendChild(all);

        ACTION_ORDER.filter(action => available.has(action)).forEach(action => {
            const option = el("option", "", actionLabel(action));
            option.value = action;
            ui.action.appendChild(option);
        });

        if (state.action !== "all" && !available.has(state.action)) state.action = "all";
        ui.action.value = state.action;
    }

    function refreshFilters(selectFirst: boolean): void {
        renderPositions();
        renderActions();
        const spots = renderList();
        savePrefs();

        const stillListed = spots.some(spot => spot.id === state.spotId);
        if (selectFirst || !stillListed) {
            if (spots.length) showSpot(spots[0]!.id);
        }
    }


    /* ---------- Construction de l'interface ---------- */

    function buildUi(): void {
        root!.replaceChildren();
        root!.classList.add("pl-rv", "nct-ranges");

        ui.positions = el("div", "pl-rv-tabs");
        ui.positions.setAttribute("role", "group");
        ui.positions.setAttribute("aria-label", "Position du héros");

        const filters = el("div", "pl-rv-filters");

        ui.action = el("select", "pl-rv-input");
        ui.action.setAttribute("aria-label", "Action");
        ui.action.addEventListener("change", () => {
            state.action = ui.action.value;
            refreshFilters(true);
        });

        ui.search = el("input", "pl-rv-input");
        ui.search.type = "search";
        ui.search.placeholder = "Rechercher (ex : UTG RFI, MP 3bet)";
        ui.search.setAttribute("aria-label", "Rechercher un spot");
        ui.search.addEventListener("input", () => {
            state.query = ui.search.value;
            const spots = renderList();
            if (spots.length && !spots.some(spot => spot.id === state.spotId)) showSpot(spots[0]!.id);
        });

        filters.append(ui.action, ui.search);

        ui.count = el("p", "pl-rv-count");
        ui.list = el("div", "pl-rv-list");

        const panel = el("div", "pl-rv-panel");
        ui.title = el("h3", "pl-rv-title");
        ui.summary = el("p", "pl-rv-summary");
        ui.matrix = el("div", "pl-rv-matrix");
        // The 13×13 matrix stays intact; on narrow screens its own region
        // scrolls horizontally instead of shrinking every hand label.
        ui.matrix.tabIndex = 0;
        ui.matrix.setAttribute("role", "region");
        ui.matrix.setAttribute("aria-label", "Matrice des ranges — défilement horizontal sur petit écran");
        ui.detail = el("p", "pl-rv-detail");
        ui.detail.setAttribute("role", "status");
        ui.detail.setAttribute("aria-live", "polite");
        ui.error = el("p", "pl-rv-error");
        ui.error.hidden = true;

        const legend = el("div", "pl-rv-legend");
        legend.appendChild(el("span", "", "0 %"));
        legend.appendChild(el("span", "pl-rv-legend-bar"));
        legend.appendChild(el("span", "", "100 %"));

        const matrixHeader = el("header", "nct-matrix-heading");
        matrixHeader.append(ui.title, ui.summary);
        const matrixFooter = el("footer", "nct-matrix-footer");
        matrixFooter.append(legend, ui.detail, ui.error);
        panel.append(matrixHeader, ui.matrix, matrixFooter);
        const controls = el("aside", "nct-range-controls");
        controls.setAttribute("aria-label", "Sélection du spot");
        controls.append(ui.positions, filters, ui.count, ui.list);
        root!.append(panel, controls);
    }


    /* ---------- Initialisation ---------- */

    async function init(): Promise<void> {
        if (initialized) return;
        root = document.querySelector("[data-ranges-viewer]");
        if (!root) return;
        initialized = true;

        root.textContent = "Chargement des ranges…";

        try {
            index = await fetchJson(`${BASE_URL}index.json`) as RangeIndex;
            if (!index || !Array.isArray(index.spots)) throw new Error("Index de ranges invalide.");
        } catch (error) {
            initialized = false;
            root!.textContent = "Les ranges n'ont pas pu être chargées. Vérifie ta connexion puis rouvre cette page.";
            console.error("[PokerLab] Index des ranges :", error);
            return;
        }

        loadPrefs();
        if (!index!.positions.includes(state.position)) state.position = index!.positions[0] ?? state.position;

        buildUi();
        renderPositions();
        renderActions();
        const spots = renderList();

        const initial = spots.find(spot => spot.id === state.spotId) || spots[0];
        if (initial) showSpot(initial.id);
    }

    function isLessonsVisible(): boolean {
        const section = document.getElementById("lessons");
        return Boolean(section && !section.hidden);
    }

    window.addEventListener("pokerlab:navigate", event => {
        if ((event as CustomEvent<{page?:string}>).detail?.page === "lessons") void init();
    });

    document.addEventListener("DOMContentLoaded", () => {
        if (isLessonsVisible()) void init();
    });

    window.addEventListener("load", () => {
        if (isLessonsVisible()) init();
    });

    const api: RangesViewerApi = { init, getState: () => ({ ...state }) };
    target.PokerLabRangesViewer = api;
    return api;

}
