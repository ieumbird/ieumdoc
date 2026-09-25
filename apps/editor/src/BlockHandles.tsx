import { useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { reorderBlock } from "./block-reorder.ts";
import { IconButton } from "./ui/primitives.tsx";

type BlockHandlesProps = {
  editor: Editor;
  /** Block whose menu is open; its controls stay visible. */
  menuIndex?: number;
  onInsert(index: number, top: number): void;
  onOpenMenu(index: number, top: number): void;
};

export function BlockHandles({ editor, menuIndex, onInsert, onOpenMenu }: BlockHandlesProps) {
  const gutter = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; doc: ProseMirrorNode } | null>(null);
  const [blocks, setBlocks] = useState<{ top: number; name: string }[]>([]);
  const [active, setActive] = useState(-1);
  const [dropTop, setDropTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const host = gutter.current!.parentElement!;
    const rectangles = () => {
      const result: DOMRect[] = [];
      editor.state.doc.forEach((_node, pos) => {
        const element = editor.view.nodeDOM(pos);
        if (element instanceof HTMLElement) result.push(element.getBoundingClientRect());
      });
      return result;
    };
    const update = () => {
      const rects = rectangles();
      const top = host.getBoundingClientRect().top;
      setBlocks(rects.map((rect, index) => ({top: rect.top - top, name: editor.state.doc.child(index).type.name.replace(/^readonly/, "").replace(/Block$/, "").toLowerCase()})));
      setActive(editor.state.selection.$from.index(0));
    };
    const hover = (event: MouseEvent) => {
      setActive(rectangles().findIndex(rect => event.clientY >= rect.top - 8 && event.clientY <= rect.bottom + 8));
    };
    const boundary = (y: number) => {
      const rects = rectangles();
      const index = rects.findIndex(rect => y < (rect.top + rect.bottom) / 2);
      return {index: index < 0 ? rects.length : index, rects};
    };
    const over = (event: DragEvent) => {
      if (!drag.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      const {index, rects} = boundary(event.clientY);
      setDropTop((rects[index]?.top ?? rects.at(-1)!.bottom) - host.getBoundingClientRect().top);
    };
    const drop = (event: DragEvent) => {
      const source = drag.current;
      if (!source) return;
      event.preventDefault();
      event.stopPropagation();
      drag.current = null;
      setDropTop(null);
      if (!source.doc.eq(editor.state.doc)) return;
      const {index} = boundary(event.clientY);
      const to = index > source.index ? index - 1 : index;
      if (to !== source.index) {
        editor.view.dispatch(reorderBlock(editor.state, source.index, to));
      }
      editor.view.focus();
    };
    const end = () => { drag.current = null; setDropTop(null); };
    editor.on("transaction", update);
    const resize = new ResizeObserver(update);
    resize.observe(host);
    host.addEventListener("mousemove", hover);
    // Capture before ProseMirror's native content drag/drop handler.
    host.addEventListener("dragover", over, true);
    host.addEventListener("drop", drop, true);
    host.addEventListener("dragend", end);
    update();
    return () => {
      editor.off("transaction", update);
      resize.disconnect();
      host.removeEventListener("mousemove", hover);
      host.removeEventListener("dragover", over, true);
      host.removeEventListener("drop", drop, true);
      host.removeEventListener("dragend", end);
    };
  }, [editor]);
  return <div className="block-gutter" ref={gutter}>
    {blocks.map((block, index) => <div key={index}
      className={`block-controls${active === index || menuIndex === index ? " visible" : ""}`}
      data-menu-open={menuIndex === index}
      style={{top: block.top}}>
      <IconButton className="block-insert" label={`Insert block after ${block.name} block ${index + 1}`}
        title="Insert block below" aria-haspopup="menu"
        onMouseDown={event => event.stopPropagation()}
        onClick={() => onInsert(index, block.top)}>+</IconButton>
      <IconButton draggable className="block-handle"
        label={`Move ${block.name} block ${index + 1}`} title="Drag to move, click for block actions"
        aria-haspopup="menu"
        onMouseDown={event => event.stopPropagation()}
        onClick={() => onOpenMenu(index, block.top)}
        onDragStart={event => {
          drag.current = {index, doc: editor.state.doc};
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", "Move block");
        }}>⠿</IconButton>
    </div>)}
    {dropTop !== null && <div className="block-drop-line" style={{top: dropTop}} />}
  </div>;
}
