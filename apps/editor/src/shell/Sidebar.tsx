import type { CSSProperties, KeyboardEvent } from "react";
import { FilePlus2, FileText, FolderOpen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import type { OutlineItem } from "../outline.ts";
import { splitDocumentPath } from "./document-path.ts";

type SidebarProps = {
  open: boolean;
  documentPath: string;
  /** Headings of the open document and the index of the section being read. */
  outline?: { items: OutlineItem[]; current: number };
  onSelectHeading?(item: OutlineItem): void;
  onToggle(): void;
  onOpen(): void;
  onNew(): void;
};

/** App-level entry points and the open document's outline. No workspace tree until that structure is decided. */
export function Sidebar({ open, documentPath, outline, onSelectHeading, onToggle, onOpen, onNew }: SidebarProps) {
  const { name } = splitDocumentPath(documentPath);
  return (
    <nav className={`sidebar${open ? "" : " sidebar--collapsed"}`} aria-label="Application" data-testid="sidebar">
      <div className="sidebar-header">
        {open ? <span className="product">IeumDoc</span> : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
      </div>
      {open ? (
        <>
          <div className="sidebar-actions">
            <Button className="min-w-0 justify-start" size="sm" variant="ghost" onClick={onOpen}>
              <FolderOpen aria-hidden="true" />
              Open…
            </Button>
            <Button className="min-w-0 justify-start" size="sm" variant="ghost" onClick={onNew}>
              <FilePlus2 aria-hidden="true" />
              New
            </Button>
          </div>
          {documentPath ? (
            <ul className="sidebar-documents" aria-label="Open documents">
              <li className="sidebar-document" aria-current="page" title={documentPath}>
                <FileText className="sidebar-document-icon" aria-hidden="true" />
                <span className="sidebar-document-name">{name}</span>
              </li>
            </ul>
          ) : null}
          {documentPath && outline ? <Outline outline={outline} onSelect={item => onSelectHeading?.(item)} /> : null}
        </>
      ) : null}
    </nav>
  );
}

function Outline({ outline, onSelect }: { outline: { items: OutlineItem[]; current: number }; onSelect(item: OutlineItem): void }) {
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
    <section className="sidebar-outline" aria-labelledby="sidebar-outline-label" data-testid="outline">
      <p className="sidebar-section-label" id="sidebar-outline-label">Outline</p>
      {outline.items.length === 0 ? <p className="sidebar-outline-empty">No headings</p> : (
        <ol className="sidebar-outline-list" onKeyDown={move}>
          {outline.items.map((item, index) => (
            <li key={`${item.index}:${item.pos}`}>
              <button
                type="button"
                className="sidebar-outline-item"
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
                {item.text || <span className="sidebar-outline-untitled">Untitled heading</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
