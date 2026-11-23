import type { ReactNode } from "react";
import { PokerLabIcon, type PokerLabIconName } from "./PokerLabIcon";
interface PagePanelProps {title:string;description:string;children:ReactNode;}
export function PagePanel({title,description,children}:PagePanelProps){
  return <article className="pl-page-panel studio-page">
    <header className="page-lead"><h2>{title}</h2><p>{description}</p></header>
    {children}
  </article>;
}
interface SectionHeadingProps {id:string;children:ReactNode;icon?:PokerLabIconName;}
export function SectionHeading({id,children,icon}:SectionHeadingProps){
  return <h3 id={id} className="nct-section-heading">{icon&&<PokerLabIcon name={icon} size={18}/>}<span>{children}</span></h3>;
}
