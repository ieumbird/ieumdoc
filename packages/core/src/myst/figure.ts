import { DocumentDiagnosticError } from "../write-error.ts";
import { figureCaptionContent, type FigureContent } from "../figure.ts";
import { inlineContentToNodes, projectInlineContent, sameInlineContent, type InlineContent } from "../inline.ts";
import { bodyIndex, completeFootnotes } from "./footnote.ts";
import { parse } from "./parse.ts";
import { serialize, serializeFor } from "./serialize.ts";
import type { VFile } from "vfile";
import type { MystNode } from "./tree.ts";

export function isFigure(node: MystNode | undefined): boolean {
  return node?.type === "container" && node.kind === "figure";
}

/** What a Figure shows: nothing yet (pending), one image, one Mermaid diagram, or other
 * content (subfigures, several items). Caption and legend describe content; they are not it. */
export type FigureContentKind = "none" | "image" | "mermaid" | "other";

export function figureContentKind(node: MystNode): FigureContentKind {
  const content = (node.children ?? []).filter(child => child.type !== "caption" && child.type !== "legend");
  if (content.length === 0) return "none";
  if (content.length === 1 && (content[0].type === "image" || content[0].type === "mermaid")) return content[0].type;
  return "other";
}

/**
 * Figure authoring supports one `image` or option-free `mermaid` optionally followed by one supported inline
 * `caption` paragraph, or that caption alone for a pending Figure (imageUrl "").
 * Legends and unsupported inline content are rejected by native admission.
 */
export function supportedFigureContent(node: MystNode): FigureContent | undefined {
  if (!isFigure(node)) return undefined;
  const children = node.children ?? [];
  const pending = figureContentKind(node) === "none";
  const [image, caption, ...rest] = pending ? [undefined, ...children] : children;
  if (rest.length > 0) return undefined;
  const mermaid = image?.type === "mermaid";
  if (mermaid && (typeof image.value !== "string" || !image.value.trim() ||
      Object.entries(image).some(([key, value]) => value !== undefined && !["type", "value", "position"].includes(key)))) return undefined;
  if (image && !mermaid && (image.type !== "image" || typeof image.url !== "string")) return undefined;
  if (image?.alt !== undefined && typeof image.alt !== "string") return undefined;
  let content: InlineContent[] = [];
  if (caption !== undefined) {
    const [paragraph, ...others] = caption.type === "caption" ? caption.children ?? [] : [];
    const projected = paragraph?.type === "paragraph" ? projectInlineContent(paragraph) : undefined;
    if (others.length > 0 || !projected || projected.length === 0) {
      return undefined;
    }
    content = projected;
  }
  return { imageUrl: image?.url ?? "", imageAlt: image?.alt ?? "", caption: content,
    ...(mermaid ? { mermaidSource: image.value } : {}) };
}

/** Canonical MyST structure for a new Figure; no label is generated. */
export function createFigureNode(figure: FigureContent): MystNode {
  const node: MystNode = { type: "container", kind: "figure", children: [] };
  setFigureContent(node, figure);
  return node;
}

/** Replace the editable properties of a supported Figure in place. The container, and with
 * it the label, identifier and place, stays when content is connected or removed. */
export function setFigureContent(node: MystNode, figure: FigureContent): void {
  const children = node.children ?? [];
  const content = figureCaptionContent(figure.caption);
  const caption = content.length > 0
    ? [{ type: "caption", children: [{ type: "paragraph", children: inlineContentToNodes(content) }] }]
    : [];
  if (figure.mermaidSource !== undefined) {
    node.children = [{ type: "mermaid", value: figure.mermaidSource }, ...caption];
    return;
  }
  if (figure.imageUrl.length === 0) {
    node.children = caption;
    return;
  }
  const image: MystNode = { ...(children[0]?.type === "image" ? children[0] : {}), type: "image", url: figure.imageUrl };
  if (figure.imageAlt.length > 0) image.alt = figure.imageAlt;
  else delete image.alt;
  node.children = [image, ...caption];
}

/** Fail closed unless the top-level Figure keeps its properties and label through canonical Markdown. */
export function assertFigureRoundTrip(
  root: MystNode,
  index: number,
  figure: FigureContent,
  label: unknown,
  identifier: unknown,
): void {
  const failure = "Figure cannot be preserved through canonical round-trip";
  const document = { type: "root", children: root.children ?? [] };
  // A caption may introduce an endnote before the session supplies its definition.
  const complete = completeFootnotes(document);
  const markdown = serializeFor(complete, failure);
  const reparsed = parse(markdown);
  const node = reparsed.children[bodyIndex(document, index)];
  const content = node && supportedFigureContent(node);
  if (
    reparsed.children.length !== complete.children.length ||
    !content ||
    content.imageUrl !== figure.imageUrl ||
    content.imageAlt !== figure.imageAlt ||
    content.mermaidSource !== figure.mermaidSource ||
    !sameInlineContent(figureCaptionContent(content.caption), figureCaptionContent(figure.caption)) ||
    node.label !== label ||
    node.identifier !== identifier
  ) {
    throw new DocumentDiagnosticError("round-trip-mismatch", failure);
  }
  if (serialize(reparsed) !== markdown) {
    throw new DocumentDiagnosticError("round-trip-mismatch", "Figure is not canonical after round-trip");
  }
}

/** Keep options/diagnostics that MyST may discard when lifting a directive. */
export function retainMermaidOptions(node: MystNode, file: VFile): void {
  if (node.type === "mystDirective" && node.name === "mermaid") {
    const diagnostics = file.messages.filter(message => message.line != null && node.position &&
      message.line >= node.position.start.line && message.line <= node.position.end.line).map(message => message.reason);
    if ((Object.keys(node.options ?? {}).length || diagnostics.length) && node.children?.[0]) {
      node.children[0]["(unsupported mermaid options)"] = { options: node.options, diagnostics };
    }
  }
  node.children?.forEach(child => retainMermaidOptions(child, file));
}
