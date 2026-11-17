import { createRoot } from "react-dom/client";
import { LegacyApplication } from "./ui/LegacyApplication";
import "./styles/utilities.css";
import "./styles/style.css";
import "./tailwind.css";
import "./styles/design-system.css";
import "./styles/poker-table.css";

const root = document.getElementById("root");
if (!root) throw new Error("Racine React introuvable.");
createRoot(root).render(<LegacyApplication />);
