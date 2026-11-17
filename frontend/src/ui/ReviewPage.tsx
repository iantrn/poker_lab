import { PagePanel, SectionHeading } from "./PagePrimitives";

/** The typed Game Review module owns both dynamic history/detail slots. */
export function ReviewPage() {
  return <PagePanel title="Game Review"
    description="Revois les mains terminées pendant tes sessions locales. Les cartes adverses ne sont conservées que lorsqu'elles ont été révélées légalement au showdown.">
    <div className="pl-review-layout">
      <section className="pl-review-column" aria-labelledby="review-history-title">
        <SectionHeading id="review-history-title" icon="review">Historique des mains</SectionHeading>
        <div data-review-history aria-live="polite" />
      </section>
      <section className="pl-review-column" aria-labelledby="review-detail-title">
        <SectionHeading id="review-detail-title">Détail de la main</SectionHeading>
        <div data-review-detail aria-live="polite">
          <p className="pl-help-text">Sélectionne une main dans l'historique pour afficher ses actions.</p>
        </div>
      </section>
    </div>
  </PagePanel>;
}
