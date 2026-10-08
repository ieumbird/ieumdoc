import { useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
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
        <h2 className="document-panel-title" id="document-panel-title">Outline</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Hide outline" onClick={onClose}>
          <PanelRightClose />
        </Button>
      </div>
      {outline ? <Outline outline={outline} onSelect={onSelectHeading} /> : null}
    </aside>
  );
}

function Outline({ outline: store, onSelect }: { outline: OutlineStore; onSelect(item: OutlineItem): void }) {
  const outline = useSyncExternalStore(store.subscribe, store.get, store.get);
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
      {outline.items.length === 0 ? <p className="document-outline-empty">No headings</p> : (
        <ol className="document-outline-list" onKeyDown={move}>
          {outline.items.map((item, index) => (
            <li key={`${item.index}:${item.pos}`}>
              <button
                type="button"
                className="document-outline-item"
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
                {item.text || <span className="document-outline-untitled">Untitled heading</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
