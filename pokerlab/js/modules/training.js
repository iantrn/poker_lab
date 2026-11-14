
/* =========================================================
   POKERLAB - TRAINING MODULE
   Version : 1.0.0
   Description : Configuration et gestion des sessions
                 d'entraînement contre des bots
   ========================================================= */

"use strict";

window.PokerLabTraining = (function () {

    /* =====================================================
       1. CONFIGURATION
       ===================================================== */

    const DEFAULT_CONFIG = {
        gameMode: "6max",
        playerCount: 6,
        difficulty: "medium",
        botProfile: "balanced",
        startingStack: 100,
        smallBlind: 0.5,
        bigBlind: 1
    };

    const VALID_MODES = [
        "heads-up",
        "6max"
    ];

    const VALID_DIFFICULTIES = [
        "easy",
        "medium",
        "hard"
    ];

    const VALID_PROFILES = [
        "nit",
        "tag",
        "lag",
        "balanced"
    ];

    const MIN_STACK = 20;
    const MAX_STACK = 10000;

    const EVENTS = {
        CONFIG_CHANGED: "pokerlab:training-config-changed",
        SESSION_STARTED: "pokerlab:training-started",
        SESSION_STOPPED: "pokerlab:training-stopped"
    };


    /* =====================================================
       2. ÉTAT DU MODULE
       ===================================================== */

    let initialized = false;

    let currentConfig = {
        ...DEFAULT_CONFIG
    };

    let currentSession = null;


    /* =====================================================
       3. OUTILS
       ===================================================== */

    function dispatch(eventName, detail = {}) {

        window.dispatchEvent(
            new CustomEvent(eventName, {
                detail
            })
        );

    }


    function isValidNumber(value) {

        return (
            typeof value === "number" &&
            Number.isFinite(value)
        );

    }


    function cloneConfig(config) {

        return {
            ...config
        };

    }


    function getConfig() {

        return cloneConfig(currentConfig);

    }


    /* =====================================================
       4. VALIDATION DE LA CONFIGURATION
       ===================================================== */

    function validateConfig(config) {

        const errors = [];

        if (!VALID_MODES.includes(config.gameMode)) {
            errors.push("Mode de jeu invalide.");
        }

        if (
            !Number.isInteger(config.playerCount) ||
            config.playerCount < 2 ||
            config.playerCount > 6
        ) {
            errors.push(
                "Le nombre de joueurs doit être compris entre 2 et 6."
            );
        }

        if (
            config.gameMode === "heads-up" &&
            config.playerCount !== 2
        ) {
            errors.push(
                "Le mode Heads-up nécessite exactement 2 joueurs."
            );
        }

        if (
            config.gameMode === "6max" &&
            config.playerCount < 2
        ) {
            errors.push(
                "Le mode 6-max nécessite au moins 2 joueurs."
            );
        }

        if (!VALID_DIFFICULTIES.includes(config.difficulty)) {
            errors.push("Difficulté invalide.");
        }

        if (!VALID_PROFILES.includes(config.botProfile)) {
            errors.push("Profil de bot invalide.");
        }

        if (
            !isValidNumber(config.startingStack) ||
            config.startingStack < MIN_STACK ||
            config.startingStack > MAX_STACK
        ) {
            errors.push(
                `Le tapis doit être compris entre ${MIN_STACK} et ${MAX_STACK}.`
            );
        }

        if (
            !isValidNumber(config.smallBlind) ||
            config.smallBlind <= 0
        ) {
            errors.push("La petite blind doit être positive.");
        }

        if (
            !isValidNumber(config.bigBlind) ||
            config.bigBlind <= 0
        ) {
            errors.push("La grosse blind doit être positive.");
        }

        if (config.bigBlind < config.smallBlind) {
            errors.push(
                "La grosse blind doit être supérieure ou égale à la petite blind."
            );
        }

        if (
            config.startingStack <
            config.bigBlind * 10
        ) {
            errors.push(
                "Le tapis de départ doit représenter au moins 10 grosses blinds."
            );
        }

        return {
            valid: errors.length === 0,
            errors
        };

    }


    /* =====================================================
       5. MODIFICATION DE LA CONFIGURATION
       ===================================================== */

    function updateConfig(changes = {}) {

        if (!changes || typeof changes !== "object") {

            return {
                success: false,
                errors: ["Configuration invalide."]
            };

        }

        if (currentSession) {

            return {
                success: false,
                errors: [
                    "Impossible de modifier la configuration pendant une session."
                ]
            };

        }

        const proposedConfig = {
            ...currentConfig,
            ...changes
        };

        const validation = validateConfig(proposedConfig);

        if (!validation.valid) {

            return {
                success: false,
                errors: validation.errors
            };

        }

        currentConfig = proposedConfig;

        dispatch(EVENTS.CONFIG_CHANGED, {
            config: getConfig()
        });

        return {
            success: true,
            config: getConfig()
        };

    }


    function resetConfig() {

        if (currentSession) {
            return false;
        }

        currentConfig = {
            ...DEFAULT_CONFIG
        };

        dispatch(EVENTS.CONFIG_CHANGED, {
            config: getConfig()
        });

        return true;

    }


    /* =====================================================
       6. GESTION DU MODE DE JEU
       ===================================================== */

    function setGameMode(mode) {

        if (!VALID_MODES.includes(mode)) {
            return {
                success: false,
                errors: ["Mode de jeu inconnu."]
            };
        }

        const playerCount =
            mode === "heads-up" ? 2 : 6;

        return updateConfig({
            gameMode: mode,
            playerCount
        });

    }


    /* =====================================================
       7. CRÉATION D'UNE SESSION
       ===================================================== */

    function createSession() {

        if (currentSession) {

            return {
                success: false,
                errors: [
                    "Une session est déjà en cours."
                ]
            };

        }

        const validation = validateConfig(currentConfig);

        if (!validation.valid) {

            return {
                success: false,
                errors: validation.errors
            };

        }

        const session = {
            id: createSessionId(),
            status: "active",
            startedAt: new Date().toISOString(),
            config: getConfig()
        };

        currentSession = session;

        dispatch(EVENTS.SESSION_STARTED, {
            session: getSession()
        });

        return {
            success: true,
            session: getSession()
        };

    }


    function createSessionId() {

        if (
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
        ) {
            return window.crypto.randomUUID();
        }

        return (
            `session-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 10)}`
        );

    }


    /* =====================================================
       8. ARRÊT D'UNE SESSION
       ===================================================== */

    function stopSession() {

        if (!currentSession) {
            return false;
        }

        const stoppedSession = {
            ...currentSession,
            status: "stopped",
            stoppedAt: new Date().toISOString()
        };

        currentSession = null;

        dispatch(EVENTS.SESSION_STOPPED, {
            session: stoppedSession
        });

        return true;

    }


    function getSession() {

        if (!currentSession) {
            return null;
        }

        return {
            ...currentSession,
            config: cloneConfig(currentSession.config)
        };

    }


    function isSessionActive() {

        return currentSession !== null;

    }


    /* =====================================================
       9. LIAISON AVEC L'INTERFACE
       ===================================================== */

    function bindConfigurationInputs() {

        const inputs = document.querySelectorAll(
            "[data-training-setting]"
        );

        inputs.forEach(input => {

            input.addEventListener("change", () => {

                const setting = input.dataset.trainingSetting;

                let value = input.value;

                if (
                    setting === "playerCount" ||
                    setting === "startingStack" ||
                    setting === "smallBlind" ||
                    setting === "bigBlind"
                ) {
                    value = Number(value);
                }

                const result = updateConfig({
                    [setting]: value
                });

                if (!result.success) {

                    input.value = currentConfig[setting];

                    dispatch("pokerlab:training-error", {
                        errors: result.errors
                    });

                }

            });

        });

    }


    function bindActionButtons() {

        const buttons = document.querySelectorAll(
            "[data-training-action]"
        );

        buttons.forEach(button => {

            button.addEventListener("click", () => {

                const action = button.dataset.trainingAction;

                if (action === "start") {

                    const result = createSession();

                    if (!result.success) {

                        dispatch("pokerlab:training-error", {
                            errors: result.errors
                        });

                    }

                }

                if (action === "stop") {

                    stopSession();

                }

                if (action === "reset") {

                    resetConfig();

                }

            });

        });

    }


    /* =====================================================
       10. INITIALISATION
       ===================================================== */

    function init() {

        if (initialized) {
            return;
        }

        bindConfigurationInputs();
        bindActionButtons();

        initialized = true;

    }


    /* =====================================================
       11. EXPORT PUBLIC
       ===================================================== */

    return {

        init,

        getConfig,

        updateConfig,

        resetConfig,

        validateConfig,

        setGameMode,

        createSession,

        stopSession,

        getSession,

        isSessionActive,

        EVENTS

    };

})();
