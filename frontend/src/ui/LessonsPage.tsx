import { PagePanel, SectionHeading } from "./PagePrimitives";
import { PokerLabIcon } from "./PokerLabIcon";

/** Real two-pane course reader; lesson and range mounts retain their contract. */
export function LessonsPage(){
 return <PagePanel title="Apprentissage" eyebrow="03 / ACADÉMIE"
   description="Un parcours pour construire des décisions solides, puis approfondir les ranges.">
   <div className="pl-learning-shortcuts">
     <button type="button" className="pl-learning-shortcut" onClick={()=>{
       const destination=document.getElementById("preflop-ranges-section");
       destination?.scrollIntoView({block:"start"});
       destination?.focus({ preventScroll: true });
     }}>
       <PokerLabIcon name="ranges" size={18}/> Accéder aux ranges
       <PokerLabIcon name="arrow-right" size={16}/>
     </button>
   </div>
   <div className="pl-page-stack">
     <section className="pl-feature-section pl-learning-reader" aria-labelledby="learning-path-title">
       <aside className="pl-learning-catalog-rail">
         <div className="pl-section-topline">
           <SectionHeading id="learning-path-title" icon="learn">Parcours pédagogique</SectionHeading>
           <div data-lessons-progress className="pl-lesson-progress-slot" aria-live="polite"/>
         </div>
         <p className="pl-learning-rail-subtitle">Choisis une leçon pour afficher son contenu dans l'espace de lecture.</p>
         <div data-lessons-catalog/>
       </aside>
       <div className="pl-learning-reading-stage">
         <div className="pl-reading-stage-head"><span>ESPACE DE LECTURE</span><PokerLabIcon name="learn" size={19}/></div>
         <div data-lesson-content className="pl-lesson-detail" aria-live="polite">
           <p className="pl-help-text">Choisis une leçon pour commencer.</p>
         </div>
       </div>
     </section>
     <section id="preflop-ranges-section" tabIndex={-1}
       className="pl-feature-section pl-learning-ranges" aria-labelledby="preflop-ranges-title">
       <div className="pl-learning-ranges-heading">
         <div><span className="pl-layout-overline">ANALYSE PRÉFLOP</span>
           <SectionHeading id="preflop-ranges-title" icon="ranges">Ranges préflop</SectionHeading>
         </div>
         <p>Visualise les fréquences et les décisions de chaque combinaison.</p>
       </div>
       <div data-ranges-viewer className="pl-range-viewer-mount">
         <p className="pl-help-text">Chargement des ranges…</p>
       </div>
     </section>
   </div>
 </PagePanel>;
}
