import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { loadLegacy } from "../legacy/loader";

/** Entrypoint now renders the complete page structure through React.
 * LegacyApplication is retained as a stable import name during the migration.
 * The validated TypeScript game/training/solver modules bind after the initial
 * React commit, rather than requiring an HTML-injection/portal bootstrap.
 */
export function LegacyApplication() {
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    void loadLegacy().catch((error: unknown) => {
      if (mounted) setFailure(error instanceof Error ? error.message : String(error));
    });
    return () => { mounted = false; };
  }, []);
  return <>
    <AppShell />
    {failure && <div role="alert"
      className="tw-fixed tw-bottom-4 tw-left-4 tw-z-[9999] tw-rounded-xl tw-bg-red-950 tw-p-4 tw-text-white">
      Initialisation impossible : {failure}
    </div>}
  </>;
}
