import type { Editor } from "@tiptap/core";
import { useLayoutEffect, useRef, type RefObject } from "react";

/** Snapshot locators and geometry only; engine types stay inside the Editor. */
export type ReadingPosition = { blocks: { key: string; top: number; left: number; height: number }[]; height: number };
export type ReadingCallbacks = {
  onReadingLayout?(position: ReadingPosition): void;
  onReadingSelection?(key: string | undefined): void;
};

export function useDocumentReading(editor: Editor | null, host: RefObject<HTMLElement | null>, callbacks: ReadingCallbacks) {
  const report = useRef(callbacks); report.current = callbacks;
  const observeLayout = !!callbacks.onReadingLayout, observeSelection = !!callbacks.onReadingSelection;
  useLayoutEffect(() => {
    if (!editor || !host.current || (!observeLayout && !observeSelection)) return;
    const element = host.current;
    let frame = 0, previous: string | undefined;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const blocks: ReadingPosition["blocks"] = [];
      editor.state.doc.forEach((node, offset) => {
        const dom = editor.view.nodeDOM(offset);
        if (!(dom instanceof HTMLElement) || !node.attrs.sourcePath) return;
        const rect = dom.getBoundingClientRect();
        const key = JSON.stringify(String(node.attrs.sourcePath).split(",").map(Number));
        blocks.push({ key, top: rect.top - origin.top, left: rect.left - origin.left, height: rect.height });
        if (node.type.name === "bulletList" || node.type.name === "orderedList") {
          const walk = (list: HTMLElement, indexes: number[]) => {
            [...list.children].filter(child => child.tagName === "LI").forEach((child, index) => {
              const item = [...indexes, index], itemRect = child.getBoundingClientRect();
              blocks.push({ key: `${key}:${item.join(".")}`, top: itemRect.top - origin.top, left: itemRect.left - origin.left, height: itemRect.height });
              for (const nested of child.children) if (nested.matches("ul,ol")) walk(nested as HTMLElement, item);
            });
          };
          walk(dom, []);
        }
      });
      report.current.onReadingLayout?.({ blocks, height: element.scrollHeight });
    };
    const selection = (force = false) => {
      const { $from, empty } = editor.state.selection;
      // A text range spans content, rather than selecting one correspondence target.
      const path = (empty || "node" in editor.state.selection) && editor.state.doc.maybeChild($from.index(0))?.attrs.sourcePath;
      const items: number[] = [];
      for (let depth = 1; depth <= $from.depth; depth++) {
        if ($from.node(depth).type.name === "listItem") items.push($from.index(depth - 1));
      }
      const key = path ? JSON.stringify(String(path).split(",").map(Number)) + (items.length ? `:${items.join(".")}` : "") : undefined;
      if (force || key !== previous) { previous = key; report.current.onReadingSelection?.(key); }
    };
    const changed = () => selection();
    // Source inspection may change without moving the engine selection. Clicking that
    // same document block again must restore its correspondence as well.
    const clicked = () => selection(true);
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    if (observeLayout) {
      observer.observe(element);
      mutations.observe(element, { childList: true, subtree: true });
      element.addEventListener("load", schedule, true);
      schedule();
    }
    if (observeSelection) {
      editor.on("selectionUpdate", changed);
      editor.view.dom.addEventListener("click", clicked);
    }
    return () => {
      observer.disconnect(); mutations.disconnect(); element.removeEventListener("load", schedule, true);
      editor.off("selectionUpdate", changed); editor.view.dom.removeEventListener("click", clicked); cancelAnimationFrame(frame);
    };
  }, [editor, host, observeLayout, observeSelection]);
}
