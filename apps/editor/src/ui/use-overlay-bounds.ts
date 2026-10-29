import { useEditorVisible } from "../editor-visibility.ts";
import { documentScrollContainer } from "../document-scroll.ts";
import { useLayoutEffect, useRef } from "react";

/** Fit overlays to their split document viewport; retain the window bounds in one group. */
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
      const group = viewport?.closest(".app-shell--split") ? viewport.getBoundingClientRect() : null;
      const leftEdge = group ? group.left + viewport!.clientLeft : 0;
      const topEdge = group ? group.top + viewport!.clientTop : document.querySelector(".app-header")?.getBoundingClientRect().bottom ?? 0;
      // clientWidth is integral, while equal columns can end on half pixels. Stay inside both.
      const rightEdge = group ? Math.min(group.right, leftEdge + viewport!.clientWidth) : window.innerWidth;
      const bottomEdge = group ? Math.min(group.bottom, topEdge + viewport!.clientHeight) : window.innerHeight;
      if (group) {
        element.style.setProperty("--overlay-max-width", `${rightEdge - leftEdge - inset * 2}px`);
        element.style.setProperty("--overlay-max-height", `${bottomEdge - topEdge - inset * 2}px`);
      } else {
        element.style.removeProperty("--overlay-max-width");
        element.style.removeProperty("--overlay-max-height");
      }
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
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, true);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", fit);
      window.removeEventListener("scroll", fit, true);
    };
  });
  return ref;
}
