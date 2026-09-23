import { Button, IconButton } from "../ui/primitives.tsx";
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
        <IconButton
          className="sidebar-toggle"
          label={open ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? "«" : "»"}
        </IconButton>
      </div>
      {open ? (
        <>
          <Button className="sidebar-open" size="sm" variant="subtle" onClick={onOpen}>
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
