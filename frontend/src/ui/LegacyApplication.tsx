import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HomePage } from "./HomePage";
import shell from "./legacy-shell.html?raw";
import { loadLegacy } from "../legacy/loader";

export function LegacyApplication() {
  const [failure, setFailure] = useState<string | null>(null);
  const [homeMount, setHomeMount] = useState<HTMLElement | null>(null);
  // Claim the existing, stable navigation target before the legacy listeners
  // attach; subsequent updates to its hidden/class attributes are untouched.
  useLayoutEffect(() => {
    const node = document.querySelector<HTMLElement>('#home[data-module="home"]');
    if (!node) return;
    node.replaceChildren();
    setHomeMount(node);
  }, []);
  useEffect(() => {
    let mounted = true;
    void loadLegacy().catch((error: unknown) => {
      if (mounted) setFailure(error instanceof Error ? error.message : String(error));
    });
    return () => { mounted = false; };
  }, []);
  return <>
    <div dangerouslySetInnerHTML={{ __html: shell }} />
    {homeMount && createPortal(<HomePage />, homeMount)}
    {failure && <div role="alert" className="tw-fixed tw-bottom-4 tw-left-4 tw-z-[9999] tw-rounded-xl tw-bg-red-950 tw-p-4 tw-text-white">
      Initialisation impossible : {failure}
    </div>}
  </>;
}
