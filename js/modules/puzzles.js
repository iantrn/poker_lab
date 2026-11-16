
/* =========================================================
   POKERLAB - PUZZLES MODULE
   Version : 1.0.0
   Description : Gestion des exercices tactiques de poker
   ========================================================= */

"use strict";

window.PokerLabPuzzles = (function () {

    /* =====================================================
       1. CONFIGURATION
       ===================================================== */

    const DATA_URL = "./data/puzzles/puzzles.json";

    const VALID_ACTIONS = [
        "fold",
        "check",
        "call",
        "bet",
        "raise",
        "all-in"
    ];

    const SELECTORS = {
        container: "[data-puzzles-container]",
        category: "[data-puzzle-category]",
        difficulty: "[data-puzzle-difficulty]",
        startButton: "[data-puzzle-action='start']",
        submitButton: "[data-puzzle-action='submit']",
        nextButton: "[data-puzzle-action='next']"
    };

    const EVENTS = {
        LOADED: "pokerlab:puzzles-loaded",
        STARTED: "pokerlab:puzzle-started",
        ANSWERED: "pokerlab:puzzle-answered",
        COMPLETED: "pokerlab:puzzle-completed",
        ERROR: "pokerlab:puzzle-error"
    };


    /* =====================================================
       2. ÉTAT DU MODULE
       ===================================================== */

    let initialized = false;

    let puzzles = [];

    let filteredPuzzles = [];

    let currentPuzzle = null;

    let currentAnswer = null;

    let answered = false;

    let statistics = {
        attempted: 0,
        correct: 0,
        incorrect: 0
    };


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


    function shuffle(array) {

        const result = [...array];

        for (let i = result.length - 1; i > 0; i--) {

            const j = Math.floor(
                Math.random() * (i + 1)
            );

            [result[i], result[j]] =
                [result[j], result[i]];

        }

        return result;

    }


    function normalizeText(value) {

        return String(value || "")
            .trim()
            .toLowerCase();

    }


    function normalizeAction(action) {

        const value = normalizeText(action);

        const aliases = {
            "all in": "all-in",
            "all_in": "all-in",
            "raise to": "raise",
            "shove": "all-in"
        };

        return aliases[value] || value;

    }


    /* =====================================================
       4. VALIDATION DES EXERCICES
       ===================================================== */

    function validatePuzzle(puzzle) {

        const errors = [];

        if (!puzzle || typeof puzzle !== "object") {

            return {
                valid: false,
                errors: ["Exercice invalide."]
            };

        }

        if (!puzzle.id) {
            errors.push("Identifiant manquant.");
        }

        if (!puzzle.title) {
            errors.push("Titre manquant.");
        }

        if (!puzzle.question) {
            errors.push("Question manquante.");
        }

        if (!puzzle.solution) {

            errors.push("Solution manquante.");

        } else if (
            !VALID_ACTIONS.includes(
                normalizeAction(puzzle.solution.action)
            )
        ) {

            errors.push("Action de solution invalide.");

        }

        if (puzzle.options !== undefined) {

            if (!Array.isArray(puzzle.options) || puzzle.options.length < 2) {
                errors.push("Les propositions doivent contenir au moins deux choix.");
            } else {
                puzzle.options.forEach((option, index) => {
                    const action = typeof option === "string"
                        ? option
                        : option && option.action;

                    if (!VALID_ACTIONS.includes(normalizeAction(action))) {
                        errors.push(`Proposition invalide à l'index ${index}.`);
                    }
                });
            }

        }

        return {
            valid: errors.length === 0,
            errors
        };

    }


    function validatePuzzleCollection(collection) {

        if (!Array.isArray(collection)) {

            return {
                valid: false,
                errors: ["Le fichier d'exercices doit contenir un tableau."]
            };

        }

        const errors = [];
        const ids = new Set();

        collection.forEach((puzzle, index) => {

            const validation = validatePuzzle(puzzle);

            if (!validation.valid) {

                errors.push({
                    index,
                    id: puzzle && puzzle.id
                        ? puzzle.id
                        : null,
                    errors: validation.errors
                });

            }

            const id = String(puzzle?.id ?? "").trim();
            if (id && ids.has(id)) {
                errors.push({
                    index,
                    id,
                    errors: ["Identifiant d'exercice dupliqué."]
                });
            }
            if (id) ids.add(id);

        });

        return {
            valid: errors.length === 0,
            errors
        };

    }


    /* =====================================================
       5. CHARGEMENT DES DONNÉES
       ===================================================== */

    async function loadPuzzles(url = DATA_URL) {

        try {

            const response = await fetch(url);

            if (!response.ok) {

                throw new Error(
                    `Erreur HTTP ${response.status}`
                );

            }

            const data = await response.json();

            const collection = Array.isArray(data)
                ? data
                : data.puzzles;

            const validation =
                validatePuzzleCollection(collection);

            if (!validation.valid) {

                throw new Error(
                    `Données d'exercices invalides : ${
                        JSON.stringify(validation.errors)
                    }`
                );

            }

            puzzles = collection.map(puzzle => ({
                ...puzzle
            }));

            filteredPuzzles = [...puzzles];

            dispatch(EVENTS.LOADED, {
                count: puzzles.length
            });

            return {
                success: true,
                count: puzzles.length
            };

        } catch (error) {

            console.error(
                "PokerLabPuzzles : chargement impossible.",
                error
            );

            dispatch(EVENTS.ERROR, {
                message: error.message
            });

            return {
                success: false,
                error: error.message
            };

        }

    }


    /* =====================================================
       6. FILTRAGE DES EXERCICES
       ===================================================== */

    function filterPuzzles(filters = {}) {

        filteredPuzzles = puzzles.filter(puzzle => {

            if (
                filters.category &&
                normalizeText(puzzle.category) !==
                normalizeText(filters.category)
            ) {
                return false;
            }

            if (
                filters.difficulty &&
                normalizeText(puzzle.difficulty) !==
                normalizeText(filters.difficulty)
            ) {
                return false;
            }

            if (
                filters.position &&
                normalizeText(puzzle.position) !==
                normalizeText(filters.position)
            ) {
                return false;
            }

            return true;

        });

        // Un changement de filtres invalide la question en cours afin
        // d'éviter de répondre à un exercice qui ne correspond plus au filtre.
        currentPuzzle = null;
        currentAnswer = null;
        answered = false;

        return [...filteredPuzzles];

    }


    /* =====================================================
       7. SÉLECTION D'UN EXERCICE
       ===================================================== */

    function selectPuzzle(id) {

        const puzzle = puzzles.find(
            item => String(item.id) === String(id)
        );

        if (!puzzle) {

            return {
                success: false,
                error: "Exercice introuvable."
            };

        }

        currentPuzzle = puzzle;

        currentAnswer = null;

        answered = false;

        dispatch(EVENTS.STARTED, {
            puzzle: getCurrentPuzzle()
        });

        return {
            success: true,
            puzzle: getCurrentPuzzle()
        };

    }


    function getRandomPuzzle() {

        const available = filteredPuzzles;

        if (available.length === 0) {

            return {
                success: false,
                error: "Aucun exercice disponible."
            };

        }

        const candidates = currentPuzzle
            ? available.filter(
                puzzle => puzzle.id !== currentPuzzle.id
            )
            : available;

        const pool = candidates.length
            ? candidates
            : available;

        const puzzle = pool[
            Math.floor(Math.random() * pool.length)
        ];

        return selectPuzzle(puzzle.id);

    }


    function getCurrentPuzzle() {

        if (!currentPuzzle) {
            return null;
        }

        const {
            solution,
            ...publicPuzzle
        } = currentPuzzle;

        return {
            ...publicPuzzle
        };

    }


    /* =====================================================
       8. SOUMISSION D'UNE RÉPONSE
       ===================================================== */

    function submitAnswer(action, amount = null) {

        if (!currentPuzzle) {

            return {
                success: false,
                error: "Aucun exercice sélectionné."
            };

        }

        if (answered) {

            return {
                success: false,
                error: "Une réponse a déjà été soumise."
            };

        }

        const normalizedAction = normalizeAction(action);

        if (!VALID_ACTIONS.includes(normalizedAction)) {

            return {
                success: false,
                error: "Action inconnue."
            };

        }

        if (
            amount !== null &&
            (
                typeof amount !== "number" ||
                !Number.isFinite(amount) ||
                amount < 0
            )
        ) {

            return {
                success: false,
                error: "Montant de mise invalide."
            };

        }

        const solution = currentPuzzle.solution;

        const expectedAction = normalizeAction(
            solution.action
        );

        let isCorrect =
            normalizedAction === expectedAction;

        if (
            isCorrect &&
            solution.amount !== undefined &&
            solution.amount !== null
        ) {

            isCorrect =
                amount !== null &&
                Math.abs(amount - Number(solution.amount)) < 0.001;

        }

        answered = true;

        currentAnswer = {
            action: normalizedAction,
            amount,
            correct: isCorrect
        };

        statistics.attempted++;

        if (isCorrect) {
            statistics.correct++;
        } else {
            statistics.incorrect++;
        }

        const result = {
            correct: isCorrect,
            answer: {
                ...currentAnswer
            },
            solution: {
                ...solution
            },
            explanation: currentPuzzle.explanation || ""
        };

        dispatch(EVENTS.ANSWERED, result);

        if (filteredPuzzles.length > 0) {

            const allAnswered = filteredPuzzles.every(
                puzzle => puzzle.id === currentPuzzle.id
            );

            if (allAnswered) {

                dispatch(EVENTS.COMPLETED, {
                    statistics: getStatistics()
                });

            }

        }

        return {
            success: true,
            ...result
        };

    }


    /* =====================================================
       9. STATISTIQUES
       ===================================================== */

    function getStatistics() {

        const accuracy = statistics.attempted > 0
            ? (
                statistics.correct /
                statistics.attempted
            ) * 100
            : 0;

        return {
            ...statistics,
            accuracy: Math.round(accuracy * 10) / 10
        };

    }


    function renderStatistics() {

        const container = document.querySelector("[data-puzzle-stats]");
        if (!container) return getStatistics();

        const stats = getStatistics();
        container.textContent = stats.attempted > 0
            ? `Session : ${stats.correct}/${stats.attempted} bonnes réponses (${stats.accuracy} %)`
            : `${puzzles.length} exercices disponibles · aucune réponse soumise`;

        return stats;

    }


    function resetStatistics() {

        statistics = {
            attempted: 0,
            correct: 0,
            incorrect: 0
        };

        return getStatistics();

    }


    /* =====================================================
       10. AFFICHAGE D'UN EXERCICE
       ===================================================== */

    function renderPuzzle(container, puzzle = currentPuzzle) {

        if (!(container instanceof HTMLElement)) {

            throw new Error(
                "Conteneur d'exercice invalide."
            );

        }

        if (!puzzle) {

            container.replaceChildren();

            const empty = document.createElement("p");

            empty.textContent =
                "Aucun exercice sélectionné.";

            container.appendChild(empty);

            return;

        }

        container.replaceChildren();

        const title = document.createElement("h3");

        title.className = "pl-puzzle-title";
        title.textContent = puzzle.title;

        container.appendChild(title);

        if (puzzle.description) {

            const description = document.createElement("p");

            description.className = "pl-puzzle-description";
            description.textContent = puzzle.description;

            container.appendChild(description);

        }

        const context = document.createElement("div");

        context.className = "pl-puzzle-context";

        const contextItems = [
            ["Position", puzzle.position],
            ["Blindes", puzzle.blinds],
            ["Joueurs", puzzle.players],
            ["Difficulté", puzzle.difficulty]
        ];

        contextItems.forEach(([label, value]) => {

            if (value === undefined || value === null) {
                return;
            }

            const item = document.createElement("div");

            item.className = "pl-puzzle-context-item";

            const itemLabel = document.createElement("span");

            itemLabel.textContent = `${label} : `;

            const itemValue = document.createElement("strong");

            itemValue.textContent = String(value);

            item.appendChild(itemLabel);
            item.appendChild(itemValue);

            context.appendChild(item);

        });

        container.appendChild(context);

        const question = document.createElement("p");

        question.className = "pl-puzzle-question";
        question.textContent = puzzle.question;

        container.appendChild(question);

        if (Array.isArray(puzzle.options)) {

            const optionsContainer = document.createElement("div");

            optionsContainer.className = "pl-puzzle-options";

            puzzle.options.forEach(option => {

                const button = document.createElement("button");

                button.type = "button";
                button.className = "pl-button pl-puzzle-option";

                const action = typeof option === "string"
                    ? option
                    : option.action;

                const label = typeof option === "string"
                    ? option
                    : option.label || option.action;

                button.textContent = label;

                button.disabled = answered;

                button.addEventListener("click", () => {

                    const result = submitAnswer(action);

                    if (result.success) {
                        renderResult(container, result);
                    }

                });

                optionsContainer.appendChild(button);

            });

            container.appendChild(optionsContainer);

        }

    }


    /* =====================================================
       11. AFFICHAGE DU RÉSULTAT
       ===================================================== */

    function renderResult(container, result) {

        const existing = container.querySelector(
            ".pl-puzzle-result"
        );

        if (existing) {
            existing.remove();
        }

        const resultContainer = document.createElement("div");

        resultContainer.className = [
            "pl-puzzle-result",
            result.correct
                ? "is-correct"
                : "is-incorrect"
        ].join(" ");

        const heading = document.createElement("h4");

        heading.textContent = result.correct
            ? "Bonne réponse !"
            : "Ce n'est pas la réponse attendue.";

        resultContainer.appendChild(heading);

        const solution = document.createElement("p");

        solution.textContent =
            `Solution : ${result.solution.action}` +
            (
                result.solution.amount !== undefined
                    ? ` (${result.solution.amount})`
                    : ""
            );

        resultContainer.appendChild(solution);

        if (result.explanation) {

            const explanation = document.createElement("p");

            explanation.textContent = result.explanation;

            resultContainer.appendChild(explanation);

        }

        renderStatistics();

        const nextButton = document.createElement("button");
        nextButton.type = "button";
        nextButton.className = "pl-button pl-puzzle-next";
        nextButton.textContent = "Exercice suivant";
        nextButton.addEventListener("click", () => {
            const selection = getRandomPuzzle();
            if (!selection.success) {
                container.textContent = selection.error;
                return;
            }
            renderPuzzle(container);
        });
        resultContainer.appendChild(nextButton);

        container.appendChild(resultContainer);

    }


    /* =====================================================
       12. INITIALISATION
       ===================================================== */

    async function init() {

        if (initialized) {
            return;
        }

        initialized = true;

        const result = await loadPuzzles();

        if (!result.success) {
            initialized = false;
            const container = document.querySelector(SELECTORS.container);
            if (container) container.textContent = "Les exercices n'ont pas pu être chargés. Vérifie les données ou réessaie après actualisation.";
            return;
        }

        renderStatistics();

        const startButtons = document.querySelectorAll(
            SELECTORS.startButton
        );

        startButtons.forEach(button => {

            button.addEventListener("click", () => {

                const selection = getRandomPuzzle();

                const container = document.querySelector(
                    SELECTORS.container
                );

                if (!selection.success) {
                    if (container) container.textContent = selection.error;
                    return;
                }

                if (container) {
                    renderPuzzle(container);
                }

            });

        });

        const categorySelect = document.querySelector(
            SELECTORS.category
        );

        if (categorySelect) {

            categorySelect.addEventListener("change", () => {

                const results = filterPuzzles({
                    category: categorySelect.value,
                    difficulty: difficultySelect ? difficultySelect.value : null
                });
                renderStatistics();
                const container = document.querySelector(SELECTORS.container);
                if (container) {
                    container.textContent = results.length
                        ? `${results.length} exercice(s) correspondent aux filtres. Clique sur « Commencer un exercice » pour continuer.`
                        : "Aucun exercice ne correspond à ces filtres.";
                }

            });

        }

        const difficultySelect = document.querySelector(
            SELECTORS.difficulty
        );

        if (difficultySelect) {

            difficultySelect.addEventListener("change", () => {

                const results = filterPuzzles({
                    category: categorySelect ? categorySelect.value : null,
                    difficulty: difficultySelect.value
                });
                renderStatistics();
                const container = document.querySelector(SELECTORS.container);
                if (container) {
                    container.textContent = results.length
                        ? `${results.length} exercice(s) correspondent aux filtres. Clique sur « Commencer un exercice » pour continuer.`
                        : "Aucun exercice ne correspond à ces filtres.";
                }

            });

        }

    }


    /* =====================================================
       13. EXPORT PUBLIC
       ===================================================== */

    return {

        init,

        loadPuzzles,

        validatePuzzle,

        validatePuzzleCollection,

        filterPuzzles,

        selectPuzzle,

        getRandomPuzzle,

        getCurrentPuzzle,

        submitAnswer,

        getStatistics,

        renderStatistics,

        resetStatistics,

        renderPuzzle,

        EVENTS

    };

})();
