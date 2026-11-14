
/* =========================================================
   POKERLAB - NAVIGATION COMPONENT
   Version : 1.0.0
   Description : Navigation entre les modules de PokerLab
   ========================================================= */

"use strict";

window.PokerLabNavigation = (function () {

    /* =====================================================
       1. CONFIGURATION
       ===================================================== */

    const DEFAULT_PAGE = "home";

    const VALID_PAGES = [
        "home",
        "training",
        "tactics",
        "lessons",
        "review",
        "settings"
    ];

    const SELECTORS = {
        navigationLinks: "[data-page]",
        pageSections: "[data-module]",
        mobileNavigation: ".pl-mobile-nav"
    };


    /* =====================================================
       2. OUTILS
       ===================================================== */

    function getPageFromHash() {

        const hash = window.location.hash.replace(/^#\/?/, "");

        if (VALID_PAGES.includes(hash)) {
            return hash;
        }

        return DEFAULT_PAGE;

    }


    function getPageSection(page) {

        return document.querySelector(
            `[data-module="${page}"]`
        );

    }


    function getNavigationLinks() {

        return document.querySelectorAll(
            SELECTORS.navigationLinks
        );

    }


    function getPageSections() {

        return document.querySelectorAll(
            SELECTORS.pageSections
        );

    }


    /* =====================================================
       3. MISE À JOUR DES LIENS
       ===================================================== */

    function updateNavigationLinks(page) {

        const links = getNavigationLinks();

        links.forEach(link => {

            const isActive = link.dataset.page === page;

            link.classList.toggle("is-active", isActive);

            if (isActive) {
                link.setAttribute("aria-current", "page");
            } else {
                link.removeAttribute("aria-current");
            }

        });

    }


    /* =====================================================
       4. AFFICHAGE DES SECTIONS
       ===================================================== */

    function updatePageSections(page) {

        const sections = getPageSections();

        sections.forEach(section => {

            const isActive = section.dataset.module === page;

            section.hidden = !isActive;

            section.classList.toggle("is-active", isActive);

        });

        const activeSection = getPageSection(page);

        if (!activeSection) {

            console.warn(
                `PokerLabNavigation : section "${page}" introuvable.`
            );

        }

    }


    /* =====================================================
       5. NAVIGATION
       ===================================================== */

    function navigateTo(page, options = {}) {

        if (!VALID_PAGES.includes(page)) {

            console.warn(
                `PokerLabNavigation : page inconnue "${page}".`
            );

            return false;

        }

        const updateHash = options.updateHash !== false;

        if (
            updateHash &&
            window.location.hash !== `#${page}`
        ) {

            window.location.hash = page;

        }

        updateNavigationLinks(page);
        updatePageSections(page);

        window.dispatchEvent(
            new CustomEvent("pokerlab:navigate", {
                detail: {
                    page
                }
            })
        );

        return true;

    }


    /* =====================================================
       6. ÉVÉNEMENTS DES LIENS
       ===================================================== */

    function bindNavigationLinks() {

        const links = getNavigationLinks();

        links.forEach(link => {

            link.addEventListener("click", event => {

                const page = link.dataset.page;

                if (!VALID_PAGES.includes(page)) {
                    return;
                }

                event.preventDefault();

                navigateTo(page);

            });

        });

    }


    /* =====================================================
       7. CHANGEMENT DE HASH
       ===================================================== */

    function bindHashChanges() {

        window.addEventListener("hashchange", () => {

            const page = getPageFromHash();

            navigateTo(page, {
                updateHash: false
            });

        });

    }


    /* =====================================================
       8. INITIALISATION
       ===================================================== */

    let initialized = false;

    function init() {

        if (initialized) {
            return;
        }

        bindNavigationLinks();
        bindHashChanges();

        const initialPage = getPageFromHash();

        navigateTo(initialPage, {
            updateHash: !window.location.hash
        });

        initialized = true;

    }


    /* =====================================================
       9. EXPORT PUBLIC
       ===================================================== */

    return {

        init,

        navigateTo,

        getCurrentPage: getPageFromHash,

        getAvailablePages() {
            return [...VALID_PAGES];
        }

    };

})();
