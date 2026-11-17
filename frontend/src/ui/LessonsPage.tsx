/** React-owned learning page. The existing typed lessons and ranges modules
 * continue to manage the contents of these stable DOM mount points.
 */
export function LessonsPage() {
  return <div className="bg-surface rounded-2xl p-6 border border-white/5">
    <h2 className="text-2xl font-bold mb-2">Apprentissage</h2>
    <p className="text-textMuted text-sm">
      Progresse avec des leçons structurées, puis approfondis les ranges préflop.
    </p>
    <div className="mt-6 space-y-6">
      <section aria-labelledby="learning-path-title">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 id="learning-path-title" className="text-lg font-bold">Parcours pédagogique</h3>
          <div data-lessons-progress className="w-full sm:w-64" aria-live="polite" />
        </div>
        <div data-lessons-catalog />
        <div data-lesson-content className="mt-5" aria-live="polite">
          <p className="text-textMuted text-sm">Choisis une leçon pour commencer.</p>
        </div>
      </section>
      <section aria-labelledby="preflop-ranges-title">
        <h3 id="preflop-ranges-title" className="text-lg font-bold mb-3">Ranges préflop</h3>
        <div data-ranges-viewer>
          <p className="text-textMuted text-sm">Chargement des ranges…</p>
        </div>
      </section>
    </div>
  </div>;
}
