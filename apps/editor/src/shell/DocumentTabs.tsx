import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { tabLabels, tabNames } from "../document-tabs.ts";

export function DocumentTabs({ tabs, active, disabled, onActivate, onClose }: {
  /** SPIKE: a diagram tab names itself (`label`) and shows an `icon`. */
  tabs: { id: string; path: string; dirty: boolean; label?: string; icon?: ReactNode }[];
  active: string | null;
  disabled: boolean;
  onActivate(id: string): void;
  onClose(id: string): void;
}) {
  useTranslation();
  const row = useRef<HTMLDivElement>(null);
  const names = tabNames(tabs).map((name, index) => tabs[index]!.label ?? name);
  const labels = tabLabels(tabs).map((label, index) => tabs[index]!.label ? { name: tabs[index]!.label! } : label);
  useLayoutEffect(() => {
    const element = row.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    // Scroll only the tab row; scrollIntoView would also move the document's window.
    if (element && row.current) {
      const item = element.parentElement!;
      const left = item.offsetLeft - row.current.offsetLeft;
      if (left < row.current.scrollLeft) row.current.scrollLeft = left;
      else if (left + item.offsetWidth > row.current.scrollLeft + row.current.clientWidth) {
        row.current.scrollLeft = left + item.offsetWidth - row.current.clientWidth;
      }
    }
  }, [active, tabs.length]);
  return (
    <div ref={row} className="document-tabs" role="tablist" aria-label={i18n.t("Documents")}>
      {tabs.map((tab, index) => (
        <div className="document-tab" key={tab.id} data-selected={tab.id === active} title={tab.path} role="presentation">
          <button type="button" role="tab" id={`tab-${tab.id}`} aria-controls={`panel-${tab.id}`}
            aria-selected={tab.id === active} aria-disabled={disabled} tabIndex={tab.id === active ? 0 : -1}
            aria-label={`${names[index]}${tab.dirty ? `, ${i18n.t("Unsaved changes")}` : ""}`}
            onClick={() => { if (!disabled) onActivate(tab.id); }}
            onKeyDown={event => {
              if (disabled) return;
              const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
              if (next !== null) {
                event.preventDefault();
                onActivate(tabs[next]!.id);
                row.current?.querySelector<HTMLElement>(`#tab-${tabs[next]!.id}`)?.focus({ preventScroll: true });
              } else if (event.key === "Delete") {
                event.preventDefault();
                onClose(tab.id);
              }
            }}>
            {/* The filename gives way first, so the folder that tells equal names apart stays visible. */}
            {tab.icon}
            <span className="document-tab-name">
              <span className="document-tab-file">{labels[index]!.name}</span>
              {labels[index]!.folder ? <span className="document-tab-folder">{labels[index]!.folder}</span> : null}
            </span>
            <span className="document-tab-dirty" aria-hidden="true">{tab.dirty ? "•" : ""}</span>
          </button>
          <button type="button" className="document-tab-close" aria-label={i18n.t("Close {{name}}", { name: names[index] })}
            disabled={disabled} onClick={() => onClose(tab.id)}><X aria-hidden="true" /></button>
        </div>
      ))}
    </div>
  );
}
