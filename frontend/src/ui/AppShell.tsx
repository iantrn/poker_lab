import { HomePage } from "./HomePage";
import { TrainingPage } from "./TrainingPage";
import { TacticsPage } from "./TacticsPage";
import { LessonsPage } from "./LessonsPage";
import { ReviewPage } from "./ReviewPage";
import { SettingsPage } from "./SettingsPage";
import { PokerLabIcon, type PokerLabIconName } from "./PokerLabIcon";

/**
 * A genuine application workspace: persistent navigation rail on wide screens,
 * narrow top navigation on laptop/tablet, bottom tab bar on small screens.
 * data-page, data-module and original runtime mount points remain unchanged.
 */
const DESKTOP_NAV: ReadonlyArray<{page:string;label:string;icon:PokerLabIconName;hint:string}> = [
  {page:"home",label:"Accueil",icon:"home",hint:"Vue d'ensemble"},
  {page:"training",label:"Jouer",icon:"play",hint:"Entraînement libre"},
  {page:"tactics",label:"Tactiques",icon:"tactics",hint:"Prise de décision"},
  {page:"lessons",label:"Apprentissage",icon:"learn",hint:"Cours et ranges"},
  {page:"review",label:"Game Review",icon:"review",hint:"Historique et analyse"}
];
const MOBILE_NAV: ReadonlyArray<{page:string;label:string;ariaLabel:string;icon:PokerLabIconName}> = [
  {page:"home",label:"Accueil",ariaLabel:"Accueil",icon:"home"},
  {page:"training",label:"Jouer",ariaLabel:"Jouer",icon:"play"},
  {page:"tactics",label:"Exos",ariaLabel:"Tactiques et exercices",icon:"tactics"},
  {page:"lessons",label:"Leçons",ariaLabel:"Apprentissage et ranges",icon:"learn"},
  {page:"review",label:"Analyse",ariaLabel:"Game Review",icon:"review"}
];
const pageClass = "mb-10 scroll-mt-6";

export function AppShell() {
  return <div id="app" className="pl-app-frame">
    <header className="pl-shell-header w-full border-b">
      <div className="pl-shell-header-inner">
        <a href="#home" data-page="home" className="pl-brand flex items-center gap-3">
          <img src={import.meta.env.BASE_URL+"assets/icons/pokerlab-mark.svg"} width={40} height={40}
            alt="" className="pl-brand-mark"/>
          <span className="pl-brand-wordmark">
            <span className="pl-brand-name">POKERLAB</span>
            <span className="pl-brand-caption">Étudier · Jouer · Progresser</span>
          </span>
        </a>
        <nav className="pl-desktop-nav hidden md:flex items-center" aria-label="Navigation principale">
          {DESKTOP_NAV.map(({page,label,icon})=>
            <a key={page} href={"#"+page} data-page={page} className="pl-nav-link"
              aria-label={label} title={label}>
              <PokerLabIcon name={icon} size={18}/><span>{label}</span>
            </a>)}
        </nav>
        <a href="#settings" data-page="settings" className="pl-settings-link"
          aria-label="Paramètres" title="Paramètres"><PokerLabIcon name="settings" size={20}/></a>
      </div>
    </header>

    <aside className="pl-sidebar" aria-label="Espace de travail PokerLab">
      <div className="pl-sidebar-top">
        <span className="pl-sidebar-label">ESPACE DE TRAVAIL</span>
        <span className="pl-sidebar-edition">POKERLAB <span>NLH / 01</span></span>
      </div>
      <nav className="pl-sidebar-nav" aria-label="Navigation latérale">
        {DESKTOP_NAV.map(({page,label,icon,hint},index)=>
          <a key={page} href={"#"+page} data-page={page} className="pl-sidebar-link" title={hint}>
            <span className="pl-sidebar-link-icon"><PokerLabIcon name={icon} size={21}/></span>
            <span className="pl-sidebar-link-copy"><strong>{label}</strong><small>{hint}</small></span>
            <span className="pl-sidebar-index">{String(index+1).padStart(2,"0")}</span>
          </a>)}
      </nav>
      <div className="pl-sidebar-bottom">
        <div className="pl-sidebar-study-mark" aria-hidden="true">♠</div>
        <strong>Le travail fait la différence.</strong>
        <p>Observe. Décide. Analyse. Recommence.</p>
        <a href="#settings" data-page="settings">Préférences <PokerLabIcon name="arrow-right" size={15}/></a>
      </div>
    </aside>

    <main className="pl-shell-main">
      <section id="home" data-module="home" className="mb-10"><HomePage/></section>
      <section id="training" data-module="training" className={pageClass} hidden><TrainingPage/></section>
      <section id="tactics" data-module="tactics" className={pageClass} hidden><TacticsPage/></section>
      <section id="lessons" data-module="lessons" className={pageClass} hidden><LessonsPage/></section>
      <section id="review" data-module="review" className={pageClass} hidden><ReviewPage/></section>
      <section id="settings" data-module="settings" className={pageClass} hidden><SettingsPage/></section>
    </main>

    <nav className="pl-mobile-nav md:hidden fixed bottom-0 left-0 w-full z-50" aria-label="Navigation mobile">
      <div className="pl-mobile-nav-grid grid grid-cols-5 max-w-xl mx-auto">
        {MOBILE_NAV.map(({page,icon,label,ariaLabel})=>
          <a href={"#"+page} data-page={page} key={page} className="pl-mobile-link"
            aria-label={ariaLabel} title={ariaLabel}>
            <PokerLabIcon name={icon} size={21}/><span>{label}</span>
          </a>)}
      </div>
    </nav>
    <footer className="pl-shell-footer hidden md:block border-t">
      <p>PokerLab <span aria-hidden="true">/</span> Un environnement d'entraînement au poker, sans argent réel.</p>
      <span>NO-LIMIT HOLD'EM</span>
    </footer>
  </div>;
}
