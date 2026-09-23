import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";

type NewDialogProps = {
  open: boolean;
  busy: boolean;
  /** Resolves to an error message, or "" once the document is created and open. */
  onCreate(path: string): Promise<string>;
  onClose(): void;
};

export function NewDialog({ open, busy, onCreate, onClose }: NewDialogProps) {
  const [path, setPath] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPath("");
      setError("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false}>
        <form
          className="grid gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const message = await onCreate(path);
            setError(message);
            if (!message) onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>New Markdown file</DialogTitle>
            <DialogDescription>Create a new file at an existing parent directory.</DialogDescription>
          </DialogHeader>
          <Input
            id="new-file-path"
            data-testid="new-file-path"
            aria-label="New Markdown file path"
            value={path}
            onChange={(event) => {
              setPath(event.target.value);
              setError("");
            }}
            placeholder="path/to/new-document.md"
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
