import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { useEditorVisible } from "./editor-visibility.ts";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { Button } from "@/components/ui/button.tsx";
import { PROPERTY_APPLY_SHORTCUT } from "./shortcuts.ts";
import { Notice } from "./ui/primitives.tsx";

/** Explicit block editing. Selection and outside interaction never apply or discard input. */
export function BlockProperties({
  anchor, initialFocus, kind, testId, open, error, busy, onApply, onCancel, children, endnoteOwner,
}: {
  anchor: RefObject<HTMLElement | null>;
  /** The field Edit focuses. Views that focus their own field after insertion omit it. */
  initialFocus?: RefObject<HTMLElement | null>;
  kind: string;
  testId: string;
  open: boolean;
  error?: string;
  busy?: boolean;
  endnoteOwner?: { label: string; editor: string };
  onApply(): void;
  onCancel(): void;
  children: ReactNode;
}) {
  useTranslation();
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
        aria-label={i18n.t("{{kind}} properties", { kind: kind })}
        data-testid={`${testId}-properties`}
        data-endnote-owner={endnoteOwner?.label}
        data-endnote-editor={endnoteOwner?.editor}
        className="block-properties"
      >
        <p className="overlay-title">{kind}</p>
        <form
          className="block-properties-form"
          data-testid={`${testId}-editor`}
          onSubmit={(event) => { event.preventDefault(); if (!busy) onApply(); }}
          onKeyDown={(event) => {
            if (PROPERTY_APPLY_SHORTCUT.matches(event.nativeEvent)) {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.requestSubmit();
            }
            if (event.key === "Escape") { event.preventDefault(); onCancel(); }
          }}
        >
          {children}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="form-actions">
            <Button type="button" size="sm" variant="outline" onClick={onCancel} data-testid={`${testId}-cancel`}>{i18n.t("Cancel")}</Button>
            <Button type="submit" size="sm" disabled={busy} data-testid={`${testId}-apply`}>{i18n.t("Apply")}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
