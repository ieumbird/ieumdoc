/** The owning tab's viewport. Callers without a document use the focused surface. */
export function documentScrollContainer(from: Element | null = document.querySelector('.document-scroll[data-active="true"]')): HTMLElement | null {
  return from?.closest<HTMLElement>(".document-scroll") ?? null;
}

/** Native keys already work inside the viewport. Shell focus needs the same reading keys. */
export function scrollDocumentFromShell(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (!["PageUp", "PageDown", " ", "Home", "End"].includes(event.key)) return;
  const target = event.target;
  if (!(target instanceof Element) || target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], .settings-screen')) return;
  if (event.key === " " && target.closest('button, a, [role="button"], [role="tab"]')) return;
  const viewport = documentScrollContainer();
  if (!viewport || viewport.contains(target)) return;
  // File/Outline lists keep their own native scrolling and keyboard navigation.
  for (let node: Element | null = target; node && node !== document.body; node = node.parentElement) {
    if (node instanceof HTMLElement && /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return;
  }
  const page = viewport.clientHeight * 0.875;
  const top = event.key === "Home" ? 0 : event.key === "End" ? viewport.scrollHeight
    : viewport.scrollTop + (event.key === "PageUp" || event.key === " " && event.shiftKey ? -page : page);
  viewport.scrollTo({ top });
  event.preventDefault();
}

/** Visible content area, excluding shell panels, padding and the native scrollbar. */
export function documentContentBounds(viewport: HTMLElement) {
  const rect = viewport.getBoundingClientRect(), style = getComputedStyle(viewport);
  const x = rect.left + viewport.clientLeft + parseFloat(style.paddingLeft);
  const y = rect.top + viewport.clientTop;
  // Below the docking width Outline covers content without changing its padding.
  const panel = viewport.closest(".app-shell")?.querySelector(".document-panel")?.getBoundingClientRect();
  const right = Math.min(rect.right, rect.left + viewport.clientLeft + viewport.clientWidth - parseFloat(style.paddingRight), panel?.left ?? window.innerWidth);
  return { x, y, width: Math.max(0, right - x), height: Math.min(rect.bottom - y, viewport.clientHeight) };
}
