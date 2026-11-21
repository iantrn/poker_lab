import { PokerLabIcon } from "./PokerLabIcon";
import { PagePanel, SectionHeading } from "./PagePrimitives";

export function TrainingPage(){
  return <PagePanel title="Jouer" eyebrow="01 / TABLE"
      description="Configure une session de No-Limit Hold'em et entraîne-toi contre les bots.">
    <div id="training-configuration" className="nct-setup">
      <section aria-labelledby="nct-setup-title">
        <p className="nct-kicker">NOUVELLE SESSION</p>
        <h3 id="nct-setup-title">Choisis les conditions de jeu</h3>
        <div className="nct-form nct-setup-fields">
          <label htmlFor="training-mode">Format
            <select id="training-mode" data-training-setting="gameMode" className="pl-field-control" defaultValue="6max">
              <option value="6max">6-max — 6 joueurs maximum</option>
              <option value="heads-up">Heads-up — 2 joueurs</option>
            </select>
          </label>
          <label htmlFor="training-player-count">Joueurs
            <select id="training-player-count" data-training-setting="playerCount" className="pl-field-control" defaultValue="6">
              {[2,3,4,5,6].map(n=><option key={n} value={String(n)}>{n} joueurs</option>)}
            </select>
          </label>
          <label htmlFor="training-difficulty">Niveau des adversaires
            <select id="training-difficulty" data-training-setting="difficulty" className="pl-field-control" defaultValue="medium">
              <option value="easy">Débutant</option><option value="medium">Intermédiaire</option><option value="hard">Avancé</option>
            </select>
          </label>
          <label htmlFor="training-stack-bb">Stack initial
            <select id="training-stack-bb" data-training-setting="startingStackBB" className="pl-field-control" defaultValue="100">
              {[20,40,50,100,200].map(n=><option key={n} value={String(n)}>{n} BB</option>)}
            </select>
          </label>
        </div>
        <div className="nct-setup-actions">
          <button type="button" data-training-action="start" className="nct-button nct-button--gold"><PokerLabIcon name="play" size={18}/> Démarrer une partie</button>
          <button type="button" data-training-action="reset" className="nct-button"><PokerLabIcon name="reset" size={18}/> Réinitialiser</button>
        </div>
      </section>
      <aside className="nct-notes pl-training-notes" aria-label="Conditions de jeu">
        <p className="nct-kicker">À LA TABLE</p>
        <div className="nct-note pl-training-note"><strong>0,5 / 1 BB</strong> Small blind / big blind. Montants toujours affichés en big blinds.</div>
        <div className="nct-note pl-training-note"><strong>Adversaires</strong> Chaque bot reçoit aléatoirement un profil Nit, TAG, LAG ou Balanced.</div>
      </aside>
    </div>
    <div id="training-message" className="hidden mt-5 rounded-lg p-4 text-sm" role="status" aria-live="polite"/>
    <div id="training-game" className="hidden nct-game">
      <header className="pl-training-game-heading nct-game-header">
        <div className="pl-game-heading-copy"><SectionHeading id="training-table-title">Table de poker</SectionHeading></div>
        <button type="button" data-training-action="stop" className="nct-button">Quitter la partie</button>
      </header>
      <div className="pl-live-table-stage">
        <div id="training-table" className="w-full"/>
        <div id="training-solver-dock" className="pl-table-solver-dock" aria-label="Outils d'analyse de la table"/>
      </div>
      <div id="training-actions" className="pl-table-action-bar"/>
    </div>
  </PagePanel>;
}
