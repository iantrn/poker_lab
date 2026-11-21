import { PagePanel } from "./PagePrimitives";
export function SettingsPage(){
  return <PagePanel title="Paramètres" eyebrow="05 / PRÉFÉRENCES" description="Retrouve les informations et les options de ton espace de travail.">
    <div className="nct-settings-list">
      <section className="nct-settings-row">
        <h3>Environnement</h3><p>PokerLab — Nocturne. Entraînement, leçons et historique des mains accessibles depuis la navigation.</p>
      </section>
      <section id="settings-content" className="nct-settings-row">
        <h3>Personnalisation</h3><p>Les options de personnalisation seront développées ici.</p>
      </section>
    </div>
  </PagePanel>;
}
