import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";

type NewDialogProps = {
  open: boolean;
  busy: boolean;
  /** A Host-resolved folder for filename-only creation; omitted for full-path New. */
  directory?: string;
  /** Resolves to an error message, or "" once the document is created and open. */
  onCreate(path: string): Promise<string>;
  onClose(): void;
};

export function NewDialog({ open, busy, directory = "", onCreate, onClose }: NewDialogProps) {
  const [path, setPath] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPath("");
      setError("");
    }
  }, [open, directory]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false}>
        <form
          className="grid gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            let requestedPath = path;
            if (directory) {
              const filename = path.trim();
              if (!filename || filename === "." || filename === ".." || /[\\/]/.test(filename)) {
                setError("Enter a file name without a directory path.");
                return;
              }
              // Append one leaf name; the Host still resolves and validates the address.
              const separator = directory.includes("\\") ? "\\" : "/";
              requestedPath = directory + (/[\\/]$/.test(directory) ? "" : separator) +
                (filename.toLowerCase().endsWith(".md") ? filename : `${filename}.md`);
            }
            const message = await onCreate(requestedPath);
            setError(message);
            if (!message) onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>New Markdown file</DialogTitle>
            <DialogDescription>{directory
              ? "Name your Markdown file. The .md extension is added if omitted."
              : "Create a new file at an existing parent directory."}</DialogDescription>
          </DialogHeader>
          {directory ? <p className="min-w-0 break-all text-sm text-muted-foreground" data-testid="new-file-directory">{directory}</p> : null}
          <Input
            id="new-file-path"
            data-testid={directory ? "new-file-name" : "new-file-path"}
            aria-label={directory ? "New Markdown file name" : "New Markdown file path"}
            value={path}
            onChange={(event) => {
              setPath(event.target.value);
              setError("");
            }}
            placeholder={directory ? "new-document.md" : "path/to/new-document.md"}
            disabled={busy}
            autoFocus
          />
          {error ? <p className="text-sm text-destructive" role="alert" data-testid="new-error">{error}</p> : null}
          <DialogFooter>
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || !path.trim()}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
