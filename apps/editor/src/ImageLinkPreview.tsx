import type { Editor } from "@tiptap/core";
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
    const close = () => setAnchor(null);
    const link = (target: EventTarget | null) => {
      const candidate = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      return candidate && dom.contains(candidate) && isRelativeImageLink(candidate.getAttribute("href")!) ? candidate : null;
    };
    const over = (event: PointerEvent) => {
      if (!event.buttons && !editor.view.composing) setAnchor(link(event.target));
    };
    const out = (event: PointerEvent) => {
      if (link(event.target) !== link(event.relatedTarget)) close();
    };
    const focus = (event: FocusEvent) => { if (!editor.view.composing) setAnchor(link(event.target)); };
    const key = (event: KeyboardEvent) => {
      // Focusing an image link must not introduce native Enter navigation (#725).
      if (link(event.target) && !event.isComposing) {
        if (event.key === "Enter") event.preventDefault();
        // A focused link uses native Tab traversal, not the document's table/list keys.
        if (event.key === "Enter" || event.key === "Tab") event.stopPropagation();
      }
      close();
    };
    dom.addEventListener("pointerover", over);
    dom.addEventListener("pointerout", out);
    dom.addEventListener("focusin", focus);
    dom.addEventListener("focusout", close);
    dom.addEventListener("compositionstart", close);
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", close, true);
    editor.on("update", close);
    return () => {
      dom.removeEventListener("pointerover", over);
      dom.removeEventListener("pointerout", out);
      dom.removeEventListener("focusin", focus);
      dom.removeEventListener("focusout", close);
      dom.removeEventListener("compositionstart", close);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", close, true);
      editor.off("update", close);
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
