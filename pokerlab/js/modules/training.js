
/* =========================================================
   POKERLAB - TRAINING MODULE
   Version : 2.2.0
   Description : Parties Texas Hold'em contre des bots
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
        startingStackBB: 100
    };

    const VALID_MODES = ["heads-up", "6max"];
    const VALID_DIFFICULTIES = ["easy", "medium", "hard"];
    const VALID_PROFILES = ["nit", "tag", "lag", "balanced"];
    const VALID_STACKS_BB = [20, 40, 50, 100, 200];

    const SMALL_BLIND = 0.5;
    const BIG_BLIND = 1;

    const HERO_ID = "hero";

    const EVENTS = {
        CONFIG_CHANGED: "pokerlab:training-config-changed",
        SESSION_STARTED: "pokerlab:training-started",
        SESSION_STOPPED: "pokerlab:training-stopped",
        ERROR: "pokerlab:training-error"
    };


    /* =====================================================
       2. ÉTAT DU MODULE
       ===================================================== */

    let initialized = false;

    let currentConfig = {
        ...DEFAULT_CONFIG
    };

    let currentSession = null;
    let gameEngine = null;

    let configurationElement = null;
    let gameElement = null;
    let tableElement = null;
    let actionsElement = null;
    let messageElement = null;


    /* =====================================================
       3. OUTILS GÉNÉRAUX
       ===================================================== */

    function dispatch(eventName, detail = {}) {

        window.dispatchEvent(
            new CustomEvent(eventName, { detail })
        );

    }


    function getConfig() {

        return { ...currentConfig };

    }


    function getStartingStack(config = currentConfig) {

        return config.startingStackBB;

    }


    function formatChips(amount) {

        return Number(amount).toLocaleString("fr-FR");

    }


    function createElement(tag, className, text) {

        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined && text !== null) {
            element.textContent = String(text);
        }

        return element;

    }


    function showMessage(message, type = "info") {

        if (!messageElement) {
            return;
        }

        messageElement.textContent = message;
        messageElement.classList.remove("hidden");

        messageElement.classList.remove(
            "text-red-400",
            "text-green-400",
            "text-textMuted"
        );

        if (type === "error") {
            messageElement.classList.add("text-red-400");
        } else if (type === "success") {
            messageElement.classList.add("text-green-400");
        } else {
            messageElement.classList.add("text-textMuted");
        }

    }


    function showError(errors) {

        const message = Array.isArray(errors)
            ? errors.join(" ")
            : String(errors);

        showMessage(message, "error");

        dispatch(EVENTS.ERROR, {
            errors: Array.isArray(errors) ? errors : [message]
        });

    }


    function hideMessage() {

        if (!messageElement) {
            return;
        }

        messageElement.textContent = "";
        messageElement.classList.add("hidden");

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
            (config.playerCount < 2 || config.playerCount > 6)
        ) {
            errors.push(
                "Le mode 6-max accepte entre 2 et 6 joueurs."
            );
        }

        if (!VALID_DIFFICULTIES.includes(config.difficulty)) {
            errors.push("Difficulté invalide.");
        }

        if (!VALID_STACKS_BB.includes(config.startingStackBB)) {
            errors.push(
                "Le tapis doit être de 20, 40, 50, 100 ou 200 BB."
            );
        }

        return {
            valid: errors.length === 0,
            errors
        };

    }


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
                    "Impossible de modifier la configuration pendant une partie."
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
            config: getConfig(),
            startingStack: getStartingStack(),
            smallBlind: SMALL_BLIND,
            bigBlind: BIG_BLIND
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

        synchronizeConfigurationInputs();

        dispatch(EVENTS.CONFIG_CHANGED, {
            config: getConfig(),
            startingStack: getStartingStack(),
            smallBlind: SMALL_BLIND,
            bigBlind: BIG_BLIND
        });

        hideMessage();

        return true;

    }


    function setGameMode(mode) {

        if (!VALID_MODES.includes(mode)) {
            return {
                success: false,
                errors: ["Mode de jeu inconnu."]
            };
        }

        const playerCount = mode === "heads-up"
            ? 2
            : 6;

        const result = updateConfig({
            gameMode: mode,
            playerCount
        });

        if (result.success) {
            synchronizeConfigurationInputs();
        }

        return result;

    }


    /* =====================================================
       5. CONFIGURATION DE L'INTERFACE
       ===================================================== */

    function synchronizeConfigurationInputs() {

        const inputs = document.querySelectorAll(
            "[data-training-setting]"
        );

        inputs.forEach(input => {

            const setting = input.dataset.trainingSetting;

            if (Object.prototype.hasOwnProperty.call(
                currentConfig,
                setting
            )) {
                input.value = String(currentConfig[setting]);
            }

        });

    }


    function bindConfigurationInputs() {

        const inputs = document.querySelectorAll(
            "[data-training-setting]"
        );

        inputs.forEach(input => {

            input.addEventListener("change", () => {

                const setting = input.dataset.trainingSetting;

                if (setting === "gameMode") {

                    const result = setGameMode(input.value);

                    if (!result.success) {
                        showError(result.errors);
                    } else {
                        hideMessage();
                    }

                    return;

                }

                let value = input.value;

                if (
                    setting === "playerCount" ||
                    setting === "startingStackBB"
                ) {
                    value = Number(value);
                }

                const result = updateConfig({
                    [setting]: value
                });

                if (!result.success) {

                    input.value = String(currentConfig[setting]);

                    showError(result.errors);

                } else {

                    hideMessage();

                }

            });

        });

        synchronizeConfigurationInputs();

    }


    /* =====================================================
       6. ATTRIBUTION ALÉATOIRE DES PROFILS
       ===================================================== */

    function shuffleArray(array) {

        const shuffled = [...array];

        for (let i = shuffled.length - 1; i > 0; i--) {

            const randomIndex = Math.floor(
                Math.random() * (i + 1)
            );

            [
                shuffled[i],
                shuffled[randomIndex]
            ] = [
                shuffled[randomIndex],
                shuffled[i]
            ];

        }

        return shuffled;

    }


    function assignBotProfiles(botCount) {

        const assignments = [];

        while (assignments.length < botCount) {

            const shuffledProfiles = shuffleArray(VALID_PROFILES);

            assignments.push(...shuffledProfiles);

        }

        return assignments.slice(0, botCount);

    }


    /* =====================================================
       7. CRÉATION DE LA SESSION
       ===================================================== */

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


    function createPlayers(config) {

        const players = [];

        const startingStack = getStartingStack(config);

        const botCount = config.playerCount - 1;
        const botProfiles = assignBotProfiles(botCount);

        players.push({
            id: HERO_ID,
            name: "Vous",
            stack: startingStack,
            isHuman: true,
            isBot: false
        });

        for (let i = 1; i < config.playerCount; i++) {

            players.push({
                id: `bot_${i}`,
                name: `Bot ${i}`,
                stack: startingStack,
                isHuman: false,
                isBot: true,
                botProfile: botProfiles[i - 1],
                botDifficulty: config.difficulty
            });

        }

        return players;

    }


    function createSession() {

        if (currentSession) {
            return {
                success: false,
                errors: ["Une partie est déjà en cours."]
            };
        }

        const validation = validateConfig(currentConfig);

        if (!validation.valid) {
            return {
                success: false,
                errors: validation.errors
            };
        }

        try {

            const players = createPlayers(currentConfig);

            gameEngine = new window.PokerLabGameEngine({
                players,
                smallBlind: SMALL_BLIND,
                bigBlind: BIG_BLIND,
                dealerIndex: 0
            });

            currentSession = {
                id: createSessionId(),
                status: "active",
                startedAt: new Date().toISOString(),
                config: {
                    ...getConfig(),
                    startingStack: getStartingStack(),
                    smallBlind: SMALL_BLIND,
                    bigBlind: BIG_BLIND
                },
                botProfiles: players
                    .filter(player => player.isBot)
                    .map(player => ({
                        playerId: player.id,
                        profile: player.botProfile
                    }))
            };

            if (configurationElement) {
                configurationElement.classList.add("hidden");
            }

            if (gameElement) {
                gameElement.classList.remove("hidden");
            }

            hideMessage();

            const state = gameEngine.startHand();

            renderGame(state);
            processBotTurns();

            dispatch(EVENTS.SESSION_STARTED, {
                session: getSession()
            });

            return {
                success: true,
                session: getSession()
            };

        } catch (error) {

            gameEngine = null;
            currentSession = null;

            if (configurationElement) {
                configurationElement.classList.remove("hidden");
            }

            if (gameElement) {
                gameElement.classList.add("hidden");
            }

            return {
                success: false,
                errors: [error.message]
            };

        }

    }


    /**
 * Affiche la table de jeu.
 */
    function renderGame(state = null) {
    if (!gameEngine || !tableElement) {
        return;
    }

    const gameState = state || gameEngine.getState();

    window.PokerLabTable.render(
        tableElement,
        gameState
    );

    renderGameActions(gameState);

    // MASQUER la configuration quand la table est affichée
    if (configurationElement) {
        configurationElement.classList.add('hidden');
    }
    if (gameElement) {
        gameElement.classList.remove('hidden');
    }
}

    /* =====================================================
       9. AFFICHAGE DES COMMANDES DU JOUEUR
       ===================================================== */

    function createActionButton(label, action, options = {}) {

        const button = createElement(
            "button",
            options.className ||
                "bg-primary hover:bg-primaryHover text-white font-semibold rounded-lg px-5 py-3 transition",
            label
        );

        button.type = "button";
        button.addEventListener("click", action);

        return button;

    }


    function renderGameActions(state) {

        if (!actionsElement) {
            return;
        }

        actionsElement.replaceChildren();

        if (state.handComplete) {

            renderHandResult(state);

            const playersWithChips = state.players.filter(
                player => player.stack > 0
            );

            if (playersWithChips.length >= 2) {

                const nextHandButton = createActionButton(
                    "Main suivante",
                    startNextHand
                );

                actionsElement.appendChild(nextHandButton);

            } else {

                const endMessage = createElement(
                    "p",
                    "text-yellow-400 font-semibold",
                    "La partie est terminée : il ne reste plus assez de joueurs avec des jetons."
                );

                actionsElement.appendChild(endMessage);

            }

            return;

        }

        const currentPlayer = state.players.find(
            player => player.id === state.currentPlayerId
        );

        if (!currentPlayer) {
            return;
        }

        if (!currentPlayer.isHuman) {

            const waiting = createElement(
                "p",
                "text-textMuted text-sm",
                `Au tour de ${currentPlayer.name}...`
            );

            actionsElement.appendChild(waiting);

            return;

        }

        const actionOptions = currentPlayer.actionOptions;

        if (!actionOptions) {
            return;
        }

        const heading = createElement(
            "h4",
            "font-bold text-lg mb-3",
            "À vous de jouer"
        );

        actionsElement.appendChild(heading);

        const information = createElement(
            "p",
            "text-textMuted text-sm mb-4",
            actionOptions.callAmount > 0
                ? `Vous devez ajouter ${formatChips(actionOptions.callAmount)} jetons pour suivre.`
                : "Aucune mise à égaliser : vous pouvez checker."
        );

        actionsElement.appendChild(information);

        const buttonsContainer = createElement(
            "div",
            "flex flex-wrap gap-3"
        );

        if (actionOptions.canFold) {

            buttonsContainer.appendChild(
                createActionButton(
                    "Se coucher",
                    () => executePlayerAction("fold"),
                    {
                        className:
                            "bg-red-700 hover:bg-red-600 text-white font-semibold rounded-lg px-5 py-3 transition"
                    }
                )
            );

        }

        if (actionOptions.canCheck) {

            buttonsContainer.appendChild(
                createActionButton(
                    "Checker",
                    () => executePlayerAction("check")
                )
            );

        }

        if (actionOptions.canCall) {

            buttonsContainer.appendChild(
                createActionButton(
                    `Suivre (${formatChips(actionOptions.callAmount)})`,
                    () => executePlayerAction("call")
                )
            );

        }

        if (actionOptions.canBet || actionOptions.canRaise) {

            renderBetControls(
                buttonsContainer,
                actionOptions
            );

        }

        if (actionOptions.isAllIn) {

            buttonsContainer.appendChild(
                createActionButton(
                    "All-in",
                    () => executePlayerAction("all-in"),
                    {
                        className:
                            "bg-yellow-600 hover:bg-yellow-500 text-white font-semibold rounded-lg px-5 py-3 transition"
                    }
                )
            );

        }

        actionsElement.appendChild(buttonsContainer);

    }


    function renderBetControls(container, options) {

        const betContainer = createElement(
            "div",
            "flex flex-wrap items-center gap-2 w-full mt-3"
        );

        const amountInput = createElement(
            "input",
            "bg-background border border-white/10 rounded-lg px-3 py-3 w-32"
        );

        amountInput.type = "number";
        amountInput.min = "1";
        amountInput.step = "0.5";
        amountInput.inputMode = "decimal";
        amountInput.setAttribute("aria-label", "Montant de la mise");

        let actionType;
        let minimum;
        let maximum;

        if (options.canBet) {

            actionType = "bet";
            minimum = options.minimumBet;
            maximum = options.maximumBet;

        } else {

            actionType = "raise";
            minimum = options.minimumRaiseTo;
            maximum = options.maximumRaiseTo;

        }

        amountInput.min = String(minimum);
        amountInput.max = String(maximum);
        amountInput.value = String(
            Math.min(maximum, minimum)
        );

        const label = createElement(
            "span",
            "text-sm text-textMuted",
            actionType === "bet"
                ? "Montant de la mise"
                : "Relancer à"
        );

        const submitButton = createActionButton(
            actionType === "bet" ? "Miser" : "Relancer",
            () => {

                const amount = Number(amountInput.value);

                if (
                    !Number.isFinite(amount) ||
                    amount < minimum ||
                    amount > maximum
                ) {
                    showError([
                        `Le montant doit être compris entre ${formatChips(minimum)} et ${formatChips(maximum)}.`
                    ]);

                    return;
                }

                executePlayerAction(actionType, amount);

            }
        );

        betContainer.appendChild(label);
        betContainer.appendChild(amountInput);
        betContainer.appendChild(submitButton);

        container.appendChild(betContainer);

    }


    /* =====================================================
       10. EXÉCUTION DES ACTIONS
       ===================================================== */

    function executePlayerAction(action, amount = null) {

        if (!gameEngine || !currentSession) {
            return;
        }

        try {

            gameEngine.act(
                action,
                amount,
                HERO_ID
            );

            hideMessage();
            renderGame();
            processBotTurns();

        } catch (error) {

            showError([error.message]);

        }

    }


    /* =====================================================
       11. TOUR AUTOMATIQUE DES BOTS
       ===================================================== */

    function processBotTurns() {

        if (!gameEngine || !currentSession) {
            return;
        }

        let state = gameEngine.getState();
        let safetyCounter = 0;

        try {

            while (
                !state.handComplete &&
                state.currentPlayerId &&
                safetyCounter < 100
            ) {

                const currentPlayer = gameEngine.players.find(
                    player => player.id === state.currentPlayerId
                );

                if (!currentPlayer || !currentPlayer.isBot) {
                    break;
                }

                gameEngine.playBotTurn(currentPlayer.id);

                state = gameEngine.getState();
                safetyCounter++;

            }

            if (safetyCounter >= 100) {
                throw new Error(
                    "La progression automatique des bots a été interrompue."
                );
            }

            renderGame(state);

        } catch (error) {

            showError([
                "Erreur pendant le tour des bots : " + error.message
            ]);

        }

    }


    /* =====================================================
       12. RÉSULTAT DE LA MAIN
       ===================================================== */

    function renderHandResult(state) {

        if (!state.result) {
            return;
        }

        const result = state.result;

        const resultContainer = createElement(
            "div",
            "bg-background border border-white/10 rounded-xl p-4 mb-4"
        );

        const title = createElement(
            "h4",
            "font-bold text-lg mb-2",
            "Résultat de la main"
        );

        resultContainer.appendChild(title);

        const winners = state.players.filter(
            player => result.winnerIds.includes(player.id)
        );

        const winnerNames = winners.map(
            player => player.name
        );

        const winnerText = createElement(
            "p",
            "text-green-400 font-semibold mb-2",
            winnerNames.length > 0
                ? `Gagnant${winnerNames.length > 1 ? "s" : ""} : ${winnerNames.join(", ")}`
                : "Main terminée"
        );

        resultContainer.appendChild(winnerText);

        const potText = createElement(
            "p",
            "text-textMuted text-sm",
            `Pot remporté : ${formatChips(result.totalPot)} jetons`
        );

        resultContainer.appendChild(potText);

        if (result.type === "showdown") {

            const showdownText = createElement(
                "p",
                "text-textMuted text-sm mt-2",
                "Les cartes ont été révélées à l'abattage."
            );

            resultContainer.appendChild(showdownText);

        }

        actionsElement.appendChild(resultContainer);

    }


    /* =====================================================
       13. MAIN SUIVANTE
       ===================================================== */

    function startNextHand() {

        if (!gameEngine || !currentSession) {
            return;
        }

        try {

            const state = gameEngine.nextHand();

            hideMessage();
            renderGame(state);
            processBotTurns();

        } catch (error) {

            showError([error.message]);

        }

    }


    /* =====================================================
       14. ARRÊT DE LA SESSION
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
        gameEngine = null;

        if (configurationElement) {
            configurationElement.classList.remove("hidden");
        }

        if (gameElement) {
            gameElement.classList.add("hidden");
        }

        if (tableElement) {
            tableElement.replaceChildren();
        }

        if (actionsElement) {
            actionsElement.replaceChildren();
        }

        hideMessage();

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
            config: { ...currentSession.config },
            botProfiles: currentSession.botProfiles
                ? currentSession.botProfiles.map(profile => ({ ...profile }))
                : []
        };

    }


    function isSessionActive() {

        return currentSession !== null;

    }


    /* =====================================================
       15. LIAISON DES BOUTONS
       ===================================================== */

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
                        showError(result.errors);
                    }

                }

                if (action === "stop") {
                    stopSession();
                }

                if (action === "reset") {

                    const success = resetConfig();

                    if (!success) {
                        showError([
                            "Impossible de réinitialiser pendant une partie."
                        ]);
                    }

                }

            });

        });

    }


    /* =====================================================
       16. INITIALISATION
       ===================================================== */

    function init() {

        if (initialized) {
            return;
        }

        configurationElement = document.getElementById(
            "training-configuration"
        );

        gameElement = document.getElementById(
            "training-game"
        );

        tableElement = document.getElementById(
            "training-table"
        );

        actionsElement = document.getElementById(
            "training-actions"
        );

        messageElement = document.getElementById(
            "training-message"
        );

        if (
            !configurationElement ||
            !gameElement ||
            !tableElement ||
            !actionsElement ||
            !messageElement
        ) {
            console.error(
                "[PokerLab] Interface d'entraînement introuvable."
            );

            return;
        }

        if (
            !window.PokerLabGameEngine ||
            !window.PokerLabTable ||
            !window.PokerLabBotEngine
        ) {
            console.error(
                "[PokerLab] Un ou plusieurs modules nécessaires au jeu ne sont pas chargés."
            );

            return;
        }

        bindConfigurationInputs();
        bindActionButtons();

        initialized = true;

        console.info(
            "[PokerLab] Module d'entraînement initialisé."
        );

    }


    /* =====================================================
       17. EXPORT PUBLIC
       ===================================================== */

    return {

        init,

        getConfig,

        getStartingStack,

        updateConfig,

        resetConfig,

        validateConfig,

        setGameMode,

        createSession,

        stopSession,

        getSession,

        isSessionActive,

        getGameState() {
            return gameEngine
                ? gameEngine.getState()
                : null;
        },

        getHandHistory() {
            return gameEngine
                ? gameEngine.getHandHistory()
                : [];
        },

        EVENTS

    };

})();


/* =========================================================
   18. INITIALISATION AUTOMATIQUE
   ========================================================= */

function initializePokerLabTraining() {

    window.PokerLabTraining.init();

}

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        initializePokerLabTraining,
        { once: true }
    );

} else {

    initializePokerLabTraining();

}
