import type { InlineContent } from "@ieumdoc/core";

export type TiptapJSON = {
  type?: string;
  text?: string;
  marks?: { type: string }[];
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
  const content: InlineContent[] = [];
  for (const block of doc.content ?? []) {
    if (block.type !== "paragraph") continue;
    for (const node of block.content ?? []) {
      const item = fromTiptapText(node);
      if (item) content.push(item);
    }
  }
  return content;
}

function toTiptapInline(content: InlineContent[], marks: Marks): TiptapJSON[] {
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

function fromTiptapText(node: TiptapJSON): InlineContent | undefined {
  if (node.type !== "text") return undefined;
  const text = node.text ?? "";
  if (text.length === 0) return undefined;
  const marks = new Set((node.marks ?? []).map((mark) => mark.type));
  let item: InlineContent = { kind: "text", text };
  if (marks.has("italic")) {
    item = { kind: "emphasis", children: [item] };
  }
  if (marks.has("bold")) {
    item = { kind: "strong", children: [item] };
  }
  return item;
}
