import type { Editor, EditorEvents } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { documentScrollContainer } from "./document-scroll.ts";
import { useEditorVisible } from "./editor-visibility.ts";
import { resolveFigureSource } from "./editor-schema.tsx";
import { isRelativeImageLink } from "./image-link.ts";
import { useOverlayBounds } from "./ui/use-overlay-bounds.ts";

/** Reading aid outside ProseMirror content: no transaction, selection or focus transfer. */
export function ImageLinkPreview({ editor, host, documentPath }: {
  editor: Editor; host: RefObject<HTMLElement | null>; documentPath?: string;
}) {
  const visible = useEditorVisible();
  const [anchor, setAnchor] = useState<HTMLAnchorElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const bounds = useOverlayBounds<HTMLDivElement>(!!anchor);

  useEffect(() => {
    if (!visible) return;
    const dom = editor.view.dom;
    let editing = false;
    let lastPointer: { x: number; y: number } | undefined;
    const close = () => setAnchor(null);
    const input = () => { editing = true; close(); };
    const link = (target: EventTarget | null) => {
      const candidate = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      return candidate && dom.contains(candidate) && isRelativeImageLink(candidate.getAttribute("href")!) ? candidate : null;
    };
    const move = (event: PointerEvent) => {
      // DOM replacement during typing can generate hover events under a stationary
      // pointer. Resume reading only when the user actually moves it (#744 review).
      if (!event.isTrusted || lastPointer?.x === event.clientX && lastPointer.y === event.clientY) return;
      lastPointer = { x: event.clientX, y: event.clientY };
      if (!event.buttons && !editor.view.composing) { editing = false; setAnchor(link(event.target)); }
    };
    const out = (event: PointerEvent) => {
      if (link(event.target) !== link(event.relatedTarget)) close();
    };
    const caret = () => {
      const { selection } = editor.state;
      const mark = selection.$from.marks().find(mark => mark.type.name === "link");
      if (editing || !editor.isFocused || editor.view.composing || !(selection instanceof TextSelection) ||
          !selection.empty || !mark || !isRelativeImageLink(mark.attrs.href)) { close(); return; }
      const { node } = editor.view.domAtPos(selection.from);
      setAnchor(link(node instanceof Element ? node : node.parentElement));
    };
    const selection = ({ transaction }: EditorEvents["selectionUpdate"]) => {
      if (transaction.docChanged) input();
      else caret();
    };
    // Composition can normalize selection after committing. Only a subsequent
    // reading gesture resumes caret previews; never reopen from that normalization.
    const navigate = (event: KeyboardEvent) => {
      if (!event.isComposing && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
        editing = false; caret();
      }
    };
    const pointer = (event: PointerEvent) => {
      if (event.target instanceof globalThis.Node && dom.contains(event.target)) editing = false;
      close();
    };
    // Dismissal only: no key cancellation or propagation changes inside the editor.
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("pointermove", move);
    dom.addEventListener("pointerout", out);
    dom.addEventListener("beforeinput", input);
    dom.addEventListener("compositionstart", input);
    dom.addEventListener("keyup", navigate);
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", pointer, true);
    editor.on("selectionUpdate", selection);
    editor.on("focus", caret);
    editor.on("blur", close);
    editor.on("update", input);
    return () => {
      window.removeEventListener("pointermove", move);
      dom.removeEventListener("pointerout", out);
      dom.removeEventListener("beforeinput", input);
      dom.removeEventListener("compositionstart", input);
      dom.removeEventListener("keyup", navigate);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", pointer, true);
      editor.off("selectionUpdate", selection);
      editor.off("focus", caret);
      editor.off("blur", close);
      editor.off("update", input);
      close();
    };
  }, [editor, visible, documentPath]);

  useLayoutEffect(() => {
    if (!anchor || !visible || !host.current) return;
    const viewport = documentScrollContainer(anchor);
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const area = viewport?.getBoundingClientRect();
      if (!anchor.isConnected || area && (rect.bottom <= area.top || rect.top >= area.bottom || rect.right <= area.left || rect.left >= area.right)) {
        setAnchor(null); return;
      }
      const origin = host.current!.getBoundingClientRect();
      setStyle({ left: rect.left - origin.left, top: rect.bottom - origin.top + 4 });
    };
    position();
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [anchor, host, visible]);

  if (!visible || !anchor) return null;
  const src = resolveFigureSource(anchor.getAttribute("href")!, documentPath);
  return <div ref={bounds} role="tooltip" className="image-link-preview" style={style} data-testid="image-link-preview">
    <PreviewImage key={src} src={src} label={anchor.textContent ?? ""} />
  </div>;
}

function PreviewImage({ src, label }: { src: string; label: string }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  return failed ? <span>{t("Image not found")}</span>
    : <img src={src} alt={label} onError={() => setFailed(true)} />;
}
