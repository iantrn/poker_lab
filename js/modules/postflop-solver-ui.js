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

    function renderResult(container, result, strategy = null) {
        container.replaceChildren();
        const heading = element("h4", "font-bold text-lg mb-3", "Analyse postflop");
        const equity = element("p", "text-2xl font-bold mb-2",
            (result.equity * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " % d'équité");
        const range = element("p", "text-sm text-textMuted mb-2",
            "Range adverse : " + result.rangeLabel);
        const stats = element("p", "text-sm text-textMuted mb-3",
            result.wins + " victoires · " + result.ties + " égalités · " +
            result.losses + " défaites sur " + result.iterations.toLocaleString("fr-FR") + " simulations");
        const action = element("p", "font-semibold text-primaryHover mb-1",
            "Piste de décision : " + result.decision.action);
        const explanation = element("p", "text-sm mb-2", result.decision.explanation);
        const odds = result.decision.potOdds > 0
            ? "Pot odds : " + (result.decision.potOdds * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %"
            : "Aucune mise à payer";
        const details = element("p", "text-xs text-textMuted mb-2", odds);
        const disclaimer = element("p", "text-xs text-textMuted", result.note);
        container.append(heading, equity, range, stats, action, explanation, details);

        if (strategy) {
            const divider = element("div", "border-t border-white/10 my-4");
            const strategyHeading = element("h5", "font-bold mb-2", "Stratégie CFR+ — river");
            const strategyMeta = element("p", "text-xs text-textMuted mb-2",
                strategy.iterations + " itérations · " +
                strategy.sampledOpponentHands + " mains adverses échantillonnées · " +
                strategy.treeNodes + " nœuds dans l'arbre");
            const strategyActions = element("div", "space-y-1 mb-3");
            for (const item of strategy.actions) {
                const line = element("p", "text-sm",
                    item.action.replace(/_/g, " ") + " : " +
                    (item.frequency * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " % · EV " +
                    item.ev.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " jetons");
                strategyActions.append(line);
            }
            const ev = element("p", "text-sm font-semibold mb-2",
                "EV estimée depuis cette décision : " +
                strategy.heroEV.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " jetons");
            const abstraction = element("p", "text-xs text-textMuted mb-2", strategy.abstraction);
            const convergence = element("p", "text-xs text-textMuted", strategy.convergence);
            container.append(divider, strategyHeading, strategyMeta, strategyActions, ev, abstraction, convergence);
        } else {
            const strategyInfo = element("p", "text-xs text-textMuted mb-2",
                "Le calcul CFR+ est actuellement limité à la river. Sur le flop et le turn, cette version affiche uniquement l'analyse d'équité.");
            container.append(strategyInfo);
        }

        container.append(disclaimer);
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
            let strategy = null;
            if (initialState.street === "river" && global.PokerLabPostflopStrategy) {
                panel.textContent = "Calcul CFR+ de l'arbre de décisions river…";
                strategy = await global.PokerLabPostflopStrategy.solveRiver(initialState, history);
            }
            const latestState = global.PokerLabTraining.getGameState();

            if (!button.isConnected || stateKey(latestState) !== initialKey) {
                if (button.isConnected) {
                    panel.replaceChildren(element("p", "text-sm text-textMuted",
                        "La situation a changé pendant le calcul. Relance SOLVE pour analyser la nouvelle situation."));
                }
                return;
            }

            renderResult(panel, result, strategy);
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
