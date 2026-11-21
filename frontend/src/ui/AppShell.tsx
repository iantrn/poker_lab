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
const views = [HomePage, TrainingPage, TacticsPage, LessonsPage, ReviewPage, SettingsPage];
const modules = ["home","training","tactics","lessons","review","settings"];

function NavigationLinks({mobile=false}:{mobile?:boolean}){
  return <>{destinations.map(item=><a key={item.page} href={"#"+item.page} data-page={item.page}
    className={mobile?"pl-mobile-link nct-mobile-link":"pl-sidebar-link nct-nav-link"}
    aria-label={item.label} title={item.label}>
    <PokerLabIcon name={item.icon} size={20}/><span>{mobile?item.mobile:item.label}</span>
  </a>)}</>;
}

export function AppShell(){
  return <div id="app" className="pl-app-frame nct-app">
    <aside className="nct-rail" aria-label="Espace de travail">
      <a href="#home" className="nct-brand" data-page="home">
        <img src={import.meta.env.BASE_URL+"assets/icons/pokerlab-mark.svg"} width={36} height={36} alt=""/>
        <span>PokerLab<small>NOCTURNE</small></span>
      </a>
      <div className="nct-nav-label">ESPACE DE JEU</div>
      <nav className="pl-sidebar-nav nct-navigation" aria-label="Navigation principale"><NavigationLinks/></nav>
      <div className="nct-rail-bottom">
        <a href="#settings" data-page="settings" className="pl-sidebar-link nct-nav-link"><PokerLabIcon name="settings" size={20}/><span>Paramètres</span></a>
        <small>NO-LIMIT HOLD'EM<br/>Entraînement sans argent réel</small>
      </div>
    </aside>
    <div className="nct-workspace">
      <header className="nct-topbar">
        <a href="#home" className="nct-brand nct-compact-brand" data-page="home">
          <img src={import.meta.env.BASE_URL+"assets/icons/pokerlab-mark.svg"} width={30} height={30} alt=""/>
          <span>PokerLab</span>
        </a>
        <span className="nct-topbar-caption">LABORATOIRE STRATÉGIQUE</span>
        <a href="#settings" data-page="settings" className="nct-settings" aria-label="Paramètres" title="Paramètres"><PokerLabIcon name="settings" size={20}/></a>
      </header>
      <main className="nct-main">
        {views.map((View,index)=><section key={modules[index]} id={modules[index]} data-module={modules[index]} hidden={index!==0}><View/></section>)}
      </main>
    </div>
    <nav className="pl-mobile-nav nct-mobile" aria-label="Navigation mobile"><NavigationLinks mobile/></nav>
  </div>;
}
