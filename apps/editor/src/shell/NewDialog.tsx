import { useMessageState } from "../ui-message.ts";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";

export type NewDestination = { path: string; label: string };

const TEXT = {
  file: {
    get title() { return i18n.t("New Markdown file"); },
    get description() { return i18n.t("Name your Markdown file. The .md extension is added if omitted."); },
    get label() { return i18n.t("New Markdown file name"); },
    placeholder: "new-document.md",
    invalid: "Enter a file name without a directory path." as const,
  },
  folder: {
    get title() { return i18n.t("New folder"); },
    get description() { return i18n.t("Name the folder to create in the location."); },
    get label() { return i18n.t("New folder name"); },
    placeholder: "new-folder",
    invalid: "Enter a folder name without a directory path." as const,
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
  useTranslation();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState(directory);
  const [error, setError] = useMessageState("");
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
              setError({ key: text.invalid });
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
            <span>{i18n.t("Location")}</span>
            {/* The destination is always shown and chosen here, never inferred from the tree. */}
            <select
              className="form-select h-[var(--size-control)] w-full min-w-0 rounded-md border border-input bg-background pl-[var(--space-3)] text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
            <span>{i18n.t("Name")}</span>
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
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>{i18n.t("Cancel")}</Button>
            <Button type="submit" size="sm" disabled={disabled || !trimmed}>{i18n.t("Create")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
