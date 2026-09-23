import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import "katex/dist/katex.min.css";
import "./index.css";
import "./styles/tokens.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root");
}

createRoot(root).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
);
