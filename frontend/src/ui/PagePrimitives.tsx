import type { ReactNode } from "react";
import { PokerLabIcon, type PokerLabIconName } from "./PokerLabIcon";
interface PagePanelProps {title:string;description:string;eyebrow?:string;children:ReactNode;}
export function PagePanel({title,description,eyebrow,children}:PagePanelProps){
  return <div className="bg-surface pl-page-panel nct-page">
    <header className="pl-page-header nct-page-intro">
      <div>{eyebrow&&<p className="nct-kicker">{eyebrow}</p>}<h2 className="nct-page-title">{title}</h2></div>
      <p className="nct-intro-description">{description}</p>
    </header>
    <div className="nct-page-body">{children}</div>
  </div>;
}
interface SectionHeadingProps {id:string;children:ReactNode;icon?:PokerLabIconName;}
export function SectionHeading({id,children,icon}:SectionHeadingProps){
  return <h3 id={id} className="nct-section-heading">{icon&&<PokerLabIcon name={icon} size={18}/>}<span>{children}</span></h3>;
}
