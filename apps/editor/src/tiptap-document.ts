import type { EditableBlock, EditableDocument, InlineContent, NodePath } from "@ieumdoc/core";
import { fromTiptapContent, toTiptapContent, type TiptapJSON } from "./tiptap-inline.ts";

export type { TiptapJSON };

export type HeadingEdit = {
  path: NodePath;
  from: string;
  to: string;
};

export type ParagraphEdit = {
  path: NodePath;
  content: InlineContent[];
};

export type SupportedEdits = {
  headings: HeadingEdit[];
  paragraphs: ParagraphEdit[];
};

const KNOWN_BLOCKS = new Set([
  "heading",
  "paragraph",
  "readonlyHeading",
  "readonlyParagraph",
  "admonition",
  "figure",
  "equation",
  "readonlyTable",
  "unsupportedBlock",
]);

const READONLY_BLOCKS = new Set([
  "readonlyHeading",
  "readonlyParagraph",
  "admonition",
  "figure",
  "equation",
  "readonlyTable",
  "unsupportedBlock",
]);

export function pathKey(path: NodePath): string {
  return path.join(",");
}

export function toTiptapDocument(document: EditableDocument): TiptapJSON {
  return {
    type: "doc",
    content: document.blocks.map(toTiptapBlock),
  };
}

export function collectSupportedEdits(document: EditableDocument, next: TiptapJSON): SupportedEdits {
  assertSupportedDocumentChange(toTiptapDocument(document), next);
  const headings: HeadingEdit[] = [];
  const paragraphs: ParagraphEdit[] = [];
  document.blocks.forEach((block, index) => {
    const node = next.content?.[index];
    if (!node) {
      throw new Error(`missing Tiptap block at ${index}`);
    }
    if (block.block === "heading" && block.editable) {
      const text = headingText(node);
      if (text === block.text) return;
      if (text.length === 0) {
        throw new Error("empty heading text cannot be saved");
      }
      headings.push({ path: block.path, from: block.text, to: text });
      return;
    }
    if (block.block === "paragraph" && block.editable) {
      const content = paragraphInline(node);
      if (sameInline(content, block.content)) return;
      if (inlineText(content).length === 0) {
        throw new Error("empty paragraph cannot be saved");
      }
      paragraphs.push({ path: block.path, content });
    }
  });
  return { headings, paragraphs };
}

export function isSupportedDocumentChange(baseline: TiptapJSON, next: TiptapJSON): boolean {
  try {
    assertSupportedDocumentChange(baseline, next);
    return true;
  } catch {
    return false;
  }
}

export function assertSupportedDocumentChange(baseline: TiptapJSON, next: TiptapJSON): void {
  if (baseline.type !== "doc" || next.type !== "doc") {
    throw new Error('Tiptap document must have type "doc"');
  }
  const before = baseline.content ?? [];
  const after = next.content ?? [];
  if (!Array.isArray(after)) {
    throw new Error("Tiptap document content must be an array");
  }
  if (after.length > before.length) {
    throw new Error("block insertion is not allowed");
  }
  if (after.length < before.length) {
    throw new Error("block deletion is not allowed");
  }
  const beforePaths = before.map(sourcePathOf);
  const afterPaths = after.map(sourcePathOf);
  if (beforePaths.some((item, index) => item !== afterPaths[index])) {
    const sameMembers = [...beforePaths].sort().join("\0") === [...afterPaths].sort().join("\0");
    throw new Error(sameMembers ? "top-level reorder is not allowed" : "top-level block identity changed");
  }
  before.forEach((block, index) => {
    assertBlockChange(block, after[index]);
  });
}

function toTiptapBlock(block: EditableBlock): TiptapJSON {
  if (block.block === "heading") {
    if (!block.editable) {
      return readonlyNode("readonlyHeading", block.path, {
        level: block.level,
        text: block.text,
      });
    }
    const content = block.text.length > 0 ? [{ type: "text", text: block.text }] : [];
    return {
      type: "heading",
      attrs: { level: block.level, sourcePath: pathKey(block.path) },
      content,
    };
  }
  if (block.block === "paragraph") {
    if (!block.editable) {
      return readonlyNode("readonlyParagraph", block.path, { text: block.text });
    }
    return {
      type: "paragraph",
      attrs: { sourcePath: pathKey(block.path) },
      content: paragraphContent(block.content),
    };
  }
  if (block.block === "admonition") {
    return readonlyNode("admonition", block.path, {
      variant: block.variant,
      text: block.text,
    });
  }
  if (block.block === "figure") {
    return readonlyNode("figure", block.path, {
      label: block.label,
      imageUrl: block.imageUrl,
      imageAlt: block.imageAlt,
      caption: block.caption.text,
    });
  }
  if (block.block === "equation") {
    return readonlyNode("equation", block.path, {
      latex: block.latex,
      label: block.label,
    });
  }
  if (block.block === "table") {
    return readonlyNode("readonlyTable", block.path, {
      rows: JSON.stringify(
        block.rows.map((row) => row.cells.map((cell) => ({ text: cell.text, header: cell.header }))),
      ),
    });
  }
  return readonlyNode("unsupportedBlock", block.path, { text: block.text });
}

function readonlyNode(
  type: string,
  path: NodePath,
  attrs: Record<string, string | number>,
): TiptapJSON {
  return {
    type,
    attrs: { sourcePath: pathKey(path), ...attrs },
  };
}

function paragraphContent(content: InlineContent[]): TiptapJSON[] {
  const projected = toTiptapContent(content);
  return projected.content?.[0]?.content ?? [];
}

function assertBlockChange(before: TiptapJSON | undefined, after: TiptapJSON | undefined): void {
  if (!before || !after) {
    throw new Error("missing Tiptap block");
  }
  const beforeType = before.type ?? "";
  const afterType = after.type ?? "";
  if (!KNOWN_BLOCKS.has(afterType)) {
    throw new Error(`unsupported Tiptap block "${afterType || "unknown"}"`);
  }
  if (beforeType !== afterType) {
    throw new Error(`top-level block type changed from "${beforeType}" to "${afterType}"`);
  }
  if (READONLY_BLOCKS.has(beforeType)) {
    assertReadonlyUnchanged(before, after);
    return;
  }
  if (beforeType === "heading") {
    if (Number(before.attrs?.level ?? 1) !== Number(after.attrs?.level ?? 1)) {
      throw new Error("heading level cannot change");
    }
    headingText(after);
    return;
  }
  if (beforeType === "paragraph") {
    paragraphInline(after);
    return;
  }
  throw new Error(`unsupported Tiptap block "${beforeType || "unknown"}"`);
}

function assertReadonlyUnchanged(before: TiptapJSON, after: TiptapJSON): void {
  const beforeAttrs = before.attrs ?? {};
  for (const [key, value] of Object.entries(beforeAttrs)) {
    if (normalizeAttr(value) !== normalizeAttr(after.attrs?.[key])) {
      throw new Error(`read-only block changed (${before.type ?? "block"} ${key})`);
    }
  }
  if ((after.content ?? []).length > 0) {
    throw new Error(`read-only block changed (${before.type ?? "block"} content)`);
  }
}

function headingText(node: TiptapJSON): string {
  if (node.content === undefined) return "";
  if (!Array.isArray(node.content)) {
    throw new Error("heading content must be an array");
  }
  let text = "";
  for (const [index, child] of node.content.entries()) {
    if (!child || child.type !== "text") {
      throw new Error(`unsupported Tiptap node ${describeType(child)} in heading`);
    }
    if (child.marks !== undefined && (!Array.isArray(child.marks) || child.marks.length > 0)) {
      throw new Error("heading text cannot contain marks");
    }
    if (typeof child.text !== "string") {
      throw new Error(`heading text node at ${index} must contain text`);
    }
    text += child.text;
  }
  return text;
}

function paragraphInline(node: TiptapJSON): InlineContent[] {
  return fromTiptapContent({
    type: "doc",
    content: [{ type: "paragraph", content: node.content }],
  });
}

function sourcePathOf(node: TiptapJSON | undefined): string {
  return String(node?.attrs?.sourcePath ?? "");
}

function sameInline(left: InlineContent[], right: InlineContent[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function inlineText(content: InlineContent[]): string {
  return content.map((item) => (item.kind === "text" ? item.text : item.kind === "break" ? "\n" : inlineText(item.children))).join("");
}

function normalizeAttr(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function describeType(value: TiptapJSON | undefined): string {
  if (value && typeof value.type === "string" && value.type.length > 0) {
    return `"${value.type}"`;
  }
  return "unknown node";
}
