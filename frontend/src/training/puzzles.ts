
/* =========================================================
   POKERLAB - PUZZLES MODULE
   Version : 1.0.0
   Description : Gestion des exercices tactiques de poker
   ========================================================= */

"use strict";

export interface PuzzleSolution { action: string; amount?: number | null; [key: string]: unknown; }
export interface PokerPuzzle {
  id: string; title: string; question: string; solution: PuzzleSolution;
  category?: string; difficulty?: string; position?: string;
  description?: string; explanation?: string;
  blinds?: unknown; players?: unknown;
  options?: Array<string | { action: string; label?: string }>;
  [attribute: string]: unknown;
}
interface PuzzleFilters {category?: string | null;difficulty?: string | null;position?: string | null;}
interface PuzzleAnswer {action:string;amount:number|null;correct:boolean;}
interface Stats {attempted:number;correct:number;incorrect:number;}
interface ValidationFailure {index:number;id:unknown;errors:string[];}
type SelectResult = {success:true;puzzle:Omit<PokerPuzzle,"solution">|null} | {success:false;error:string};
interface SubmitSuccess {success:true;correct:boolean;answer:PuzzleAnswer;solution:PuzzleSolution;explanation:string;}
type SubmitResult = SubmitSuccess | {success:false;error:string};
function createPuzzles() {

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

    let puzzles: PokerPuzzle[] = [];

    let filteredPuzzles: PokerPuzzle[] = [];

    let currentPuzzle: PokerPuzzle | null = null;

    let currentAnswer: PuzzleAnswer | null = null;

    let answered = false;

    let statistics: Stats = {
        attempted: 0,
        correct: 0,
        incorrect: 0
    };


    /* =====================================================
       3. OUTILS
       ===================================================== */

    function dispatch(eventName: string, detail: unknown = {}): void {

        window.dispatchEvent(
            new CustomEvent(eventName, {
                detail
            })
        );

    }


    function shuffle<T>(array: readonly T[]): T[] {

        const result = [...array];

        for (let i = result.length - 1; i > 0; i--) {

            const j = Math.floor(
                Math.random() * (i + 1)
            );

            [result[i], result[j]] =
                [result[j]!, result[i]!];

        }

        return result;

    }


    function normalizeText(value: unknown): string {

        return String(value || "")
            .trim()
            .toLowerCase();

    }


    function normalizeAction(action: unknown): string {

        const value = normalizeText(action);

        const aliases: Record<string, string> = {
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

    function validatePuzzle(input: unknown) {
        const puzzle = input as Partial<PokerPuzzle> | null;

        const errors: string[] = [];

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


    function validatePuzzleCollection(collection: unknown) {

        if (!Array.isArray(collection)) {

            return {
                valid: false,
                errors: ["Le fichier d'exercices doit contenir un tableau."]
            };

        }

        const errors: ValidationFailure[] = [];
        const ids = new Set<string>();

        collection.forEach((puzzle: unknown, index: number) => {

            const validation = validatePuzzle(puzzle);

            if (!validation.valid) {

                errors.push({
                    index,
                    id: (puzzle as Partial<PokerPuzzle> | null)?.id
                        ? (puzzle as Partial<PokerPuzzle>).id
                        : null,
                    errors: validation.errors
                });

            }

            const id = String((puzzle as Partial<PokerPuzzle> | null)?.id ?? "").trim();
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

    async function loadPuzzles(url: string = DATA_URL) {

        try {

            const response = await fetch(url);

            if (!response.ok) {

                throw new Error(
                    `Erreur HTTP ${response.status}`
                );

            }

            const data = await response.json();

            const collection: unknown = Array.isArray(data)
                ? data
                : (data as {puzzles?:unknown}).puzzles;

            const validation =
                validatePuzzleCollection(collection);

            if (!validation.valid) {

                throw new Error(
                    `Données d'exercices invalides : ${
                        JSON.stringify(validation.errors)
                    }`
                );

            }

            puzzles = (collection as PokerPuzzle[]).map(puzzle => ({
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

        } catch (caught: unknown) {
            const error = caught instanceof Error ? caught : new Error(String(caught));

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

    function filterPuzzles(filters: PuzzleFilters = {}): PokerPuzzle[] {

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

    function selectPuzzle(id: unknown): SelectResult {

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


    function getRandomPuzzle(): SelectResult {

        const available = filteredPuzzles;

        if (available.length === 0) {

            return {
                success: false,
                error: "Aucun exercice disponible."
            };

        }

        const candidates = currentPuzzle
            ? available.filter(
                puzzle => puzzle.id !== currentPuzzle!.id
            )
            : available;

        const pool = candidates.length
            ? candidates
            : available;

        const puzzle = pool[
            Math.floor(Math.random() * pool.length)
        ]!;

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

    function submitAnswer(action: unknown, amount: number | null = null): SubmitResult {

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
                puzzle => puzzle.id === currentPuzzle!.id
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

    function renderPuzzle(container: HTMLElement, puzzle: PokerPuzzle | null = currentPuzzle): void {

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

        const introduction = document.createElement("header");
        introduction.className = "nct-puzzle-introduction";
        introduction.appendChild(title);
        container.appendChild(introduction);

        if (puzzle.description) {

            const description = document.createElement("p");

            description.className = "pl-puzzle-description";
            description.textContent = puzzle.description;

            introduction.appendChild(description);

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

        const decision = document.createElement("section");
        decision.className = "nct-puzzle-decision";
        decision.setAttribute("aria-label", "Choisir une réponse");
        decision.appendChild(question);
        container.appendChild(decision);

        if (Array.isArray(puzzle.options)) {

            const optionsContainer = document.createElement("div");

            optionsContainer.className = "pl-puzzle-options";

            puzzle.options.forEach((option, index) => {

                const button = document.createElement("button");

                button.type = "button";
                button.className = "pl-button pl-puzzle-option";

                const action = typeof option === "string"
                    ? option
                    : option.action;

                const label = typeof option === "string"
                    ? option
                    : option.label || option.action;

                const number = document.createElement("span");
                number.className = "nct-option-index";
                number.setAttribute("aria-hidden", "true");
                number.textContent = String(index + 1).padStart(2, "0");
                const caption = document.createElement("span");
                caption.textContent = label;
                button.append(number, caption);

                button.disabled = answered;

                button.addEventListener("click", () => {

                    const result = submitAnswer(action);

                    if (result.success) {
                        renderResult(container, result);
                    }

                });

                optionsContainer.appendChild(button);

            });

            decision.appendChild(optionsContainer);

        }

    }


    /* =====================================================
       11. AFFICHAGE DU RÉSULTAT
       ===================================================== */

    function renderResult(container: HTMLElement, result: SubmitSuccess): void {

        const existing = container.querySelector(
            ".pl-puzzle-result"
        );

        if (existing) {
            existing.remove();
        }

        const resultContainer = document.createElement("section");
        resultContainer.setAttribute("role", "status");

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

    async function init(): Promise<void> {

        if (initialized) {
            return;
        }

        initialized = true;

        const result = await loadPuzzles();

        if (!result.success) {
            initialized = false;
            const container = document.querySelector<HTMLElement>(SELECTORS.container);
            if (container) container.textContent = "Les exercices n'ont pas pu être chargés. Vérifie les données ou réessaie après actualisation.";
            return;
        }

        renderStatistics();

        const startButtons = document.querySelectorAll<HTMLButtonElement>(
            SELECTORS.startButton
        );

        startButtons.forEach(button => {

            button.addEventListener("click", () => {

                const selection = getRandomPuzzle();

                const container = document.querySelector<HTMLElement>(
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

        const categorySelect = document.querySelector<HTMLSelectElement>(
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

        const difficultySelect = document.querySelector<HTMLSelectElement>(
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

}
export type PuzzlesApi = ReturnType<typeof createPuzzles>;
export function installPuzzles(): PuzzlesApi {
  const target = window as Window & { PokerLabPuzzles?: PuzzlesApi };
  if (!target.PokerLabPuzzles) target.PokerLabPuzzles = createPuzzles();
  return target.PokerLabPuzzles;
}
