import { PagePanel, SectionHeading } from "./PagePrimitives";
export function ReviewPage(){
  return <PagePanel title="Game Review" eyebrow="04 / ANALYSE"
    description="Revois tes mains locales. Seules les cartes révélées légalement au showdown sont conservées.">
    <div className="nct-review">
      <article className="pl-review-column nct-review-detail" aria-labelledby="review-detail-title">
        <SectionHeading id="review-detail-title">Détail de la main</SectionHeading>
        <div data-review-detail aria-live="polite"><p className="nct-intro-description">Sélectionne une main dans l'historique pour afficher ses actions.</p></div>
      </article>
      <aside className="pl-review-column nct-review-history" aria-labelledby="review-history-title">
        <SectionHeading id="review-history-title" icon="review">Historique des mains</SectionHeading>
        <div data-review-history aria-live="polite"/>
      </aside>
    </div>
  </PagePanel>;
}
