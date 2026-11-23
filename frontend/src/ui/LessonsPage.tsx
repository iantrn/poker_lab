import { PagePanel, SectionHeading } from "./PagePrimitives";
import { PokerLabIcon } from "./PokerLabIcon";
export function LessonsPage(){
  return <PagePanel title="Apprentissage"
    description="Construis ton raisonnement en découvrant les concepts puis les ranges préflop.">
    <div className="course-tools">
      <div data-lessons-progress className="pl-lesson-progress-slot" aria-live="polite"/>
      <button type="button" className="pl-learning-shortcut nct-button" onClick={()=>{
        const destination=document.getElementById("preflop-ranges-section");
        destination?.scrollIntoView({block:"start"});
        destination?.focus({ preventScroll: true });
      }}><PokerLabIcon name="ranges" size={18}/> Accéder aux ranges <PokerLabIcon name="arrow-right" size={16}/></button>
    </div>
    <section className="course-desk" aria-labelledby="learning-path-title">
      <aside className="course-index"><SectionHeading id="learning-path-title">Sommaire des leçons</SectionHeading><div data-lessons-catalog /></aside>
      <article className="course-reader"><div data-lesson-content className="pl-lesson-detail" aria-live="polite">Choisis une leçon dans le sommaire.</div></article>
    </section>
    <section id="preflop-ranges-section" tabIndex={-1} className="range-library" aria-labelledby="preflop-ranges-title">
      <SectionHeading id="preflop-ranges-title" icon="ranges">Ranges préflop</SectionHeading>
      <p className="nct-intro-description">Visualise les fréquences et les décisions de chaque combinaison.</p>
      <div data-ranges-viewer className="pl-range-viewer-mount"><p>Chargement des ranges…</p></div>
    </section>
  </PagePanel>;
}
