import { figureCaptionContent, figurePersistenceError, type FigureContent } from "../figure.ts";
import { inlineContentToNodes, projectInlineContent, sameInlineContent, type InlineContent } from "../inline.ts";
import { parse } from "./parse.ts";
import { serialize, serializeFor } from "./serialize.ts";
import type { MystNode } from "./tree.ts";

export function isFigure(node: MystNode | undefined): boolean {
  return node?.type === "container" && node.kind === "figure";
}

/** What a Figure shows: nothing yet (pending), one image, or other content (a Mermaid
 * diagram, subfigures, several items). Caption and legend describe content; they are not it. */
export type FigureContentKind = "none" | "image" | "other";

export function figureContentKind(node: MystNode): FigureContentKind {
  const content = (node.children ?? []).filter(child => child.type !== "caption" && child.type !== "legend");
  return content.length === 0 ? "none" : content.length === 1 && content[0].type === "image" ? "image" : "other";
}

/**
 * Figure authoring supports `image` optionally followed by one supported inline
 * `caption` paragraph, or that caption alone for a pending Figure (imageUrl "").
 * Legends and unsupported inline content are read-only so an edit never flattens them.
 */
export function supportedFigureContent(node: MystNode): FigureContent | undefined {
  if (!isFigure(node)) return undefined;
  const children = node.children ?? [];
  const pending = figureContentKind(node) === "none";
  const [image, caption, ...rest] = pending ? [undefined, ...children] : children;
  if (rest.length > 0) return undefined;
  if (image && (image.type !== "image" || typeof image.url !== "string")) return undefined;
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
  return { imageUrl: image?.url ?? "", imageAlt: image?.alt ?? "", caption: content };
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
  if (figure.imageUrl.length === 0) {
    node.children = caption;
    return;
  }
  const image: MystNode = { ...(children[0]?.type === "image" ? children[0] : {}), type: "image", url: figure.imageUrl };
  if (figure.imageAlt.length > 0) image.alt = figure.imageAlt;
  else delete image.alt;
  node.children = [image, ...caption];
}

/** The persistence rule for every Figure in a document's final state (see figurePersistenceError). */
export function figureWriteError(document: MystNode): string | undefined {
  let error: string | undefined;
  const visit = (node: MystNode, block: number) => {
    if (error) return;
    if (isFigure(node) && !node.subcontainer && figureContentKind(node) === "none" &&
        !(node.children ?? []).some(child => child.type === "caption") && !node.label) {
      error = `Block ${block + 1}: ${figurePersistenceError({ imageUrl: "", imageAlt: "", caption: [] }, "")}`;
    }
    node.children?.forEach(child => visit(child, block));
  };
  (document.children ?? []).forEach((child, index) => visit(child, index));
  return error;
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
  const markdown = serializeFor({ type: "root", children: root.children ?? [] }, failure);
  const reparsed = parse(markdown);
  const node = reparsed.children[index];
  const content = node && supportedFigureContent(node);
  if (
    reparsed.children.length !== (root.children ?? []).length ||
    !content ||
    content.imageUrl !== figure.imageUrl ||
    content.imageAlt !== figure.imageAlt ||
    !sameInlineContent(figureCaptionContent(content.caption), figureCaptionContent(figure.caption)) ||
    node.label !== label ||
    node.identifier !== identifier
  ) {
    throw new Error(failure);
  }
  if (serialize(reparsed) !== markdown) {
    throw new Error("Figure is not canonical after round-trip");
  }
}
