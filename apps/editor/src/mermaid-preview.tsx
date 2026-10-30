import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import { Notice } from "./ui/primitives.tsx";
import { useEditorVisible } from "./editor-visibility.ts";
import { useNotifications } from "./components/ui/notification-center.tsx";

/** The import boundary keeps Mermaid and its diagram grammars out of the initial bundle. */
export function MermaidPreview({ source, draft = false, onReveal }: { source: string; draft?: boolean; onReveal?(): void }) {
  useTranslation();
  const visible = useEditorVisible();
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const [result, setResult] = useState<{ source: string; dark: boolean; url?: string; error?: string }>();
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setDark(root.dataset.theme === "dark"));
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      void import("./mermaid-render.ts").then(module => {
        if (stale) return;
        return module.renderMermaid(source, dark);
      }).then(url => {
        if (!stale && url) setResult({ source, dark, url });
      }).catch(cause => {
        if (!stale) setResult({ source, dark, error: cause instanceof Error ? cause.message : String(cause) });
      });
    }, draft ? 250 : 0);
    return () => { stale = true; window.clearTimeout(timer); };
  }, [source, dark, visible, draft]);
  const current = result?.source === source && result.dark === dark ? result : undefined;
  const failure = result?.source === source ? result.error : undefined;
  useNotifications(onReveal && failure ? [{ id: source, severity: "error", testId: "mermaid-error",
    message: i18n.t("Diagram preview failed: {{reason}}", { reason: failure }), reveal: onReveal }] : []);
  return <div className="mermaid-preview" data-testid={draft ? "mermaid-edit-preview" : "mermaid-preview"}
    data-theme={dark ? "dark" : "light"} aria-busy={!current}>
    {current?.error ? !draft ? <p>{i18n.t("Diagram preview unavailable")}</p> : <Notice tone="error" data-testid="mermaid-error">
      {i18n.t("Diagram preview failed: {{reason}}", { reason: current.error })}
    </Notice> : current?.url ? <img src={current.url} alt={i18n.t("Diagram")} draggable={false} />
      : <p role="status">{i18n.t("Rendering diagram…")}</p>}
  </div>;
}
