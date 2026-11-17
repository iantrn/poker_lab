/** Strict TypeScript port of the original navigation module.
 * The V1 script remains unchanged for baseline tests and rollback.
 */
const DEFAULT_PAGE = "home";
const VALID_PAGES = ["home", "training", "tactics", "lessons", "review", "settings"] as const;
export type PokerLabPage = (typeof VALID_PAGES)[number];
type NavigateOptions = { updateHash?: boolean };
export interface NavigationApi {
  init(): void;
  navigateTo(page: string, options?: NavigateOptions): boolean;
  getCurrentPage(): PokerLabPage;
  getAvailablePages(): PokerLabPage[];
}
const SELECTORS = {
  navigationLinks: "[data-page]",
  pageSections: "[data-module]",
  mobileNavigation: ".pl-mobile-nav"
} as const;
function isValidPage(value: string | undefined): value is PokerLabPage {
  return VALID_PAGES.some(page => page === value);
}
export function installNavigation(): NavigationApi {
  const target = window as Window & { PokerLabNavigation?: NavigationApi };
  if (target.PokerLabNavigation) return target.PokerLabNavigation;
  const getPageFromHash = (): PokerLabPage => {
    const hash = window.location.hash.replace(/^#\/?/, "");
    return isValidPage(hash) ? hash : DEFAULT_PAGE;
  };
  const getPageSection = (page: string): HTMLElement | null =>
    document.querySelector<HTMLElement>('[data-module="' + page + '"]');
  const getNavigationLinks = (): NodeListOf<HTMLElement> =>
    document.querySelectorAll<HTMLElement>(SELECTORS.navigationLinks);
  const getPageSections = (): NodeListOf<HTMLElement> =>
    document.querySelectorAll<HTMLElement>(SELECTORS.pageSections);
  const updateNavigationLinks = (page: string): void => {
    getNavigationLinks().forEach(link => {
      const isActive = link.dataset.page === page;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  };
  const updatePageSections = (page: string): void => {
    getPageSections().forEach(section => {
      const isActive = section.dataset.module === page;
      section.hidden = !isActive;
      section.classList.toggle("is-active", isActive);
    });
    if (!getPageSection(page)) console.warn('PokerLabNavigation : section "' + page + '" introuvable.');
  };
  const navigateTo = (page: string, options: NavigateOptions = {}): boolean => {
    if (!isValidPage(page)) {
      console.warn('PokerLabNavigation : page inconnue "' + page + '".');
      return false;
    }
    const updateHash = options.updateHash !== false;
    if (updateHash && window.location.hash !== "#" + page) window.location.hash = page;
    updateNavigationLinks(page);
    updatePageSections(page);
    // Hash navigation may scroll the browser directly to the section ID.
    // After toggling the active view, always expose its heading/header.
    // Do not use smooth scrolling: this also respects reduced motion.
    window.scrollTo(0, 0);
    window.dispatchEvent(new CustomEvent("pokerlab:navigate", { detail: { page } }));
    return true;
  };
  const bindNavigationLinks = (): void => {
    getNavigationLinks().forEach(link => {
      link.addEventListener("click", event => {
        const page = link.dataset.page;
        if (!isValidPage(page)) return;
        event.preventDefault();
        navigateTo(page);
      });
    });
  };
  const bindHashChanges = (): void => {
    window.addEventListener("hashchange", () => {
      navigateTo(getPageFromHash(), { updateHash: false });
    });
  };
  let initialized = false;
  const init = (): void => {
    if (initialized) return;
    bindNavigationLinks();
    bindHashChanges();
    navigateTo(getPageFromHash(), { updateHash: !window.location.hash });
    initialized = true;
  };
  const api: NavigationApi = {
    init, navigateTo, getCurrentPage: getPageFromHash,
    getAvailablePages: () => [...VALID_PAGES]
  };
  target.PokerLabNavigation = api;
  return api;
}
