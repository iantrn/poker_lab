import { createRoot } from "react-dom/client";
import { LegacyApplication } from "./ui/LegacyApplication";
import "../../css/utilities.css";
import "../../css/style.css";
import "./tailwind.css";

const root = document.getElementById("root");
if (!root) throw new Error("Racine React introuvable.");
createRoot(root).render(<LegacyApplication />);
