import type { InlineContent } from "@ieumdoc/core";

export type TiptapJSON = {
  type?: string;
  text?: string;
  marks?: { type: string }[];
  attrs?: Record<string, string | number>;
  content?: TiptapJSON[];
};

type Marks = {
  bold: boolean;
  italic: boolean;
};

export function toTiptapContent(content: InlineContent[]): TiptapJSON {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: toTiptapInline(content, { bold: false, italic: false }),
      },
    ],
  };
}

export function fromTiptapContent(doc: TiptapJSON): InlineContent[] {
  if (!isTiptapJSON(doc) || doc.type !== "doc") {
    throw new Error('Tiptap document must have type "doc"');
  }

  if (!Array.isArray(doc.content) || doc.content.length !== 1) {
    throw new Error("Tiptap document must contain exactly one paragraph");
  }

  const paragraph = doc.content[0];
  if (!isTiptapJSON(paragraph) || paragraph.type !== "paragraph") {
    throw new Error(`unsupported Tiptap block ${describeType(paragraph)}; expected paragraph`);
  }

  if (paragraph.content === undefined) {
    return [];
  }
  if (!Array.isArray(paragraph.content)) {
    throw new Error("Tiptap paragraph content must be an array");
  }

  return paragraph.content.map((node, index) => fromTiptapText(node, index));
}

function toTiptapInline(content: InlineContent[], marks: Marks): TiptapJSON[] {
  const nodes: TiptapJSON[] = [];
  for (const item of content) {
    if (item.kind === "break") throw new Error("hard break paragraphs are read-only in the Editor");
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

function fromTiptapText(node: TiptapJSON, index: number): InlineContent {
  if (!isTiptapJSON(node) || node.type !== "text") {
    throw new Error(`unsupported Tiptap node ${describeType(node)} at paragraph child ${index}`);
  }

  if (typeof node.text !== "string" || node.text.length === 0) {
    throw new Error(`Tiptap text node at paragraph child ${index} must contain non-empty text`);
  }

  if (node.marks !== undefined && !Array.isArray(node.marks)) {
    throw new Error(`Tiptap marks at paragraph child ${index} must be an array`);
  }

  const marks = new Set<string>();
  for (const mark of node.marks ?? []) {
    if (!isTiptapJSON(mark) || typeof mark.type !== "string") {
      throw new Error(`unsupported Tiptap mark at paragraph child ${index}`);
    }
    if (mark.type !== "bold" && mark.type !== "italic") {
      throw new Error(`unsupported Tiptap mark "${mark.type}" at paragraph child ${index}`);
    }
    if (marks.has(mark.type)) {
      throw new Error(`duplicate Tiptap mark "${mark.type}" at paragraph child ${index}`);
    }
    marks.add(mark.type);
  }

  const text = node.text;
  let item: InlineContent = { kind: "text", text };
  if (marks.has("italic")) {
    item = { kind: "emphasis", children: [item] };
  }
  if (marks.has("bold")) {
    item = { kind: "strong", children: [item] };
  }
  return item;
}

function isTiptapJSON(value: unknown): value is TiptapJSON {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeType(value: unknown): string {
  if (isTiptapJSON(value) && typeof value.type === "string") {
    return `"${value.type}"`;
  }
  return "unknown node";
}
