import { PagePanel } from "./PagePrimitives";
import { PokerLabIcon } from "./PokerLabIcon";

/** Filters/launch are now a workstation rail; the exercise mount remains intact. */
export function TacticsPage(){
 return <PagePanel title="Tactiques" eyebrow="02 / EXERCICES"
   description="Travaille tes décisions préflop, postflop et mathématiques.">
   <div className="pl-tactics-workspace">
     <aside className="pl-tactics-controls" aria-label="Paramètres des exercices">
       <div className="pl-layout-section-head">
         <span className="pl-layout-overline">SÉLECTION</span>
         <h3>Ton prochain spot.</h3>
         <p>Choisis le type de situation à étudier.</p>
       </div>
       <div className="pl-form-grid pl-form-grid--filters">
         <label className="pl-form-field"><span className="pl-form-label">Catégorie</span>
           <select data-puzzle-category className="pl-form-control pl-field-control" aria-label="Filtrer les tactiques par catégorie">
             <option value="">Toutes les catégories</option>
             <option value="Préflop">Préflop</option><option value="Postflop">Postflop</option>
             <option value="Mathématiques">Mathématiques</option><option value="Règles">Règles</option>
           </select>
         </label>
         <label className="pl-form-field"><span className="pl-form-label">Difficulté</span>
           <select data-puzzle-difficulty className="pl-form-control pl-field-control" aria-label="Filtrer les tactiques par difficulté">
             <option value="">Toutes les difficultés</option>
             <option value="Débutant">Débutant</option><option value="Intermédiaire">Intermédiaire</option>
             <option value="Avancé">Avancé</option>
           </select>
         </label>
       </div>
       <div className="pl-inline-actions">
         <button type="button" data-puzzle-action="start" className="pl-button">
           <PokerLabIcon name="play" size={18}/> Commencer un exercice
         </button>
       </div>
       <p data-puzzle-stats className="pl-session-stats" aria-live="polite">
         Les statistiques de cette session apparaîtront ici.
       </p>
     </aside>
     <section className="pl-tactics-stage" aria-label="Exercice interactif">
       <div className="pl-tactics-stage-head">
         <span className="pl-layout-overline">ZONE DE DÉCISION</span><span>NLH / TRAINER</span>
       </div>
       <div data-puzzles-container className="pl-tactics-content" aria-live="polite">
         <p className="pl-help-text">Chargement des exercices…</p>
       </div>
     </section>
   </div>
 </PagePanel>;
}
