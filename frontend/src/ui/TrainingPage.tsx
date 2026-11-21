import { PokerLabIcon } from "./PokerLabIcon";
import { PagePanel, SectionHeading } from "./PagePrimitives";

/**
 * Structural change: setup form and briefing are now independent columns;
 * live stage and action mount stay stable for the typed training/session module.
 */
export function TrainingPage(){
  return <PagePanel title="Jouer" eyebrow="01 / ENTRAÎNEMENT"
    description="Choisis le format, rejoins la table et travaille chaque décision.">
    <div id="training-configuration">
      <div className="pl-training-setup-layout">
        <section className="pl-training-setup-primary" aria-labelledby="pl-training-setup-title">
          <div className="pl-layout-section-head">
            <span className="pl-layout-overline">CONFIGURATION DE LA TABLE</span>
            <h3 id="pl-training-setup-title">Prépare ta session.</h3>
            <p>Quatre réglages pour commencer. Tu pourras analyser tes décisions une fois assis.</p>
          </div>
          <div className="pl-form-grid pl-training-fields">
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
                {[2,3,4,5,6].map(number=><option value={String(number)} key={number}>{number} joueurs</option>)}
              </select>
            </div>
            <div className="pl-form-field">
              <label htmlFor="training-difficulty" className="pl-form-label">Difficulté des bots</label>
              <select id="training-difficulty" data-training-setting="difficulty" className="pl-form-control pl-field-control" defaultValue="medium">
                <option value="easy">Débutant</option><option value="medium">Intermédiaire</option><option value="hard">Avancé</option>
              </select>
            </div>
            <div className="pl-form-field">
              <label htmlFor="training-stack-bb" className="pl-form-label">Tapis de départ</label>
              <select id="training-stack-bb" data-training-setting="startingStackBB" className="pl-form-control pl-field-control" defaultValue="100">
                {[20,40,50,100,200].map(number=><option value={String(number)} key={number}>{number} BB</option>)}
              </select>
            </div>
          </div>
          <div className="pl-setup-actions">
            <button type="button" data-training-action="start" className="pl-button">
              <PokerLabIcon name="play" size={18}/> Démarrer une partie <PokerLabIcon name="arrow-right" size={17}/>
            </button>
            <button type="button" data-training-action="reset" className="pl-button pl-button--secondary">
              <PokerLabIcon name="reset" size={18}/> Réinitialiser
            </button>
          </div>
        </section>
        <aside className="pl-training-briefing" aria-label="Informations avant de jouer">
          <div className="pl-training-briefing-head">
            <span className="pl-layout-overline">LE FORMAT</span>
            <strong>NO-LIMIT<br/>HOLD'EM</strong>
            <div className="pl-briefing-table" aria-hidden="true"><span>POKERLAB</span></div>
          </div>
          <div className="pl-training-notes">
            <section className="pl-training-note" aria-labelledby="training-blinds-title">
              <h3 id="training-blinds-title" className="pl-training-note-title">Structure des blinds</h3>
              <p className="pl-training-note-value">Small blind : 0,5 BB · Big blind : 1 BB</p>
              <p className="pl-training-note-detail">Les stacks, les mises et les pots sont affichés en big blinds (BB).</p>
            </section>
            <section className="pl-training-note" aria-labelledby="training-opponents-title">
              <h3 id="training-opponents-title" className="pl-training-note-title">Profils des adversaires</h3>
              <p className="pl-training-note-value">Chaque bot reçoit aléatoirement un style de jeu : Nit, TAG, LAG ou Balanced.</p>
            </section>
          </div>
        </aside>
      </div>
    </div>
    <div id="training-message" className="hidden mt-5 rounded-lg p-4 text-sm" role="status" aria-live="polite"/>
    <div id="training-game" className="hidden mt-8">
      <div className="pl-training-game-heading">
        <div className="pl-game-heading-copy">
          <span className="pl-layout-overline">SESSION EN COURS</span>
          <SectionHeading id="training-table-title">Table de poker</SectionHeading>
        </div>
        <button type="button" data-training-action="stop"
          className="pl-button pl-button--secondary">Quitter la partie</button>
      </div>
      <div className="pl-live-table-stage">
        <div id="training-table" className="w-full"/>
        <div id="training-solver-dock" className="pl-table-solver-dock" aria-label="Outils d'analyse de la table"/>
      </div>
      <div id="training-actions" className="pl-table-action-bar"/>
    </div>
  </PagePanel>;
}
