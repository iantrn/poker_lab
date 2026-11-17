/** UI-only settings placeholder; preserves the V1 #settings-content anchor.
 * The typed Settings API is authoritative and is not reinitialized by React.
 */
export function SettingsPage() {
  return <div className="bg-surface rounded-2xl p-6 border border-white/5">
    <h2 className="text-2xl font-bold mb-2">Paramètres</h2>
    <p className="text-textMuted text-sm">Personnalise ton expérience PokerLab.</p>
    <div id="settings-content" className="mt-6">
      <p className="text-textMuted text-sm">
        Les options de personnalisation seront développées ici.
      </p>
    </div>
  </div>;
}
