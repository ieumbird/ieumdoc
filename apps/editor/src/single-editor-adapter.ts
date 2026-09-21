import type { EditableBlock, EditableDocument, InlineContent, NodePath } from "@ieumdoc/core";
import type { JSONContent } from "@tiptap/core";

export type TiptapJSON = JSONContent;

export type TiptapDocument = TiptapJSON & { type: "doc" };

/** The editor-side semantic snapshot; it deliberately carries Core paths. */
export type SingleEditorDocument = EditableDocument;

export function toTiptapDocument(document: SingleEditorDocument): TiptapDocument {
  return {
    type: "doc",
    content: document.blocks.map((block) => toTiptapBlock(block)),
  };
}

export function fromTiptapDocument(doc: TiptapJSON): SingleEditorDocument {
  if (!isTiptapJSON(doc) || doc.type !== "doc") {
    throw new Error('Tiptap document must have type "doc"');
  }
  if (!Array.isArray(doc.content) || doc.content.length === 0) {
    throw new Error("single editor document must contain at least one block");
  }

  return {
    blocks: doc.content.map((node, index) => fromTiptapBlock(node, [index])),
  };
}

function toTiptapBlock(block: EditableBlock): TiptapJSON {
  if (block.block === "heading") {
    return {
      type: "heading",
      attrs: { level: block.level },
      content: block.text.length > 0 ? [{ type: "text", text: block.text }] : [],
    };
  }
  if (block.block === "paragraph") {
    if (!block.editable) {
      throw new Error(`single editor cannot project read-only paragraph at [${block.path.join(",")}]`);
    }
    return { type: "paragraph", content: toTiptapInline(block.content) };
  }
  if (block.block === "equation") {
    return {
      type: "equation",
      attrs: { latex: block.latex, label: block.label },
    };
  }
  throw new Error(`single editor fixture does not support ${block.block} blocks`);
}

function fromTiptapBlock(node: TiptapJSON, path: NodePath): EditableBlock {
  if (!isTiptapJSON(node) || typeof node.type !== "string") {
    throw new Error(`Tiptap block at [${path.join(",")}] is invalid`);
  }
  if (node.type === "heading") {
    const level = node.attrs?.level;
    if (!Number.isInteger(level) || level < 1 || level > 6) {
      throw new Error(`heading at [${path.join(",")}] requires a level from 1 to 6`);
    }
    return {
      block: "heading",
      path,
      level,
      text: inlineText(node.content ?? [], path),
    };
  }
  if (node.type === "paragraph") {
    return {
      block: "paragraph",
      path,
      content: fromTiptapInline(node.content ?? [], path),
      text: inlineText(node.content ?? [], path),
      editable: true,
    };
  }
  if (node.type === "equation") {
    const latex = node.attrs?.latex;
    const label = node.attrs?.label;
    if (typeof latex !== "string" || typeof label !== "string") {
      throw new Error(`equation at [${path.join(",")}] requires latex and label attributes`);
    }
    return { block: "equation", path, latex, label };
  }
  throw new Error(`unsupported Tiptap block "${node.type}" at [${path.join(",")}]`);
}

function toTiptapInline(content: InlineContent[], marks: Marks = { bold: false, italic: false }): TiptapJSON[] {
  const nodes: TiptapJSON[] = [];
  for (const item of content) {
    if (item.kind === "text") {
      if (item.text.length === 0) continue;
      const node: TiptapJSON = { type: "text", text: item.text };
      const applied: { type: string }[] = [];
      if (marks.bold) applied.push({ type: "bold" });
      if (marks.italic) applied.push({ type: "italic" });
      if (applied.length > 0) node.marks = applied;
      nodes.push(node);
    } else if (item.kind === "strong") {
      nodes.push(...toTiptapInline(item.children, { ...marks, bold: true }));
    } else if (item.kind === "emphasis") {
      nodes.push(...toTiptapInline(item.children, { ...marks, italic: true }));
    }
  }
  return nodes;
}

function fromTiptapInline(nodes: TiptapJSON[], path: NodePath): InlineContent[] {
  return nodes.map((node, index) => {
    if (!isTiptapJSON(node) || node.type !== "text") {
      throw new Error(`unsupported Tiptap inline node at [${[...path, index].join(",")}]`);
    }
    if (typeof node.text !== "string" || node.text.length === 0) {
      throw new Error(`Tiptap text at [${[...path, index].join(",")}] must be non-empty`);
    }
    const marks = new Set<string>();
    for (const mark of node.marks ?? []) {
      if (!mark || (mark.type !== "bold" && mark.type !== "italic")) {
        throw new Error(`unsupported Tiptap mark at [${[...path, index].join(",")}]`);
      }
      if (marks.has(mark.type)) {
        throw new Error(`duplicate Tiptap mark at [${[...path, index].join(",")}]`);
      }
      marks.add(mark.type);
    }
    let item: InlineContent = { kind: "text", text: node.text };
    if (marks.has("italic")) item = { kind: "emphasis", children: [item] };
    if (marks.has("bold")) item = { kind: "strong", children: [item] };
    return item;
  });
}

function inlineText(nodes: TiptapJSON[], path: NodePath): string {
  return fromTiptapInline(nodes, path)
    .map((item) => (item.kind === "text" ? item.text : inlineTextFromContent(item.children)))
    .join("");
}

function inlineTextFromContent(content: InlineContent[]): string {
  return content.map((item) => (item.kind === "text" ? item.text : inlineTextFromContent(item.children))).join("");
}

function isTiptapJSON(value: unknown): value is TiptapJSON {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Marks = { bold: boolean; italic: boolean };
