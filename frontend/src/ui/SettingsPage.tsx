import { PagePanel } from "./PagePrimitives";

/** Preserve the V1 #settings-content anchor without adding fake controls. */
export function SettingsPage() {
  return <PagePanel title="Paramètres" description="Personnalise ton expérience PokerLab.">
    <div id="settings-content" className="pl-settings-content">
      <p className="pl-help-text">
        Les options de personnalisation seront développées ici.
      </p>
    </div>
  </PagePanel>;
}
