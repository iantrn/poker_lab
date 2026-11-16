/* =========================================================
   POKERLAB - POSTFLOP SOLVER UI
   Injects the SOLVE action only on an eligible human turn.
   ========================================================= */
"use strict";

(function (global) {
    let observer = null;
    let busy = false;
    let activeStateKey = null;

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function eligible(state) {
        if (!state || state.handComplete || !["flop", "turn", "river"].includes(state.street)) return false;
        const hero = state.players.find(player => player.isHuman);
        if (!hero || state.currentPlayerId !== hero.id || !Array.isArray(hero.holeCards) || hero.holeCards.length !== 2) {
            return false;
        }
        const active = state.players.filter(player => !player.folded);
        return active.length === 2;
    }

    function stateKey(state) {
        if (!state) return "";
        try {
            return JSON.stringify(global.PokerLabPostflopSolver.createInput(
                state,
                global.PokerLabTraining.getHandHistory()
            ));
        } catch (error) {
            return String(state.handNumber) + ":" + String(state.street);
        }
    }

    function renderResult(container, result, strategy = null, strategyError = null) {
        container.replaceChildren();

        const heading = element("h4", "pl-solve-heading", "Stratégie");
        const summary = element("p", "pl-solve-summary",
            strategy
                ? "Fréquence de chaque action dans cette situation"
                : "Fréquences stratégiques indisponibles pour cette situation.");

        const frequencies = element("div", "pl-solve-frequencies");
        if (strategy && Array.isArray(strategy.actions) && strategy.actions.length) {
            strategy.actions.forEach(item => {
                const row = element("div", "pl-solve-frequency-row");
                const action = element("span", "pl-solve-frequency-action", item.action);
                const value = element("strong", "pl-solve-frequency-value",
                    (item.frequency * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %");
                row.append(action, value);
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

        container.append(heading, summary, frequencies, detailsButton, details);
    }

    async function run(button, panel) {
        if (busy || !global.PokerLabSolverPrecompute) return;
        busy = true;
        button.disabled = true;
        button.textContent = "Analyse en cours…";
        panel.classList.remove("hidden");
        panel.textContent = "Récupération du pré-calcul ou démarrage de l'analyse…";
        const initialState = global.PokerLabTraining.getGameState();
        const initialKey = stateKey(initialState);
        activeStateKey = initialKey;
        const unsubscribe = global.PokerLabSolverPrecompute.subscribe(snapshot => {
            if (!button.isConnected || !panel.isConnected || !dialogIsOpen(panel) || snapshot.key !== initialKey) return;
            if (snapshot.phase === "equity") panel.textContent = "Calcul de l'équité Monte-Carlo…";
            else if (snapshot.phase === "strategy") panel.textContent = "Calcul stratégique CFR+…";
            else if (snapshot.phase === "complete") panel.textContent = "Analyse terminée.";
        });
        try {
            const result = await global.PokerLabSolverPrecompute.getOrStart();
            const latestState = global.PokerLabTraining.getGameState();
            if (!button.isConnected || stateKey(latestState) !== initialKey) {
                if (button.isConnected) panel.replaceChildren(element("p", "text-sm text-textMuted",
                    "La situation a changé pendant le calcul. Le résultat obsolète a été écarté."));
                return;
            }
            renderResult(panel, result.equity, result.strategy, result.strategyError);
        } catch (error) {
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
                button.textContent = "Analyser";
            }
        }
    }

    function dialogIsOpen(panel) {
        const dialog = panel && panel.closest("[data-postflop-dialog]");
        return Boolean(dialog && dialog.open);
    }

    function sync() {
        const actions = document.getElementById("training-actions");
        if (!actions || !global.PokerLabTraining || !global.PokerLabPostflopSolver) return;
        const state = global.PokerLabTraining.getGameState();
        const currentKey = stateKey(state);
        if (global.PokerLabSolverPrecompute) global.PokerLabSolverPrecompute.onStateChange();
        if (busy && activeStateKey && currentKey !== activeStateKey) activeStateKey = null;

        const oldButton = actions.querySelector("[data-postflop-solve]");
        const oldDialog = actions.querySelector("[data-postflop-dialog]");
        const oldPanel = actions.querySelector("[data-postflop-result]");

        if (!eligible(state)) {
            if (oldDialog?.open) oldDialog.close();
            if (oldButton) oldButton.remove();
            if (oldDialog) oldDialog.remove();
            return;
        }

        if (oldButton) {
            if (oldButton.dataset.solveStateKey !== currentKey) {
                oldButton.dataset.solveStateKey = currentKey;
                if (oldPanel) {
                    oldPanel.replaceChildren(element(
                        "p",
                        "text-sm text-textMuted",
                        "La situation a changé. Ferme cette fenêtre puis clique sur « Analyser » pour étudier la nouvelle situation."
                    ));
                }
            }
            return;
        }

        const button = element("button",
            "pl-solve-button bg-primary hover:bg-primaryHover text-white font-bold rounded-lg px-5 py-3 transition",
            "Analyser");
        button.type = "button";
        button.dataset.postflopSolve = "true";
        button.dataset.solveStateKey = currentKey;
        button.setAttribute("aria-label", "Analyser cette situation postflop");

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

        actions.append(button, dialog);
    }

    function init() {
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
})(window);
