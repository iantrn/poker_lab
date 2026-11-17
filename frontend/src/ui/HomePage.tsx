/** React-owned home content, preserving the validated V1 card semantics.
 * The stable #home/[data-module=home] node remains controlled by navigation.
 */
interface HomeDestination {
  page: "training" | "tactics" | "lessons" | "review" | "settings";
  icon: string;
  title: string;
  description: string;
}
const DESTINATIONS: readonly HomeDestination[] = [
  { page:"training", icon:"♠", title:"Jouer",
    description:"Affronte des intelligences artificielles aux styles variés." },
  { page:"tactics", icon:"🎯", title:"Tactiques",
    description:"Résous des situations stratégiques et améliore tes décisions." },
  { page:"lessons", icon:"📚", title:"Apprentissage",
    description:"Découvre les fondamentaux et les ranges théoriques." },
  { page:"review", icon:"📊", title:"Game Review",
    description:"Analyse tes parties et identifie tes erreurs." },
  { page:"settings", icon:"⚙", title:"Paramètres",
    description:"Personnalise ton expérience PokerLab." }
];
export function HomePage() {
  return <>
    <div className="mb-8">
      <p className="text-primaryHover text-sm font-semibold uppercase tracking-widest mb-2">
        Poker Training Platform
      </p>
      <h2 className="text-3xl md:text-4xl font-bold mb-3">
        Deviens meilleur au poker.
      </h2>
      <p className="text-textMuted max-w-2xl leading-relaxed">
        Entraîne-toi, développe tes connaissances stratégiques
        et améliore ton jeu au Texas Hold'em No-Limit.
      </p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {DESTINATIONS.map(({page,icon,title,description})=>
        <a href={"#"+page} data-page={page} key={page}
          className="bg-surface rounded-2xl p-5 border border-white/5 hover:border-primary transition">
          <div className="text-3xl mb-4">{icon}</div>
          <h3 className="font-bold text-lg mb-2">{title}</h3>
          <p className="text-sm text-textMuted leading-relaxed">{description}</p>
        </a>
      )}
    </div>
  </>;
}
