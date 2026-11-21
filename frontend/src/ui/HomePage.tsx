import { PokerLabIcon, type PokerLabIconName } from "./PokerLabIcon";

interface HomeDestination {
  page: "training" | "tactics" | "lessons" | "review" | "settings";
  icon: PokerLabIconName;
  title: string;
  description: string;
}
const DESTINATIONS: readonly HomeDestination[] = [
  { page: "training", icon: "play", title: "Jouer",
    description: "Prends place à la table, affronte des bots et affine tes décisions." },
  { page: "tactics", icon: "tactics", title: "Tactiques",
    description: "Résous des spots ciblés et consolide tes automatismes." },
  { page: "lessons", icon: "learn", title: "Apprentissage",
    description: "Explore les concepts clés et étudie les ranges préflop." },
  { page: "review", icon: "review", title: "Game Review",
    description: "Reviens sur tes mains et comprends tes choix." },
  { page: "settings", icon: "settings", title: "Paramètres",
    description: "Retrouve les préférences de ton environnement." }
];

/** Keep the imperative navigation contract when links are inserted later by React. */
function navigate(event: React.MouseEvent<HTMLAnchorElement>, page: string) {
  if (event.defaultPrevented) return;
  const navigation = (window as Window & {
    PokerLabNavigation?: { navigateTo(page: string): boolean }
  }).PokerLabNavigation;
  if (navigation) {
    event.preventDefault();
    navigation.navigateTo(page);
  }
}

export function HomePage() {
  return <>
    <div className="pl-home-intro mb-8">
      <p className="pl-home-eyebrow">PokerLab / Le jeu, compris en profondeur</p>
      <h2 className="pl-home-title">Joue avec instinct.<br /><span>Progresse avec méthode.</span></h2>
      <p className="pl-home-description">
        La table pour pratiquer, les outils pour analyser.
        Un espace dédié au Texas Hold'em No-Limit, à l'apprentissage
        et à la progression stratégique.
      </p>
      <div className="pl-home-hero-actions">
        <a href="#training" data-page="training" onClick={event => navigate(event, "training")}
          className="pl-home-primary-link">Entrer à la table <PokerLabIcon name="arrow-right" size={19} /></a>
        <a href="#lessons" data-page="lessons" onClick={event => navigate(event, "lessons")}
          className="pl-home-secondary-link">Explorer les leçons</a>
      </div>
      <p className="pl-home-meta">TEXAS HOLD'EM <span aria-hidden="true">·</span> NO-LIMIT <span aria-hidden="true">·</span> ENTRAÎNEMENT STRATÉGIQUE</p>
    </div>
    <div className="pl-home-section-heading">
      <p className="pl-home-eyebrow">Ton laboratoire</p>
      <h3>Choisis ton terrain de progression.</h3>
    </div>
    <div className="pl-home-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {DESTINATIONS.map(({ page, icon, title, description }) =>
        <a href={"#" + page} data-page={page} key={page}
          onClick={event => navigate(event, page)}
          className="pl-home-card">
          <span className="pl-home-card-icon"><PokerLabIcon name={icon} size={23} /></span>
          <span className="pl-home-card-content">
            <h3 className="pl-home-card-title">{title}</h3>
            <p className="pl-home-card-description">{description}</p>
          </span>
          <PokerLabIcon name="arrow-right" size={18} className="pl-home-card-arrow" />
        </a>)}
    </div>
  </>;
}
