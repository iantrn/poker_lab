import { PagePanel } from "./PagePrimitives";
import { PokerLabIcon } from "./PokerLabIcon";

/** Honest empty state, not a decorative fake settings form. */
export function SettingsPage(){
  return <PagePanel title="Paramètres" eyebrow="05 / ENVIRONNEMENT"
    description="Préférences et configuration de l'application.">
    <div className="pl-settings-layout">
      <aside className="pl-settings-information">
        <span className="pl-layout-overline">POKERLAB</span>
        <h3>Un environnement pensé pour progresser.</h3>
        <p>L'entraînement, l'apprentissage, les exercices et l'historique des mains restent disponibles dans les autres sections.</p>
        <PokerLabIcon name="settings" size={34}/>
      </aside>
      <div id="settings-content" className="pl-settings-content">
        <span className="pl-layout-overline">PRÉFÉRENCES</span>
        <h3>Personnalisation</h3>
        <p className="pl-help-text">Les options de personnalisation seront développées ici.</p>
      </div>
    </div>
  </PagePanel>;
}
