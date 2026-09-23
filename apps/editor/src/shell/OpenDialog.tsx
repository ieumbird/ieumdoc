import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "../ui/primitives.tsx";

type OpenDialogProps = {
  initialPath: string;
  busy: boolean;
  /** Resolves to an error message, or "" once the document is open. */
  onOpen(path: string): Promise<string>;
  onClose(): void;
};

// Temporary path entry until a workspace or file picker structure is decided.
// Mounted only while open, so each opening starts from the current document path.
export function OpenDialog({ initialPath, busy, onOpen, onClose }: OpenDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [path, setPath] = useState(initialPath);
  const [error, setError] = useState("");

  // Unmounting removes the element, which closes the modal without a close event.
  useLayoutEffect(() => {
    if (!dialog.current!.open) dialog.current!.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="open-dialog" aria-labelledby="open-dialog-title" onClose={onClose}>
      <form
        className="open-dialog-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const message = await onOpen(path);
          setError(message);
          if (!message) onClose();
        }}
      >
        <h2 id="open-dialog-title" className="open-dialog-title">Open Markdown file</h2>
        <input
          id="file-path"
          className="file-path"
          data-testid="file-path"
          aria-label="Markdown file path"
          value={path}
          onChange={(event) => {
            setPath(event.target.value);
            setError("");
          }}
          placeholder="path/to/document.md"
          disabled={busy}
          autoFocus
        />
        {error ? <p className="open-dialog-error" role="alert" data-testid="open-error">{error}</p> : null}
        <div className="open-dialog-actions">
          <Button size="sm" variant="subtle" onClick={onClose}>Cancel</Button>
          <Button size="sm" type="submit" disabled={busy || !path.trim()}>Open</Button>
        </div>
      </form>
    </dialog>
  );
}
