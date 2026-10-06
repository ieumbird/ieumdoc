import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";

type OpenDialogProps = {
  open: boolean;
  initialPath: string;
  busy: boolean;
  /** Asks for a folder to list in the sidebar instead of a document. */
  folder?: boolean;
  /** Resolves to an error message, or "" once the document (or folder) is open. */
  onOpen(path: string): Promise<string>;
  onClose(): void;
};

// Path entry: the local Host has no native file or folder picker.
export function OpenDialog({ open, initialPath, busy, folder = false, onOpen, onClose }: OpenDialogProps) {
  const [path, setPath] = useState(initialPath);
  const [error, setError] = useState("");

  // Reset the form each time the dialog opens, so it always starts from the current document path.
  useEffect(() => {
    if (open) {
      setPath(initialPath);
      setError("");
    }
  }, [open, initialPath]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false}>
        <form
          className="grid gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const message = await onOpen(path);
            setError(message);
            if (!message) onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>{folder ? "Open folder" : "Open Markdown file"}</DialogTitle>
          </DialogHeader>
          <Input
            id={folder ? "folder-path" : "file-path"}
            data-testid={folder ? "folder-path" : "file-path"}
            aria-label={folder ? "Folder path" : "Markdown file path"}
            value={path}
            onChange={(event) => {
              setPath(event.target.value);
              setError("");
            }}
            placeholder={folder ? "path/to/folder" : "path/to/document.md"}
            disabled={busy}
            autoFocus
          />
          {error ? <p className="text-sm text-destructive" role="alert" data-testid="open-error">{error}</p> : null}
          <DialogFooter>
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || !path.trim()}>Open</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
