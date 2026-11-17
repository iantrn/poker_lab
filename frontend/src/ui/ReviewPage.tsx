/** React shell for game history; the typed Game Review module owns its
 * dynamic history and detail slots after initialization.
 */
export function ReviewPage() {
  return <div className="bg-surface rounded-2xl p-6 border border-white/5">
    <h2 className="text-2xl font-bold mb-2">Game Review</h2>
    <p className="text-textMuted text-sm">
      Revois les mains terminées pendant tes sessions locales. Les cartes adverses ne sont conservées
      que lorsqu'elles ont été révélées légalement au showdown.
    </p>
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)]">
      <section aria-labelledby="review-history-title">
        <h3 id="review-history-title" className="text-lg font-bold mb-3">Historique des mains</h3>
        <div data-review-history aria-live="polite" />
      </section>
      <section aria-labelledby="review-detail-title">
        <h3 id="review-detail-title" className="text-lg font-bold mb-3">Détail de la main</h3>
        <div data-review-detail aria-live="polite">
          <p className="text-textMuted text-sm">
            Sélectionne une main dans l'historique pour afficher ses actions.
          </p>
        </div>
      </section>
    </div>
  </div>;
}
