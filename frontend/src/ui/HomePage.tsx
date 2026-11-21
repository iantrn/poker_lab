import { PokerLabIcon, type PokerLabIconName } from "./PokerLabIcon";
import type { MouseEvent } from "react";

interface HomeDestination {
  page:"training"|"tactics"|"lessons"|"review"|"settings";
  icon:PokerLabIconName;
  title:string;
  description:string;
  number:string;
  tag:string;
}
const DESTINATIONS:readonly HomeDestination[]=[
  {page:"training",icon:"play",title:"Jouer",number:"01",tag:"TABLE INTERACTIVE",
    description:"Mets tes décisions à l'épreuve contre des adversaires virtuels."},
  {page:"tactics",icon:"tactics",title:"Tactiques",number:"02",tag:"EXERCICES",
    description:"Résous des situations concrètes et développe tes automatismes."},
  {page:"lessons",icon:"learn",title:"Apprentissage",number:"03",tag:"COURS + RANGES",
    description:"Construis ta compréhension des ranges et des concepts du jeu."},
  {page:"review",icon:"review",title:"Game Review",number:"04",tag:"ANALYSE",
    description:"Rejoue tes mains et examine les décisions importantes."},
  {page:"settings",icon:"settings",title:"Paramètres",number:"05",tag:"PRÉFÉRENCES",
    description:"Retrouve les informations de ton espace de travail."}
];
function navigate(event:MouseEvent<HTMLAnchorElement>,page:string) {
  if(event.defaultPrevented)return;
  const navigation=(window as Window&{PokerLabNavigation?:{navigateTo(page:string):boolean}}).PokerLabNavigation;
  if(navigation){event.preventDefault();navigation.navigateTo(page);}
}
export function HomePage(){
  return <>
    <div className="pl-home-intro mb-8">
      <div className="pl-home-hero-copy">
        <p className="pl-home-eyebrow"><span className="pl-status-dot" aria-hidden="true"/> LE LABORATOIRE DU POKER</p>
        <h2 className="pl-home-title">Joue avec instinct.<br/><span>Progresse avec méthode.</span></h2>
        <p className="pl-home-description">
          De la première décision à l'analyse de la dernière main.
          Une seule interface pour jouer, apprendre et comprendre le No-Limit Hold'em.
        </p>
        <div className="pl-home-hero-actions">
          <a href="#training" data-page="training" onClick={event=>navigate(event,"training")}
            className="pl-home-primary-link">Entrer à la table <PokerLabIcon name="arrow-right" size={19}/></a>
          <a href="#lessons" data-page="lessons" onClick={event=>navigate(event,"lessons")}
            className="pl-home-secondary-link">Étudier les ranges</a>
        </div>
        <p className="pl-home-meta">POKERLAB <span aria-hidden="true">/</span> NLH <span aria-hidden="true">/</span> OFFLINE FIRST</p>
      </div>
      <div className="pl-home-visual" aria-hidden="true">
        <div className="pl-preview-label"><span>LIVE LAB</span><span>01 / TABLE</span></div>
        <div className="pl-preview-arena">
          <div className="pl-preview-felt">
            <span className="pl-preview-seat pl-preview-seat-a">BB · 100</span>
            <span className="pl-preview-seat pl-preview-seat-b">BTN · 88</span>
            <span className="pl-preview-seat pl-preview-seat-c">SB · 102</span>
            <div className="pl-preview-board">
              <span className="pl-preview-card">A<span>♠</span></span>
              <span className="pl-preview-card">K<span>♥</span></span>
              <span className="pl-preview-card">7<span>♣</span></span>
              <span className="pl-preview-card pl-preview-card-dim"/>
              <span className="pl-preview-card pl-preview-card-dim"/>
            </div>
            <span className="pl-preview-pot">POT 12.5 BB</span>
          </div>
        </div>
        <div className="pl-preview-bottom"><span className="pl-preview-pulse"/> DÉCISION SUIVANTE <strong>À TOI DE JOUER</strong></div>
      </div>
    </div>
    <section className="pl-home-discover" aria-labelledby="pl-home-discover-title">
      <div className="pl-home-section-heading">
        <div><p className="pl-home-eyebrow">DÉCOUVRIR L'APPLICATION</p>
          <h3 id="pl-home-discover-title">Ton espace. Tes décisions.</h3></div>
        <span className="pl-home-section-count">05 MODULES</span>
      </div>
      <div className="pl-home-grid">
        {DESTINATIONS.map(({page,icon,title,description,number,tag})=>
          <a href={"#"+page} data-page={page} key={page} onClick={event=>navigate(event,page)}
            className={"pl-home-card pl-home-card--"+page}>
            <span className="pl-home-card-top">
              <span className="pl-home-card-number">{number} / 05</span>
              <span className="pl-home-card-tag">{tag}</span>
            </span>
            <span className="pl-home-card-content">
              <span className="pl-home-card-icon"><PokerLabIcon name={icon} size={23}/></span>
              <h3 className="pl-home-card-title">{title}</h3>
              <p className="pl-home-card-description">{description}</p>
            </span>
            <span className="pl-home-card-arrow"><PokerLabIcon name="arrow-right" size={20}/></span>
          </a>)}
      </div>
    </section>
  </>;
}
