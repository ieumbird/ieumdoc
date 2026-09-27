import { useLayoutEffect, useRef } from "react";

/** Keep the existing editor overlays inside the viewport. Focus/dismissal stay with each caller. */
export function useOverlayBounds<T extends HTMLElement>(open = true) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    let x = parseFloat(element.style.getPropertyValue("--overlay-shift-x")) || 0;
    let y = parseFloat(element.style.getPropertyValue("--overlay-shift-y")) || 0;
    const fit = () => {
      const rect = element.getBoundingClientRect();
      const inset = 8;
      const top = (document.querySelector(".app-header")?.getBoundingClientRect().bottom ?? 0) + inset;
      // Subtract our previous translation so repeated fitting never accumulates offsets.
      const left = rect.left - x;
      const above = rect.top - y;
      x = Math.max(inset, Math.min(left, window.innerWidth - rect.width - inset)) - left;
      y = Math.max(top, Math.min(above, window.innerHeight - rect.height - inset)) - above;
      element.style.setProperty("--overlay-shift-x", `${x}px`);
      element.style.setProperty("--overlay-shift-y", `${y}px`);
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(element);
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
