import { PokerLabIcon, type PokerLabIconName } from "./PokerLabIcon";
import type { MouseEvent } from "react";

const modules: ReadonlyArray<{page:string;title:string;detail:string;icon:PokerLabIconName}>=[
  {page:"training",title:"Jouer",detail:"Affronte des bots et teste tes décisions.",icon:"play"},
  {page:"tactics",title:"Tactiques",detail:"Travaille des situations concrètes.",icon:"tactics"},
  {page:"lessons",title:"Apprentissage",detail:"Explore les cours et les ranges.",icon:"learn"},
  {page:"review",title:"Game Review",detail:"Analyse les mains de tes sessions.",icon:"review"},
  {page:"settings",title:"Paramètres",detail:"Retrouve ton environnement de travail.",icon:"settings"}
];
function navigate(event:MouseEvent<HTMLAnchorElement>,page:string){
  if(event.defaultPrevented)return;
  const navigation=(window as Window&{PokerLabNavigation?:{navigateTo(page:string):boolean}}).PokerLabNavigation;
  if(navigation){event.preventDefault();navigation.navigateTo(page);}
}
export function HomePage(){
  return <div className="nct-home">
    <section className="nct-welcome">
      <div className="nct-welcome-copy">
        <p className="nct-kicker">POKERLAB / NOCTURNE</p>
        <h1>Maîtrise<br/>la prochaine<br/><em>décision.</em></h1>
        <p>Un espace pour étudier le No-Limit Hold'em, jouer sans argent réel et analyser tes mains.</p>
        <a href="#training" data-page="training" onClick={event=>navigate(event,"training")} className="pl-home-primary-link nct-primary">Entrer à la table <PokerLabIcon name="arrow-right" size={19}/></a>
      </div>
      <div className="pl-home-visual nct-hero-art" aria-hidden="true">
        <div className="nct-hero-orbit"><div className="nct-hero-suit">♠</div><span>NLH</span></div>
        <div className="nct-hero-cards"><span>A<small>♠</small></span><span>K<small>♥</small></span></div>
        <span className="nct-hero-caption">L'ART DE LA DÉCISION</span>
      </div>
    </section>
    <section className="nct-module-list" aria-labelledby="nct-module-title">
      <div className="nct-list-heading"><p className="nct-kicker">TON ESPACE</p><h2 id="nct-module-title">Choisis ton activité</h2></div>
      {modules.map((m,index)=><a key={m.page} href={"#"+m.page} data-page={m.page}
        onClick={event=>navigate(event,m.page)} className={"pl-home-card nct-module-row nct-module-"+m.page}>
        <span className="nct-module-index">{String(index+1).padStart(2,"0")}</span>
        <PokerLabIcon name={m.icon} size={23}/>
        <span><strong className="pl-home-card-title">{m.title}</strong><small>{m.detail}</small></span>
        <PokerLabIcon name="arrow-right" size={18}/>
      </a>)}
    </section>
  </div>;
}
