import { useEditorVisible } from "../editor-visibility.ts";
import { documentContentBounds, documentScrollContainer } from "../document-scroll.ts";
import { useLayoutEffect, useRef } from "react";

/** Fit overlays to their owning document content viewport in every group layout. */
export function useOverlayBounds<T extends HTMLElement>(open = true) {
  const visible = useEditorVisible();
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!visible || !open || !element) return;
    let x = parseFloat(element.style.getPropertyValue("--overlay-shift-x")) || 0;
    let y = parseFloat(element.style.getPropertyValue("--overlay-shift-y")) || 0;
    const viewport = documentScrollContainer(element);
    const fit = () => {
      const inset = 8;
      const bounds = viewport ? documentContentBounds(viewport) : null;
      const leftEdge = bounds?.x ?? 0;
      const topEdge = bounds?.y ?? document.querySelector(".app-header")?.getBoundingClientRect().bottom ?? 0;
      const rightEdge = bounds ? bounds.x + bounds.width : window.innerWidth;
      const bottomEdge = bounds ? bounds.y + bounds.height : window.innerHeight;
      element.style.setProperty("--overlay-max-width", `${Math.max(0, rightEdge - leftEdge - inset * 2)}px`);
      element.style.setProperty("--overlay-max-height", `${Math.max(0, bottomEdge - topEdge - inset * 2)}px`);
      // Apply the size cap before measuring so forms and menus can wrap/scroll, then fit.
      const rect = element.getBoundingClientRect();
      // Subtract our previous translation so repeated fitting never accumulates offsets.
      const left = rect.left - x;
      const above = rect.top - y;
      x = Math.max(leftEdge + inset, Math.min(left, rightEdge - rect.width - inset)) - left;
      y = Math.max(topEdge + inset, Math.min(above, bottomEdge - rect.height - inset)) - above;
      element.style.setProperty("--overlay-shift-x", `${x}px`);
      element.style.setProperty("--overlay-shift-y", `${y}px`);
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(element);
    if (viewport) resize.observe(viewport);
    const movement = new MutationObserver(fit);
    const shell = viewport?.closest(".app-shell");
    if (shell) movement.observe(shell, { attributes: true, attributeFilter: ["class"] });
    if (viewport) movement.observe(viewport, { attributes: true, attributeFilter: ["style", "data-group-index"] });
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, true);
    return () => {
      resize.disconnect();
      movement.disconnect();
      window.removeEventListener("resize", fit);
      window.removeEventListener("scroll", fit, true);
    };
  });
  return ref;
}
