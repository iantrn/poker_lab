import type { ReactNode } from "react";
import { PokerLabIcon, type PokerLabIconName } from "./PokerLabIcon";

/**
 * UI-only primitives. Keep each page's outer .bg-surface element, stable
 * mount points and imperative runtime controllers untouched.
 */
interface PagePanelProps {
  title: string;
  description: string;
  eyebrow?: string;
  children: ReactNode;
}
export function PagePanel({ title, description, eyebrow, children }: PagePanelProps) {
  return <div className="bg-surface rounded-2xl p-6 border border-white/5 pl-page-panel">
    <header className="pl-page-header">
      {eyebrow && <p className="pl-page-eyebrow">{eyebrow}</p>}
      <h2 className="pl-page-title">{title}</h2>
      <p className="pl-page-description">{description}</p>
    </header>
    {children}
  </div>;
}

interface SectionHeadingProps {
  id: string;
  children: ReactNode;
  icon?: PokerLabIconName;
}
export function SectionHeading({ id, children, icon }: SectionHeadingProps) {
  return <h3 id={id} className="pl-section-heading">
    {icon && <PokerLabIcon name={icon} size={19} />}
    <span>{children}</span>
  </h3>;
}
