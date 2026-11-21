/* =========================================================
   POKERLAB - POSTFLOP SOLVER UI
   Injects the SOLVE action only on an eligible human turn.
   ========================================================= */
"use strict";

import type { PrecomputeApi, PrecomputeSnapshot } from "../solver/precompute";

interface SolverPlayer {
  id: unknown;
  isHuman?: boolean;
  folded?: boolean;
  holeCards?: unknown[];
}
interface SolverGameState {
  handComplete?: boolean;
  street: string;
  players: SolverPlayer[];
  currentPlayerId: unknown;
  handNumber?: number;
}
interface SolverTraining {
  getGameState(): SolverGameState | null;
  getHandHistory(): unknown;
}
interface EquityResult {
  equity: number;
  wins: number;
  ties: number;
  losses: number;
  iterations: number;
  rangeLabel: string;
  decision: {potOdds:number;action:string;explanation:string};
  note: string;
}
interface StrategyAction {
  action: string; frequency: number; ev: number; evLower95: number; evUpper95: number;
}
interface StrategyResult {
  actions: StrategyAction[];
  street: string; iterations: number;
  sampledHeroHands: number; sampledOpponentHands: number;
  evaluationSamples: number; treeNodes: number;
  heroRangeLabel: string; actualHandInHeroRange: boolean;
  sampledActualHeroHand: number; heroRangeEffectiveSampleSize: number;
  rangeLabel: string; rangeConditioning: string;
  heroEV: number; heroEVLower95: number; heroEVUpper95: number;
  evaluationMethod: string; nashConv: number; exploitability: number;
  exploitabilitySamples: number; exploitabilityEffectiveSampleSize: number;
  heroDeviationGain: number; opponentDeviationGain: number;
  exploitabilityMethod: string; postflopActionsUsed: number;
  abstraction: string; convergence: string;
  /** Absent/false for all Monte Carlo solvers; only an independent exact
   * full-game proof could ever enable this flag. */
  fullGameGtoCertified?: boolean;
  certificationScope?: string;
}
type SolverWindow = Window & {
  PokerLabTraining?: SolverTraining;
  PokerLabPostflopSolver?: {
    createInput(state: SolverGameState | null, history: unknown): unknown;
  };
  PokerLabSolverPrecompute?: PrecomputeApi;
};
let installed = false;
/** V1-compatible solver dialog with typed state, EV and CFR+ result contracts. */
export function installPostflopSolverUI(): void {
  if (installed) return;
  installed = true;
  const global = window as SolverWindow;
    let observer: MutationObserver | null = null;
    let busy = false;
    let activeStateKey: string | null = null;
    let pendingRerun = false;

    function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function eligible(state: SolverGameState | null): boolean {
        if (!state || state.handComplete || !["flop", "turn", "river"].includes(state.street)) return false;
        const hero = state.players.find(player => player.isHuman);
        if (!hero || state.currentPlayerId !== hero.id || !Array.isArray(hero.holeCards) || hero.holeCards.length !== 2) {
            return false;
        }
        const active = state.players.filter(player => !player.folded);
        return active.length >= 2 && active.length <= 6;
    }

    function stateKey(state: SolverGameState | null): string {
        if (!state) return "";
        try {
            return JSON.stringify(global.PokerLabPostflopSolver!.createInput(
                state,
                global.PokerLabTraining!.getHandHistory()
            )) ?? "";
        } catch (error) {
            return String(state.handNumber) + ":" + String(state.street);
        }
    }

    function renderResult(container: HTMLElement, result: EquityResult, strategy: StrategyResult | null = null, strategyError: string | null = null): void {
        container.replaceChildren();

        const heading = element("h4", "pl-solve-heading", "Stratégie");
        const summary = element("p", "pl-solve-summary",
            strategy
                ? "Fréquences estimées — CFR+ sur arbre abstrait"
                : "Fréquences stratégiques indisponibles pour cette situation.");
        const certification = element("p","pl-solve-detail-note",
            "GTO intégral non certifié : les fréquences reposent sur un jeu abstrait et un échantillonnage de mains, pas sur une preuve d’équilibre du No-Limit Hold’em.");
        certification.setAttribute("role","status");

        const frequencies = element("div", "pl-solve-frequencies nct-frequency-list");
        if (strategy && Array.isArray(strategy.actions) && strategy.actions.length) {
            strategy.actions.forEach(item => {
                const row = element("div", "pl-solve-frequency-row");
                row.dataset.strategyAction = item.action.toLowerCase();
                const action = element("span", "pl-solve-frequency-action", item.action);
                const value = element("strong", "pl-solve-frequency-value",
                    (item.frequency * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %");
                // The bar is purely visual: show the exact original frequency
                // numerically and clamp only the painted width to [0,100].
                const track = element("div", "pl-solve-frequency-track");
                track.setAttribute("aria-hidden", "true");
                const fill = element("span", "pl-solve-frequency-fill");
                fill.style.width = String(Math.min(100, Math.max(0, item.frequency * 100))) + "%";
                track.appendChild(fill);
                row.append(action, value, track);
                frequencies.appendChild(row);
            });
        } else {
            frequencies.appendChild(element("p", "pl-solve-unavailable",
                strategyError
                    ? "Erreur de calcul : " + strategyError
                    : "Aucune fréquence d'action n'a été retournée."));
        }

        const detailsButton = element("button", "pl-solve-details-toggle", "Afficher tous les détails");
        detailsButton.type = "button";
        detailsButton.setAttribute("aria-expanded", "false");

        const details = element("div", "pl-solve-details hidden");
        details.setAttribute("aria-label", "Détails de l'analyse");

        const equityHeading = element("h5", "pl-solve-details-heading", "Équité");
        const equity = element("p", "pl-solve-detail-line",
            (result.equity * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %");
        const range = element("p", "pl-solve-detail-line", "Range adverse : " + result.rangeLabel);
        const stats = element("p", "pl-solve-detail-line",
            result.wins + " victoires · " + result.ties + " égalités · " +
            result.losses + " défaites sur " + result.iterations.toLocaleString("fr-FR") + " simulations");
        const odds = result.decision.potOdds > 0
            ? "Pot odds : " + (result.decision.potOdds * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %"
            : "Aucune mise à payer";
        details.append(equityHeading, equity, range, stats,
            element("p", "pl-solve-detail-line", odds));

        if (strategy) {
            details.append(
                element("h5", "pl-solve-details-heading", "Détails stratégiques — " + strategy.street),
                element("p", "pl-solve-detail-line",
                    strategy.iterations + " itérations CFR+ · " +
                    strategy.sampledHeroHands + " mains héros échantillonnées · " +
                    strategy.sampledOpponentHands + " mains adverses échantillonnées · " +
                    strategy.evaluationSamples + " évaluations indépendantes · " +
                    strategy.treeNodes + " nœuds moyens dans l'arbre"),
                element("p", "pl-solve-detail-line",
                    "Range héros : " + strategy.heroRangeLabel +
                    " · main réelle incluse : " + (strategy.actualHandInHeroRange ? "oui" : "non") +
                    " · échantillons de la main réelle : " +
                    strategy.sampledActualHeroHand + "/" + strategy.sampledHeroHands +
                    " · ESS pondéré : " + strategy.heroRangeEffectiveSampleSize.toLocaleString("fr-FR", { maximumFractionDigits: 1 })),
                element("p", "pl-solve-detail-line",
                    "Range adverse : " + strategy.rangeLabel),
                element("p", "pl-solve-detail-line", strategy.rangeConditioning)
            );

            strategy.actions.forEach(item => {
                details.appendChild(element("p", "pl-solve-detail-line",
                    item.action + " : " +
                    (item.frequency * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " % · EV " +
                    item.ev.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " jetons · IC 95 % [" +
                    item.evLower95.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " ; " +
                    item.evUpper95.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + "]"));
            });

            details.append(
                element("p", "pl-solve-detail-line pl-solve-detail-emphasis",
                    "EV estimée depuis cette décision : " +
                    strategy.heroEV.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " jetons · IC 95 % [" +
                    strategy.heroEVLower95.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " ; " +
                    strategy.heroEVUpper95.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + "]"),
                element("p", "pl-solve-detail-line", strategy.evaluationMethod),
                ...(Number.isFinite(strategy.nashConv) ? [
                    element("h5", "pl-solve-details-heading", "Diagnostic de meilleure réponse"),
                    element("p", "pl-solve-detail-line pl-solve-detail-emphasis",
                        "NashConv estimée : " +
                        strategy.nashConv.toLocaleString("fr-FR", { maximumFractionDigits: 3 }) +
                        " jetons · exploitabilité estimée : " +
                        strategy.exploitability.toLocaleString("fr-FR", { maximumFractionDigits: 3 }) +
                        " jetons · " + strategy.exploitabilitySamples + " deals indépendants · ESS " +
                        strategy.exploitabilityEffectiveSampleSize.toLocaleString("fr-FR", { maximumFractionDigits: 1 })),
                    element("p", "pl-solve-detail-line",
                        "Gain d'une déviation optimale estimée — héros : +" +
                        strategy.heroDeviationGain.toLocaleString("fr-FR", { maximumFractionDigits: 3 }) +
                        " · adversaire : +" +
                        strategy.opponentDeviationGain.toLocaleString("fr-FR", { maximumFractionDigits: 3 }) +
                        " jetons par main."),
                    element("p", "pl-solve-detail-line", strategy.exploitabilityMethod)
                ] : []),
                element("p", "pl-solve-detail-line",
                    strategy.postflopActionsUsed
                        ? strategy.postflopActionsUsed + " actions postflop adverses intégrées à l'ajustement heuristique de la range."
                        : "Aucune action postflop adverse antérieure à cette décision à intégrer."),
                element("p", "pl-solve-detail-line", strategy.abstraction),
                element("p", "pl-solve-detail-line", strategy.convergence)
            );
        } else {
            details.append(
                element("h5", "pl-solve-details-heading", "Piste heuristique"),
                element("p", "pl-solve-detail-line", result.decision.action + " — " + result.decision.explanation)
            );
            if (strategyError) {
                details.appendChild(element("p", "pl-solve-detail-line pl-solve-detail-error",
                    "Analyse stratégique indisponible : " + strategyError));
            }
        }

        details.appendChild(element("p", "pl-solve-detail-note", result.note));

        detailsButton.addEventListener("click", () => {
            const expanded = details.classList.contains("hidden");
            details.classList.toggle("hidden", !expanded);
            detailsButton.textContent = expanded ? "Masquer les détails" : "Afficher tous les détails";
            detailsButton.setAttribute("aria-expanded", String(expanded));
        });

        const overview = element("header", "nct-solver-overview");
        const intro = element("div", "nct-solver-intro");
        intro.append(heading, summary);
        const metric = element("div", "nct-solver-metric");
        metric.append(element("span", "", "Équité estimée"), element("strong", "",
            (result.equity * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %"));
        overview.append(intro, metric);
        const strategyPanel = element("section", "nct-solver-strategy");
        strategyPanel.setAttribute("aria-label", "Fréquences des actions");
        strategyPanel.append(frequencies);
        const disclosure = element("footer", "nct-solver-disclosure");
        disclosure.append(certification, detailsButton, details);
        container.append(overview, strategyPanel, disclosure);
    }

    function renderProgress(panel:HTMLElement,snapshot:PrecomputeSnapshot):void {
        const percentage=Math.max(0,Math.min(100,Math.floor((snapshot.progress??0)*100)));
        const phase=snapshot.phase==="equity"?"Équité Monte-Carlo":
            snapshot.stage==="strategy_training"?"Entraînement CFR+":
            snapshot.stage==="strategy_evaluation"?"Évaluation indépendante":
            snapshot.stage==="strategy_diagnostics"?"Diagnostic stratégique":
            "Analyse stratégique";
        const heading=element("p","pl-solve-summary",phase+" · "+percentage+" %");
        heading.setAttribute("role","status");
        const children:HTMLElement[]=[heading];
        if(snapshot.previewActions?.length){
            children.push(element("p","pl-solve-detail-note",
                "Fréquences provisoires — stratégie échantillonnée non convergée."));
            const frequencies=element("div","pl-solve-frequencies");
            for(const action of snapshot.previewActions){
                const row=element("div","pl-solve-frequency-row");
                row.append(element("span","pl-solve-frequency-action",action.action),
                    element("strong","pl-solve-frequency-value",
                        (action.frequency*100).toLocaleString("fr-FR",
                            {maximumFractionDigits:1})+" %"));
                frequencies.append(row);
            }
            children.push(frequencies);
        }
        panel.replaceChildren(...children);
    }

    async function run(button: HTMLButtonElement, panel: HTMLElement): Promise<void> {
        if (busy || !global.PokerLabSolverPrecompute) return;
        busy = true;
        button.disabled = true;
        button.textContent = "Analyse en cours…";
        panel.classList.remove("hidden");
        panel.textContent = "Récupération du pré-calcul ou démarrage de l'analyse…";
        const initialState = global.PokerLabTraining!.getGameState();
        const initialKey = stateKey(initialState);
        activeStateKey = initialKey;
        const unsubscribe = global.PokerLabSolverPrecompute!.subscribe(snapshot => {
            if (!button.isConnected || !panel.isConnected || !dialogIsOpen(panel) ||
                snapshot.key !== initialKey || activeStateKey !== initialKey ||
                stateKey(global.PokerLabTraining!.getGameState()) !== initialKey) return;
            if(snapshot.phase==="equity"||snapshot.phase==="strategy"){
                renderProgress(panel,snapshot);
            }else if(snapshot.phase==="complete"){
                panel.textContent="Analyse terminée.";
            }
        });
        try {
            const result = await global.PokerLabSolverPrecompute!.getOrStart();
            const latestState = global.PokerLabTraining!.getGameState();
            if (!button.isConnected || stateKey(latestState) !== initialKey) {
                if (button.isConnected) panel.replaceChildren(element("p", "text-sm text-textMuted",
                    "La situation a changé pendant le calcul. Le résultat obsolète a été écarté."));
                return;
            }
            renderResult(panel, result.equity as EquityResult, result.strategy as StrategyResult | null, result.strategyError);
        } catch (caught: unknown) {
            const error = caught instanceof Error ? caught : new Error(String(caught));
            if (button.isConnected) panel.replaceChildren(element(
                "p",
                error.name === "AbortError" ? "text-sm text-textMuted" : "text-red-400 text-sm",
                error.name === "AbortError" ? "La situation a changé. Une nouvelle analyse est en préparation." : error.message
            ));
        } finally {
            unsubscribe();
            activeStateKey = null;
            busy = false;
            if (button.isConnected) {
                button.disabled = false;
                button.textContent = "Solver";
                button.disabled = !eligible(global.PokerLabTraining!.getGameState());
            }
            // When a bot action changes the public state while a dialog is
            // open, don't ask the user to close/reopen it. The previous Worker
            // has been terminated by precompute.onStateChange(). Re-solve
            // automatically for the latest eligible snapshot.
            const nextState=global.PokerLabTraining!.getGameState();
            const shouldRestart=pendingRerun&&button.isConnected &&
                dialogIsOpen(panel)&&eligible(nextState)&&
                stateKey(nextState)!==initialKey;
            pendingRerun=false;
            if(shouldRestart)void run(button,panel);
        }
    }

    function dialogIsOpen(panel: HTMLElement): boolean {
        const dialog = panel && panel.closest<HTMLDialogElement>("[data-postflop-dialog]");
        return Boolean(dialog && dialog.open);
    }

    function sync(): void {
        const actions = document.getElementById("training-actions");
        if (!actions || !global.PokerLabTraining || !global.PokerLabPostflopSolver) return;
        // Keep the real modal in the permanent dock, not in the action bar.
        // Re-rendering action controls must never destroy an open analysis.
        const host = document.getElementById("training-solver-dock") ?? actions;
        const state = global.PokerLabTraining!.getGameState();
        const currentKey = stateKey(state);
        if (global.PokerLabSolverPrecompute) global.PokerLabSolverPrecompute.onStateChange();
        if (busy && activeStateKey && currentKey !== activeStateKey) activeStateKey = null;

        const oldButton = host.querySelector<HTMLButtonElement>("[data-postflop-solve]");
        const oldDialog = host.querySelector<HTMLDialogElement>("[data-postflop-dialog]");
        const oldPanel = host.querySelector<HTMLElement>("[data-postflop-result]");

        const canAnalyse = eligible(state);
        if (!canAnalyse) {
            pendingRerun = false;
            if (oldDialog?.open) oldDialog.close();
            if (oldButton) {
                oldButton.disabled = true;
                oldButton.title = "Disponible après le flop, quand c'est votre tour";
                oldButton.dataset.solveStateKey = currentKey;
                return;
            }
        }

        if (oldButton) {
            oldButton.disabled = busy;
            oldButton.title = "Analyser cette situation postflop";
            if (oldButton.dataset.solveStateKey !== currentKey) {
                oldButton.dataset.solveStateKey = currentKey;
                if (oldPanel) {
                    oldPanel.replaceChildren(element(
                        "p",
                        "text-sm text-textMuted",
                        "Situation actualisée. Recalcul de la stratégie en cours…"
                    ));
                }
                if(oldDialog?.open&&oldPanel){
                    if(busy)pendingRerun=true;
                    else void run(oldButton,oldPanel);
                }
            }
            return;
        }

        const button = element("button", "pl-solve-button", "Solver");
        button.disabled = !canAnalyse;
        button.title = canAnalyse
            ? "Analyser cette situation postflop"
            : "Disponible après le flop, quand c'est votre tour";
        button.type = "button";
        button.dataset.postflopSolve = "true";
        button.dataset.solveStateKey = currentKey;
        button.setAttribute("aria-label", "Solver — analyse postflop");

        const dialog = element("dialog", "pl-solve-dialog");
        dialog.dataset.postflopDialog = "true";
        dialog.setAttribute("aria-labelledby", "pl-solve-dialog-title");

        const header = element("header", "pl-solve-dialog-header");
        const title = element("h3", "pl-solve-dialog-title", "Analyse SOLVE");
        title.id = "pl-solve-dialog-title";

        const closeButton = element("button", "pl-solve-dialog-close", "Fermer");
        closeButton.type = "button";
        closeButton.setAttribute("aria-label", "Fermer l'analyse SOLVE");
        closeButton.addEventListener("click", () => dialog.close());

        header.append(title, closeButton);

        const panel = element("section", "pl-solve-result");
        panel.dataset.postflopResult = "true";

        dialog.append(header, panel);

        button.addEventListener("click", () => {
            if (!dialog.open) dialog.showModal();
            run(button, panel);
        });

        dialog.addEventListener("click", event => {
            if (event.target === dialog) dialog.close();
        });

        host.append(button, dialog);
    }

    function init(): void {
        const actions = document.getElementById("training-actions");
        if (!actions || observer) return;
        observer = new MutationObserver(sync);
        observer.observe(actions, { childList: true, subtree: true });
        global.addEventListener("pokerlab:table-state-changed", sync);
        sync();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
}
