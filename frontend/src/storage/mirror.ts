import { pokerLabDb } from "./db";
import { attachSettingsMirror } from "./mirror-core";

type LegacyPokerLab = {
  storage?: {
    save(key:string,value:unknown):boolean;
    load(key:string,defaultValue?:unknown):unknown;
    remove(key:string):boolean;
  };
};

/**
 * V1 localStorage remains authoritative. IndexedDB is an ordered, best-effort
 * mirror: a failed write never affects game state, and a later remove cannot
 * be overwritten by a slower, earlier put. Backfill covers V1 settings saved
 * before loadLegacy() completes, including first-install preferences.
 */
export function installStorageMirror(): void {
  const global = window as Window & {PokerLab?:LegacyPokerLab};
  const storage = global.PokerLab?.storage;
  if (!storage) return;
  attachSettingsMirror(
    storage,
    localStorage,
    {
      put: record => pokerLabDb.settings.put(record),
      delete: key => pokerLabDb.settings.delete(key)
    },
    error => console.warn("[PokerLab V2] IndexedDB mirror unavailable",error)
  );
}
