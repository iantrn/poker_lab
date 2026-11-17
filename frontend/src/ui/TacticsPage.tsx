import { PagePanel } from "./PagePrimitives";

/**
 * The typed puzzles module owns generated exercise and result content.
 * Filter attributes and the start-action hook are retained unchanged.
 */
export function TacticsPage() {
  return <PagePanel title="Tactiques"
    description="Travaille tes décisions à travers des situations préflop, postflop et mathématiques.">
    <div className="pl-form-grid pl-form-grid--filters">
      <label className="pl-form-field">
        <span className="pl-form-label">Catégorie</span>
        <select data-puzzle-category className="pl-form-control pl-field-control"
          aria-label="Filtrer les tactiques par catégorie">
          <option value="">Toutes les catégories</option>
          <option value="Préflop">Préflop</option>
          <option value="Postflop">Postflop</option>
          <option value="Mathématiques">Mathématiques</option>
          <option value="Règles">Règles</option>
        </select>
      </label>
      <label className="pl-form-field">
        <span className="pl-form-label">Difficulté</span>
        <select data-puzzle-difficulty className="pl-form-control pl-field-control"
          aria-label="Filtrer les tactiques par difficulté">
          <option value="">Toutes les difficultés</option>
          <option value="Débutant">Débutant</option>
          <option value="Intermédiaire">Intermédiaire</option>
          <option value="Avancé">Avancé</option>
        </select>
      </label>
    </div>
    <div className="pl-inline-actions">
      <button type="button" data-puzzle-action="start" className="pl-button">
        Commencer un exercice
      </button>
      <p data-puzzle-stats className="pl-session-stats" aria-live="polite">
        Les statistiques de cette session apparaîtront ici.
      </p>
    </div>
    <div data-puzzles-container className="pl-tactics-content" aria-live="polite">
      <p className="pl-help-text">Chargement des exercices…</p>
    </div>
  </PagePanel>;
}
