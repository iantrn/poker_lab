/* =========================================================
   POKERLAB - ACCÈS AUX DONNÉES DE RANGES PRÉFLOP
   Charge le catalogue et les nœuds normalisés sans dépendance externe.
   ========================================================= */

(function (global) {
    "use strict";

    const DEFAULT_CATALOG_URL = "./data/ranges/preflop/catalog/index.json";
    const nodeCache = new Map();

    function normalizeCombo(cards) {
        if (Array.isArray(cards)) cards = cards.join("");
        if (typeof cards !== "string" || !/^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/.test(cards)) {
            throw new TypeError("Combinaison physique invalide.");
        }
        const rankOrder = "23456789TJQKA";
        const suitOrder = "cdhs";
        const parts = [cards.slice(0, 2), cards.slice(2, 4)];
        if (parts[0] === parts[1]) throw new TypeError("Une main ne peut pas contenir deux fois la même carte.");
        parts.sort((a, b) => rankOrder.indexOf(b[0]) - rankOrder.indexOf(a[0]) || suitOrder.indexOf(a[1]) - suitOrder.indexOf(b[1]));
        return parts.join("");
    }

    function toHandClass(cards) {
        const combo = normalizeCombo(cards);
        const first = combo.slice(0, 2);
        const second = combo.slice(2, 4);
        if (first[0] === second[0]) return first[0] + second[0];
        const ranks = "23456789TJQKA";
        const [high, low] = ranks.indexOf(first[0]) > ranks.indexOf(second[0])
            ? [first[0], second[0]]
            : [second[0], first[0]];
        return `${high}${low}${first[1] === second[1] ? "s" : "o"}`;
    }

    async function loadJson(url) {
        const response = await fetch(url, { cache: "no-cache" });
        if (!response.ok) throw new Error(`Chargement impossible (${response.status}) : ${url}`);
        return response.json();
    }

    async function loadCatalog(url = DEFAULT_CATALOG_URL) {
        const catalog = await loadJson(url);
        if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.datasets)) {
            throw new Error("Catalogue de ranges invalide.");
        }
        return catalog;
    }

    async function loadNode(file, baseUrl = "./") {
        const url = new URL(file, new URL(baseUrl, document.baseURI)).href;
        if (!nodeCache.has(url)) {
            nodeCache.set(url, loadJson(url).then(node => {
                if (node.schemaVersion !== 2 || node.recordType !== "preflop-range-node") {
                    throw new Error(`Nœud de range invalide : ${file}`);
                }
                return node;
            }).catch(error => {
                nodeCache.delete(url);
                throw error;
            }));
        }
        return nodeCache.get(url);
    }

    function getComboFrequency(node, cards) {
        const combo = normalizeCombo(cards);
        return node?.range?.comboFrequencies?.[combo] ?? node?.range?.defaultFrequency ?? 0;
    }

    function getHandClassSummary(node, cardsOrClass) {
        const key = typeof cardsOrClass === "string" && /^(?:([AKQJT98765432])\1|[AKQJT98765432]{2}[so])$/.test(cardsOrClass)
            ? cardsOrClass
            : toHandClass(cardsOrClass);
        return node?.range?.classFrequencies?.[key] ?? null;
    }

    function findDataset(catalog, context) {
        const matches = (catalog?.datasets || []).filter(dataset => {
            if (dataset.status !== "ready") return false;
            const game = dataset.game || {};
            const spot = dataset.spot || {};
            return ["format", "tableSize", "effectiveStackBB"].every(key =>
                context[key] == null || game[key] === context[key]
            ) && ["actorPosition", "actionCode", "sequenceKey"].every(key =>
                context[key] == null || spot[key] === context[key]
            );
        });
        return matches.length === 1 ? matches[0] : null;
    }

    global.PokerLabRangesData = {
        loadCatalog,
        loadNode,
        normalizeCombo,
        toHandClass,
        getComboFrequency,
        getHandClassSummary,
        findDataset,
        clearCache() { nodeCache.clear(); }
    };
})(window);
