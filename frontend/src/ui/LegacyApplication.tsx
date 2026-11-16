import { useEffect, useState } from "react";
import shell from "./legacy-shell.html?raw";
import { loadLegacy } from "../legacy/loader";

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
    <div dangerouslySetInnerHTML={{ __html: shell }} />
    {failure && <div role="alert" className="tw-fixed tw-bottom-4 tw-left-4 tw-z-[9999] tw-rounded-xl tw-bg-red-950 tw-p-4 tw-text-white">
      Initialisation impossible : {failure}
    </div>}
  </>;
}
