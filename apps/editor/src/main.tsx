import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { themeReady } from "./theme.ts";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "katex/dist/katex.min.css";
import "./index.css";
import "./styles.css";
// The configured simplified mark is shared with small Windows icon frames.
import productIcon from "@brand-small-icon";

const icon = document.createElement("link");
icon.rel = "icon";
icon.type = "image/png";
icon.href = productIcon;
document.head.append(icon);

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root");
}

void themeReady.then(() => createRoot(root).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
));
