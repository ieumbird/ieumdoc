import type { Editor } from "@tiptap/core";
import { DOMSerializer, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { ReferenceRole } from "@ieumdoc/core";
import { citationText } from "@ieumdoc/core/citation";
import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { BibliographyReferenceText } from "./BibliographyReferenceText.tsx";
import { citationNumbers, citationStatus, useBibliography } from "./citation.tsx";
import { referenceDisplay, referenceTargets } from "./cross-reference.tsx";
import { renderEquation } from "./equation-render.ts";

/** The same current document/resource snapshot as the chips and trailing References. */
export function ReferencePreviewContent({ editor, anchor }: { editor: Editor; anchor: HTMLElement }) {
  const { t } = useTranslation();
  const bibliography = useBibliography();
  if (anchor.matches("[data-citation]")) {
    const keys = JSON.parse(anchor.dataset.keys ?? "[]") as string[];
    return <>{keys.map((key, index) => {
      const reference = bibliography?.references.find(reference => reference.key === key);
      return <div className="reference-preview-entry" key={index}>
        {reference ? <><span className="bibliography-number">[{reference.number}]</span><BibliographyReferenceText reference={reference} /></>
          : citationStatus([key], citationText([key], citationNumbers(editor.state.doc)), bibliography)}
      </div>;
    })}</>;
  }
  const label = anchor.dataset.label ?? "";
  let definition: ProseMirrorNode | undefined;
  editor.state.doc.forEach(node => {
    if (node.type.name === "footnoteDefinition" && node.attrs.label === label) definition = node;
  });
  return definition ? <EndnotePreviewBody editor={editor} definition={definition} />
    : <>{t("Unresolved: no definition of footnote [^{{label}}] in this document", { label })}</>;
}

/** Reuse schema mark serialization and existing display calculations, without NodeViews,
 * editor instances, event handlers, form controls or document writes. */
function EndnotePreviewBody({ editor, definition }: { editor: Editor; definition: ProseMirrorNode }) {
  const body = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const schema = DOMSerializer.fromSchema(editor.schema);
    const targets = referenceTargets(editor.state.doc);
    const serializer = new DOMSerializer({ ...schema.nodes,
      inlineMath: node => {
        const value = String(node.attrs.value);
        const rendered = renderEquation(value, false);
        const span = document.createElement("span");
        span.className = "inline-math-rendered";
        if (rendered.html) span.innerHTML = rendered.html;
        else span.textContent = `$${value}$`;
        return span;
      },
      crossReference: node => ["span", { class: "cross-reference-chip" },
        referenceDisplay(targets, node.attrs.role as ReferenceRole, String(node.attrs.label)).text],
      citation: node => ["span", { class: "cross-reference-chip" }, citationText(node.attrs.keys, citationNumbers(editor.state.doc))],
    }, { ...schema.marks,
      // Display link text with its formatting, without creating a focusable destination
      // in this pointer-transparent reading overlay.
      link: () => ["span", { class: "reference-preview-link" }, 0],
    });
    body.current?.replaceChildren(serializer.serializeFragment(definition.content));
  }, [editor, definition]);
  return <p className="reference-preview-body" ref={body} />;
}
