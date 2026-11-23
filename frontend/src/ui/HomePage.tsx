import { PokerLabIcon, type PokerLabIconName } from "./PokerLabIcon";

const activities: { page: string; title: string; detail: string; icon: PokerLabIconName }[] = [
  { page: "lessons", title: "Étudier", detail: "Leçons et ranges préflop", icon: "learn" },
  { page: "tactics", title: "S’exercer", detail: "Décisions préflop et postflop", icon: "tactics" },
  { page: "review", title: "Revoir une main", detail: "Historique de tes sessions", icon: "review" }
];

export function HomePage() {
  return <div className="lobby">
    <header className="lobby-title"><h1>La salle de poker</h1><span>No-Limit Hold’em</span></header>
    <section className="practice-feature" aria-labelledby="practice-title">
      <div className="table-illustration" aria-hidden="true"><div className="illustrated-felt"><i>♠</i></div></div>
      <div className="practice-copy"><p>Partie contre les bots</p><h2 id="practice-title">Prends place<br />à la table.</h2>
        <a className="pl-home-primary-link studio-cta" href="#training" data-page="training">Configurer ma partie <PokerLabIcon name="arrow-right" /></a>
      </div>
    </section>
    <nav className="practice-paths" aria-label="Étude et analyse">{activities.map(activity =>
      <a key={activity.page} href={"#" + activity.page} data-page={activity.page}>
        <PokerLabIcon name={activity.icon} size={25} /><span><strong>{activity.title}</strong><small>{activity.detail}</small></span><PokerLabIcon name="arrow-right" size={18}/>
      </a>)}</nav>
  </div>;
}
