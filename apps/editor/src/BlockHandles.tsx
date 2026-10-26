import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import { memo, useCallback, useLayoutEffect, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import type { Editor, EditorEvents } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { blockDropTarget, reorderBlock } from "./block-reorder.ts";
import { endnoteLabel } from "./endnotes.ts";
import { editorTitleIndex, TITLE_FIXED } from "./document-title.ts";
import { Button } from "@/components/ui/button.tsx";
import { GripVertical, Plus } from "lucide-react";

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

type HandleControlsProps = {
  index: number;
  name: string;
  endnote: boolean;
  blocked?: string;
  onInsert(index: number): void;
  onOpenMenu(index: number): void;
  onDragStart(event: ReactDragEvent, index: number): void;
};

const HandleControls = memo(function HandleControls({ index, name, endnote, blocked,
  onInsert, onOpenMenu, onDragStart }: HandleControlsProps) {
  useTranslation();
  const kind = i18n.t(name, { defaultValue: name });
  return <>
    {endnote ? <span className="block-insert-space" aria-hidden="true" /> : <Button variant="ghost" size="icon" className="block-insert"
      aria-label={i18n.t("Insert block after {{kind}} block {{number}}", { kind, number: index + 1 })}
      title={i18n.t("Insert block below")} aria-haspopup="menu"
      onMouseDown={event => event.stopPropagation()} onClick={() => onInsert(index)}><Plus aria-hidden="true" /></Button>}
    <Button variant="ghost" size="icon" draggable={!blocked} className="block-handle" data-endnote={endnote}
      aria-label={endnote ? i18n.t("Actions for endnote block {{number}}", { number: index + 1 }) : i18n.t("Move {{kind}} block {{number}}", { kind, number: index + 1 })}
      title={blocked ?? i18n.t("Drag to move, click for block actions")} aria-haspopup="menu"
      onMouseDown={event => event.stopPropagation()} onClick={() => onOpenMenu(index)}
      onDragStart={event => {
        if (blocked) { event.preventDefault(); return; }
        onDragStart(event, index);
      }}><GripVertical aria-hidden="true" /></Button>
  </>;
});

export const BlockHandles = memo(function BlockHandles({ editor, menuIndex, onInsert, onOpenMenu, moveBlockedHint }: BlockHandlesProps) {
  useTranslation();
  const gutter = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; doc: ProseMirrorNode } | null>(null);
  const [blocks, setBlocks] = useState<{ top: number; height: number; name: string; endnote: boolean; title: boolean; sourcePath: string }[]>([]);
  // Event handlers read the latest measured geometry, not the controls' last render.
  const geometry = useRef(blocks);
  geometry.current = blocks;
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
    let typing = false;
    let handlingKey = false;
    let scrollFrame: number | null = null;
    // The block row includes its gutter controls; selection never supplies a hover extent.
    const updateHovered = (rects?: DOMRect[]) => {
      const point = pointer;
      if (!point || typing || drag.current) {
        setHovered(-1);
        return;
      }
      const bounds = host.getBoundingClientRect();
      if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) {
        setHovered(-1);
        return;
      }
      setHovered((rects ?? rectangles()).findIndex(rect => point.y >= rect.top && point.y <= rect.bottom));
    };
    const leave = () => { pointer = null; setHovered(-1); };
    // Keep gutter controls independent; only real pointer movement restores the neutral outline.
    const input = () => { typing = true; setHovered(-1); };
    // Bracket ProseMirror's keydown listener on this same element, including stopped bubbling.
    const keydown = () => { handlingKey = true; };
    const keydownEnd = () => { handlingKey = false; };
    const scroll = () => {
      if (!pointer || drag.current || scrollFrame !== null) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        updateHovered();
      });
    };
    // A dragged body block lands in the body: the endnotes after it keep their own order.
    const bodyRectangles = () => {
      let end = editor.state.doc.childCount;
      while (end > 0 && endnoteLabel(editor.state.doc.child(end - 1)) !== undefined) end--;
      return rectangles().slice(0, end);
    };
    // The title stays first (#255): nothing lands at or above it.
    const dropTarget = (y: number, from: number) => {
      const target = blockDropTarget(bodyRectangles(), y, from);
      const title = editorTitleIndex(editor.state.doc);
      return target && title !== undefined && target.to <= title ? null : target;
    };
    const update = () => {
      const rects = rectangles();
      const top = host.getBoundingClientRect().top;
      const titleIndex = editorTitleIndex(editor.state.doc);
      const next = rects.map((rect, index) => {
        const node = editor.state.doc.child(index);
        const endnote = endnoteLabel(node) !== undefined;
        return {top: rect.top - top, height: rect.height, endnote, title: index === titleIndex,
          sourcePath: String(node.attrs.sourcePath ?? ""),
          name: endnote ? "endnote" : node.type.name.replace(/Block$/, "").toLowerCase()};
      });
      setBlocks(previous => previous.length === next.length && previous.every((block, index) => {
        const current = next[index];
        return block.top === current.top && block.height === current.height && block.name === current.name &&
          block.endnote === current.endnote && block.title === current.title && block.sourcePath === current.sourcePath;
      }) ? previous : next);
      updateHovered(rects);
    };
    const transaction = (event?: EditorEvents["transaction"]) => {
      if (handlingKey && event?.transaction.docChanged) input();
      update();
      setActive(editor.state.selection.$from.index(0));
    };
    const hover = (event: MouseEvent) => {
      if (!event.isTrusted || (pointer?.x === event.clientX && pointer.y === event.clientY)) return;
      pointer = { x: event.clientX, y: event.clientY };
      typing = false;
      const rects = rectangles();
      updateHovered(rects);
      setActive(rects.findIndex(rect => event.clientY >= rect.top - 8 && event.clientY <= rect.bottom + 8));
    };
    const over = (event: DragEvent) => {
      if (!drag.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      // No line where the block would stay in place, or above the title.
      const target = dropTarget(event.clientY, drag.current.index);
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
      const target = dropTarget(event.clientY, source.index);
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
    editor.view.dom.addEventListener("beforeinput", input, true);
    editor.view.dom.addEventListener("keydown", keydown, true);
    editor.view.dom.addEventListener("keydown", keydownEnd);
    editor.view.dom.addEventListener("compositionstart", input, true);
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
      editor.view.dom.removeEventListener("beforeinput", input, true);
      editor.view.dom.removeEventListener("keydown", keydown, true);
      editor.view.dom.removeEventListener("keydown", keydownEnd);
      editor.view.dom.removeEventListener("compositionstart", input, true);
      host.removeEventListener("mouseleave", leave);
      window.removeEventListener("blur", leave);
      window.removeEventListener("scroll", scroll, true);
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      host.removeEventListener("dragover", over, true);
      host.removeEventListener("drop", drop, true);
      host.removeEventListener("dragend", finish);
    };
  }, [editor]);
  const insert = useCallback((index: number) => {
    const block = geometry.current[index];
    if (block) onInsert(index, block.top);
  }, [onInsert]);
  const openMenu = useCallback((index: number) => {
    const block = geometry.current[index];
    if (block) onOpenMenu(index, block.top);
  }, [onOpenMenu]);
  const startDrag = useCallback((event: ReactDragEvent, index: number) => {
    const block = geometry.current[index];
    if (!block) { event.preventDefault(); return; }
    drag.current = {index, doc: editor.state.doc};
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", i18n.t("Move block"));
    setMoving({top: block.top, height: block.height});
  }, [editor]);
  return <div className="block-gutter" ref={gutter}>
    {blocks.map((block, index) => {
      const blocked = block.endnote ? i18n.t(ENDNOTE_HINT)
        : block.title ? `${i18n.t(TITLE_FIXED)} ${i18n.t("Block actions")}` : moveBlockedHint?.(index);
      return <div key={index} className={`block-controls${active === index || menuIndex === index ? " visible" : ""}`}
        data-menu-open={menuIndex === index} style={{top: block.top}}>
        <HandleControls index={index} name={block.name} endnote={block.endnote}
          blocked={blocked} onInsert={insert} onOpenMenu={openMenu} onDragStart={startDrag} />
      </div>;
    })}
    {!moving && blocks[hovered] && <div className="block-hover-outline" data-testid="block-hover-outline" aria-hidden="true"
      style={{top: `calc(${blocks[hovered].top}px - var(--space-block-hover-block))`,
        height: `calc(${blocks[hovered].height}px + 2 * var(--space-block-hover-block))`}} />}
    {moving && <div className="block-drag-source" data-testid="block-drag-source" style={moving} />}
    {dropTop !== null && <div className="block-drop-line" data-testid="block-drop-line" style={{top: dropTop}} />}
  </div>;
});
