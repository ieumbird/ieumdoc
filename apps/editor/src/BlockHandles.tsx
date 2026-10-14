import { useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { blockDropTarget, reorderBlock } from "./block-reorder.ts";
import { endnoteLabel } from "./endnotes.ts";
import { Button } from "@/components/ui/button.tsx";

type BlockHandlesProps = {
  editor: Editor;
  /** Block whose menu is open; its controls stay visible. */
  menuIndex?: number;
  onInsert(index: number, top: number): void;
  onOpenMenu(index: number, top: number): void;
  /** Why the block cannot be moved now: moving recreates its view, which would drop an open draft. */
  moveBlockedHint?(index: number): string | undefined;
};

/** An endnote follows its first reference: it is not dragged, and nothing is inserted after it. */
const ENDNOTE_HINT = "Endnotes follow the order of their first reference. Click for block actions.";

export function BlockHandles({ editor, menuIndex, onInsert, onOpenMenu, moveBlockedHint }: BlockHandlesProps) {
  const gutter = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; doc: ProseMirrorNode } | null>(null);
  const [blocks, setBlocks] = useState<{ top: number; height: number; name: string; endnote: boolean }[]>([]);
  const [active, setActive] = useState(-1);
  const [hovered, setHovered] = useState(-1);
  const [dropTop, setDropTop] = useState<number | null>(null);
  const [moving, setMoving] = useState<{ top: number; height: number } | null>(null);
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
    let pointer: { x: number; y: number } | null = null;
    // The block row includes its gutter controls; selection never supplies a hover extent.
    const updateHovered = (rects = rectangles()) => {
      const point = pointer;
      const bounds = host.getBoundingClientRect();
      setHovered(point && !drag.current && point.x >= bounds.left && point.x <= bounds.right &&
        point.y >= bounds.top && point.y <= bounds.bottom ? rects.findIndex(rect =>
        point.y >= rect.top && point.y <= rect.bottom) : -1);
    };
    const leave = () => { pointer = null; setHovered(-1); };
    const scroll = () => updateHovered();
    // A dragged body block lands in the body: the endnotes after it keep their own order.
    const bodyRectangles = () => {
      let end = editor.state.doc.childCount;
      while (end > 0 && endnoteLabel(editor.state.doc.child(end - 1)) !== undefined) end--;
      return rectangles().slice(0, end);
    };
    const update = () => {
      const rects = rectangles();
      const top = host.getBoundingClientRect().top;
      setBlocks(rects.map((rect, index) => {
        const node = editor.state.doc.child(index);
        const endnote = endnoteLabel(node) !== undefined;
        return {top: rect.top - top, height: rect.height, endnote,
          name: endnote ? "endnote" : node.type.name.replace(/Block$/, "").toLowerCase()};
      }));
      updateHovered(rects);
    };
    const transaction = () => {
      update();
      setActive(editor.state.selection.$from.index(0));
    };
    const hover = (event: MouseEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      updateHovered();
      setActive(rectangles().findIndex(rect => event.clientY >= rect.top - 8 && event.clientY <= rect.bottom + 8));
    };
    const over = (event: DragEvent) => {
      if (!drag.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      // No line where the block would stay in place.
      const target = blockDropTarget(bodyRectangles(), event.clientY, drag.current.index);
      setDropTop(target ? target.line - host.getBoundingClientRect().top : null);
    };
    const end = () => { drag.current = null; setDropTop(null); setMoving(null); leave(); };
    let dropped = false;
    const drop = (event: DragEvent) => {
      const source = drag.current;
      if (!source) return;
      event.preventDefault();
      event.stopPropagation();
      end();
      if (!source.doc.eq(editor.state.doc)) return;
      const target = blockDropTarget(bodyRectangles(), event.clientY, source.index);
      if (target) editor.view.dispatch(reorderBlock(editor.state, source.index, target.to));
      dropped = true;
    };
    // Focusing the editor during the drop keeps Chromium from starting the next drag; wait for its end.
    const finish = () => {
      end();
      if (dropped) editor.view.focus();
      dropped = false;
    };
    editor.on("transaction", transaction);
    // Layout changes must not replace the hovered block with the selected one.
    const resize = new ResizeObserver(update);
    resize.observe(host);
    // A minimum-height paper can stay fixed while fonts, images or NodeViews resize the content.
    resize.observe(editor.view.dom);
    host.addEventListener("mousemove", hover);
    host.addEventListener("mouseleave", leave);
    window.addEventListener("blur", leave);
    window.addEventListener("scroll", scroll, true);
    // Capture before ProseMirror's native content drag/drop handler.
    host.addEventListener("dragover", over, true);
    host.addEventListener("drop", drop, true);
    host.addEventListener("dragend", finish);
    transaction();
    return () => {
      editor.off("transaction", transaction);
      resize.disconnect();
      host.removeEventListener("mousemove", hover);
      host.removeEventListener("mouseleave", leave);
      window.removeEventListener("blur", leave);
      window.removeEventListener("scroll", scroll, true);
      host.removeEventListener("dragover", over, true);
      host.removeEventListener("drop", drop, true);
      host.removeEventListener("dragend", finish);
    };
  }, [editor]);
  return <div className="block-gutter" ref={gutter}>
    {blocks.map((block, index) => {
      const blocked = block.endnote ? ENDNOTE_HINT : moveBlockedHint?.(index);
      return <div key={index}
        className={`block-controls${active === index || menuIndex === index ? " visible" : ""}`}
        data-menu-open={menuIndex === index}
        style={{top: block.top}}>
        {block.endnote ? <span className="block-insert-space" aria-hidden="true" /> : <Button variant="ghost" size="icon" className="block-insert" aria-label={`Insert block after ${block.name} block ${index + 1}`}
          title="Insert block below" aria-haspopup="menu"
          onMouseDown={event => event.stopPropagation()}
          onClick={() => onInsert(index, block.top)}>+</Button>}
        <Button variant="ghost" size="icon" draggable={!blocked} className="block-handle" data-endnote={block.endnote}
          aria-label={block.endnote ? `Actions for endnote block ${index + 1}` : `Move ${block.name} block ${index + 1}`}
          title={blocked ?? "Drag to move, click for block actions"}
          aria-haspopup="menu"
          onMouseDown={event => event.stopPropagation()}
          onClick={() => onOpenMenu(index, block.top)}
          onDragStart={event => {
            if (blocked) {
              event.preventDefault();
              return;
            }
            drag.current = {index, doc: editor.state.doc};
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", "Move block");
            setMoving({top: block.top, height: block.height});
          }}>⠿</Button>
      </div>;
    })}
    {!moving && blocks[hovered] && <div className="block-hover-outline" data-testid="block-hover-outline" aria-hidden="true"
      style={{top: `calc(${blocks[hovered].top}px - var(--space-block-hover-block))`,
        height: `calc(${blocks[hovered].height}px + 2 * var(--space-block-hover-block))`}} />}
    {moving && <div className="block-drag-source" data-testid="block-drag-source" style={moving} />}
    {dropTop !== null && <div className="block-drop-line" data-testid="block-drop-line" style={{top: dropTop}} />}
  </div>;
}
