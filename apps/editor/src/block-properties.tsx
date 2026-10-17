import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { useEditorVisible } from "./editor-visibility.ts";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Notice } from "./ui/primitives.tsx";

/** Explicit block editing. Selection and outside interaction never apply or discard input. */
export function BlockProperties({
  anchor, initialFocus, kind, testId, open, error, busy, onApply, onCancel, children,
}: {
  anchor: RefObject<HTMLElement | null>;
  /** The field Edit focuses. Views that focus their own field after insertion omit it. */
  initialFocus?: RefObject<HTMLElement | null>;
  kind: string;
  testId: string;
  open: boolean;
  error?: string;
  busy?: boolean;
  onApply(): void;
  onCancel(): void;
  children: ReactNode;
}) {
  const visible = useEditorVisible();
  const wasOpen = useRef(false);
  useLayoutEffect(() => { wasOpen.current = open; }, [open]);
  if (!visible) return null;
  return (
    <Popover open={open}>
      <PopoverContent
        anchor={anchor}
        side="bottom"
        align="end"
        sideOffset={12}
        initialFocus={wasOpen.current ? false : initialFocus ?? false}
        finalFocus={false}
        aria-label={`${kind} properties`}
        data-testid={`${testId}-properties`}
        className="block-properties"
      >
        <p className="overlay-title">{kind}</p>
        <form
          className="block-properties-form"
          data-testid={`${testId}-editor`}
          onSubmit={(event) => { event.preventDefault(); onApply(); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); onCancel(); }
          }}
        >
          {children}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="form-actions">
            <Button type="button" size="sm" variant="outline" onClick={onCancel} data-testid={`${testId}-cancel`}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy} data-testid={`${testId}-apply`}>Apply</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
