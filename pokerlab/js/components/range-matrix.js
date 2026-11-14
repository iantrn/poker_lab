
/* =========================================================
   POKERLAB - RANGE MATRIX
   Version : 1.0.0
   Description : Matrice de ranges Texas Hold'em 13 x 13
   ========================================================= */

"use strict";

window.PokerLabRangeMatrix = (function () {

    /* =====================================================
       1. CONFIGURATION
       ===================================================== */

    const RANKS = [
        "A", "K", "Q", "J", "T",
        "9", "8", "7", "6", "5",
        "4", "3", "2"
    ];

    const DEFAULT_OPTIONS = {
        interactive: true,
        showFrequencies: true,
        showLegend: true,
        selectedHands: [],
        onSelect: null
    };


    /* =====================================================
       2. GÉNÉRATION DES MAINS
       ===================================================== */

    function getHandName(row, column) {

        const firstRank = RANKS[
            Math.min(row, column)
        ];

        const secondRank = RANKS[
            Math.max(row, column)
        ];

        if (row === column) {
            return `${firstRank}${secondRank}`;
        }

        if (row < column) {
            return `${firstRank}${secondRank}s`;
        }

        return `${firstRank}${secondRank}o`;

    }


    function getAllHands() {

        const hands = [];

        for (let row = 0; row < 13; row++) {

            for (let column = 0; column < 13; column++) {

                hands.push(
                    getHandName(row, column)
                );

            }

        }

        return hands;

    }


    /* =====================================================
       3. NORMALISATION DES DONNÉES
       ===================================================== */

    function normalizeFrequency(value) {

        const frequency = Number(value);

        if (!Number.isFinite(frequency)) {
            return 0;
        }

        return Math.max(
            0,
            Math.min(100, frequency)
        );

    }


    function normalizeRange(range) {

        const normalized = {};

        if (!range || typeof range !== "object") {
            return normalized;
        }

        Object.entries(range).forEach(([hand, value]) => {

            const normalizedHand = String(hand).toUpperCase();

            if (!getAllHands().includes(normalizedHand)) {
                return;
            }

            if (typeof value === "number") {

                normalized[normalizedHand] =
                    normalizeFrequency(value);

                return;

            }

            if (typeof value === "boolean") {

                normalized[normalizedHand] =
                    value ? 100 : 0;

                return;

            }

            if (value && typeof value === "object") {

                normalized[normalizedHand] =
                    normalizeFrequency(value.frequency);

            }

        });

        return normalized;

    }


    /* =====================================================
       4. CRÉATION DES ÉLÉMENTS
       ===================================================== */

    function createElement(tag, className, text) {

        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined && text !== null) {
            element.textContent = String(text);
        }

        return element;

    }


    /* =====================================================
       5. COULEURS DES CASES
       ===================================================== */

    function getFrequencyClass(frequency) {

        if (frequency <= 0) {
            return "pl-range-cell--inactive";
        }

        if (frequency < 25) {
            return "pl-range-cell--low";
        }

        if (frequency < 50) {
            return "pl-range-cell--medium";
        }

        if (frequency < 75) {
            return "pl-range-cell--high";
        }

        return "pl-range-cell--very-high";

    }


    /* =====================================================
       6. CRÉATION D'UNE CASE
       ===================================================== */

    function createCell(hand, frequency, options, state) {

        const cell = createElement(
            "button",
            "pl-range-cell"
        );

        cell.type = "button";

        cell.dataset.hand = hand;

        cell.classList.add(
            getFrequencyClass(frequency)
        );

        const isSelected = state.selectedHands.has(hand);

        cell.classList.toggle(
            "is-selected",
            isSelected
        );

        cell.disabled = !options.interactive;

        const handLabel = createElement(
            "span",
            "pl-range-cell-hand",
            hand
        );

        cell.appendChild(handLabel);

        if (options.showFrequencies) {

            const frequencyLabel = createElement(
                "span",
                "pl-range-cell-frequency",
                `${Math.round(frequency)}%`
            );

            cell.appendChild(frequencyLabel);

        }

        cell.setAttribute(
            "aria-label",
            `${hand} : fréquence ${Math.round(frequency)}%`
        );

        cell.setAttribute(
            "aria-pressed",
            String(isSelected)
        );

        if (options.interactive) {

            cell.addEventListener("click", () => {

                toggleSelection(
                    hand,
                    options,
                    state
                );

            });

        }

        return cell;

    }


    /* =====================================================
       7. SÉLECTION DES MAINS
       ===================================================== */

    function toggleSelection(hand, options, state) {

        if (state.selectedHands.has(hand)) {

            state.selectedHands.delete(hand);

        } else {

            state.selectedHands.add(hand);

        }

        updateSelectionDisplay(
            state.container,
            state.selectedHands
        );

        if (typeof options.onSelect === "function") {

            options.onSelect({
                hand,
                selected: state.selectedHands.has(hand),
                selectedHands: [...state.selectedHands]
            });

        }

    }


    function updateSelectionDisplay(container, selectedHands) {

        const cells = container.querySelectorAll(
            ".pl-range-cell"
        );

        cells.forEach(cell => {

            const selected = selectedHands.has(
                cell.dataset.hand
            );

            cell.classList.toggle(
                "is-selected",
                selected
            );

            cell.setAttribute(
                "aria-pressed",
                String(selected)
            );

        });

    }


    /* =====================================================
       8. LÉGENDE
       ===================================================== */

    function createLegend() {

        const legend = createElement(
            "div",
            "pl-range-legend"
        );

        const levels = [
            {
                label: "0%",
                className: "pl-range-cell--inactive"
            },
            {
                label: "1–24%",
                className: "pl-range-cell--low"
            },
            {
                label: "25–49%",
                className: "pl-range-cell--medium"
            },
            {
                label: "50–74%",
                className: "pl-range-cell--high"
            },
            {
                label: "75–100%",
                className: "pl-range-cell--very-high"
            }
        ];

        levels.forEach(level => {

            const item = createElement(
                "div",
                "pl-range-legend-item"
            );

            const swatch = createElement(
                "span",
                `pl-range-legend-swatch ${level.className}`
            );

            const label = createElement(
                "span",
                "pl-range-legend-label",
                level.label
            );

            item.appendChild(swatch);
            item.appendChild(label);

            legend.appendChild(item);

        });

        return legend;

    }


    /* =====================================================
       9. AFFICHAGE DE LA MATRICE
       ===================================================== */

    function render(container, range = {}, customOptions = {}) {

        if (!(container instanceof HTMLElement)) {

            throw new Error(
                "Conteneur de matrice invalide."
            );

        }

        const options = {
            ...DEFAULT_OPTIONS,
            ...customOptions
        };

        const normalizedRange = normalizeRange(range);

        const selectedHands = new Set(
            Array.isArray(options.selectedHands)
                ? options.selectedHands
                : []
        );

        const state = {
            container,
            selectedHands
        };

        container.replaceChildren();

        container.classList.add(
            "pl-range-matrix-container"
        );

        const matrix = createElement(
            "div",
            "pl-range-matrix"
        );

        matrix.setAttribute(
            "role",
            "grid"
        );

        matrix.setAttribute(
            "aria-label",
            "Matrice des 169 mains de poker"
        );

        for (let row = 0; row < 13; row++) {

            const rowElement = createElement(
                "div",
                "pl-range-row"
            );

            rowElement.setAttribute(
                "role",
                "row"
            );

            for (let column = 0; column < 13; column++) {

                const hand = getHandName(row, column);

                const frequency =
                    normalizedRange[hand] ?? 0;

                const cell = createCell(
                    hand,
                    frequency,
                    options,
                    state
                );

                cell.setAttribute(
                    "role",
                    "gridcell"
                );

                rowElement.appendChild(cell);

            }

            matrix.appendChild(rowElement);

        }

        container.appendChild(matrix);

        if (options.showLegend) {

            container.appendChild(
                createLegend()
            );

        }

        return {

            element: matrix,

            getSelectedHands() {
                return [...selectedHands];
            },

            clearSelection() {

                selectedHands.clear();

                updateSelectionDisplay(
                    container,
                    selectedHands
                );

            },

            selectHands(hands) {

                selectedHands.clear();

                if (Array.isArray(hands)) {

                    hands.forEach(hand => {

                        const normalized =
                            String(hand).toUpperCase();

                        if (getAllHands().includes(normalized)) {
                            selectedHands.add(normalized);
                        }

                    });

                }

                updateSelectionDisplay(
                    container,
                    selectedHands
                );

            }

        };

    }


    /* =====================================================
       10. EXPORT PUBLIC
       ===================================================== */

    return {

        render,

        getAllHands,

        getHandName,

        normalizeRange

    };

})();
