import { figureCaptionContent, type FigureContent } from "../figure.ts";
import { inlineContentToNodes, projectInlineContent, sameInlineContent, type InlineContent } from "../inline.ts";
import { parse } from "./parse.ts";
import { serialize, serializeFor } from "./serialize.ts";
import type { MystNode } from "./tree.ts";

export function isFigure(node: MystNode | undefined): boolean {
  return node?.type === "container" && node.kind === "figure";
}

/**
 * Figure authoring supports `image` optionally followed by one supported inline
 * `caption` paragraph. Legends and unsupported inline content are
 * read-only so an edit never flattens them.
 */
export function supportedFigureContent(node: MystNode): FigureContent | undefined {
  if (!isFigure(node)) return undefined;
  // SPIKE (persistent Figure draft): a Figure with no content child is pending: imageUrl "".
  const children = node.children ?? [];
  const pending = children.every(child => child.type === "caption");
  const [image, caption, ...rest] = pending ? [undefined, ...children] : children;
  if (!pending && (image?.type !== "image" || typeof image.url !== "string")) return undefined;
  if (rest.length > 0) return undefined;
  if (image && image.alt !== undefined && typeof image.alt !== "string") return undefined;
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

/** Replace the editable properties of a supported Figure in place. */
export function setFigureContent(node: MystNode, figure: FigureContent): void {
  const children = node.children ?? [];
  const content = figureCaptionContent(figure.caption);
  const caption = content.length > 0
    ? [{ type: "caption", children: [{ type: "paragraph", children: inlineContentToNodes(content) }] }]
    : [];
  // SPIKE (persistent Figure draft): connecting content later keeps the container, so its
  // label and identifier stay; a pending Figure has no image node.
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
