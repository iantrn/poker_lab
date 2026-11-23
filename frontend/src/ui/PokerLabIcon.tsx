import type { ReactNode } from "react";

/**
 * Poker Lab Icons — a consistent, dependency-free 24×24 outline set.
 * Every glyph uses the same stroke, cap and join geometry.
 * Icons are decorative when paired with their visible labels.
 */
export type PokerLabIconName =
  | "home"
  | "play"
  | "tactics"
  | "learn"
  | "review"
  | "settings"
  | "solve"
  | "ranges"
  | "arrow-right"
  | "reset";

const glyphs: Record<PokerLabIconName, ReactNode> = {
  home: <><rect x="3" y="3" width="7" height="7" rx="1.3"/><path d="M14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/></>,
  play: <><rect x="3" y="6" width="18" height="12" rx="6"/><path d="M10 9.5 14.5 12 10 14.5Z" fill="currentColor" stroke="none"/></>,
  tactics: <><path d="M3 12h4l3-7 4 14 3-7h4"/><path d="M3 20h18"/></>,
  learn: <><path d="M4 4h12a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3V4Z"/><path d="M4 16h15M8 8h7M8 11h5"/></>,
  review: <><path d="M4 19h16M5 15l5-5 4 3 5-8"/><circle cx="5" cy="15" r="1" fill="currentColor"/><circle cx="19" cy="5" r="1" fill="currentColor"/></>,
  settings: <><path d="M4 7h16M4 17h16"/><rect x="7" y="4" width="4" height="6" rx="1" fill="var(--nct-secondary)"/><rect x="14" y="14" width="4" height="6" rx="1" fill="var(--nct-secondary)"/></>,
  solve: <><path d="M12 3 21 12 12 21 3 12Z"/><path d="M7 12h10M12 7v10"/></>,
  ranges: <><rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><path d="M4.5 4.5h3v3h-3zM10.5 10.5h3v3h-3zM16.5 16.5h3v3h-3z" fill="currentColor" stroke="none"/></>,
  "arrow-right": <><path d="M3 12h17m-6-6 6 6-6 6"/></>,
  reset: <><path d="M6 7a8 8 0 1 1-2 7M6 3v6H0"/></>
};

interface PokerLabIconProps {
  name: PokerLabIconName;
  size?: number;
  className?: string;
}

export function PokerLabIcon({ name, size = 20, className }: PokerLabIconProps) {
  return <svg xmlns="http://www.w3.org/2000/svg"
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false" className={className}>
    {glyphs[name]}
  </svg>;
}
