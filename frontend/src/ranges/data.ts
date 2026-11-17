/** Strict TypeScript port of the validated preflop range data access module. */
export interface RangeNode {
  schemaVersion: number;
  recordType: string;
  range?: {
    comboFrequencies?: Record<string, number>;
    defaultFrequency?: number;
    classFrequencies?: Record<string, unknown>;
  };
}
export interface RangeDataset {
  status?: string;
  game?: Record<string, unknown>;
  spot?: Record<string, unknown>;
}
export interface RangeCatalog {
  schemaVersion: number;
  datasets: RangeDataset[];
}
export interface RangesDataApi {
  loadCatalog(url?: string): Promise<RangeCatalog>;
  loadNode(file: string, baseUrl?: string): Promise<RangeNode>;
  normalizeCombo(cards: unknown): string;
  toHandClass(cards: unknown): string;
  getComboFrequency(node: RangeNode | null | undefined, cards: unknown): number;
  getHandClassSummary(node: RangeNode | null | undefined, cardsOrClass: unknown): unknown;
  findDataset(catalog: RangeCatalog | null | undefined, context: Record<string, unknown>): RangeDataset | null;
  clearCache(): void;
}
const DEFAULT_CATALOG_URL = "./data/ranges/preflop/catalog/index.json";
const nodeCache = new Map<string, Promise<RangeNode>>();
const RANKS = "23456789TJQKA";
const SUITS = "cdhs";
export function normalizeCombo(cards: unknown): string {
  const raw: unknown = Array.isArray(cards) ? cards.join("") : cards;
  if (typeof raw !== "string" || !/^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/.test(raw)) {
    throw new TypeError("Combinaison physique invalide.");
  }
  const parts = [raw.slice(0, 2), raw.slice(2, 4)];
  if (parts[0] === parts[1]) throw new TypeError("Une main ne peut pas contenir deux fois la même carte.");
  parts.sort((a, b) => RANKS.indexOf(b[0] ?? "") - RANKS.indexOf(a[0] ?? "") ||
    SUITS.indexOf(a[1] ?? "") - SUITS.indexOf(b[1] ?? ""));
  return parts.join("");
}
export function toHandClass(cards: unknown): string {
  const combo = normalizeCombo(cards);
  const first = combo.slice(0, 2);
  const second = combo.slice(2, 4);
  if (first[0] === second[0]) return (first[0] ?? "") + second[0];
  const [high, low] = RANKS.indexOf(first[0] ?? "") > RANKS.indexOf(second[0] ?? "")
    ? [first[0], second[0]] : [second[0], first[0]];
  return String(high) + String(low) + (first[1] === second[1] ? "s" : "o");
}
async function loadJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error("Chargement impossible (" + response.status + ") : " + url);
  return response.json();
}
async function loadCatalog(url = DEFAULT_CATALOG_URL): Promise<RangeCatalog> {
  const catalog = await loadJson(url) as RangeCatalog;
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.datasets)) {
    throw new Error("Catalogue de ranges invalide.");
  }
  return catalog;
}
async function loadNode(file: string, baseUrl = "./"): Promise<RangeNode> {
  const url = new URL(file, new URL(baseUrl, document.baseURI)).href;
  if (!nodeCache.has(url)) {
    nodeCache.set(url, loadJson(url).then(value => {
      const node = value as RangeNode;
      if (node.schemaVersion !== 2 || node.recordType !== "preflop-range-node") {
        throw new Error("Nœud de range invalide : " + file);
      }
      return node;
    }).catch((error: unknown) => {
      nodeCache.delete(url);
      throw error;
    }));
  }
  return nodeCache.get(url)!;
}
function getComboFrequency(node: RangeNode | null | undefined, cards: unknown): number {
  const combo = normalizeCombo(cards);
  return node?.range?.comboFrequencies?.[combo] ?? node?.range?.defaultFrequency ?? 0;
}
function getHandClassSummary(node: RangeNode | null | undefined, cardsOrClass: unknown): unknown {
  const key = typeof cardsOrClass === "string" && /^(?:([AKQJT98765432])\1|[AKQJT98765432]{2}[so])$/.test(cardsOrClass)
    ? cardsOrClass : toHandClass(cardsOrClass);
  return node?.range?.classFrequencies?.[key] ?? null;
}
function findDataset(catalog: RangeCatalog | null | undefined, context: Record<string, unknown>): RangeDataset | null {
  const matches = (catalog?.datasets || []).filter(dataset => {
    if (dataset.status !== "ready") return false;
    const game = dataset.game || {};
    const spot = dataset.spot || {};
    return (["format", "tableSize", "effectiveStackBB"] as const).every(key =>
      context[key] == null || game[key] === context[key]
    ) && (["actorPosition", "actionCode", "sequenceKey"] as const).every(key =>
      context[key] == null || spot[key] === context[key]
    );
  });
  return matches.length === 1 ? matches[0] ?? null : null;
}
export function installRangesData(): RangesDataApi {
  const api: RangesDataApi = {
    loadCatalog, loadNode, normalizeCombo, toHandClass,
    getComboFrequency, getHandClassSummary, findDataset,
    clearCache() { nodeCache.clear(); }
  };
  (window as Window & { PokerLabRangesData?: RangesDataApi }).PokerLabRangesData = api;
  return api;
}
