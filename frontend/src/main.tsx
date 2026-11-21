import { createRoot } from "react-dom/client";
import { LegacyApplication } from "./ui/LegacyApplication";
import "./styles/utilities.css";
import "./tailwind.css";
import "./styles/nocturne.css";
import "./styles/nocturne-controls.css";
import "./styles/nocturne-table.css";

const root = document.getElementById("root");
if (!root) throw new Error("Racine React introuvable.");
createRoot(root).render(<LegacyApplication />);
