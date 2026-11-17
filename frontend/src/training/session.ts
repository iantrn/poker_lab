
/* =========================================================
   POKERLAB - TRAINING MODULE
   Version : 2.2.0
   Description : Parties Texas Hold'em contre des bots
   ========================================================= */

"use strict";

import type { PokerLabGameEngine, InputPlayer, GameActionOptions } from "../core/game-engine";

export interface TrainingConfig {
  gameMode: string;
  playerCount: number;
  difficulty: string;
  startingStackBB: number;
  [key: string]: string | number;
}
export type GameState = ReturnType<PokerLabGameEngine["getState"]>;
export interface TrainingSession {
  id: string;
  status: string;
  startedAt: string;
  config: TrainingConfig & { startingStack: number; smallBlind: number; bigBlind: number };
  botProfiles: Array<{ playerId: string; profile?: string }>;
}
interface HistoryEvent {
  type: string; street: string; timestamp: number;
  data: Record<string, unknown>;
}
interface SavedHandResponse { success?: boolean; error?: string; errors?: unknown; }
export interface TrainingApi {
  init(): void;
  getConfig(): TrainingConfig;
  getStartingStack(config?: TrainingConfig): number;
  updateConfig(changes?: Partial<TrainingConfig>): {success:boolean;errors?:string[];config?:TrainingConfig};
  resetConfig(): boolean;
  validateConfig(config: TrainingConfig): { valid:boolean; errors:string[] };
  setGameMode(mode: string): {success:boolean;errors?:string[];config?:TrainingConfig};
  createSession(): {success:boolean;errors?:string[];session?:TrainingSession|null};
  stopSession(): boolean;
  getSession(): TrainingSession|null;
  isSessionActive(): boolean;
  getGameState(): GameState|null;
  getHandHistory(): HistoryEvent[];
  EVENTS: Record<string,string>;
}
type TrainingGlobals = Window & {
  PokerLabTraining?: TrainingApi;
  PokerLabGameEngine?: typeof PokerLabGameEngine;
  PokerLabTable?: {render(container: HTMLElement, state: GameState): void};
  PokerLabBotEngine?: unknown;
  PokerLabGameReview?: {saveHand(hand: unknown):SavedHandResponse};
};
function createTraining(globals: TrainingGlobals): TrainingApi {

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

    let currentConfig: TrainingConfig = {
        ...DEFAULT_CONFIG
    };

    let currentSession: TrainingSession | null = null;
    let gameEngine: PokerLabGameEngine | null = null;
    const savedHandKeys = new Set<string>();

    let configurationElement: HTMLElement | null = null;
    let gameElement: HTMLElement | null = null;
    let tableElement: HTMLElement | null = null;
    let actionsElement: HTMLElement | null = null;
    let messageElement: HTMLElement | null = null;


    /* =====================================================
       3. OUTILS GÉNÉRAUX
       ===================================================== */

    function dispatch(eventName: string, detail: unknown = {}): void {

        window.dispatchEvent(
            new CustomEvent(eventName, { detail })
        );

    }


    function getConfig(): TrainingConfig {

        return { ...currentConfig };

    }


    function getStartingStack(config: TrainingConfig = currentConfig): number {

        return config.startingStackBB;

    }


    function formatChips(amount: unknown): string {

        return Number(amount).toLocaleString("fr-FR");

    }


    function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: unknown = undefined): HTMLElementTagNameMap[K] {

        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined && text !== null) {
            element.textContent = String(text);
        }

        return element;

    }


    function showMessage(message: string, type: "info" | "success" | "error" = "info"): void {

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


    function showError(errors: unknown): void {

        const message = Array.isArray(errors)
            ? errors.join(" ")
            : String(errors);

        showMessage(message, "error");

        dispatch(EVENTS.ERROR, {
            errors: Array.isArray(errors) ? errors : [message]
        });

    }


    function hideMessage(): void {

        if (!messageElement) {
            return;
        }

        messageElement.textContent = "";
        messageElement.classList.add("hidden");

    }


    /* =====================================================
       4. VALIDATION DE LA CONFIGURATION
       ===================================================== */

    function validateConfig(config: TrainingConfig): {valid:boolean; errors:string[]} {

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


    function updateConfig(changes: Partial<TrainingConfig> = {}) {

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

        const proposedConfig: TrainingConfig = {
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


    function resetConfig(): boolean {

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


    function setGameMode(mode: string) {

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

    function synchronizeConfigurationInputs(): void {

        const inputs = document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
            "[data-training-setting]"
        );

        inputs.forEach(input => {

            const setting = input.dataset.trainingSetting ?? "";

            if (Object.prototype.hasOwnProperty.call(
                currentConfig,
                setting
            )) {
                input.value = String(currentConfig[setting]);
            }

        });

    }


    function bindConfigurationInputs(): void {

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

                let value: string | number = input.value;

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

    function shuffleArray<T>(array: readonly T[]): T[] {

        const shuffled: T[] = [...array];

        for (let i = shuffled.length - 1; i > 0; i--) {

            const randomIndex = Math.floor(
                Math.random() * (i + 1)
            );

            [
                shuffled[i],
                shuffled[randomIndex]
            ] = [
                shuffled[randomIndex]!,
                shuffled[i]!
            ];

        }

        return shuffled;

    }


    function assignBotProfiles(botCount: number): string[] {

        const assignments: string[] = [];

        while (assignments.length < botCount) {

            const shuffledProfiles = shuffleArray(VALID_PROFILES);

            assignments.push(...shuffledProfiles);

        }

        return assignments.slice(0, botCount);

    }


    /* =====================================================
       7. CRÉATION DE LA SESSION
       ===================================================== */

    function createSessionId(): string {

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


    function createPlayers(config: TrainingConfig): InputPlayer[] {

        const players: InputPlayer[] = [];

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

            gameEngine = new globals.PokerLabGameEngine!({
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

        } catch (caught: unknown) {
            const error = caught instanceof Error ? caught : new Error(String(caught));

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


    function saveCompletedHand(state: GameState | null): boolean {

        if (
            !state ||
            !state.handComplete ||
            !currentSession ||
            !gameEngine ||
            !globals.PokerLabGameReview ||
            typeof globals.PokerLabGameReview.saveHand !== "function"
        ) {
            return false;
        }

        const handKey = `${currentSession.id}-${state.handNumber}`;
        if (savedHandKeys.has(handKey)) return true;

        const actionAliases: Record<string,string> = {
            all_in_call: "call",
            short_raise: "raise",
            short_all_in_bet: "all-in"
        };

        const actions = (gameEngine.getHandHistory() as HistoryEvent[])
            .filter(event => event && event.type === "player_action" && event.data)
            .map(event => {
                const rawAction = String(event.data.action || "");
                const action = actionAliases[rawAction] || rawAction;
                const amount = Number(event.data.amount);

                const snapshot: Record<string,number> = {};
                [
                    "potBefore",
                    "potAfter",
                    "currentBetBefore",
                    "currentBetAfter",
                    "streetBetBefore",
                    "streetBetAfter",
                    "stackBefore",
                    "stackAfter",
                    "totalContributionBefore",
                    "totalContributionAfter"
                ].forEach(key => {
                    const value = event.data[key];
                    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
                        snapshot[key] = value;
                    }
                });

                return {
                    street: event.street,
                    playerId: event.data.playerId,
                    playerName: event.data.playerName || event.data.playerId,
                    type: action,
                    ...(Number.isFinite(amount) && amount >= 0 ? { amount } : {}),
                    ...snapshot,
                    timestamp: event.timestamp
                };
            })
            .filter(action =>
                ["preflop", "flop", "turn", "river"].includes(action.street) &&
                ["fold", "check", "call", "bet", "raise", "all-in"].includes(action.type)
            );

        const players = state.players.map(player => ({
            id: player.id,
            name: player.name,
            position: player.position || null,
            stack: player.stack,
            streetBet: player.streetBet,
            totalContribution: player.totalContribution,
            folded: Boolean(player.folded),
            allIn: Boolean(player.allIn),
            ...(Array.isArray(player.holeCards)
                ? { holeCards: player.holeCards.map(card => ({ ...card })) }
                : {})
        }));

        const hand = {
            id: handKey,
            sessionId: currentSession.id,
            handNumber: state.handNumber,
            gameMode: currentSession.config?.gameMode || null,
            blinds: {
                smallBlind: currentSession.config?.smallBlind ?? SMALL_BLIND,
                bigBlind: currentSession.config?.bigBlind ?? BIG_BLIND
            },
            startingStackBB: currentSession.config?.startingStackBB ?? null,
            players,
            board: Array.isArray(state.board)
                ? state.board.map(card => ({ ...card }))
                : [],
            actions,
            result: state.result || null
        };

        const saved = globals.PokerLabGameReview.saveHand(hand);
        if (!saved || !saved.success) {
            console.warn("[PokerLab] Main terminée non enregistrée :", saved?.errors || saved?.error);
            return false;
        }

        savedHandKeys.add(handKey);
        return true;

    }


    /**
 * Affiche la table de jeu.
 */
function renderGame(state: GameState | null = null): void {
    if (!gameEngine || !tableElement) {
        return;
    }

    const gameState = state || gameEngine.getState();

    saveCompletedHand(gameState);

    globals.PokerLabTable!.render(tableElement, gameState);

    // Mount the action panel inside the table container, below the hero cards.
    const actionMount = tableElement.querySelector<HTMLElement>(".pl-hero-actions-mount");
    if (actionMount && actionsElement && actionsElement.parentElement !== actionMount) {
        actionMount.appendChild(actionsElement);
    }

    renderGameActions(gameState);

    dispatch("pokerlab:table-state-changed", { state: gameState });

    // Masquer la configuration
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

    function createActionButton(label: string, action: (event: MouseEvent) => void, options: {className?:string} = {}): HTMLButtonElement {

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


    function renderGameActions(state: GameState): void {

        if (!actionsElement) {
            return;
        }

        actionsElement.replaceChildren();
        actionsElement.classList.add("pl-action-panel");

        if (state.handComplete) {

            renderHandResult(state);

            const playersWithChips = state.players.filter(
                player => player.stack > 0
            );

            if (playersWithChips.length >= 2) {
                actionsElement.appendChild(
                    createActionButton("Main suivante", startNextHand)
                );
            } else {
                actionsElement.appendChild(
                    createElement(
                        "p",
                        "text-yellow-400 font-semibold",
                        "La partie est terminée : il ne reste plus assez de joueurs avec des jetons."
                    )
                );
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
            actionsElement.appendChild(
                createElement(
                    "p",
                    "text-textMuted text-sm",
                    `Au tour de ${currentPlayer.name}...`
                )
            );
            return;
        }

        const actionOptions = currentPlayer.actionOptions;

        if (!actionOptions) {
            return;
        }

        // Les quatre actions sont regroupées sur une seule ligne.
        const buttonsContainer = createElement("div", "pl-action-buttons");

        if (actionOptions.canFold) {
            buttonsContainer.appendChild(
                createActionButton(
                    "Se coucher",
                    () => executePlayerAction("fold"),
                    { className: "pl-action-btn pl-action-btn-fold" }
                )
            );
        }

        if (actionOptions.canCall) {
            buttonsContainer.appendChild(
                createActionButton(
                    `Suivre (${formatChips(actionOptions.callAmount)})`,
                    () => executePlayerAction("call"),
                    { className: "pl-action-btn pl-action-btn-call" }
                )
            );
        } else if (actionOptions.canCheck) {
            buttonsContainer.appendChild(
                createActionButton(
                    "Checker",
                    () => executePlayerAction("check"),
                    { className: "pl-action-btn pl-action-btn-check" }
                )
            );
        }

        let betControls = null;

        if (actionOptions.canBet || actionOptions.canRaise) {
            betControls = renderBetControls(actionOptions, state);

            buttonsContainer.appendChild(
                createActionButton(
                    actionOptions.canBet ? "Miser" : "Relancer",
                    betControls.submit,
                    { className: "pl-action-btn pl-action-btn-raise" }
                )
            );
        }

        if (actionOptions.isAllIn) {
            buttonsContainer.appendChild(
                createActionButton(
                    "Tapis",
                    () => executePlayerAction("all-in"),
                    { className: "pl-action-btn pl-action-btn-allin" }
                )
            );
        }

        actionsElement.appendChild(buttonsContainer);

        // Le réglage du montant se trouve immédiatement sous la ligne de boutons.
        if (betControls) {
            actionsElement.appendChild(betControls.element);
        }

    }


    function renderBetControls(options: GameActionOptions, state: GameState): {element:HTMLElement;submit():void} {

        const betContainer = createElement("div", "pl-action-bet-controls");
        const actionType = options.canBet ? "bet" : "raise";
        const minimum = options.canBet ? options.minimumBet : options.minimumRaiseTo;
        const maximum = options.canBet ? options.maximumBet : options.maximumRaiseTo;
        const isPreflop = state.street === "preflop";
        const currentBet = Number(state.currentBet) || 0;
        const isPreflopOpenRaise = isPreflop && currentBet <= BIG_BLIND;

        const amountInput = createElement("input", "pl-bet-number");
        amountInput.type = "number";
        amountInput.min = String(minimum);
        amountInput.max = String(maximum);
        amountInput.step = "0.5";
        amountInput.inputMode = "decimal";
        amountInput.setAttribute("aria-label", "Montant de la mise ou de la relance");
        amountInput.value = String(Math.min(maximum, Math.max(minimum, minimum)));

        const slider = createElement("input", "pl-bet-slider");
        slider.type = "range";
        slider.min = String(minimum);
        slider.max = String(maximum);
        slider.step = "0.5";
        slider.value = amountInput.value;
        slider.setAttribute("aria-label", "Ajuster le montant de la mise ou de la relance");

        const amountValue = createElement(
            "strong",
            "pl-bet-current-value",
            `${formatChips(Number(amountInput.value))} BB`
        );

        const label = createElement(
            "span",
            "pl-bet-label",
            actionType === "bet" ? "Montant de la mise" : "Montant de la relance"
        );

        const normalizeAmount = (value: unknown): number | null => {
            const parsed = Number(String(value).replace(",", "."));
            if (!Number.isFinite(parsed)) return null;

            const bounded = Math.min(maximum, Math.max(minimum, parsed));
            const rounded = Math.round(bounded * 2) / 2;

            return Number(Math.min(maximum, Math.max(minimum, rounded)).toFixed(1));
        };

        const syncAmount = (value: unknown): void => {
            const normalized = normalizeAmount(value);
            if (normalized === null) return;

            amountInput.value = String(normalized);
            slider.value = String(normalized);
            amountValue.textContent = `${formatChips(normalized)} BB`;
        };

        const presets = createElement("div", "pl-bet-presets");
        presets.setAttribute("aria-label", "Tailles de mise prédéfinies");
        presets.style.gridColumn = "1 / -1";
        const presetDefinitions: Array<{label:string;value:number}> = [];

        if (isPreflopOpenRaise) {
            presetDefinitions.push(
                { label: "2 BB", value: 2 },
                { label: "2,5 BB", value: 2.5 },
                { label: "3 BB", value: 3 },
                { label: "4 BB", value: 4 }
            );
        } else if (isPreflop) {
            presetDefinitions.push(
                { label: "3×", value: currentBet * 3 },
                { label: "3,5×", value: currentBet * 3.5 },
                { label: "4×", value: currentBet * 4 }
            );
        } else {
            const potFractions = [
                { label: "¼ pot", fraction: 0.25 },
                { label: "⅓ pot", fraction: 1 / 3 },
                { label: "½ pot", fraction: 0.5 },
                { label: "⅔ pot", fraction: 2 / 3 },
                { label: "¾ pot", fraction: 0.75 },
                { label: "Pot", fraction: 1 }
            ];

            const potBeforeAction = Math.max(0, Number(state.pot) || 0);
            const potAfterCall = potBeforeAction + (actionType === "raise"
                ? Math.max(0, Number(options.callAmount) || 0)
                : 0);

            potFractions.forEach((preset) => {
                const sizingBase = actionType === "raise"
                    ? potAfterCall
                    : potBeforeAction;
                const value = actionType === "raise"
                    ? currentBet + sizingBase * preset.fraction
                    : sizingBase * preset.fraction;

                presetDefinitions.push({
                    label: preset.label,
                    value
                });
            });
        }

        presetDefinitions.forEach((preset) => {
            const button = createElement(
                "button",
                "pl-bet-preset",
                preset.label
            );

            button.type = "button";

            // Une taille prédéfinie inférieure au minimum légal ne doit pas
            // être sélectionnable (notamment les petits sizings postflop).
            const presetAmount = Math.round(Number(preset.value) * 2) / 2;
            const isBelowMinimum = presetAmount < minimum - 0.000001;

            if (isBelowMinimum) {
                button.disabled = true;
                button.setAttribute("aria-disabled", "true");
                button.title = `${actionType === "bet" ? "Mise" : "Relance"} minimale : ${formatChips(minimum)}`;
            } else {
                button.addEventListener("click", () => {
                    syncAmount(preset.value);
                });
            }

            presets.appendChild(button);
        });

        amountInput.addEventListener("input", () => {
            if (amountInput.value !== "") {
                syncAmount(amountInput.value);
            }
        });

        amountInput.addEventListener("change", () => {
            if (amountInput.value === "") {
                syncAmount(minimum);
            } else {
                syncAmount(amountInput.value);
            }
        });

        slider.addEventListener("input", () => syncAmount(slider.value));

        const sliderRow = createElement("div", "pl-bet-slider-row");
        sliderRow.append(slider, amountValue);

        betContainer.append(label, presets, sliderRow, amountInput);

        return {
            element: betContainer,
            submit() {
                const amount = normalizeAmount(amountInput.value);

                if (amount === null || amount < minimum || amount > maximum) {
                    showError([
                        `Le montant doit être compris entre ${formatChips(minimum)} et ${formatChips(maximum)}.`
                    ]);
                    return;
                }

                executePlayerAction(actionType, amount);
            }
        };
    }

    /* =====================================================
       10. EXÉCUTION DES ACTIONS
       ===================================================== */

    function executePlayerAction(action: string, amount: number | null = null): void {

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

        } catch (caught: unknown) {
            const error = caught instanceof Error ? caught : new Error(String(caught));

            showError([error.message]);

        }

    }


    /* =====================================================
       11. TOUR AUTOMATIQUE DES BOTS
       ===================================================== */

    function processBotTurns(): void {

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

        } catch (caught: unknown) {
            const error = caught instanceof Error ? caught : new Error(String(caught));

            showError([
                "Erreur pendant le tour des bots : " + error.message
            ]);

        }

    }


    /* =====================================================
       12. RÉSULTAT DE LA MAIN
       ===================================================== */

    function renderHandResult(state: GameState): void {

        if (!state.result) {
            return;
        }

        const result = state.result as {type:string;winnerIds:string[];totalPot:number};

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

        actionsElement!.appendChild(resultContainer);

    }


    /* =====================================================
       13. MAIN SUIVANTE
       ===================================================== */

    function startNextHand(): void {

        if (!gameEngine || !currentSession) {
            return;
        }

        try {

            const state = gameEngine.nextHand();

            hideMessage();
            renderGame(state);
            processBotTurns();

        } catch (caught: unknown) {
            const error = caught instanceof Error ? caught : new Error(String(caught));

            showError([error.message]);

        }

    }


    /* =====================================================
       14. ARRÊT DE LA SESSION
       ===================================================== */

    function stopSession(): boolean {

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
        dispatch("pokerlab:table-state-changed", { state: null });

        return true;

    }


    function getSession(): TrainingSession | null {

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


    function isSessionActive(): boolean {

        return currentSession !== null;

    }


    /* =====================================================
       15. LIAISON DES BOUTONS
       ===================================================== */

    function bindActionButtons(): void {

        const buttons = document.querySelectorAll<HTMLElement>(
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

    function init(): void {

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
            !globals.PokerLabGameEngine ||
            !globals.PokerLabTable ||
            !globals.PokerLabBotEngine
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
}

/** Install the typed module at the same point in the V1 dependency order. */
export function installTraining(): TrainingApi {
    const globals = window as TrainingGlobals;
    if (globals.PokerLabTraining) return globals.PokerLabTraining;
    const api = createTraining(globals);
    globals.PokerLabTraining = api;
    const initialize = (): void => { api.init(); };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, {once:true});
    } else {
        initialize();
    }
    return api;
}
