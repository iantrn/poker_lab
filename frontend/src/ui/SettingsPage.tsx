import { useEffect, useState } from "react";
import { PagePanel } from "./PagePrimitives";

const motionPreference = "pokerlab.display.reduce-motion";

export function SettingsPage() {
  const [reduceMotion, setReduceMotion] = useState(() => {
    try { return localStorage.getItem(motionPreference) === "true"; }
    catch { return false; }
  });
  const [saveMessage, setSaveMessage] = useState("");
  useEffect(() => {
    document.documentElement.toggleAttribute("data-reduce-motion", reduceMotion);
  }, [reduceMotion]);

  function updateMotion(value: boolean) {
    setReduceMotion(value);
    try {
      localStorage.setItem(motionPreference, String(value));
      setSaveMessage("Préférence enregistrée.");
    } catch {
      setSaveMessage("Préférence appliquée pour cette visite. Le stockage local est indisponible.");
    }
  }

  return <PagePanel title="Paramètres" description="Consulte les informations de ton environnement de jeu.">
    <section id="settings-content" className="environment">
      <h3>Affichage</h3>
      <label className="motion-setting"><span>Réduire les animations<small>Afficher immédiatement les cartes distribuées et les résultats.</small></span>
        <input type="checkbox" checked={reduceMotion} onChange={event => updateMotion(event.currentTarget.checked)} />
      </label>
      <p role="status" className="setting-status">{saveMessage}</p>
      <h3>Application</h3>
      <dl><div><dt>Interface</dt><dd>PokerLab · Nocturne</dd></div>
        <div><dt>Format de jeu</dt><dd>No-Limit Hold’em</dd></div>
        <div><dt>Historique des mains</dt><dd>Enregistré sur cet appareil</dd></div></dl>
      <a className="nct-button" href="#training" data-page="training">Configurer une session</a>
    </section>
  </PagePanel>;
}
