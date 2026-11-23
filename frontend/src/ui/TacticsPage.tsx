import { PagePanel } from "./PagePrimitives";
import { PokerLabIcon } from "./PokerLabIcon";
export function TacticsPage(){
  return <PagePanel title="Tactiques"
    description="Entraîne tes décisions préflop, postflop et ton raisonnement mathématique.">
    <div className="exercise-desk"><aside className="exercise-controls"><details className="exercise-filters" open><summary>Filtres des exercices</summary><div className="exercise-fields">
      <label>Catégorie
        <select data-puzzle-category className="pl-field-control" aria-label="Filtrer les tactiques par catégorie">
          <option value="">Toutes les catégories</option>
          {["Préflop","Postflop","Mathématiques","Règles"].map(value=><option value={value} key={value}>{value}</option>)}
        </select>
      </label>
      <label>Difficulté
        <select data-puzzle-difficulty className="pl-field-control" aria-label="Filtrer les tactiques par difficulté">
          <option value="">Toutes les difficultés</option>
          {["Débutant","Intermédiaire","Avancé"].map(value=><option value={value} key={value}>{value}</option>)}
        </select>
      </label>
      </div></details>
      <button type="button" onClick={event => {
        if (window.matchMedia("(max-width:767px)").matches)
          event.currentTarget.parentElement?.querySelector("details")?.removeAttribute("open");
      }} data-puzzle-action="start" className="nct-button nct-button--gold"><PokerLabIcon name="play" size={18}/> Commencer un exercice</button>
      <p data-puzzle-stats className="pl-session-stats" aria-live="polite" />
    </aside>
    <section className="exercise-sheet" aria-label="Exercice interactif">
      <div data-puzzles-container aria-live="polite"><p>Chargement des exercices…</p></div>
    </section>
    </div>
  </PagePanel>;
}
