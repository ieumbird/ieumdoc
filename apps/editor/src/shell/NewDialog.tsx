import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";

export type NewDestination = { path: string; label: string };

type NewDialogProps = {
  open: boolean;
  busy: boolean;
  /** Host-resolved folders the document can be created in, in tree order. */
  destinations: NewDestination[];
  /** The destination selected when the dialog opens. */
  directory: string;
  /** Resolves to an error message, or "" once the document is created and open. */
  onCreate(path: string): Promise<string>;
  onClose(): void;
};

export function NewDialog({ open, busy, destinations, directory, onCreate, onClose }: NewDialogProps) {
  const [name, setName] = useState("");
  const [destination, setDestination] = useState(directory);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setDestination(directory);
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
            const separator = destination.includes("\\") ? "\\" : "/";
            const requestedPath = destination + (/[\\/]$/.test(destination) ? "" : separator) +
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
          <label className="grid gap-1 text-sm text-muted-foreground">
            Location
            {/* The destination is always shown and chosen here, never inferred from the tree. */}
            <select
              className="h-[var(--size-control)] w-full min-w-0 rounded-lg border border-input bg-transparent px-[var(--space-3)] text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              data-testid="new-file-directory"
              title={destination}
              value={destination}
              onChange={(event) => {
                setDestination(event.target.value);
                setError("");
              }}
              disabled={busy}
            >
              {destinations.map(option => <option key={option.path} value={option.path}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-muted-foreground">
            Name
            <Input
              id="new-file-name"
              data-testid="new-file-name"
              aria-label="New Markdown file name"
              className="text-foreground"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
              placeholder="new-document.md"
              disabled={busy}
              autoFocus
            />
          </label>
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
