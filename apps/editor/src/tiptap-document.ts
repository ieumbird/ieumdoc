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

export type EquationEdit = {
  path: NodePath;
  from: string;
  to: string;
};

export type SupportedEdits = {
  order?: { path: NodePath; part: number }[];
  headings: HeadingEdit[];
  paragraphs: ParagraphEdit[];
  equations?: EquationEdit[];
  splits?: { path: NodePath; parts: InlineContent[][] }[];
  merges?: { paths: NodePath[]; parts: InlineContent[][] }[];
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
  const equations: EquationEdit[] = [];
  const splits: NonNullable<SupportedEdits["splits"]> = [];
  const merges: NonNullable<SupportedEdits["merges"]> = [];
  const nodes = next.content ?? [];
  const keys = [...new Set(nodes.map(sourcePathOf))];
  for (const key of keys) {
    const node = nodes.find(node => sourcePathOf(node) === key)!;
    const paths = key.split(";");
    const block = document.blocks.find(block => pathKey(block.path) === paths[0])!;
    const group = nodes.filter(node => sourcePathOf(node) === key);
    if (paths.length > 1) {
      merges.push({ paths: paths.map(path => path.split(",").map(Number)), parts: group.map(paragraphInline) });
    } else if (block.block === "heading" && block.editable) {
      const text = headingText(node);
      if (text === block.text) continue;
      if (text.length === 0) throw new Error("empty heading text cannot be saved");
      headings.push({ path: block.path, from: block.text, to: text });
    } else if (block.block === "paragraph" && block.editable) {
      if (group.length > 1) {
        splits.push({ path: block.path, parts: group.map(paragraphInline) });
        continue;
      }
      const content = paragraphInline(node);
      if (sameInline(content, block.content)) continue;
      if (inlineText(content).length === 0) throw new Error("empty paragraph cannot be saved");
      paragraphs.push({ path: block.path, content });
    } else if (block.block === "equation") {
      const latex = equationLatex(node);
      if (latex !== block.latex) equations.push({ path: block.path, from: block.latex, to: latex });
    }
  }
  const counts = new Map<string, number>();
  const order = nodes.map(node => {
    const key = sourcePathOf(node);
    const part = counts.get(key) ?? 0;
    counts.set(key, part + 1);
    return { path: key.split(";")[0].split(",").map(Number), part };
  });
  const reordered = order.some((item, index) => index > 0 && item.path[0] < order[index - 1].path[0]) ||
    merges.some(merge => merge.paths.some((path, index) => index > 0 && path[0] !== merge.paths[index - 1][0] + 1));
  return {
    ...(reordered ? { order } : {}),
    headings,
    paragraphs,
    ...(equations.length ? { equations } : {}),
    ...(splits.length ? { splits } : {}),
    ...(merges.length ? { merges } : {}),
  };
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
  const used = new Set<string>();
  for (const key of new Set(after.map(sourcePathOf))) {
    const paths = key.split(";");
    const originals = paths.map(path => before.find(node => sourcePathOf(node) === path));
    for (const [index, path] of paths.entries()) {
      if (!originals[index] || used.has(path)) throw new Error("block insertion or identity changed");
      used.add(path);
    }
    if (paths.length > 1 && originals.some(block => block!.type !== "paragraph")) {
      throw new Error("only editable paragraphs can merge");
    }
    const group = after.filter(node => sourcePathOf(node) === key);
    if (group.length > 1 && originals[0]!.type !== "paragraph") throw new Error("block insertion is not allowed");
    for (const node of group) assertBlockChange(originals[0], node);
  }
  if (used.size !== before.length) throw new Error("block deletion is not allowed");
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
  if (beforeType === "equation") {
    const beforeAttrs = before.attrs ?? {};
    const afterAttrs = after.attrs ?? {};
    for (const key of ["sourcePath", "label"]) {
      if (normalizeAttr(beforeAttrs[key]) !== normalizeAttr(afterAttrs[key])) {
        throw new Error(`equation identity cannot change (${key})`);
      }
    }
    if (typeof afterAttrs.latex !== "string") {
      throw new Error("equation LaTeX must be a string");
    }
    if ((after.content ?? []).length > 0) {
      throw new Error("equation content cannot change");
    }
    return;
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

function equationLatex(node: TiptapJSON): string {
  if (typeof node.attrs?.latex !== "string") throw new Error("equation LaTeX must be a string");
  return node.attrs.latex;
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
