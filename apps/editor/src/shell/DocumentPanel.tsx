import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import { createOutlineStore, type NavigationList, type OutlineItem, type OutlineStore } from "../outline.ts";
import { Button } from "@/components/ui/button.tsx";

type DocumentPanelProps = {
  /** Below the docking width the panel covers the document instead of narrowing it. */
  overlay: boolean;
  /** Document navigation lists and the current item in each. */
  outline?: OutlineStore;
  onSelectItem(item: OutlineItem): void;
  /** Dismiss the overlay with Escape and return focus to the TopBar Outline toggle. */
  onClose(): void;
};

const emptyOutline = createOutlineStore();
const kinds = ["outline", "tables", "figures"] as const;
type ListKind = typeof kinds[number];

/** Navigation inside the open document. Choice is local to this mounted panel. */
export function DocumentPanel({ overlay, outline: store = emptyOutline, onSelectItem, onClose }: DocumentPanelProps) {
  useTranslation();
  const outline = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [kind, setKind] = useState<ListKind>("outline");
  const tabs = useRef<HTMLDivElement>(null);
  const labels = { outline: i18n.t("Outline"), tables: i18n.t("Tables"),
    figures: i18n.t("Figures") };
  const switchTab = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = kinds.indexOf(kind);
    const next = event.key === "ArrowRight" ? (index + 1) % kinds.length : event.key === "ArrowLeft" ? (index + kinds.length - 1) % kinds.length
      : event.key === "Home" ? 0 : event.key === "End" ? kinds.length - 1 : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setKind(kinds[next]);
    tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
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
      <div className="document-panel-header document-panel-navigation">
        <h2 className="sr-only" id="document-panel-title">{i18n.t("Outline")}</h2>
        <div ref={tabs} className="view-toggle" role="tablist" aria-label={i18n.t("Document navigation")} onKeyDown={switchTab}>
          {kinds.map(value => <Button key={value} type="button" variant="ghost" size="sm" className="view-toggle-option"
            role="tab" id={`document-panel-tab-${value}`} aria-selected={kind === value} aria-controls={`document-panel-list-${value}`}
            tabIndex={kind === value ? 0 : -1} onClick={() => setKind(value)} data-segment-label={labels[value]}><span className="view-toggle-label">{labels[value]}</span></Button>)}
        </div>
      </div>
      {kinds.map(value => <Outline key={value} kind={value} active={kind === value}
        outline={value === "outline" ? outline : outline[value]} onSelect={onSelectItem} />)}
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

function Outline({ kind, active, outline, onSelect }: { kind: ListKind; active: boolean; outline: NavigationList; onSelect(item: OutlineItem): void }) {
  useTranslation();
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
  }, [active, outline.current, outline.items]);
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
  }, [active, outline.items.length === 0]);
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
    <section className="document-outline" role="tabpanel" hidden={!active} id={`document-panel-list-${kind}`} aria-labelledby={`document-panel-tab-${kind}`} data-testid={kind}>
      {!active ? null : outline.items.length === 0 ? <p className="document-outline-empty">{i18n.t(kind === "tables" ? "No tables" : kind === "figures" ? "No figures" : "No headings")}</p> : (
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
