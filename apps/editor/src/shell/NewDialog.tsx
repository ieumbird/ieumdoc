import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";

export type NewDestination = { path: string; label: string };

const TEXT = {
  file: {
    title: "New Markdown file",
    description: "Name your Markdown file. The .md extension is added if omitted.",
    label: "New Markdown file name",
    placeholder: "new-document.md",
    invalid: "Enter a file name without a directory path.",
  },
  folder: {
    title: "New folder",
    description: "Name the folder to create in the location.",
    label: "New folder name",
    placeholder: "new-folder",
    invalid: "Enter a folder name without a directory path.",
  },
};

type NewDialogProps = {
  /** A Markdown file (the default) or a folder. */
  kind?: "file" | "folder";
  open: boolean;
  busy: boolean;
  /** Host-resolved folders the item can be created in, in tree order. */
  destinations: NewDestination[];
  /** The destination selected when the dialog opens. */
  directory: string;
  /** Resolves to an error message, or "" once the item is created (and a document open). */
  onCreate(directory: string, name: string): Promise<string>;
  /** Successful creation hands focus to the new document after the modal closes. */
  createdFocusTarget?: () => HTMLElement | null;
  returnFocus?: RefObject<HTMLElement | null>;
  onClose(): void;
};

export function NewDialog({ kind = "file", open, busy, destinations, directory, onCreate, createdFocusTarget, returnFocus, onClose }: NewDialogProps) {
  const [name, setName] = useState("");
  const [destination, setDestination] = useState(directory);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const created = useRef(false);
  const text = TEXT[kind];
  const disabled = busy || pending;
  const trimmed = name.trim();
  const invalidName = !trimmed || trimmed === "." || trimmed === ".." || /[\\/]/.test(trimmed);

  useEffect(() => {
    if (open) {
      created.current = false;
      setName("");
      setDestination(directory);
      setError("");
    }
  }, [open, directory]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false}
        finalFocus={() => created.current && createdFocusTarget ? createdFocusTarget() ?? true : returnFocus?.current ?? true}>
        <form
          className="grid gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (disabled) return;
            if (invalidName) {
              setError(text.invalid);
              return;
            }
            // One leaf name; the Host still resolves and validates the address.
            const leaf = kind === "folder" || trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
            setPending(true);
            const message = await onCreate(destination, leaf);
            setPending(false);
            setError(message);
            if (!message) {
              created.current = true;
              onClose();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{text.title}</DialogTitle>
            <DialogDescription>{text.description}</DialogDescription>
          </DialogHeader>
          <label className="form-field">
            <span>Location</span>
            {/* The destination is always shown and chosen here, never inferred from the tree. */}
            <select
              className="h-[var(--size-control)] w-full min-w-0 rounded-md border border-input bg-background px-[var(--space-3)] text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              data-testid={`new-${kind}-directory`}
              title={destination}
              value={destination}
              onChange={(event) => {
                setDestination(event.target.value);
                setError("");
              }}
              disabled={disabled}
            >
              {destinations.map(option => <option key={option.path} value={option.path}>{option.label}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Name</span>
            <Input
              id={`new-${kind}-name`}
              data-testid={`new-${kind}-name`}
              aria-label={text.label}
              aria-invalid={error && invalidName ? true : undefined}
              aria-describedby={error ? "new-error" : undefined}
              className="text-foreground"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
              placeholder={text.placeholder}
              disabled={disabled}
              autoFocus
            />
          </label>
          {error ? <p id="new-error" className="text-sm text-destructive" role="alert" data-testid="new-error">{error}</p> : null}
          <DialogFooter>
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={disabled || !trimmed}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
