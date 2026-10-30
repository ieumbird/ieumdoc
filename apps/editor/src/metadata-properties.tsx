import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useDocumentBounds } from "./ui/use-document-bounds.ts";
import { useEditorVisible } from "./editor-visibility.ts";
import { PROPERTY_APPLY_SHORTCUT } from "./shortcuts.ts";
import { Notice } from "./ui/primitives.tsx";

/** Short metadata only. Source editing retains its explicit Apply/Cancel form. */
export function MetadataProperties({ anchor, target, initialFocus, kind, testId, open, busy, choosing, error, onApply, onCancel, children }: {
  anchor: RefObject<HTMLElement | null>; target(): Element | null; initialFocus?: RefObject<HTMLElement | null>; kind: string; testId: string; open: boolean;
  busy?: boolean; choosing?: boolean; error?: string; onApply(outside?: boolean): void; onCancel(): void; children: ReactNode;
}) {
  const { t } = useTranslation();
  const visible = useEditorVisible();
  const bounds = useDocumentBounds(anchor, open);
  const wasOpen = useRef(false);
  const openingFocus = useRef<RefObject<HTMLElement | null> | false>(false);
  const outsideCompletion = useRef<number | undefined>(undefined);
  // Boundary measurement must not replace the queued opening focus target.
  if (!wasOpen.current && open) openingFocus.current = initialFocus ?? false;
  if (!visible) openingFocus.current = false;
  useLayoutEffect(() => { wasOpen.current = open; }, [open]);
  useLayoutEffect(() => () => {
    if (outsideCompletion.current !== undefined) window.clearTimeout(outsideCompletion.current);
    outsideCompletion.current = undefined;
    // A pointer may hide this tab before accepted completion runs. Visibility
    // alone must not cancel that edit; explicit close/unmount still does.
  }, [open]);
  if (!visible) return null;
  return <Popover open={open} onOpenChange={(next, details) => {
    // The owner closes only after accepted completion/cancellation. Keep Base UI's
    // interaction state open across focus-out and rejected/async submissions too.
    if (!next) details.cancel();
    if (next || choosing) return;
    // Escape in a separate block menu belongs to that menu, preserving the property draft.
    const inMenu = details.event.composedPath().some(target => target instanceof Element && target.getAttribute("role") === "menu");
    if (details.reason === "escape-key" && !inMenu) onCancel();
    // Keyboard activation of Save, Source or a tab retains its draft contract. Only a
    // pointer click completes metadata; focus/keyboard navigation alone does not.
    if (details.reason === "outside-press" && !busy && details.event instanceof MouseEvent && details.event.detail > 0 && outsideCompletion.current === undefined) {
      // Let the engine read the native pointer selection before a synchronous
      // metadata transaction writes its selection back to the DOM.
      outsideCompletion.current = window.setTimeout(() => { outsideCompletion.current = undefined; onApply(true); }, 0);
    }
  }}>
    <PopoverContent anchor={() => {
      const block = target();
      if (!block) return null;
      // Include metadata above the target when flipping, on the same document axis.
      return { contextElement: block, getBoundingClientRect: () => {
        const rect = block.getBoundingClientRect();
        const top = Math.min(rect.top, anchor.current?.getBoundingClientRect().top ?? rect.top);
        return new DOMRect(rect.left, top, rect.width, rect.bottom - top);
      } };
    }}
      collisionBoundary={bounds}
      side="bottom" align="start" sideOffset={() => anchor.current
        ? parseFloat(getComputedStyle(anchor.current).getPropertyValue("--space-figure-popover-gap")) : 0}
      initialFocus={openingFocus.current} finalFocus={false}
      className="figure-properties" aria-label={t("{{kind}} properties", { kind })} data-testid={`${testId}-properties`}>
      <form className="block-properties-form" data-testid={`${testId}-editor`} aria-label={t("{{kind}} properties", { kind })}
        onSubmit={event => { event.preventDefault(); if (!busy) onApply(); }}
        onKeyDown={event => {
          if (PROPERTY_APPLY_SHORTCUT.matches(event.nativeEvent)) {
            event.preventDefault(); event.stopPropagation(); event.currentTarget.requestSubmit();
          }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
        }}>
        {children}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="form-actions"><Button type="submit" size="sm" disabled={busy} data-testid={`${testId}-apply`}>{t("Done")}</Button></div>
      </form>
    </PopoverContent>
  </Popover>;
}
