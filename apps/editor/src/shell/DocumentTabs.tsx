import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ArrowLeftRight, PanelRightOpen, X } from "lucide-react";
import { tabLabels, tabNames } from "../document-tabs.ts";
import { ContextMenu } from "@/components/ui/context-menu.tsx";

export function DocumentTabs({ tabs, allTabs = tabs, active, disabled, onActivate, onClose, actions, onOpenRight, onMove, openRightDisabled, moveDisabled }: {
  actions?: ReactNode;
  tabs: { id: string; path: string; dirty: boolean; title?: string }[];
  allTabs?: { id: string; path: string; title?: string }[];
  active: string | null;
  disabled: boolean;
  onActivate(id: string): void;
  onClose(id: string): void;
  onOpenRight?(id: string): void;
  onMove?(id: string): void;
  openRightDisabled?: boolean;
  moveDisabled?: boolean;
}) {
  useTranslation();
  const row = useRef<HTMLDivElement>(null);
  const names = tabNames(allTabs).map((name, index) => allTabs[index]!.title ?? name);
  const labels = tabLabels(allTabs).map((label, index) => allTabs[index]!.title ? { name: allTabs[index]!.title } : label);
  useLayoutEffect(() => {
    const list = row.current;
    if (!list) return;
    const reveal = () => {
      const element = list.querySelector<HTMLElement>('[aria-selected="true"]');
      // Scroll only the tablist; scrollIntoView would also move the document viewport.
      if (!element) return;
      const item = element.parentElement!;
      const left = item.offsetLeft - list.offsetLeft;
      if (left < list.scrollLeft) list.scrollLeft = left;
      else if (left + item.offsetWidth > list.scrollLeft + list.clientWidth) {
        list.scrollLeft = left + item.offsetWidth - list.clientWidth;
      }
    };
    const observer = new ResizeObserver(reveal);
    observer.observe(list);
    reveal();
    return () => observer.disconnect();
  }, [active, tabs.length]);
  return (
    <div className="document-tab-row">
      <div ref={row} className="document-tabs" role="tablist" aria-label={i18n.t("Documents")}>
        {tabs.map((tab, index) => {
          const labelIndex = allTabs.findIndex(item => item.id === tab.id);
          const tabRow = <div className="document-tab" key={tab.id} data-selected={tab.id === active} title={tab.path} role="presentation">
            <button type="button" role="tab" id={`tab-${tab.id}`} aria-controls={`panel-${tab.id}`}
              title={tab.title}
              aria-selected={tab.id === active} aria-disabled={disabled} tabIndex={tab.id === active ? 0 : -1}
              aria-label={`${names[labelIndex]}${tab.dirty ? `, ${i18n.t("Unsaved changes")}` : ""}`}
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
              <span className="document-tab-name">
                <span className="document-tab-file">{labels[labelIndex]!.name}</span>
                {labels[labelIndex]!.folder ? <span className="document-tab-folder">{labels[labelIndex]!.folder}</span> : null}
              </span>
              <span className="document-tab-dirty" aria-hidden="true">{tab.dirty ? "•" : ""}</span>
            </button>
            <button type="button" className="document-tab-close" aria-label={i18n.t("Close {{name}}", { name: names[labelIndex] })}
              disabled={disabled} onClick={() => onClose(tab.id)}><X aria-hidden="true" /></button>
          </div>;
          return onOpenRight && onMove ? <ContextMenu key={tab.id} trigger={tabRow} disabled={disabled} actions={[
            { id: "open-right", label: i18n.t("Open to the right"), icon: <PanelRightOpen aria-hidden="true" />, disabled: openRightDisabled, run: () => onOpenRight(tab.id) },
            { id: "move-group", label: i18n.t("Move to other group"), icon: <ArrowLeftRight aria-hidden="true" />, disabled: moveDisabled, run: () => onMove(tab.id) },
          ]} /> : tabRow;
        })}
      </div>
      {actions}
    </div>
  );
}
