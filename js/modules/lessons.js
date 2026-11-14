
/* =========================================================
   POKERLAB - LESSONS MODULE
   Version : 1.0.0
   Description : Parcours pédagogique et suivi de progression
   ========================================================= */

"use strict";

window.PokerLabLessons = (function () {

    /* =====================================================
       1. CONFIGURATION
       ===================================================== */

    const DATA_URL = "./data/lessons/lessons.json";

    const STORAGE_KEY = "pokerlab_lessons_progress";

    const EVENTS = {
        LOADED: "pokerlab:lessons-loaded",
        OPENED: "pokerlab:lesson-opened",
        COMPLETED: "pokerlab:lesson-completed",
        PROGRESS_UPDATED: "pokerlab:lesson-progress-updated",
        ERROR: "pokerlab:lessons-error"
    };


    /* =====================================================
       2. ÉTAT DU MODULE
       ===================================================== */

    let initialized = false;

    let lessons = [];

    let currentLesson = null;

    let progress = {
        completedLessons: [],
        lastLessonId: null
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


    function normalizeId(value) {

        return String(value ?? "").trim();

    }


    function clone(value) {

        return JSON.parse(JSON.stringify(value));

    }


    /* =====================================================
       4. SAUVEGARDE DE LA PROGRESSION
       ===================================================== */

    function saveProgress() {

        try {

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(progress)
            );

            return true;

        } catch (error) {

            console.error(
                "PokerLabLessons : sauvegarde impossible.",
                error
            );

            dispatch(EVENTS.ERROR, {
                message: "Impossible de sauvegarder la progression."
            });

            return false;

        }

    }


    function loadProgress() {

        try {

            const saved = localStorage.getItem(STORAGE_KEY);

            if (!saved) {
                return;
            }

            const parsed = JSON.parse(saved);

            if (
                !parsed ||
                !Array.isArray(parsed.completedLessons)
            ) {
                return;
            }

            progress = {
                completedLessons: [
                    ...new Set(
                        parsed.completedLessons.map(normalizeId)
                    )
                ],
                lastLessonId: parsed.lastLessonId
                    ? normalizeId(parsed.lastLessonId)
                    : null
            };

        } catch (error) {

            console.warn(
                "PokerLabLessons : progression sauvegardée illisible.",
                error
            );

            progress = {
                completedLessons: [],
                lastLessonId: null
            };

        }

    }


    /* =====================================================
       5. VALIDATION DES LEÇONS
       ===================================================== */

    function validateLesson(lesson) {

        const errors = [];

        if (!lesson || typeof lesson !== "object") {

            return {
                valid: false,
                errors: ["Leçon invalide."]
            };

        }

        if (!lesson.id) {
            errors.push("Identifiant manquant.");
        }

        if (!lesson.title) {
            errors.push("Titre manquant.");
        }

        if (
            lesson.content === undefined &&
            lesson.sections === undefined
        ) {
            errors.push(
                "La leçon doit contenir un contenu ou des sections."
            );
        }

        if (
            lesson.sections !== undefined &&
            !Array.isArray(lesson.sections)
        ) {
            errors.push("Les sections doivent être un tableau.");
        }

        return {
            valid: errors.length === 0,
            errors
        };

    }


    function validateCollection(collection) {

        if (!Array.isArray(collection)) {

            return {
                valid: false,
                errors: ["Le catalogue doit être un tableau."]
            };

        }

        const errors = [];
        const ids = new Set();

        collection.forEach((lesson, index) => {

            const validation = validateLesson(lesson);

            if (!validation.valid) {

                errors.push({
                    index,
                    id: lesson?.id ?? null,
                    errors: validation.errors
                });

            }

            const id = normalizeId(lesson?.id);

            if (id && ids.has(id)) {

                errors.push({
                    index,
                    id,
                    errors: ["Identifiant de leçon dupliqué."]
                });

            }

            if (id) {
                ids.add(id);
            }

        });

        return {
            valid: errors.length === 0,
            errors
        };

    }


    /* =====================================================
       6. CHARGEMENT DU CATALOGUE
       ===================================================== */

    async function loadLessons(url = DATA_URL) {

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
                : data.lessons;

            const validation = validateCollection(collection);

            if (!validation.valid) {

                throw new Error(
                    `Catalogue invalide : ${
                        JSON.stringify(validation.errors)
                    }`
                );

            }

            lessons = collection.map(lesson => clone(lesson));

            // Élimine les références à des leçons supprimées.

            const availableIds = new Set(
                lessons.map(lesson => normalizeId(lesson.id))
            );

            progress.completedLessons =
                progress.completedLessons.filter(
                    id => availableIds.has(id)
                );

            if (
                progress.lastLessonId &&
                !availableIds.has(progress.lastLessonId)
            ) {
                progress.lastLessonId = null;
            }

            saveProgress();

            dispatch(EVENTS.LOADED, {
                count: lessons.length
            });

            return {
                success: true,
                count: lessons.length
            };

        } catch (error) {

            console.error(
                "PokerLabLessons : chargement impossible.",
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
       7. CATALOGUE ET RECHERCHE
       ===================================================== */

    function getAllLessons() {

        return lessons.map(lesson => ({
            ...clone(lesson),
            completed: isCompleted(lesson.id)
        }));

    }


    function getLesson(id) {

        const lesson = lessons.find(
            item => normalizeId(item.id) === normalizeId(id)
        );

        if (!lesson) {
            return null;
        }

        return {
            ...clone(lesson),
            completed: isCompleted(lesson.id)
        };

    }


    function getLessonsByCategory(category) {

        const normalizedCategory = String(category)
            .trim()
            .toLowerCase();

        return getAllLessons().filter(lesson => {

            return String(lesson.category || "")
                .toLowerCase() === normalizedCategory;

        });

    }


    /* =====================================================
       8. OUVERTURE D'UNE LEÇON
       ===================================================== */

    function openLesson(id) {

        const lesson = lessons.find(
            item => normalizeId(item.id) === normalizeId(id)
        );

        if (!lesson) {

            return {
                success: false,
                error: "Leçon introuvable."
            };

        }

        currentLesson = lesson;

        progress.lastLessonId = normalizeId(lesson.id);

        saveProgress();

        dispatch(EVENTS.OPENED, {
            lesson: getLesson(lesson.id)
        });

        return {
            success: true,
            lesson: getLesson(lesson.id)
        };

    }


    function getCurrentLesson() {

        if (!currentLesson) {
            return null;
        }

        return getLesson(currentLesson.id);

    }


    /* =====================================================
       9. SUIVI DE PROGRESSION
       ===================================================== */

    function isCompleted(id) {

        return progress.completedLessons.includes(
            normalizeId(id)
        );

    }


    function completeLesson(id) {

        const lesson = lessons.find(
            item => normalizeId(item.id) === normalizeId(id)
        );

        if (!lesson) {

            return {
                success: false,
                error: "Leçon introuvable."
            };

        }

        const lessonId = normalizeId(lesson.id);

        if (!isCompleted(lessonId)) {

            progress.completedLessons.push(lessonId);

        }

        progress.lastLessonId = lessonId;

        saveProgress();

        const statistics = getProgress();

        dispatch(EVENTS.COMPLETED, {
            lessonId,
            statistics
        });

        dispatch(EVENTS.PROGRESS_UPDATED, {
            statistics
        });

        return {
            success: true,
            statistics
        };

    }


    function resetProgress() {

        progress = {
            completedLessons: [],
            lastLessonId: null
        };

        saveProgress();

        dispatch(EVENTS.PROGRESS_UPDATED, {
            statistics: getProgress()
        });

        return getProgress();

    }


    function getProgress() {

        const total = lessons.length;

        const completed = lessons.filter(
            lesson => isCompleted(lesson.id)
        ).length;

        const percentage = total > 0
            ? Math.round((completed / total) * 100)
            : 0;

        return {
            total,
            completed,
            remaining: total - completed,
            percentage,
            lastLessonId: progress.lastLessonId
        };

    }


    function getNextLesson() {

        const next = lessons.find(
            lesson => !isCompleted(lesson.id)
        );

        return next
            ? getLesson(next.id)
            : null;

    }


    /* =====================================================
       10. AFFICHAGE DU CONTENU
       ===================================================== */

    function renderSection(section) {

        const element = createElement(
            "section",
            "pl-lesson-section"
        );

        if (section.title) {

            element.appendChild(
                createElement(
                    "h3",
                    "pl-lesson-section-title",
                    section.title
                )
            );

        }

        if (section.content) {

            element.appendChild(
                createElement(
                    "p",
                    "pl-lesson-section-content",
                    section.content
                )
            );

        }

        if (Array.isArray(section.items)) {

            const list = createElement(
                "ul",
                "pl-lesson-list"
            );

            section.items.forEach(item => {

                list.appendChild(
                    createElement(
                        "li",
                        "pl-lesson-list-item",
                        item
                    )
                );

            });

            element.appendChild(list);

        }

        if (section.tip) {

            element.appendChild(
                createElement(
                    "aside",
                    "pl-lesson-tip",
                    section.tip
                )
            );

        }

        return element;

    }


    function renderLesson(container, lesson = currentLesson) {

        if (!(container instanceof HTMLElement)) {

            throw new Error(
                "Conteneur de leçon invalide."
            );

        }

        if (!lesson) {

            container.replaceChildren();

            container.appendChild(
                createElement(
                    "p",
                    "pl-lesson-empty",
                    "Aucune leçon sélectionnée."
                )
            );

            return;

        }

        container.replaceChildren();

        container.classList.add("pl-lesson-container");

        const header = createElement(
            "div",
            "pl-lesson-header"
        );

        header.appendChild(
            createElement(
                "h2",
                "pl-lesson-title",
                lesson.title
            )
        );

        if (lesson.category) {

            header.appendChild(
                createElement(
                    "span",
                    "pl-lesson-category",
                    lesson.category
                )
            );

        }

        if (lesson.description) {

            header.appendChild(
                createElement(
                    "p",
                    "pl-lesson-description",
                    lesson.description
                )
            );

        }

        container.appendChild(header);

        const content = createElement(
            "div",
            "pl-lesson-content"
        );

        if (Array.isArray(lesson.sections)) {

            lesson.sections.forEach(section => {

                content.appendChild(
                    renderSection(section)
                );

            });

        } else if (lesson.content) {

            content.appendChild(
                createElement(
                    "p",
                    "pl-lesson-text",
                    lesson.content
                )
            );

        }

        container.appendChild(content);

        const completed = isCompleted(lesson.id);

        const completeButton = createElement(
            "button",
            "pl-button pl-lesson-complete",
            completed
                ? "Leçon terminée"
                : "Marquer comme terminée"
        );

        completeButton.type = "button";
        completeButton.disabled = completed;

        completeButton.addEventListener("click", () => {

            const result = completeLesson(lesson.id);

            if (result.success) {

                completeButton.textContent = "Leçon terminée";
                completeButton.disabled = true;

                renderProgress();

            }

        });

        container.appendChild(completeButton);

    }


    /* =====================================================
       11. AFFICHAGE DE LA PROGRESSION
       ===================================================== */

    function renderProgress(container = null) {

        if (!container) {

            container = document.querySelector(
                "[data-lessons-progress]"
            );

        }

        if (!container) {
            return null;
        }

        const stats = getProgress();

        container.replaceChildren();

        const label = createElement(
            "div",
            "pl-progress-label",
            `${stats.completed} / ${stats.total} leçons terminées`
        );

        const progressBar = createElement(
            "div",
            "pl-progress-bar"
        );

        const progressFill = createElement(
            "div",
            "pl-progress-fill"
        );

        progressFill.style.width = `${stats.percentage}%`;

        progressBar.setAttribute(
            "role",
            "progressbar"
        );

        progressBar.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressBar.setAttribute(
            "aria-valuemax",
            "100"
        );

        progressBar.setAttribute(
            "aria-valuenow",
            String(stats.percentage)
        );

        progressBar.appendChild(progressFill);

        const percentage = createElement(
            "span",
            "pl-progress-percentage",
            `${stats.percentage}%`
        );

        container.appendChild(label);
        container.appendChild(progressBar);
        container.appendChild(percentage);

        return stats;

    }


    /* =====================================================
       12. AFFICHAGE DU CATALOGUE
       ===================================================== */

    function renderCatalog(container) {

        if (!(container instanceof HTMLElement)) {

            throw new Error(
                "Conteneur du catalogue invalide."
            );

        }

        container.replaceChildren();

        const catalog = createElement(
            "div",
            "pl-lesson-catalog"
        );

        lessons.forEach((lesson, index) => {

            const completed = isCompleted(lesson.id);

            const card = createElement(
                "article",
                "pl-lesson-card"
            );

            card.classList.toggle(
                "is-completed",
                completed
            );

            const number = createElement(
                "span",
                "pl-lesson-number",
                `Leçon ${index + 1}`
            );

            const title = createElement(
                "h3",
                "pl-lesson-card-title",
                lesson.title
            );

            card.appendChild(number);
            card.appendChild(title);

            if (lesson.description) {

                card.appendChild(
                    createElement(
                        "p",
                        "pl-lesson-card-description",
                        lesson.description
                    )
                );

            }

            const status = createElement(
                "span",
                "pl-lesson-card-status",
                completed ? "Terminée" : "À découvrir"
            );

            card.appendChild(status);

            const button = createElement(
                "button",
                "pl-button pl-lesson-open",
                "Ouvrir la leçon"
            );

            button.type = "button";

            button.addEventListener("click", () => {

                const result = openLesson(lesson.id);

                if (!result.success) {
                    return;
                }

                const lessonContainer = document.querySelector(
                    "[data-lesson-content]"
                );

                if (lessonContainer) {
                    renderLesson(lessonContainer, currentLesson);
                }

            });

            card.appendChild(button);

            catalog.appendChild(card);

        });

        container.appendChild(catalog);

        renderProgress();

        return catalog;

    }


    /* =====================================================
       13. INITIALISATION
       ===================================================== */

    async function init() {

        if (initialized) {
            return;
        }

        loadProgress();

        const result = await loadLessons();

        if (!result.success) {
            return;
        }

        initialized = true;

        const catalogContainer = document.querySelector(
            "[data-lessons-catalog]"
        );

        if (catalogContainer) {
            renderCatalog(catalogContainer);
        }

        renderProgress();

        if (progress.lastLessonId) {

            const savedLesson = lessons.find(
                lesson =>
                    normalizeId(lesson.id) === progress.lastLessonId
            );

            if (savedLesson) {
                currentLesson = savedLesson;
            }

        }

    }


    /* =====================================================
       14. EXPORT PUBLIC
       ===================================================== */

    return {

        init,

        loadLessons,

        validateLesson,

        validateCollection,

        getAllLessons,

        getLesson,

        getLessonsByCategory,

        openLesson,

        getCurrentLesson,

        completeLesson,

        isCompleted,

        getProgress,

        getNextLesson,

        resetProgress,

        renderLesson,

        renderCatalog,

        renderProgress,

        EVENTS

    };

})();
