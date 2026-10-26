import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import { PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import type { OutlineItem, OutlineStore } from "../outline.ts";

type DocumentPanelProps = {
  /** Below the docking width the panel covers the document instead of narrowing it. */
  overlay: boolean;
  /** Headings of the open document and the index of the section being read. */
  outline?: OutlineStore;
  onSelectHeading(item: OutlineItem): void;
  /** The TopBar Outline toggle opens the panel again. */
  onClose(): void;
};

/** Navigation inside the open document, shown while open. It holds only the outline. */
export function DocumentPanel({ overlay, outline, onSelectHeading, onClose }: DocumentPanelProps) {
  useTranslation();
  return (
    <aside
      className={`document-panel${overlay ? " document-panel--overlay" : ""}`}
      aria-labelledby="document-panel-title"
      data-testid="document-panel"
      onKeyDown={event => {
        // An overlay closes with Escape, like other overlays.
        if (event.key !== "Escape" || !overlay) return;
        event.preventDefault();
        onClose();
      }}
    >
      <div className="document-panel-header">
        <h2 className="document-panel-title" id="document-panel-title">{i18n.t("Outline")}</h2>
        <Button variant="ghost" size="icon-sm" aria-label={i18n.t("Hide outline")} onClick={onClose}>
          <PanelRightClose />
        </Button>
      </div>
      {outline ? <Outline outline={outline} onSelect={onSelectHeading} /> : null}
    </aside>
  );
}

/** Scrolls only `list`, so the document and the section being read stay put. */
function revealInList(list: HTMLElement, child: HTMLElement) {
  if (list.clientHeight <= 0) return;
  const listRect = list.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  if (childRect.top < listRect.top) list.scrollTop -= listRect.top - childRect.top;
  else if (childRect.bottom > listRect.bottom && childRect.top > listRect.top) {
    list.scrollTop += Math.min(childRect.bottom - listRect.bottom, childRect.top - listRect.top);
  }
}

const useClientLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

function Outline({ outline: store, onSelect }: { outline: OutlineStore; onSelect(item: OutlineItem): void }) {
  useTranslation();
  const outline = useSyncExternalStore(store.subscribe, store.get, store.get);
  const list = useRef<HTMLOListElement>(null);
  const revealTracked = () => {
    const element = list.current;
    const current = element?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!element || !current) return;
    // Arrow keys keep a different heading focused. Do not pull that focus back to the current section.
    const active = document.activeElement;
    if (active instanceof HTMLElement && element.contains(active) && active !== current) return;
    revealInList(element, current);
  };
  const revealTrackedRef = useRef(revealTracked);
  revealTrackedRef.current = revealTracked;
  useClientLayoutEffect(() => {
    revealTrackedRef.current();
  }, [outline.current, outline.items]);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    // The visible area can shrink while the current section index stays the same.
    const observer = new ResizeObserver(() => revealTrackedRef.current());
    observer.observe(element);
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      // Moving between outline items is still keyboard navigation.
      if (next instanceof Node && element.contains(next)) return;
      // activeElement can still be the button that is losing focus.
      const current = element.querySelector<HTMLElement>('[aria-current="location"]');
      if (current) revealInList(element, current);
    };
    element.addEventListener("focusout", onFocusOut);
    return () => {
      observer.disconnect();
      element.removeEventListener("focusout", onFocusOut);
    };
  }, [outline.items.length === 0]);
  // Arrow keys, Home and End move between headings; Enter or Space goes to one.
  const move = (event: KeyboardEvent<HTMLOListElement>) => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1
      : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : undefined;
    if (next === undefined || index < 0) return;
    event.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
  };
  return (
    <section className="document-outline" aria-labelledby="document-panel-title" data-testid="outline">
      {outline.items.length === 0 ? <p className="document-outline-empty">{i18n.t("No headings")}</p> : (
        <ol ref={list} className="document-outline-list" onKeyDown={move}>
          {outline.items.map((item, index) => (
            <li key={item.index}>
              <button
                type="button"
                className="document-outline-item"
                data-outline-label={item.text || i18n.t("Untitled heading")}
                style={{ "--outline-depth": item.level - 1 } as CSSProperties}
                aria-current={index === outline.current ? "location" : undefined}
                title={item.text || undefined}
                onClick={() => onSelect(item)}
                onKeyDown={event => {
                  // Activate on keydown and consume the key: focus moves into the editor, which
                  // must not also receive this Enter or Space as typing.
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelect(item);
                }}
              >
                <span className="document-outline-copy">
                  {item.number ? <><span className="document-outline-number">{item.number}</span>{item.text.slice(item.number.length)}</>
                    : item.text || <span className="document-outline-untitled">{i18n.t("Untitled heading")}</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
