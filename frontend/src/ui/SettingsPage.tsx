import { PagePanel } from "./PagePrimitives";

export function SettingsPage() {
  return <PagePanel title="Paramètres" description="Consulte les informations de ton environnement de jeu.">
    <section id="settings-content" className="environment">
      <h3>Application</h3>
      <dl><div><dt>Interface</dt><dd>PokerLab · Nocturne</dd></div>
        <div><dt>Format de jeu</dt><dd>No-Limit Hold’em</dd></div>
        <div><dt>Historique des mains</dt><dd>Enregistré sur cet appareil</dd></div></dl>
      <a className="nct-button" href="#training" data-page="training">Configurer une session</a>
    </section>
  </PagePanel>;
}
