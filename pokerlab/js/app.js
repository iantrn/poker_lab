
/* =========================================================
   POKERLAB - APPLICATION PRINCIPALE
   Version : 1.0.0
   ========================================================= */

"use strict";


/* =========================================================
   1. CONFIGURATION GÉNÉRALE
   ========================================================= */

const APP_CONFIG = {

    name: "PokerLab",

    version: "1.0.0",

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

    currentPage: APP_CONFIG.defaultPage,


    init() {

        this.currentPage =
            window.location.hash.replace("#", "") ||
            APP_CONFIG.defaultPage;

        this.updateNavigation();

        window.addEventListener(
            "hashchange",
            () => {

                this.currentPage =
                    window.location.hash.replace("#", "") ||
                    APP_CONFIG.defaultPage;

                this.updateNavigation();

            }
        );

        window.addEventListener(
            "popstate",
            () => {

                this.currentPage =
                    window.location.hash.replace("#", "") ||
                    APP_CONFIG.defaultPage;

                this.updateNavigation();

            }
        );

        PokerLabLogger.info(
            "Navigation initialisée."
        );

    },


    updateNavigation() {

        const navigationLinks =
            document.querySelectorAll(
                "nav a[href^='#']"
            );

        navigationLinks.forEach((link) => {

            const targetPage =
                link.getAttribute("href").replace("#", "");

            const isActive =
                targetPage === this.currentPage;

            link.classList.toggle(
                "text-white",
                isActive
            );

            link.classList.toggle(
                "text-textMuted",
                !isActive
            );

        });

        PokerLabStorage.save(
            "lastPage",
            this.currentPage
        );

    },


    navigateTo(page) {

        if (!page) {
            return;
        }

        window.location.hash = page;

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
            (event) => {

                PokerLabLogger.error(
                    "Erreur JavaScript détectée.",
                    event.error || event.message
                );

            }
        );

        window.addEventListener(
            "unhandledrejection",
            (event) => {

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

        // Vérifier la prise en charge des Service Workers.

        if (!("serviceWorker" in navigator)) {

            PokerLabLogger.warn(
                "Ce navigateur ne prend pas en charge les Service Workers."
            );

            return false;

        }

        // Vérifier que l'application utilise un contexte sécurisé.

        if (!window.isSecureContext) {

            PokerLabLogger.warn(
                "Le Service Worker nécessite HTTPS ou localhost."
            );

            return false;

        }

        try {

            // Enregistrement du Service Worker.

            this.registration =
                await navigator.serviceWorker.register(
                    "./service-worker.js",
                    {
                        scope: "./"
                    }
                );

            PokerLabLogger.info(
                "Service Worker enregistré.",
                this.registration.scope
            );

            // Détecter les nouvelles versions.

            this.registration.addEventListener(
                "updatefound",
                () => {

                    const newWorker =
                        this.registration.installing;

                    if (!newWorker) {
                        return;
                    }

                    newWorker.addEventListener(
                        "statechange",
                        () => {

                            if (
                                newWorker.state === "installed" &&
                                navigator.serviceWorker.controller
                            ) {

                                PokerLabLogger.info(
                                    "Une nouvelle version de PokerLab est disponible."
                                );

                            }

                        }
                    );

                }
            );

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

        // Initialisation de la gestion des erreurs.

        PokerLabErrors.init();

        // Chargement des paramètres utilisateur.

        PokerLabSettings.init();

        // Initialisation de la navigation.

        PokerLabNavigation.init();

        // Enregistrement du Service Worker.

        await PokerLabServiceWorker.init();

        this.initialized = true;

        PokerLabLogger.info(
            "PokerLab est initialisé.",
            APP_CONFIG.version
        );

    }

};


/* =========================================================
   9. DÉMARRAGE AUTOMATIQUE
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        PokerLabApp.init();

    }
);


/* =========================================================
   10. EXPOSITION DES MODULES
   ========================================================= */

window.PokerLab = {

    config: APP_CONFIG,

    app: PokerLabApp,

    navigation: PokerLabNavigation,

    settings: PokerLabSettings,

    storage: PokerLabStorage,

    logger: PokerLabLogger,

    serviceWorker: PokerLabServiceWorker

};
