import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";

type NewDialogProps = {
  open: boolean;
  busy: boolean;
  /** The Host-resolved folder the new document is created in. */
  directory: string;
  /** Resolves to an error message, or "" once the document is created and open. */
  onCreate(path: string): Promise<string>;
  onClose(): void;
};

export function NewDialog({ open, busy, directory, onCreate, onClose }: NewDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
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
            const filename = name.trim();
            if (!filename || filename === "." || filename === ".." || /[\\/]/.test(filename)) {
              setError("Enter a file name without a directory path.");
              return;
            }
            // Append one leaf name; the Host still resolves and validates the address.
            const separator = directory.includes("\\") ? "\\" : "/";
            const requestedPath = directory + (/[\\/]$/.test(directory) ? "" : separator) +
              (filename.toLowerCase().endsWith(".md") ? filename : `${filename}.md`);
            const message = await onCreate(requestedPath);
            setError(message);
            if (!message) onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>New Markdown file</DialogTitle>
            <DialogDescription>Name your Markdown file. The .md extension is added if omitted.</DialogDescription>
          </DialogHeader>
          <p className="min-w-0 break-all text-sm text-muted-foreground" data-testid="new-file-directory">{directory}</p>
          <Input
            id="new-file-name"
            data-testid="new-file-name"
            aria-label="New Markdown file name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
            placeholder="new-document.md"
            disabled={busy}
            autoFocus
          />
          {error ? <p className="text-sm text-destructive" role="alert" data-testid="new-error">{error}</p> : null}
          <DialogFooter>
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
