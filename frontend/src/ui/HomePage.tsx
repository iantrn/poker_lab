import { PokerLabIcon, type PokerLabIconName } from "./PokerLabIcon";

interface HomeDestination {
  page: "training" | "tactics" | "lessons" | "review" | "settings";
  icon: PokerLabIconName;
  title: string;
  description: string;
}
const DESTINATIONS: readonly HomeDestination[] = [
  { page: "training", icon: "play", title: "Jouer",
    description: "Affronte des intelligences artificielles aux styles variés." },
  { page: "tactics", icon: "tactics", title: "Tactiques",
    description: "Résous des situations stratégiques et améliore tes décisions." },
  { page: "lessons", icon: "learn", title: "Apprentissage",
    description: "Découvre les fondamentaux et les ranges théoriques." },
  { page: "review", icon: "review", title: "Game Review",
    description: "Analyse tes parties et identifie tes erreurs." },
  { page: "settings", icon: "settings", title: "Paramètres",
    description: "Personnalise ton expérience PokerLab." }
];

export function HomePage() {
  return <>
    <div className="pl-home-intro mb-8">
      <p className="pl-home-eyebrow">Poker Training Platform</p>
      <h2 className="pl-home-title">Deviens meilleur au poker.</h2>
      <p className="pl-home-description">
        Entraîne-toi, développe tes connaissances stratégiques
        et améliore ton jeu au Texas Hold'em No-Limit.
      </p>
    </div>
    <div className="pl-home-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {DESTINATIONS.map(({ page, icon, title, description }) =>
        <a href={"#" + page} data-page={page} key={page}
          onClick={event => {
            // Links rendered after Navigation.init() must route through the
            // existing navigation API without changing domain behavior.
            if (event.defaultPrevented) return;
            const navigation = (window as Window & {
              PokerLabNavigation?: { navigateTo(page: string): boolean }
            }).PokerLabNavigation;
            if (navigation) {
              event.preventDefault();
              navigation.navigateTo(page);
            }
          }}
          className="pl-home-card">
          <span className="pl-home-card-icon"><PokerLabIcon name={icon} size={24} /></span>
          <span className="pl-home-card-content">
            <h3 className="pl-home-card-title">{title}</h3>
            <p className="pl-home-card-description">{description}</p>
          </span>
          <PokerLabIcon name="arrow-right" size={18} className="pl-home-card-arrow" />
        </a>)}
    </div>
  </>;
}
