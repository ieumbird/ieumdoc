import { useLayoutEffect, useState, type RefObject } from "react";
import { documentContentBounds, documentScrollContainer } from "../document-scroll.ts";
import { useEditorVisible } from "../editor-visibility.ts";

/** Reuse the Figure property's content boundary for anchored property forms. */
export function useDocumentBounds(anchor: RefObject<HTMLElement | null>, open: boolean) {
  const visible = useEditorVisible();
  const [bounds, setBounds] = useState<{ x: number; y: number; width: number; height: number }>();
  useLayoutEffect(() => {
    const viewport = documentScrollContainer(anchor.current);
    if (!open || !visible || !viewport) return;
    const measure = () => {
      const next = documentContentBounds(viewport);
      setBounds(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(viewport);
    const movement = new MutationObserver(measure);
    const shell = viewport.closest(".app-shell");
    if (shell) movement.observe(shell, { attributes: true, attributeFilter: ["class"] });
    movement.observe(viewport, { attributes: true, attributeFilter: ["style", "data-group-index"] });
    window.addEventListener("resize", measure);
    return () => { resize.disconnect(); movement.disconnect(); window.removeEventListener("resize", measure); };
  }, [anchor, open, visible]);
  return bounds;
}
