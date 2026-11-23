import { HomePage } from "./HomePage";
import { TrainingPage } from "./TrainingPage";
import { TacticsPage } from "./TacticsPage";
import { LessonsPage } from "./LessonsPage";
import { ReviewPage } from "./ReviewPage";
import { SettingsPage } from "./SettingsPage";
import { PokerLabIcon, type PokerLabIconName } from "./PokerLabIcon";

const destinations: ReadonlyArray<{page:string;label:string;mobile:string;icon:PokerLabIconName}> = [
  {page:"home",label:"Accueil",mobile:"Accueil",icon:"home"},
  {page:"training",label:"Jouer",mobile:"Jouer",icon:"play"},
  {page: "tactics", label: "Exos",mobile:"Exos",icon:"tactics"},
  {page: "lessons", label: "Leçons",mobile:"Leçons",icon:"learn"},
  {page: "review", label: "Analyse",mobile:"Analyse",icon:"review"}
];

function NavigationLinks({mobile=false}:{mobile?:boolean}){
  return <>{destinations.map(item=>{const ariaLabel=item.page==="tactics"?"Tactiques et exercices":item.page==="review"?"Game Review":item.page==="lessons"?"Apprentissage et ranges":item.label;return <a key={item.page} href={"#"+item.page} data-page={item.page}
    className={mobile?"pl-mobile-link studio-route":"studio-route"}
    aria-label={ariaLabel} title={ariaLabel}>
    <PokerLabIcon name={item.icon} size={20}/><span>{mobile?item.mobile:item.label}</span>
  </a>})}</>;
}

export function AppShell() {
  return <div id="app" className="studio">
    <header className="masthead">
      <a className="wordmark" href="#home" data-page="home">
        <img className="pl-brand-mark" src={import.meta.env.BASE_URL + "assets/icons/pokerlab-mark.svg"} width="36" height="36" alt="" />
        PokerLab
      </a>
      <nav className="desktop-routes" aria-label="Navigation principale"><NavigationLinks /></nav>
      <a className="settings-link" href="#settings" data-page="settings" aria-label="Paramètres"><PokerLabIcon name="settings" /></a>
    </header>
    <main className="studio-main">
        <section id="home" data-module="home"><HomePage/></section>
        <section id="training" data-module="training" hidden><TrainingPage/></section>
        <section id="tactics" data-module="tactics" hidden><TacticsPage/></section>
        <section id="lessons" data-module="lessons" hidden><LessonsPage/></section>
        <section id="review" data-module="review" hidden><ReviewPage/></section>
        <section id="settings" data-module="settings" hidden><SettingsPage/></section>
    </main>
    <nav className="pl-mobile-nav pocket-routes" aria-label="Navigation mobile"><NavigationLinks mobile /></nav>
  </div>;
}
