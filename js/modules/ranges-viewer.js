/* =========================================================
   POKERLAB - RANGES VIEWER
   Version : 1.0.0
   Description : Sélection d'un spot préflop et affichage de sa matrice 13 x 13
   Données     : ./data/ranges/preflop/matrix/index.json + <position>/<spot>.json
   ========================================================= */

"use strict";

window.PokerLabRangesViewer = (function () {

    const BASE_URL = "./data/ranges/preflop/matrix/";
    const STORAGE_KEY = "pokerlab_ranges_viewer";
    const MAX_LIST_ITEMS = 150;

    const ACTION_LABELS = {
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
    let index = null;
    let root = null;
    let matrixHandle = null;
    const spotCache = new Map();
    let bundlePromise = null;

    const state = {
        position: "BB",
        action: "all",
        query: "",
        spotId: null
    };

    const ui = {};


    /* ---------- Outils ---------- */

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function actionLabel(action) {
        return ACTION_LABELS[action] || String(action).replace(/_/g, " ");
    }

    function spotLabel(spot) {
        const action = String(spot.a).replace(/_/g, " ");
        return spot.s ? `${spot.p} ${action} vs ${spot.s}` : `${spot.p} ${action}`;
    }

    function formatPercent(value) {
        const rounded = Math.round(value * 10) / 10;
        return `${rounded.toLocaleString("fr-FR")} %`;
    }

    function loadPrefs() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            if (saved && typeof saved === "object") {
                if (typeof saved.position === "string") state.position = saved.position;
                if (typeof saved.action === "string") state.action = saved.action;
                if (typeof saved.spotId === "string") state.spotId = saved.spotId;
            }
        } catch (error) {
            /* stockage indisponible : valeurs par défaut */
        }
    }

    function savePrefs() {
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

    async function fetchJson(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Chargement impossible (${response.status}) : ${url}`);
        return response.json();
    }

    function loadSpot(id) {
        if (!spotCache.has(id)) {
            const promise = (async () => {
                if (!bundlePromise) {
                    bundlePromise = fetchJson(`${BASE_URL}ranges.json`)
                        .then(bundle => {
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
                        .catch(() => null);
                }

                const bundledRanges = await bundlePromise;
                if (bundledRanges) {
                    if (!Object.prototype.hasOwnProperty.call(bundledRanges, id)) {
                        throw new Error(`Range absente du bundle : ${id}`);
                    }
                    return bundledRanges[id];
                }

                // Compatibilité avec les anciennes publications sans bundle.
                return fetchJson(`${BASE_URL}${id}.json`);
            })().catch(error => {
                spotCache.delete(id);
                throw error;
            });

            spotCache.set(id, promise);
        }
        return spotCache.get(id);
    }


    /* ---------- Filtrage ---------- */

    function getFilteredSpots() {
        const query = state.query.trim().toLowerCase();
        return index.spots
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

    function paintCells(range) {
        const cells = ui.matrix.querySelectorAll(".pl-range-cell");
        cells.forEach(cell => {
            const frequency = Number(range[cell.dataset.hand]) || 0;
            cell.style.setProperty("--fill", `${Math.max(0, Math.min(100, frequency))}%`);
        });
    }

    function showHandDetail(hand, range) {
        const frequency = Number(range[hand]) || 0;
        ui.detail.textContent = `${hand} : ${formatPercent(frequency)}`;
    }

    async function showSpot(id) {
        const spot = index.spots.find(item => item.id === id);
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

            matrixHandle = window.PokerLabRangeMatrix.render(ui.matrix, range, {
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

    function highlightActiveSpot() {
        ui.list.querySelectorAll("[data-spot-id]").forEach(button => {
            const active = button.dataset.spotId === state.spotId;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function renderList() {
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

    function renderPositions() {
        ui.positions.replaceChildren();
        const positions = POSITION_ORDER.filter(position => index.positions.includes(position));
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

    function renderActions() {
        const available = new Set(index.spots.filter(spot => spot.p === state.position).map(spot => spot.a));
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

    function refreshFilters(selectFirst) {
        renderPositions();
        renderActions();
        const spots = renderList();
        savePrefs();

        const stillListed = spots.some(spot => spot.id === state.spotId);
        if (selectFirst || !stillListed) {
            if (spots.length) showSpot(spots[0].id);
        }
    }


    /* ---------- Construction de l'interface ---------- */

    function buildUi() {
        root.replaceChildren();
        root.classList.add("pl-rv");

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
            if (spots.length && !spots.some(spot => spot.id === state.spotId)) showSpot(spots[0].id);
        });

        filters.append(ui.action, ui.search);

        ui.count = el("p", "pl-rv-count");
        ui.list = el("div", "pl-rv-list");

        const panel = el("div", "pl-rv-panel");
        ui.title = el("h3", "pl-rv-title");
        ui.summary = el("p", "pl-rv-summary");
        ui.matrix = el("div", "pl-rv-matrix");
        ui.detail = el("p", "pl-rv-detail");
        ui.error = el("p", "pl-rv-error");
        ui.error.hidden = true;

        const legend = el("div", "pl-rv-legend");
        legend.appendChild(el("span", "", "0 %"));
        legend.appendChild(el("span", "pl-rv-legend-bar"));
        legend.appendChild(el("span", "", "100 %"));

        panel.append(ui.title, ui.summary, ui.matrix, legend, ui.detail, ui.error);

        root.append(ui.positions, filters, ui.count, ui.list, panel);
    }


    /* ---------- Initialisation ---------- */

    async function init() {
        if (initialized) return;
        root = document.querySelector("[data-ranges-viewer]");
        if (!root) return;
        initialized = true;

        root.textContent = "Chargement des ranges…";

        try {
            index = await fetchJson(`${BASE_URL}index.json`);
            if (!index || !Array.isArray(index.spots)) throw new Error("Index de ranges invalide.");
        } catch (error) {
            initialized = false;
            root.textContent = "Les ranges n'ont pas pu être chargées. Vérifie ta connexion puis rouvre cette page.";
            console.error("[PokerLab] Index des ranges :", error);
            return;
        }

        loadPrefs();
        if (!index.positions.includes(state.position)) state.position = index.positions[0];

        buildUi();
        renderPositions();
        renderActions();
        const spots = renderList();

        const initial = spots.find(spot => spot.id === state.spotId) || spots[0];
        if (initial) showSpot(initial.id);
    }

    function isLessonsVisible() {
        const section = document.getElementById("lessons");
        return Boolean(section && !section.hidden);
    }

    window.addEventListener("pokerlab:navigate", event => {
        if (event.detail && event.detail.page === "lessons") init();
    });

    document.addEventListener("DOMContentLoaded", () => {
        if (isLessonsVisible()) init();
    });

    window.addEventListener("load", () => {
        if (isLessonsVisible()) init();
    });

    return { init, getState: () => ({ ...state }) };

})();
