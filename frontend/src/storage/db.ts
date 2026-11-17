import Dexie, { type EntityTable } from "dexie";

export interface CacheEntry {
  key: string;
  schemaVersion: number;
  result: unknown;
  createdAt: number;
  lastAccessAt: number;
}
export interface TrainingEntry {
  id: string;
  history: unknown;
  savedAt: number;
}
export interface SettingEntry {
  key: string;
  value: unknown;
  savedAt: number;
}
export interface SpotEntry {
  id: string;
  data: unknown;
  position: string;
  savedAt: number;
}
export class PokerLabDatabase extends Dexie {
  solverCache!: EntityTable<CacheEntry, "key">;
  trainingHistory!: EntityTable<TrainingEntry, "id">;
  settings!: EntityTable<SettingEntry, "key">;
  spotLibrary!: EntityTable<SpotEntry, "id">;
  constructor() {
    super("PokerLabV2");
    this.version(1).stores({
      solverCache: "key, lastAccessAt",
      trainingHistory: "id, savedAt",
      settings: "key, savedAt",
      spotLibrary: "id, position, savedAt"
    });
  }
}
export const pokerLabDb = new PokerLabDatabase();
