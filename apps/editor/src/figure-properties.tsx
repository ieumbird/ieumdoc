import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useDocumentBounds } from "./ui/use-document-bounds.ts";
import { useEditorVisible } from "./editor-visibility.ts";
import { PROPERTY_APPLY_SHORTCUT } from "./shortcuts.ts";
import { Notice } from "./ui/primitives.tsx";

/** Figure metadata only. Source editing retains its existing in-document form. */
export function FigureProperties({ anchor, kind, testId, open, busy, choosing, error, onApply, onCancel, children }: {
  anchor: RefObject<HTMLElement | null>; kind: string; testId: string; open: boolean;
  busy?: boolean; choosing?: boolean; error?: string; onApply(outside?: boolean): void; onCancel(): void; children: ReactNode;
}) {
  const { t } = useTranslation();
  const visible = useEditorVisible();
  const bounds = useDocumentBounds(anchor, open);
  if (!visible) return null;
  return <Popover open={open} onOpenChange={(next, details) => {
    if (next || choosing) return;
    // Escape in a separate block menu belongs to that menu, preserving the property draft.
    const inMenu = details.event.composedPath().some(target => target instanceof Element && target.getAttribute("role") === "menu");
    if (details.reason === "escape-key" && !inMenu) onCancel();
    // Keyboard activation of Save, Source or a tab retains its draft contract. Only a
    // pointer click completes metadata; focus/keyboard navigation alone does not.
    if (details.reason === "outside-press" && !busy && details.event instanceof MouseEvent && details.event.detail > 0) onApply(true);
  }}>
    <PopoverContent anchor={() => {
      const figure = anchor.current?.closest("figure");
      if (!figure) return null;
      // Metadata is positioned above the Figure's layout box. Include it when
      // flipping above, keeping the same horizontal document axis.
      return { contextElement: figure, getBoundingClientRect: () => {
        const rect = figure.getBoundingClientRect();
        const top = Math.min(rect.top, anchor.current?.getBoundingClientRect().top ?? rect.top);
        return new DOMRect(rect.left, top, rect.width, rect.bottom - top);
      } };
    }}
      collisionBoundary={bounds}
      side="bottom" align="start" sideOffset={() => anchor.current
        ? parseFloat(getComputedStyle(anchor.current).getPropertyValue("--space-figure-popover-gap")) : 0}
      initialFocus={false} finalFocus={false}
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
