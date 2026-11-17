/** React-owned training page preserving V1 session and action element IDs.
 * The typed training module remains the controller for the live poker table,
 * bet inputs, settings, and direct DOM-driven player actions.
 */
const selectStyle="w-full bg-background border border-white/10 rounded-lg p-3";
const labelStyle="block text-sm font-semibold mb-2";
export function TrainingPage() {
  return <div className="bg-surface rounded-2xl p-6 border border-white/5">
    <div className="mb-6">
      <p className="text-primaryHover text-xs font-semibold uppercase tracking-widest mb-2">
        Poker contre intelligence artificielle
      </p>
      <h2 className="text-2xl font-bold mb-2">Jouer</h2>
      <p className="text-textMuted text-sm">Configure ta partie avant de rejoindre la table.</p>
    </div>
    <div id="training-configuration">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label htmlFor="training-mode" className={labelStyle}>Mode de jeu</label>
          <select id="training-mode" data-training-setting="gameMode" className={selectStyle} defaultValue="6max">
            <option value="6max">6-max — 6 joueurs maximum</option>
            <option value="heads-up">Heads-up — 2 joueurs</option>
          </select>
        </div>
        <div>
          <label htmlFor="training-player-count" className={labelStyle}>Nombre de joueurs</label>
          <select id="training-player-count" data-training-setting="playerCount" className={selectStyle} defaultValue="6">
            {[2,3,4,5,6].map(number=>
              <option value={String(number)} key={number}>{number} joueurs</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="training-difficulty" className={labelStyle}>Difficulté des bots</label>
          <select id="training-difficulty" data-training-setting="difficulty" className={selectStyle} defaultValue="medium">
            <option value="easy">Débutant</option>
            <option value="medium">Intermédiaire</option>
            <option value="hard">Avancé</option>
          </select>
        </div>
        <div>
          <label htmlFor="training-stack-bb" className={labelStyle}>Tapis de départ</label>
          <select id="training-stack-bb" data-training-setting="startingStackBB" className={selectStyle} defaultValue="100">
            {[20,40,50,100,200].map(number=>
              <option value={String(number)} key={number}>{number} BB</option>)}
          </select>
        </div>
      </div>
      <div className="mt-5 p-4 rounded-xl bg-background border border-white/5">
        <p className="text-sm font-semibold mb-1">Structure des blinds</p>
        <p className="text-sm text-textMuted">SB : 0,5 jeton · BB : 1 jeton</p>
        <p className="text-xs text-textMuted mt-2">
          1 BB correspond à 1 jeton. Ton tapis est directement exprimé en grosses blinds.
        </p>
      </div>
      <div className="mt-4 p-4 rounded-xl bg-background border border-white/5">
        <p className="text-sm font-semibold mb-1">Profils des adversaires</p>
        <p className="text-sm text-textMuted">
          Chaque bot reçoit aléatoirement un style de jeu : Nit, TAG, LAG ou Balanced.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 mt-6">
        <button type="button" data-training-action="start"
          className="group bg-primary hover:bg-primaryHover text-white font-bold rounded-xl px-7 py-4 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl">
          <span className="mr-2">♠</span>
          Démarrer une partie
          <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">→</span>
        </button>
        <button type="button" data-training-action="reset"
          className="bg-transparent border border-white/20 hover:border-white/40 hover:bg-white/5 text-textMuted hover:text-white font-semibold rounded-xl px-5 py-4 transition">
          ↺ Réinitialiser
        </button>
      </div>
    </div>
    <div id="training-message" className="hidden mt-5 rounded-lg p-4 text-sm"
      role="status" aria-live="polite" />
    <div id="training-game" className="hidden mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h3 className="text-xl font-bold">Table de poker</h3>
        <button type="button" data-training-action="stop"
          className="bg-background border border-white/10 hover:bg-white/5 rounded-lg px-4 py-2 text-sm">
          Quitter la partie
        </button>
      </div>
      <div id="training-table" className="w-full" />
      <div id="training-actions" className="mt-6" />
    </div>
  </div>;
}
