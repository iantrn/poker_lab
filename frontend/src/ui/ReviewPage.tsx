import { PagePanel, SectionHeading } from "./PagePrimitives";

export function ReviewPage() {
  return <PagePanel title="Game Review" description="Retrouve une main pour suivre les mises et revoir tes décisions street par street.">
    <div className="history-desk">
      <aside className="pl-review-column hand-index"><SectionHeading id="review-history-title">Mains enregistrées</SectionHeading><div data-review-history aria-live="polite" /></aside>
      <section className="pl-review-column hand-record" aria-labelledby="review-detail-title"><SectionHeading id="review-detail-title">Déroulement de la main</SectionHeading>
        <div data-review-detail aria-live="polite">Choisis une main dans ton historique.</div>
      </section>
    </div>
  </PagePanel>;
}
