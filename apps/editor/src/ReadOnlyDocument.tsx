import { memo, useLayoutEffect, useRef, useState } from "react";
import { Extension } from "@tiptap/core";
import { readOnlyDocumentPlugin } from "./read-only-document.ts";
import { EditorContent, useEditor } from "@tiptap/react";
import type { ReadingSurfaceProps, BlockPosition } from "@ieumdoc/docling/compare";
import { DocumentPathContext, editorExtensions } from "./editor-schema.tsx";
import { toTiptapDocument } from "./tiptap-document.ts";
import { DocumentTitle } from "./document-title.tsx";
import { ReadingPreview } from "./ReadingPreview.tsx";

/** Editor-owned, engine-neutral inputs/positions. Modules never inspect Editor DOM or types. */
export const ReadOnlyDocument = memo(function ReadOnlyDocument({ document, path, onLayout }: ReadingSurfaceProps) {
  const host = useRef<HTMLElement>(null);
  const report = useRef(onLayout); report.current = onLayout;
  const [content] = useState(() => toTiptapDocument(document));
  const editor = useEditor({ editable: false, content, immediatelyRender: true,
    extensions: [...editorExtensions(undefined, path), Extension.create({ name: "readOnlyDocument",
      addProseMirrorPlugins: () => [readOnlyDocumentPlugin()] })],
  }, []);
  useLayoutEffect(() => {
    if (!editor || !host.current) return;
    const element = host.current;
    let frame = 0;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const blocks: BlockPosition[] = [];
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
      report.current({ blocks, height: element.scrollHeight });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule); observer.observe(element);
    // Image/KaTeX/React NodeViews can settle after the initial engine mount.
    const mutations = new MutationObserver(schedule); mutations.observe(element, { childList: true, subtree: true });
    element.addEventListener("load", schedule, true);
    schedule();
    return () => { observer.disconnect(); mutations.disconnect(); element.removeEventListener("load", schedule, true); cancelAnimationFrame(frame); };
  }, [editor]);
  if (!editor) return null;
  return <article className="document docling-readonly-document" ref={host} aria-readonly="true" data-testid="comparison-document">
    {document.title ? <DocumentTitle editor={editor} /> : null}
    <DocumentPathContext.Provider value={path}><EditorContent editor={editor} className="document-editor" /></DocumentPathContext.Provider>
    <ReadingPreview editor={editor} host={host} documentPath={path} />
  </article>;
});
