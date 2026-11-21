import { PagePanel, SectionHeading } from "./PagePrimitives";

/** A hand explorer: scrollable history rail and a wide decision timeline pane. */
export function ReviewPage(){
 return <PagePanel title="Game Review" eyebrow="04 / RÉVISION"
   description="Revois les mains de tes sessions locales. Seules les cartes révélées légalement au showdown sont conservées.">
   <div className="pl-review-layout">
     <section className="pl-review-column pl-review-history-rail" aria-labelledby="review-history-title">
       <div className="pl-review-pane-heading">
         <span className="pl-layout-overline">SÉLECTIONNER UNE MAIN</span>
         <SectionHeading id="review-history-title" icon="review">Historique des mains</SectionHeading>
       </div>
       <div data-review-history aria-live="polite"/>
     </section>
     <section className="pl-review-column pl-review-decision-stage" aria-labelledby="review-detail-title">
       <div className="pl-review-pane-heading">
         <span className="pl-layout-overline">PARCOURS DE DÉCISION</span>
         <SectionHeading id="review-detail-title">Détail de la main</SectionHeading>
       </div>
       <div data-review-detail aria-live="polite">
         <p className="pl-help-text">Sélectionne une main dans l'historique pour afficher ses actions.</p>
       </div>
     </section>
   </div>
 </PagePanel>;
}
