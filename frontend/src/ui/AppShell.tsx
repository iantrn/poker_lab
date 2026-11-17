import { HomePage } from "./HomePage";
import { TrainingPage } from "./TrainingPage";
import { TacticsPage } from "./TacticsPage";
import { LessonsPage } from "./LessonsPage";
import { ReviewPage } from "./ReviewPage";
import { SettingsPage } from "./SettingsPage";

/**
 * React-owned structural shell. All stable V1 IDs, data-module targets,
 * data-page anchors, mobile navigation and interactive mount points remain
 * unchanged; typed poker modules still own their live table and result nodes.
 */
const DESKTOP_NAV = [
  {page:"home",label:"Accueil"},
  {page:"training",label:"Jouer"},
  {page:"tactics",label:"Tactiques"},
  {page:"lessons",label:"Apprentissage"},
  {page:"review",label:"Game Review"}
] as const;
const MOBILE_NAV = [
  {page:"home",icon:"⌂",label:"Accueil"},
  {page:"training",icon:"♠",label:"Jouer"},
  {page:"tactics",icon:"🎯",label:"Tactiques"},
  {page:"lessons",icon:"📚",label:"Leçons"},
  {page:"settings",icon:"⚙",label:"Réglages"}
] as const;
const pageClass="mb-10 scroll-mt-6";
export function AppShell() {
  return <div id="app" className="min-h-screen flex flex-col">
    <header className="w-full bg-surface border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <a href="#home" data-page="home" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-xl font-bold">
            ♠
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wide">POKERLAB</h1>
            <p className="text-xs text-textMuted">Texas Hold'em Training</p>
          </div>
        </a>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          {DESKTOP_NAV.map(({page,label})=>
            <a key={page} href={"#"+page} data-page={page}
              className="text-textMuted hover:text-white transition">{label}</a>)}
        </nav>
        <a href="#settings" data-page="settings"
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-surfaceLight hover:bg-white/10 transition"
          aria-label="Paramètres">⚙</a>
      </div>
    </header>

    <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
      <section id="home" data-module="home" className="mb-10"><HomePage /></section>
      <section id="training" data-module="training" className={pageClass} hidden>
        <TrainingPage />
      </section>
      <section id="tactics" data-module="tactics" className={pageClass} hidden>
        <TacticsPage />
      </section>
      <section id="lessons" data-module="lessons" className={pageClass} hidden>
        <LessonsPage />
      </section>
      <section id="review" data-module="review" className={pageClass} hidden>
        <ReviewPage />
      </section>
      <section id="settings" data-module="settings" className={pageClass} hidden>
        <SettingsPage />
      </section>
    </main>

    <nav className="md:hidden fixed bottom-0 left-0 w-full bg-surface border-t border-white/10 z-50">
      <div className="grid grid-cols-5 max-w-xl mx-auto py-3">
        {MOBILE_NAV.map(({page,icon,label})=>
          <a href={"#"+page} data-page={page} key={page}
            className="flex flex-col items-center gap-1 text-xs text-textMuted">
            <span className="text-xl">{icon}</span>{label}
          </a>)}
      </div>
    </nav>
    <footer className="hidden md:block border-t border-white/10 bg-surface mt-8">
      <div className="max-w-7xl mx-auto px-4 py-5 text-center">
        <p className="text-xs text-textMuted">PokerLab — Texas Hold'em Training Platform</p>
      </div>
    </footer>
  </div>;
}
