/** React-owned tactics controls; the typed puzzles module still owns its
 * generated question/result DOM and attaches the established native listeners.
 */
export function TacticsPage() {
  return <div className="bg-surface rounded-2xl p-6 border border-white/5">
    <h2 className="text-2xl font-bold mb-2">Tactiques</h2>
    <p className="text-textMuted text-sm">
      Travaille tes décisions à travers des situations préflop, postflop et mathématiques.
    </p>
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      <label className="text-sm text-textMuted">
        Catégorie
        <select data-puzzle-category className="pl-form-control mt-1 w-full"
          aria-label="Filtrer les tactiques par catégorie">
          <option value="">Toutes les catégories</option>
          <option value="Préflop">Préflop</option>
          <option value="Postflop">Postflop</option>
          <option value="Mathématiques">Mathématiques</option>
          <option value="Règles">Règles</option>
        </select>
      </label>
      <label className="text-sm text-textMuted">
        Difficulté
        <select data-puzzle-difficulty className="pl-form-control mt-1 w-full"
          aria-label="Filtrer les tactiques par difficulté">
          <option value="">Toutes les difficultés</option>
          <option value="Débutant">Débutant</option>
          <option value="Intermédiaire">Intermédiaire</option>
          <option value="Avancé">Avancé</option>
        </select>
      </label>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" data-puzzle-action="start" className="pl-button">
        Commencer un exercice
      </button>
      <p data-puzzle-stats className="text-sm text-textMuted" aria-live="polite">
        Les statistiques de cette session apparaîtront ici.
      </p>
    </div>
    <div data-puzzles-container className="mt-6" aria-live="polite">
      <p className="text-textMuted text-sm">Chargement des exercices…</p>
    </div>
  </div>;
}
