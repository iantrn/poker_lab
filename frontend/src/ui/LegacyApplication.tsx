import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HomePage } from "./HomePage";
import { TacticsPage } from "./TacticsPage";
import { ReviewPage } from "./ReviewPage";
import shell from "./legacy-shell.html?raw";
import { loadLegacy } from "../legacy/loader";

export function LegacyApplication() {
  const [failure, setFailure] = useState<string | null>(null);
  const [pageMounts, setPageMounts] = useState<Partial<Record<"home" | "tactics" | "review", HTMLElement>>>({});
  // Keep the six stable section elements owned by typed navigation; React only
  // replaces static interior content before V1-compatible modules attach.
  useLayoutEffect(() => {
    const nodes: Partial<Record<"home" | "tactics" | "review", HTMLElement>> = {};
    for (const id of ["home", "tactics", "review"] as const) {
      const node = document.querySelector<HTMLElement>(`#${id}[data-module="${id}"]`);
      if (!node) continue;
      node.replaceChildren();
      nodes[id] = node;
    }
    setPageMounts(nodes);
  }, []);
  useEffect(() => {
    // Attach V1-compatible native handlers only when React-owned page
    // content is committed, or the handler registration can miss links.
    if (!pageMounts.home || !pageMounts.tactics || !pageMounts.review) return;
    let mounted = true;
    void loadLegacy().catch((error: unknown) => {
      if (mounted) setFailure(error instanceof Error ? error.message : String(error));
    });
    return () => { mounted = false; };
  }, [pageMounts]);
  return <>
    <div dangerouslySetInnerHTML={{ __html: shell }} />
    {pageMounts.home && createPortal(<HomePage />, pageMounts.home)}
    {pageMounts.tactics && createPortal(<TacticsPage />, pageMounts.tactics)}
    {pageMounts.review && createPortal(<ReviewPage />, pageMounts.review)}
    {failure && <div role="alert" className="tw-fixed tw-bottom-4 tw-left-4 tw-z-[9999] tw-rounded-xl tw-bg-red-950 tw-p-4 tw-text-white">
      Initialisation impossible : {failure}
    </div>}
  </>;
}
