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
  home: <><path d="m3.5 10 8.5-7 8.5 7v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9" /><path d="M9 21v-7h6v7" /></>,
  play: <><path d="M12 3c-2.6 3-7 6.1-7 10a4 4 0 0 0 7 2.6A4 4 0 0 0 19 13c0-3.9-4.4-7-7-10Z" /><path d="m10 16-1 5h6l-1-5" /></>,
  tactics: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  learn: <><path d="M12 6.3C9.5 4.9 6.6 4.5 3 5v13c3.6-.5 6.5-.1 9 1.3 2.5-1.4 5.4-1.8 9-1.3V5c-3.6-.5-6.5-.1-9 1.3Z" /><path d="M12 6.3v13" /></>,
  review: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4" /><path d="M12 16V8" /><path d="M16 16V6" /><path d="m8 8 4-3 4 1 4-3" /></>,
  settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="var(--bg-surface, #1E2327)" /><circle cx="16" cy="12" r="2" fill="var(--bg-surface, #1E2327)" /><circle cx="11" cy="18" r="2" fill="var(--bg-surface, #1E2327)" /></>,
  solve: <><rect x="9" y="2.5" width="6" height="5" rx="1" /><rect x="2" y="16.5" width="6" height="5" rx="1" /><rect x="9" y="16.5" width="6" height="5" rx="1" /><rect x="16" y="16.5" width="6" height="5" rx="1" /><path d="M12 7.5v4.5M5 16.5v-4.5h14v4.5M12 12v4.5" /></>,
  ranges: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /><path d="M4.5 4.5h3v3h-3zM10.5 10.5h3v3h-3z" fill="currentColor" stroke="none" /></>,
  "arrow-right": <><path d="M4 12h16m-7-7 7 7-7 7" /></>,
  reset: <><path d="M3 11a9 9 0 1 1 2.5 7" /><path d="M3 4v7h7" /></>
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
