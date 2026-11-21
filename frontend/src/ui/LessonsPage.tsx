import { PagePanel, SectionHeading } from "./PagePrimitives";
import { PokerLabIcon } from "./PokerLabIcon";
export function LessonsPage(){
  return <PagePanel title="Apprentissage" eyebrow="03 / ACADÉMIE"
    description="Construis ton raisonnement en découvrant les concepts puis les ranges préflop.">
    <div className="nct-stage-head">
      <div data-lessons-progress className="pl-lesson-progress-slot" aria-live="polite"/>
      <button type="button" className="pl-learning-shortcut nct-button" onClick={()=>{
        const destination=document.getElementById("preflop-ranges-section");
        destination?.scrollIntoView({block:"start"});
        destination?.focus({ preventScroll: true });
      }}><PokerLabIcon name="ranges" size={18}/> Accéder aux ranges <PokerLabIcon name="arrow-right" size={16}/></button>
    </div>
    <section className="nct-reading" aria-labelledby="learning-path-title">
      <article className="nct-stage">
        <SectionHeading id="learning-path-title" icon="learn">Espace de lecture</SectionHeading>
        <div data-lesson-content className="pl-lesson-detail" aria-live="polite"><p>Choisis une leçon pour commencer.</p></div>
      </article>
      <aside className="nct-reading-catalog" aria-label="Parcours pédagogique">
        <p className="nct-kicker">PARCOURS PÉDAGOGIQUE</p><div data-lessons-catalog/>
      </aside>
    </section>
    <section id="preflop-ranges-section" tabIndex={-1} className="nct-range-section" aria-labelledby="preflop-ranges-title">
      <SectionHeading id="preflop-ranges-title" icon="ranges">Ranges préflop</SectionHeading>
      <p className="nct-intro-description">Visualise les fréquences et les décisions de chaque combinaison.</p>
      <div data-ranges-viewer className="pl-range-viewer-mount"><p>Chargement des ranges…</p></div>
    </section>
  </PagePanel>;
}
