import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { Button } from "@/components/ui/button.tsx";
import { documentScrollContainer } from "./document-scroll.ts";
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
  const [bounds, setBounds] = useState<{ x: number; y: number; width: number; height: number }>();
  useLayoutEffect(() => {
    const viewport = documentScrollContainer(anchor.current);
    if (!open || !visible || !viewport) return;
    const measure = () => {
      const rect = viewport.getBoundingClientRect(), style = getComputedStyle(viewport);
      const left = parseFloat(style.paddingLeft), right = parseFloat(style.paddingRight);
      const next = { x: rect.left + viewport.clientLeft + left, y: rect.top + viewport.clientTop,
        width: viewport.clientWidth - left - right, height: viewport.clientHeight };
      setBounds(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(viewport);
    const movement = new MutationObserver(measure);
    movement.observe(viewport, { attributes: true, attributeFilter: ["style", "data-group-index"] });
    window.addEventListener("resize", measure);
    return () => { resize.disconnect(); movement.disconnect(); window.removeEventListener("resize", measure); };
  }, [anchor, open, visible]);
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
    <PopoverContent anchor={() => anchor.current?.closest("figure") ?? null}
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
