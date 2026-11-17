import { PokerLabIcon } from "./PokerLabIcon";
import { PagePanel, SectionHeading } from "./PagePrimitives";

/**
 * React-owned training configuration. Existing IDs and data-training-* hooks
 * continue to be owned by the established training module after mounting.
 * The poker table and its cards are deliberately outside this UI refactor.
 */
export function TrainingPage() {
  return <PagePanel title="Jouer" eyebrow="Poker contre intelligence artificielle"
    description="Configure ta partie avant de rejoindre la table.">
    <div id="training-configuration">
      <div className="pl-form-grid">
        <div className="pl-form-field">
          <label htmlFor="training-mode" className="pl-form-label">Mode de jeu</label>
          <select id="training-mode" data-training-setting="gameMode" className="pl-form-control pl-field-control" defaultValue="6max">
            <option value="6max">6-max — 6 joueurs maximum</option>
            <option value="heads-up">Heads-up — 2 joueurs</option>
          </select>
        </div>
        <div className="pl-form-field">
          <label htmlFor="training-player-count" className="pl-form-label">Nombre de joueurs</label>
          <select id="training-player-count" data-training-setting="playerCount" className="pl-form-control pl-field-control" defaultValue="6">
            {[2, 3, 4, 5, 6].map(number =>
              <option value={String(number)} key={number}>{number} joueurs</option>)}
          </select>
        </div>
        <div className="pl-form-field">
          <label htmlFor="training-difficulty" className="pl-form-label">Difficulté des bots</label>
          <select id="training-difficulty" data-training-setting="difficulty" className="pl-form-control pl-field-control" defaultValue="medium">
            <option value="easy">Débutant</option>
            <option value="medium">Intermédiaire</option>
            <option value="hard">Avancé</option>
          </select>
        </div>
        <div className="pl-form-field">
          <label htmlFor="training-stack-bb" className="pl-form-label">Tapis de départ</label>
          <select id="training-stack-bb" data-training-setting="startingStackBB" className="pl-form-control pl-field-control" defaultValue="100">
            {[20, 40, 50, 100, 200].map(number =>
              <option value={String(number)} key={number}>{number} BB</option>)}
          </select>
        </div>
      </div>
      <div className="pl-training-notes">
        <section className="pl-training-note" aria-labelledby="training-blinds-title">
          <h3 id="training-blinds-title" className="pl-training-note-title">Structure des blinds</h3>
          <p className="pl-training-note-value">SB : 0,5 jeton · BB : 1 jeton</p>
          <p className="pl-training-note-detail">
            1 BB correspond à 1 jeton. Ton tapis est directement exprimé en grosses blinds.
          </p>
        </section>
        <section className="pl-training-note" aria-labelledby="training-opponents-title">
          <h3 id="training-opponents-title" className="pl-training-note-title">Profils des adversaires</h3>
          <p className="pl-training-note-value">
            Chaque bot reçoit aléatoirement un style de jeu : Nit, TAG, LAG ou Balanced.
          </p>
        </section>
      </div>
      <div className="pl-setup-actions">
        <button type="button" data-training-action="start" className="pl-button">
          <PokerLabIcon name="play" size={18} />
          Démarrer une partie
        </button>
        <button type="button" data-training-action="reset" className="pl-button pl-button--secondary">
          <PokerLabIcon name="reset" size={18} />
          Réinitialiser
        </button>
      </div>
    </div>
    <div id="training-message" className="hidden mt-5 rounded-lg p-4 text-sm"
      role="status" aria-live="polite" />
    <div id="training-game" className="hidden mt-8">
      <div className="pl-training-game-heading">
        <SectionHeading id="training-table-title">Table de poker</SectionHeading>
        <button type="button" data-training-action="stop"
          className="pl-button pl-button--secondary">Quitter la partie</button>
      </div>
      <div id="training-table" className="w-full" />
      <div id="training-actions" className="mt-6" />
    </div>
  </PagePanel>;
}
