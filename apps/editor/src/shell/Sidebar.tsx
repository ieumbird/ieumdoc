import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { splitDocumentPath } from "./document-path.ts";

type SidebarProps = {
  open: boolean;
  documentPath: string;
  onToggle(): void;
  onOpen(): void;
};

/** App-level entry points only. No workspace tree until that structure is decided. */
export function Sidebar({ open, documentPath, onToggle, onOpen }: SidebarProps) {
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
          <Button className="justify-start" size="sm" variant="secondary" onClick={onOpen}>
            Open…
          </Button>
          {documentPath ? (
            <ul className="sidebar-documents" aria-label="Open documents">
              <li className="sidebar-document" aria-current="page" title={documentPath}>{name}</li>
            </ul>
          ) : null}
        </>
      ) : null}
    </nav>
  );
}
