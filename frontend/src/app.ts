import type { NavigationApi } from "./navigation";

/** V1-compatible application orchestration in strict TypeScript.
 * LocalStorage stays authoritative; the IndexedDB mirror is installed separately.
 */
const APP_CONFIG = {
  name: "PokerLab", version: "1.2.0", storagePrefix: "pokerlab_",
  defaultPage: "home", debug: true
} as const;
type SettingValues = Record<string, unknown>;
type Initializer = { init(): unknown };
type PokerLabRuntime = Window & {
  PokerLab?: PokerLabApi;
  PokerLabNavigation?: NavigationApi;
  PokerLabPuzzles?: Initializer;
  PokerLabLessons?: Initializer;
  PokerLabGameReview?: Initializer;
};
const runtime = (): PokerLabRuntime => window as PokerLabRuntime;

const PokerLabStorage = {
  save(key: string, value: unknown): boolean {
    try {
      localStorage.setItem(APP_CONFIG.storagePrefix + key, JSON.stringify(value));
      return true;
    } catch (error: unknown) {
      console.error("[PokerLab] Erreur de sauvegarde :", error);
      return false;
    }
  },
  load(key: string, defaultValue: unknown = null): unknown {
    try {
      const storedValue = localStorage.getItem(APP_CONFIG.storagePrefix + key);
      if (storedValue === null) return defaultValue;
      return JSON.parse(storedValue) as unknown;
    } catch (error: unknown) {
      console.error("[PokerLab] Erreur de lecture :", error);
      return defaultValue;
    }
  },
  remove(key: string): boolean {
    try {
      localStorage.removeItem(APP_CONFIG.storagePrefix + key);
      return true;
    } catch (error: unknown) {
      console.error("[PokerLab] Erreur de suppression :", error);
      return false;
    }
  }
};

const PokerLabLogger = {
  info(message: string, data: unknown = null): void {
    if (!APP_CONFIG.debug) return;
    console.info("[PokerLab]", message, data ?? "");
  },
  warn(message: string, data: unknown = null): void {
    console.warn("[PokerLab]", message, data ?? "");
  },
  error(message: string, error: unknown = null): void {
    console.error("[PokerLab]", message, error ?? "");
  }
};

const PokerLabNavigationBridge = {
  initialized: false,
  init(): boolean {
    if (this.initialized) return true;
    const navigation = runtime().PokerLabNavigation;
    if (!navigation || typeof navigation.init !== "function") {
      PokerLabLogger.error("Le composant de navigation est introuvable.");
      return false;
    }
    navigation.init();
    this.initialized = true;
    const currentPage = navigation.getCurrentPage();
    PokerLabStorage.save("lastPage", currentPage);
    window.addEventListener("pokerlab:navigate", event => {
      const page = (event as CustomEvent<{ page?: string }>).detail?.page;
      if (page) PokerLabStorage.save("lastPage", page);
    });
    PokerLabLogger.info("Navigation initialisée.", currentPage);
    return true;
  },
  navigateTo(page: string): boolean {
    const navigation = runtime().PokerLabNavigation;
    if (!navigation || typeof navigation.navigateTo !== "function") return false;
    return navigation.navigateTo(page);
  },
  getCurrentPage(): string {
    const navigation = runtime().PokerLabNavigation;
    if (!navigation || typeof navigation.getCurrentPage !== "function") return APP_CONFIG.defaultPage;
    return navigation.getCurrentPage();
  }
};

const PokerLabSettings = {
  defaults: { theme: "dark", tableColor: "red", soundEnabled: true, animationsEnabled: true },
  current: null as SettingValues | null,
  init(): void {
    const savedSettings = PokerLabStorage.load("settings", {});
    this.current = {
      ...this.defaults,
      ...(savedSettings !== null && typeof savedSettings === "object" ? savedSettings : {})
    };
    this.save();
    PokerLabLogger.info("Paramètres chargés.", this.current);
  },
  save(): void { PokerLabStorage.save("settings", this.current); },
  get(key: string): unknown { return this.current?.[key] ?? null; },
  set(key: string, value: unknown): void {
    if (!this.current) this.current = { ...this.defaults };
    this.current[key] = value;
    this.save();
    PokerLabLogger.info("Paramètre modifié : " + key, value);
  },
  reset(): void {
    this.current = { ...this.defaults };
    this.save();
    PokerLabLogger.info("Paramètres réinitialisés.");
  }
};

const PokerLabErrors = {
  init(): void {
    window.addEventListener("error", event => {
      const error = event as ErrorEvent;
      PokerLabLogger.error("Erreur JavaScript détectée.", error.error || error.message);
    });
    window.addEventListener("unhandledrejection", event => {
      PokerLabLogger.error("Erreur de promesse non gérée.", (event as PromiseRejectionEvent).reason);
    });
    PokerLabLogger.info("Gestion des erreurs initialisée.");
  }
};

const PokerLabServiceWorker = {
  registration: null as ServiceWorkerRegistration | null,
  async init(): Promise<boolean> {
    if (!("serviceWorker" in navigator)) {
      PokerLabLogger.warn("Ce navigateur ne prend pas en charge les Service Workers.");
      return false;
    }
    if (!window.isSecureContext) {
      PokerLabLogger.warn("Le Service Worker nécessite HTTPS ou localhost.");
      return false;
    }
    try {
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
      this.registration = await navigator.serviceWorker.register("./service-worker.js", {
        scope: "./", updateViaCache: "none"
      });
      await this.registration.update().catch(() => {});
      if (this.registration.waiting && navigator.serviceWorker.controller) {
        this.registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      PokerLabLogger.info("Service Worker enregistré et vérifié.", this.registration.scope);
      this.registration.addEventListener("updatefound", () => {
        const newWorker = this.registration?.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            PokerLabLogger.info("Mise à jour de PokerLab installée.");
          }
        });
      });
      return true;
    } catch (error: unknown) {
      PokerLabLogger.error("Impossible d'enregistrer le Service Worker.", error);
      return false;
    }
  }
};

const PokerLabApp = {
  initialized: false,
  async init(): Promise<void> {
    if (this.initialized) return;
    PokerLabLogger.info("Démarrage de PokerLab...");
    PokerLabErrors.init();
    PokerLabSettings.init();
    window.addEventListener("pokerlab:navigate", event => {
      const page = (event as CustomEvent<{ page?: string }>).detail?.page;
      const initializers: Record<string, Initializer | undefined> = {
        tactics: runtime().PokerLabPuzzles,
        lessons: runtime().PokerLabLessons,
        review: runtime().PokerLabGameReview
      };
      const module = page ? initializers[page] : undefined;
      if (!module || typeof module.init !== "function") return;
      Promise.resolve(module.init()).catch((error: unknown) => {
        PokerLabLogger.error('Initialisation du module "' + page + '" impossible.', error);
      });
    });
    PokerLabNavigationBridge.init();
    await PokerLabServiceWorker.init();
    this.initialized = true;
    PokerLabLogger.info("PokerLab est initialisé.", APP_CONFIG.version);
  }
};

export interface PokerLabApi {
  config: typeof APP_CONFIG; app: typeof PokerLabApp; navigation: typeof PokerLabNavigationBridge;
  settings: typeof PokerLabSettings; storage: typeof PokerLabStorage;
  logger: typeof PokerLabLogger; serviceWorker: typeof PokerLabServiceWorker; errors: typeof PokerLabErrors;
}
let installed = false;
export function installApp(): PokerLabApi {
  const target = runtime();
  if (target.PokerLab) return target.PokerLab;
  const api: PokerLabApi = {
    config: APP_CONFIG, app: PokerLabApp, navigation: PokerLabNavigationBridge,
    settings: PokerLabSettings, storage: PokerLabStorage, logger: PokerLabLogger,
    serviceWorker: PokerLabServiceWorker, errors: PokerLabErrors
  };
  target.PokerLab = api;
  if (!installed) {
    installed = true;
    const initialize = (): void => { void PokerLabApp.init(); };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
      initialize();
    }
  }
  return api;
}
