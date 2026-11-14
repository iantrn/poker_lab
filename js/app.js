
/* =========================================================
   POKERLAB - APPLICATION PRINCIPALE
   Version : 1.1.0
   ========================================================= */

"use strict";


/* =========================================================
   1. CONFIGURATION GÉNÉRALE
   ========================================================= */

const APP_CONFIG = {

    name: "PokerLab",

    version: "1.1.0",

    storagePrefix: "pokerlab_",

    defaultPage: "home",

    debug: true

};


/* =========================================================
   2. GESTION DU STOCKAGE LOCAL
   ========================================================= */

const PokerLabStorage = {

    save(key, value) {

        try {

            const storageKey =
                APP_CONFIG.storagePrefix + key;

            localStorage.setItem(
                storageKey,
                JSON.stringify(value)
            );

            return true;

        } catch (error) {

            console.error(
                "[PokerLab] Erreur de sauvegarde :",
                error
            );

            return false;

        }

    },


    load(key, defaultValue = null) {

        try {

            const storageKey =
                APP_CONFIG.storagePrefix + key;

            const storedValue =
                localStorage.getItem(storageKey);

            if (storedValue === null) {
                return defaultValue;
            }

            return JSON.parse(storedValue);

        } catch (error) {

            console.error(
                "[PokerLab] Erreur de lecture :",
                error
            );

            return defaultValue;

        }

    },


    remove(key) {

        try {

            const storageKey =
                APP_CONFIG.storagePrefix + key;

            localStorage.removeItem(storageKey);

            return true;

        } catch (error) {

            console.error(
                "[PokerLab] Erreur de suppression :",
                error
            );

            return false;

        }

    }

};


/* =========================================================
   3. SYSTÈME DE JOURNALISATION
   ========================================================= */

const PokerLabLogger = {

    info(message, data = null) {

        if (!APP_CONFIG.debug) {
            return;
        }

        console.info(
            "[PokerLab]",
            message,
            data ?? ""
        );

    },


    warn(message, data = null) {

        console.warn(
            "[PokerLab]",
            message,
            data ?? ""
        );

    },


    error(message, error = null) {

        console.error(
            "[PokerLab]",
            message,
            error ?? ""
        );

    }

};


/* =========================================================
   4. GESTION DE LA NAVIGATION
   ========================================================= */

const PokerLabNavigation = {

    initialized: false,


    init() {

        if (this.initialized) {
            return true;
        }

        if (
            !window.PokerLabNavigation ||
            typeof window.PokerLabNavigation.init !== "function"
        ) {

            PokerLabLogger.error(
                "Le composant de navigation est introuvable."
            );

            return false;

        }

        window.PokerLabNavigation.init();

        this.initialized = true;

        const currentPage =
            window.PokerLabNavigation.getCurrentPage();

        PokerLabStorage.save(
            "lastPage",
            currentPage
        );

        window.addEventListener(
            "pokerlab:navigate",
            event => {

                const page = event.detail?.page;

                if (page) {

                    PokerLabStorage.save(
                        "lastPage",
                        page
                    );

                }

            }
        );

        PokerLabLogger.info(
            "Navigation initialisée.",
            currentPage
        );

        return true;

    },


    navigateTo(page) {

        if (
            !window.PokerLabNavigation ||
            typeof window.PokerLabNavigation.navigateTo !== "function"
        ) {
            return false;
        }

        return window.PokerLabNavigation.navigateTo(page);

    },


    getCurrentPage() {

        if (
            !window.PokerLabNavigation ||
            typeof window.PokerLabNavigation.getCurrentPage !== "function"
        ) {
            return APP_CONFIG.defaultPage;
        }

        return window.PokerLabNavigation.getCurrentPage();

    }

};


/* =========================================================
   5. GESTION DES PARAMÈTRES
   ========================================================= */

const PokerLabSettings = {

    defaults: {

        theme: "dark",

        tableColor: "red",

        soundEnabled: true,

        animationsEnabled: true

    },


    current: null,


    init() {

        const savedSettings =
            PokerLabStorage.load(
                "settings",
                {}
            );

        this.current = {

            ...this.defaults,

            ...savedSettings

        };

        this.save();

        PokerLabLogger.info(
            "Paramètres chargés.",
            this.current
        );

    },


    save() {

        PokerLabStorage.save(
            "settings",
            this.current
        );

    },


    get(key) {

        return this.current?.[key] ?? null;

    },


    set(key, value) {

        if (!this.current) {
            this.current = { ...this.defaults };
        }

        this.current[key] = value;

        this.save();

        PokerLabLogger.info(
            "Paramètre modifié : " + key,
            value
        );

    },


    reset() {

        this.current = {
            ...this.defaults
        };

        this.save();

        PokerLabLogger.info(
            "Paramètres réinitialisés."
        );

    }

};


/* =========================================================
   6. GESTION DES ERREURS
   ========================================================= */

const PokerLabErrors = {

    init() {

        window.addEventListener(
            "error",
            event => {

                PokerLabLogger.error(
                    "Erreur JavaScript détectée.",
                    event.error || event.message
                );

            }
        );

        window.addEventListener(
            "unhandledrejection",
            event => {

                PokerLabLogger.error(
                    "Erreur de promesse non gérée.",
                    event.reason
                );

            }
        );

        PokerLabLogger.info(
            "Gestion des erreurs initialisée."
        );

    }

};


/* =========================================================
   7. ENREGISTREMENT DU SERVICE WORKER
   ========================================================= */

const PokerLabServiceWorker = {

    registration: null,


    async init() {

        if (!("serviceWorker" in navigator)) {

            PokerLabLogger.warn(
                "Ce navigateur ne prend pas en charge les Service Workers."
            );

            return false;

        }

        if (!window.isSecureContext) {

            PokerLabLogger.warn(
                "Le Service Worker nécessite HTTPS ou localhost."
            );

            return false;

        }

        try {

            // Listen before registration: an update can take control immediately.
            let refreshing = false;
            navigator.serviceWorker.addEventListener("controllerchange", () => {
                if (refreshing) return;
                refreshing = true;
                window.location.reload();
            });

            this.registration = await navigator.serviceWorker.register(
                "./service-worker.js",
                {
                    scope: "./",
                    updateViaCache: "none"
                }
            );

            // Explicitly check the worker script on every app opening.
            await this.registration.update().catch(() => {});

            // If an update is already waiting, activate it now.
            if (this.registration.waiting && navigator.serviceWorker.controller) {
                this.registration.waiting.postMessage({ type: "SKIP_WAITING" });
            }

            PokerLabLogger.info(
                "Service Worker enregistré et vérifié.",
                this.registration.scope
            );

            this.registration.addEventListener("updatefound", () => {
                const newWorker = this.registration.installing;
                if (!newWorker) return;
                newWorker.addEventListener("statechange", () => {
                    if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                        PokerLabLogger.info("Mise à jour de PokerLab installée.");
                    }
                });
            });

            return true;

        } catch (error) {

            PokerLabLogger.error(
                "Impossible d'enregistrer le Service Worker.",
                error
            );

            return false;

        }

    }

};


/* =========================================================
   8. INITIALISATION DE L'APPLICATION
   ========================================================= */

const PokerLabApp = {

    initialized: false,


    async init() {

        if (this.initialized) {
            return;
        }

        PokerLabLogger.info(
            "Démarrage de PokerLab..."
        );

        PokerLabErrors.init();

        PokerLabSettings.init();

        PokerLabNavigation.init();

        await PokerLabServiceWorker.init();

        this.initialized = true;

        PokerLabLogger.info(
            "PokerLab est initialisé.",
            APP_CONFIG.version
        );

    }

};


/* =========================================================
   9. EXPOSITION DES MODULES
   ========================================================= */

window.PokerLab = {

    config: APP_CONFIG,

    app: PokerLabApp,

    navigation: PokerLabNavigation,

    settings: PokerLabSettings,

    storage: PokerLabStorage,

    logger: PokerLabLogger,

    serviceWorker: PokerLabServiceWorker,

    errors: PokerLabErrors

};


/* =========================================================
   10. DÉMARRAGE AUTOMATIQUE
   ========================================================= */

function initializePokerLabApp() {

    PokerLabApp.init();

}

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        initializePokerLabApp,
        { once: true }
    );

} else {

    initializePokerLabApp();

}
