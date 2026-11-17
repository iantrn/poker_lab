import { PagePanel, SectionHeading } from "./PagePrimitives";

/**
 * Keep the validated lesson and range mount points: the typed domain modules
 * remain responsible for their dynamic contents, selection and persistence.
 */
export function LessonsPage() {
  return <PagePanel title="Apprentissage"
    description="Progresse avec des leçons structurées, puis approfondis les ranges préflop.">
    <div className="pl-page-stack">
      <section className="pl-feature-section" aria-labelledby="learning-path-title">
        <div className="pl-section-topline">
          <SectionHeading id="learning-path-title" icon="learn">Parcours pédagogique</SectionHeading>
          <div data-lessons-progress className="pl-lesson-progress-slot" aria-live="polite" />
        </div>
        <div data-lessons-catalog />
        <div data-lesson-content className="pl-lesson-detail" aria-live="polite">
          <p className="pl-help-text">Choisis une leçon pour commencer.</p>
        </div>
      </section>
      <section className="pl-feature-section" aria-labelledby="preflop-ranges-title">
        <SectionHeading id="preflop-ranges-title" icon="ranges">Ranges préflop</SectionHeading>
        <div data-ranges-viewer className="pl-range-viewer-mount">
          <p className="pl-help-text">Chargement des ranges…</p>
        </div>
      </section>
    </div>
  </PagePanel>;
}
