import type { ReactNode, RefObject } from "react";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { Button, Notice } from "./ui/primitives.tsx";

/**
 * The properties panel Equations and Figures share. Selecting the block shows a summary of its
 * properties under the block's metadata line; Edit opens the form in the same panel, and only
 * Apply or Cancel ends that draft. Selection keeps focus in the editor; the form focuses itself.
 */
export function BlockProperties({
  anchor, kind, testId, open, editing, readOnly, summary, error, busy, onApply, onCancel, onDismiss, children,
}: {
  anchor: RefObject<HTMLElement | null>;
  /** The block kind as the panel title names it, e.g. "Equation (2)". */
  kind: string;
  /** Prefix of the panel's test ids: `${testId}-properties`, `-editor`, `-apply`, `-cancel`. */
  testId: string;
  open: boolean;
  editing: boolean;
  readOnly?: boolean;
  summary: [name: string, value: string][];
  error?: string;
  busy?: boolean;
  onApply(): void;
  onCancel(): void;
  onDismiss(): void;
  /** The form fields, shown while editing. */
  children: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={(next) => { if (!next && !editing) onDismiss(); }}>
      <PopoverContent
        anchor={anchor}
        side="bottom"
        align="end"
        sideOffset={12}
        initialFocus={false}
        finalFocus={false}
        aria-label={`${kind} properties`}
        data-testid={`${testId}-properties`}
        className="block-properties"
      >
        <p className="overlay-title">{kind}{readOnly ? " · Read-only" : ""}</p>
        {editing ? (
          <form
            className="block-properties-form"
            data-testid={`${testId}-editor`}
            onSubmit={(event) => {
              event.preventDefault();
              onApply();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }
            }}
          >
            {children}
            {error ? <Notice tone="error">{error}</Notice> : null}
            <div className="form-actions">
              <Button type="submit" size="sm" disabled={busy} data-testid={`${testId}-apply`}>Apply</Button>
              <Button type="button" size="sm" variant="subtle" onClick={onCancel} data-testid={`${testId}-cancel`}>Cancel</Button>
            </div>
          </form>
        ) : (
          <>
            <dl>
              {summary.map(([name, value]) => (
                <div key={name} className="block-property">
                  <dt>{name}</dt>
                  <dd>{value || "—"}</dd>
                </div>
              ))}
            </dl>
            {readOnly ? <p className="block-popover-note">This {kind.split(" ")[0]}'s structure is read-only in this version.</p> : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
