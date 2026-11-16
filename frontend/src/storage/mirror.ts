import { pokerLabDb } from "./db";

type StorageService = {
  save(key: string, value: unknown): boolean;
  load(key: string, defaultValue?: unknown): unknown;
  remove(key: string): boolean;
};
type LegacyPokerLab = { storage?: StorageService };

// localStorage remains authoritative until parity and IndexedDB migrations are proven.
// This best-effort mirror never changes V1 return values or makes gameplay asynchronous.
export function installStorageMirror(): void {
  const global = window as Window & { PokerLab?: LegacyPokerLab };
  const storage = global.PokerLab?.storage;
  if (!storage) return;
  const originalSave = storage.save.bind(storage);
  const originalRemove = storage.remove.bind(storage);
  storage.save = (key, value) => {
    const saved = originalSave(key, value);
    if (saved) {
      void pokerLabDb.settings.put({ key, value, savedAt: Date.now() })
        .catch((error: unknown) => console.warn("[PokerLab V2] IndexedDB mirror unavailable", error));
    }
    return saved;
  };
  storage.remove = (key) => {
    const removed = originalRemove(key);
    if (removed) void pokerLabDb.settings.delete(key)
      .catch((error: unknown) => console.warn("[PokerLab V2] IndexedDB deletion unavailable", error));
    return removed;
  };
}
