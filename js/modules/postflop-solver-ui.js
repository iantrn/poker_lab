/* =========================================================
   POKERLAB - POSTFLOP SOLVER UI
   Injects the SOLVE action only on an eligible human turn.
   ========================================================= */
"use strict";

(function (global) {
    let observer = null;
    let busy = false;

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
        const cards = cardList => (cardList || []).map(card =>
            card ? card.value + "_" + card.suit : "?"
        ).join(",");
        const players = (state.players || []).map(player => [
            player.id,
            player.stack,
            player.streetBet,
            player.totalContribution,
            player.folded,
            player.allIn,
            player.amountToCall
        ].join(":")).join("|");
        return [
            state.handNumber,
            state.street,
            cards(state.board),
            state.currentPlayerId,
            state.pot,
            state.currentBet,
            state.lastFullRaise,
            players
        ].join(";");
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
                    strategy.iterations + " itérations · " +
                    strategy.sampledOpponentHands + " scénarios main adverse / runout · " +
                    strategy.treeNodes + " nœuds dans l'arbre")
            );

            strategy.actions.forEach(item => {
                details.appendChild(element("p", "pl-solve-detail-line",
                    item.action + " : " +
                    (item.frequency * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " % · EV " +
                    item.ev.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " jetons"));
            });

            details.append(
                element("p", "pl-solve-detail-line pl-solve-detail-emphasis",
                    "EV estimée depuis cette décision : " +
                    strategy.heroEV.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " jetons"),
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
        if (busy) return;
        busy = true;
        button.disabled = true;
        button.textContent = "Calcul en cours…";
        panel.classList.remove("hidden");
        panel.textContent = "Simulation des mains adverses et des cartes restantes…";

        const initialState = global.PokerLabTraining.getGameState();
        const initialKey = stateKey(initialState);

        try {
            const history = global.PokerLabTraining.getHandHistory();
            const result = await global.PokerLabPostflopSolver.analyse(initialState, history);
            const stateAfterEquity = global.PokerLabTraining.getGameState();
            if (!button.isConnected || stateKey(stateAfterEquity) !== initialKey) {
                if (button.isConnected) {
                    panel.replaceChildren(element("p", "text-sm text-textMuted",
                        "La situation a changé pendant le calcul. Relance SOLVE pour analyser la nouvelle situation."));
                }
                return;
            }

            let strategy = null;
            let strategyError = null;
            if (global.PokerLabPostflopStrategy) {
                panel.textContent = "Calcul CFR+ de l'arbre de décisions et échantillonnage des runouts…";
                try {
                    strategy = await global.PokerLabPostflopStrategy.solvePostflop(initialState, history);
                } catch (error) {
                    strategyError = error.message;
                }
            }
            const latestState = global.PokerLabTraining.getGameState();

            if (!button.isConnected || stateKey(latestState) !== initialKey) {
                if (button.isConnected) {
                    panel.replaceChildren(element("p", "text-sm text-textMuted",
                        "La situation a changé pendant le calcul. Relance SOLVE pour analyser la nouvelle situation."));
                }
                return;
            }

            renderResult(panel, result, strategy, strategyError);
        } catch (error) {
            if (button.isConnected) {
                panel.replaceChildren(element("p", "text-red-400 text-sm", error.message));
            }
        } finally {
            busy = false;
            if (button.isConnected) {
                button.disabled = false;
                button.textContent = "SOLVE";
            }
        }
    }

    function sync() {
        const actions = document.getElementById("training-actions");
        if (!actions || !global.PokerLabTraining || !global.PokerLabPostflopSolver) return;
        const state = global.PokerLabTraining.getGameState();
        const oldButton = actions.querySelector("[data-postflop-solve]");
        const oldPanel = actions.querySelector("[data-postflop-result]");

        if (!eligible(state)) {
            if (oldButton) oldButton.remove();
            if (oldPanel) oldPanel.remove();
            return;
        }

        const currentKey = stateKey(state);
        if (oldButton) {
            if (oldButton.dataset.solveStateKey !== currentKey) {
                oldButton.dataset.solveStateKey = currentKey;
                if (oldPanel) {
                    oldPanel.replaceChildren();
                    oldPanel.classList.add("hidden");
                }
            }
            return;
        }

        const button = element("button",
            "pl-solve-button bg-primary hover:bg-primaryHover text-white font-bold rounded-lg px-5 py-3 transition",
            "SOLVE");
        button.type = "button";
        button.dataset.postflopSolve = "true";
        button.dataset.solveStateKey = currentKey;
        button.setAttribute("aria-label", "Analyser cette situation postflop");
        const panel = element("section",
            "hidden mt-4 rounded-xl border border-primary/30 bg-background p-4");
        panel.dataset.postflopResult = "true";
        button.addEventListener("click", () => run(button, panel));
        actions.append(button, panel);
    }

    function init() {
        const actions = document.getElementById("training-actions");
        if (!actions || observer) return;
        observer = new MutationObserver(sync);
        observer.observe(actions, { childList: true, subtree: true });
        sync();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})(window);
