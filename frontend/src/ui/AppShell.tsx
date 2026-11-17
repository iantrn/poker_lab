import { HomePage } from "./HomePage";
import { TrainingPage } from "./TrainingPage";
import { TacticsPage } from "./TacticsPage";
import { LessonsPage } from "./LessonsPage";
import { ReviewPage } from "./ReviewPage";
import { SettingsPage } from "./SettingsPage";
import { PokerLabIcon, type PokerLabIconName } from "./PokerLabIcon";

/**
 * React-owned structural shell. Stable IDs, data-page anchors, data-module
 * targets and imperative poker module mounts are intentionally unchanged.
 */
const DESKTOP_NAV: ReadonlyArray<{ page: string; label: string; icon: PokerLabIconName }> = [
  { page: "home", label: "Accueil", icon: "home" },
  { page: "training", label: "Jouer", icon: "play" },
  { page: "tactics", label: "Tactiques", icon: "tactics" },
  { page: "lessons", label: "Apprentissage", icon: "learn" },
  { page: "review", label: "Game Review", icon: "review" }
];
const MOBILE_NAV: ReadonlyArray<{ page: string; label: string; icon: PokerLabIconName }> = [
  { page: "home", label: "Accueil", icon: "home" },
  { page: "training", label: "Jouer", icon: "play" },
  { page: "tactics", label: "Tactiques", icon: "tactics" },
  { page: "lessons", label: "Apprendre", icon: "learn" },
  { page: "review", label: "Review", icon: "review" }
];
const pageClass = "mb-10 scroll-mt-6";

export function AppShell() {
  return <div id="app" className="min-h-screen flex flex-col">
    <header className="pl-shell-header w-full border-b">
      <div className="pl-shell-header-inner max-w-7xl mx-auto px-4 flex items-center justify-between">
        <a href="#home" data-page="home" className="pl-brand flex items-center gap-3">
          <img src={import.meta.env.BASE_URL + "assets/icons/pokerlab-mark.svg"} width={40} height={40} alt="" className="pl-brand-mark" />
          <span className="pl-brand-wordmark">
            <span className="pl-brand-name">POKERLAB</span>
            <span className="pl-brand-caption">Texas Hold'em Training</span>
          </span>
        </a>
        <nav className="pl-desktop-nav hidden md:flex items-center" aria-label="Navigation principale">
          {DESKTOP_NAV.map(({ page, label, icon }) =>
            <a key={page} href={"#" + page} data-page={page} className="pl-nav-link">
              <PokerLabIcon name={icon} size={18} /><span>{label}</span>
            </a>)}
        </nav>
        <a href="#settings" data-page="settings" className="pl-settings-link"
          aria-label="Paramètres" title="Paramètres">
          <PokerLabIcon name="settings" size={20} />
        </a>
      </div>
    </header>

    <main className="pl-shell-main flex-1 w-full max-w-7xl mx-auto px-4 py-8">
      <section id="home" data-module="home" className="mb-10"><HomePage /></section>
      <section id="training" data-module="training" className={pageClass} hidden><TrainingPage /></section>
      <section id="tactics" data-module="tactics" className={pageClass} hidden><TacticsPage /></section>
      <section id="lessons" data-module="lessons" className={pageClass} hidden><LessonsPage /></section>
      <section id="review" data-module="review" className={pageClass} hidden><ReviewPage /></section>
      <section id="settings" data-module="settings" className={pageClass} hidden><SettingsPage /></section>
    </main>

    <nav className="pl-mobile-nav md:hidden fixed bottom-0 left-0 w-full z-50"
      aria-label="Navigation mobile">
      <div className="pl-mobile-nav-grid grid grid-cols-5 max-w-xl mx-auto">
        {MOBILE_NAV.map(({ page, icon, label }) =>
          <a href={"#" + page} data-page={page} key={page} className="pl-mobile-link">
            <PokerLabIcon name={icon} size={21} /><span>{label}</span>
          </a>)}
      </div>
    </nav>
    <footer className="pl-shell-footer hidden md:block border-t mt-8">
      <div className="max-w-7xl mx-auto px-4 py-5 text-center">
        <p className="text-xs text-textMuted">PokerLab — Texas Hold'em Training Platform</p>
      </div>
    </footer>
  </div>;
}
