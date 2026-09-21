export type FocusEdge = "start" | "end" | "all" | { offset: number };

export function focusTextField(element: HTMLInputElement | HTMLTextAreaElement, edge: FocusEdge): void {
  element.focus();
  const length = element.value.length;
  if (edge === "start") {
    element.setSelectionRange(0, 0);
    return;
  }
  if (edge === "end") {
    element.setSelectionRange(length, length);
    return;
  }
  if (edge === "all") {
    element.setSelectionRange(0, length);
    return;
  }
  const offset = Math.min(length, Math.max(0, edge.offset));
  element.setSelectionRange(offset, offset);
}
