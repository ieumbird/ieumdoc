import type { NodePath } from "./document.ts";
import { figureCaptionContent } from "./figure.ts";
import { supportedFigureContent } from "./myst/figure.ts";
import { numberedTargets } from "./myst/numbering.ts";
import { blockTargets, NUMBERED_KINDS, type NumberedTargets } from "./numbering.ts";
import { tableCellContent, tableOf, tableCaptionParagraph } from "./myst/table.ts";
import { inlineContentText, projectInlineContent, type InlineContent } from "./inline.ts";
import { supportedAdmonitionContent } from "./myst/admonition.ts";
import type { ListContent } from "./list.ts";
import type { CodeBlockContent } from "./code.ts";
import { supportedCodeBlock } from "./myst/code.ts";
import { supportedListContent } from "./myst/list.ts";
import { isDivider, supportedQuoteContent } from "./myst/quote.ts";
import { FRONT_MATTER_FIELD } from "./myst/parse.ts";
import { sourceExcerpt, type MystDocument, type MystNode, toText } from "./myst/tree.ts";

export type EditableCaption = {
  path: NodePath;
  text: string;
  content: InlineContent[];
  editable: boolean;
};

export type EditableTableCell = {
  path: NodePath;
  text: string;
  /** Supported inline content; empty when the cell is empty or read-only. */
  content: InlineContent[];
  header: boolean;
  /** False when the cell holds inline content an edit could not keep. */
  editable: boolean;
  align?: "left" | "center" | "right";
};

export type EditableTableRow = {
  cells: EditableTableCell[];
};

export type EditableBlock = (
  | {
      block: "heading";
      path: NodePath;
      level: number;
      text: string;
      /** Supported inline content; empty when the heading is read-only. */
      content: InlineContent[];
      /** False when the heading holds inline content an edit could not keep. */
      editable: boolean;
    }
  | {
      block: "paragraph";
      path: NodePath;
      text: string;
      content: InlineContent[];
      editable: boolean;
    }
  | {
      block: "admonition";
      path: NodePath;
      variant: string;
      text: string;
      content: InlineContent[];
      editable: boolean;
    }
  | {
      /** Quote v1: one paragraph of supported inline content; other quotes are read-only. */
      block: "quote";
      path: NodePath;
      text: string;
      content: InlineContent[];
      editable: boolean;
    }
  | {
      /** A plain thematic break (`---`). */
      block: "divider";
      path: NodePath;
    }
  | {
      block: "figure";
      path: NodePath;
      label: string;
      imageUrl: string;
      imageAlt: string;
      caption: EditableCaption;
      /** True when Figure v1 authoring can replace image, alt text and caption without flattening content. */
      editable: boolean;
    }
  | {
      block: "table";
      path: NodePath;
      rows: EditableTableRow[];
      label?: string;
      caption?: InlineContent[];
    }
  | ({
      /** A List v1 structure; other lists are "unsupported" (read-only). */
      block: "list";
      path: NodePath;
    } & ListContent)
  | ({
      /** A Code block v1 structure; other code-like nodes are "unsupported" (read-only). */
      block: "code";
      path: NodePath;
    } & CodeBlockContent)
  | {
      block: "equation";
      path: NodePath;
      latex: string;
      label: string;
    }
  | {
      block: "unsupported";
      path: NodePath;
      text: string;
    }) & {
      /** Opening-source context for visually unsupported content; never used to write. */
      original?: { kind: string; text: string; line: number };
      /** The numbered targets the block holds, only where they differ from its kind's
       * default (see `blockTargets`). Numbers come from `targetNumbers`. */
      numbered?: NumberedTargets;
    };

export type EditableDocument = {
  blocks: EditableBlock[];
};

export function getEditableDocument(document: MystDocument): EditableDocument {
  const numbered = numberedTargets(document);
  const blocks = (document.children ?? []).map((node, index) => {
    const block = toBlock(node, [index]);
    const readonly = block.block === "unsupported" || ("editable" in block && !block.editable) ||
      (block.block === "table" && block.rows.some(row => row.cells.some(cell => !cell.editable)));
    const source = readonly ? sourceExcerpt(document, node) : undefined;
    if (source) block.original = { kind: contentKind(node), ...source };
    const defaults = blockTargets(block);
    if (NUMBERED_KINDS.some((kind) => (numbered[index][kind] ?? 0) !== (defaults[kind] ?? 0))) block.numbered = numbered[index];
    return block;
  });
  return { blocks };
}

function contentKind(node: MystNode): string {
  if (node[FRONT_MATTER_FIELD] !== undefined) return "Front matter";
  if (node.type === "image") return "Markdown image";
  const kinds = new Set<string>();
  const visit = (child: MystNode) => {
    if (!["text", "paragraph"].includes(child.type)) kinds.add(child.type);
    child.children?.forEach(visit);
  };
  node.children?.forEach(visit);
  return `${node.type}${kinds.size ? ` (${[...kinds].join(", ")})` : ""}`;
}

function toBlock(node: MystNode, path: NodePath): EditableBlock {
  if (node.type === "heading") {
    const content = headingContent(node);
    return {
      block: "heading",
      path,
      level: Number(node.depth ?? 1),
      text: toText(node),
      content: content ?? [],
      editable: content !== undefined,
    };
  }
  if (node.type === "paragraph") {
    const content = projectInlineContent(node);
    return {
      block: "paragraph",
      path,
      text: content ? inlineContentText(content) : paragraphText(node),
      content: content ?? [],
      editable: content !== undefined,
    };
  }
  if (node.type === "admonition") {
    const content = supportedAdmonitionContent(node);
    return {
      block: "admonition",
      path,
      variant: typeof node.kind === "string" && node.kind.length > 0 ? node.kind : "note",
      text: toText(node),
      content: content ?? [],
      editable: content !== undefined,
    };
  }
  if (node.type === "blockquote") {
    const content = supportedQuoteContent(node);
    return { block: "quote", path, text: toText(node), content: content ?? [], editable: content !== undefined };
  }
  if (isDivider(node)) {
    return { block: "divider", path };
  }
  if (node.type === "container" && node.kind === "figure") {
    return figureBlock(node, path);
  }
  if (node.type === "math") {
    return {
      block: "equation",
      path,
      latex: typeof node.value === "string" ? node.value : "",
      label: nodeLabel(node),
    };
  }
  if (tableOf(node) && (!tableCaptionParagraph(node) || projectInlineContent(tableCaptionParagraph(node)!) !== undefined)) {
    return tableBlock(node, path);
  }
  const list = supportedListContent(node);
  if (list) {
    return { block: "list", path, ...list };
  }
  const code = supportedCodeBlock(node);
  if (code) {
    return { block: "code", path, ...code };
  }
  return {
    block: "unsupported",
    path,
    text: toText(node),
  };
}

function figureBlock(node: MystNode, path: NodePath): EditableBlock {
  const children = node.children ?? [];
  const imageIndex = children.findIndex((child) => child.type === "image");
  const captionIndex = children.findIndex((child) => child.type === "caption");
  const image = imageIndex >= 0 ? children[imageIndex] : undefined;
  const caption = captionIndex >= 0 ? children[captionIndex] : undefined;
  const supported = supportedFigureContent(node);
  return {
    block: "figure",
    path,
    label: nodeLabel(node),
    imageUrl: typeof image?.url === "string" ? image.url : "",
    imageAlt: typeof image?.alt === "string" ? image.alt : "",
    caption: {
      path: captionIndex >= 0 ? [...path, captionIndex] : path,
      text: caption ? toText(caption) : "",
      content: supported ? figureCaptionContent(supported.caption) : [],
      editable: supported !== undefined,
    },
    editable: supported !== undefined,
  };
}

function tableBlock(node: MystNode, path: NodePath): EditableBlock {
  const rows = (tableOf(node)!.children ?? []).map((row, rowIndex) => ({
    cells: (row.children ?? []).map((cell, cellIndex) => {
      const content = tableCellContent(cell);
      return {
        path: [...path, rowIndex, cellIndex] as NodePath,
        text: toText(cell),
        content: content ?? [],
        header: rowIndex === 0,
        editable: content !== undefined,
        ...(["left", "center", "right"].includes(String(cell.align))
          ? { align: cell.align as "left" | "center" | "right" } : {}),
      };
    }),
  }));
  return {
    block: "table",
    path,
    rows,
    ...(nodeLabel(node) ? { label: nodeLabel(node) } : {}),
    ...(tableCaptionParagraph(node) ? { caption: projectInlineContent(tableCaptionParagraph(node)!)! } : {}),
  };
}

function paragraphText(node: MystNode): string {
  if (node.type === "text") {
    return typeof node.value === "string" ? node.value : "";
  }
  if (node.type === "link") {
    const inner = (node.children ?? []).map(paragraphText).join("");
    if (inner.length > 0) return inner;
    const url = typeof node.url === "string" ? node.url : "";
    return url.startsWith("#") ? url.slice(1) : url;
  }
  if (node.type === "crossReference") {
    return nodeLabel(node);
  }
  return (node.children ?? []).map(paragraphText).join("");
}

const HEADING_FIELDS = new Set(["type", "depth", "children", "position"]);

/** Editable headings hold non-empty supported inline content without line breaks. */
function headingContent(node: MystNode): InlineContent[] | undefined {
  if (!Object.entries(node).every(([key, value]) => HEADING_FIELDS.has(key) || value === undefined)) return undefined;
  const content = projectInlineContent(node);
  if (!content || inlineContentText(content).length === 0 || containsBreak(content)) return undefined;
  return content;
}

function containsBreak(content: InlineContent[]): boolean {
  return content.some((item) => item.kind === "break" || ("children" in item && containsBreak(item.children)));
}

function isTextOnly(node: MystNode): boolean {
  if (node.type === "text") {
    return true;
  }
  const children = node.children ?? [];
  if (children.length === 0) {
    return false;
  }
  return children.every(
    (child) => child.type === "text" || (child.type === "paragraph" && isTextOnly(child)),
  );
}

function nodeLabel(node: MystNode): string {
  if (typeof node.label === "string" && node.label.length > 0) return node.label;
  if (typeof node.identifier === "string" && node.identifier.length > 0) return node.identifier;
  return "";
}
