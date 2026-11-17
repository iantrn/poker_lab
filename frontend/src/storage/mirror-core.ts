/**
 * Non-authoritative, ordered migration mirror from the V1 localStorage format
 * into the V2 IndexedDB settings table.
 *
 * Every value is read back from localStorage before mirroring: this preserves
 * JSON serialization semantics and prevents IndexedDB DataCloneError for raw
 * values that V1 silently serialized (e.g. functions, class instances).
 *
 * IndexedDB must never change the synchronous V1 storage API's return value.
 */
export interface LegacyStorageService {
  save(key: string, value: unknown): boolean;
  load(key: string, defaultValue?: unknown): unknown;
  remove(key: string): boolean;
}
export interface LocalStorageSnapshot {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}
export interface MirroredSetting {
  key: string;
  value: unknown;
  savedAt: number;
}
export interface SettingsMirrorTarget {
  put(record: MirroredSetting): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}
export interface InstalledSettingsMirror {
  /** Await all operations scheduled before this call (for tests and diagnostics). */
  whenIdle(): Promise<void>;
}

const PREFIX = "pokerlab_";
const installed = new WeakMap<LegacyStorageService, InstalledSettingsMirror>();

/**
 * Install at most once per V1 storage service. Backfill existing preferences
 * before applying subsequent writes, which are serialized independently by key.
 *
 * This is intentionally not a reverse migration or a replacement for V1:
 * modules that bypass the V1 storage API still use localStorage directly.
 */
export function attachSettingsMirror(
  service: LegacyStorageService,
  source: LocalStorageSnapshot,
  target: SettingsMirrorTarget,
  warn: (error: unknown) => void = () => {},
  now: () => number = Date.now
): InstalledSettingsMirror {
  const prior = installed.get(service);
  if (prior) return prior;

  const pending = new Map<string, Promise<void>>();
  const schedule = (key: string, operation: () => Promise<unknown>): void => {
    // A failed operation cannot block future puts/removes for the same key.
    const previous = pending.get(key) ?? Promise.resolve();
    const next = previous.then(operation).then(() => {}, warn).catch(warn);
    pending.set(key, next);
    void next.then(() => {
      if (pending.get(key) === next) pending.delete(key);
    });
  };
  const readCanonical = (key: string): {valid: boolean;value:unknown} => {
    try {
      const raw = source.getItem(PREFIX + key);
      if (raw === null) return {valid:false,value:undefined};
      return {valid:true,value:JSON.parse(raw) as unknown};
    } catch (error: unknown) {
      warn(error);
      return {valid:false,value:undefined};
    }
  };
  const queuePut = (key: string): void => {
    const snapshot = readCanonical(key);
    if (!snapshot.valid) return;
    const entry: MirroredSetting = { key, value:snapshot.value, savedAt:now() };
    schedule(key, () => target.put(entry));
  };
  const handle: InstalledSettingsMirror = {
    async whenIdle(): Promise<void> {
      await Promise.all([...pending.values()]);
    }
  };
  // Mark installed before touching storage, to avoid a double wrap on retry.
  installed.set(service, handle);
  const originalSave = service.save.bind(service);
  const originalRemove = service.remove.bind(service);
  service.save = (key: string, value: unknown): boolean => {
    const saved = originalSave(key, value);
    if (saved) queuePut(key);
    return saved;
  };
  service.remove = (key: string): boolean => {
    const removed = originalRemove(key);
    if (removed) schedule(key, () => target.delete(key));
    return removed;
  };
  // App initialization can write preferences before this mirror is installed.
  // Snapshot only the keys currently present; future updates use the wrappers.
  try {
    const existing: string[] = [];
    for (let index=0; index<source.length; index++) {
      const key=source.key(index);
      if (key?.startsWith(PREFIX) && key.length>PREFIX.length)
        existing.push(key.slice(PREFIX.length));
    }
    for (const key of existing) queuePut(key);
  } catch (error: unknown) {
    warn(error);
  }
  return handle;
}
