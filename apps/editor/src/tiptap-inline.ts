import type { InlineContent } from "@ieumdoc/core";

export type TiptapMark = {
  type: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
};

export type TiptapJSON = {
  type?: string;
  text?: string;
  marks?: TiptapMark[];
  attrs?: Record<string, string | number | boolean | string[]>;
  content?: TiptapJSON[];
};

type LinkTarget = { url: string; title?: string };

type Marks = {
  bold: boolean;
  italic: boolean;
  link?: LinkTarget;
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

  return group(paragraph.content.map((node, index) => fromTiptapInline(node, index)));
}

function toTiptapInline(content: InlineContent[], marks: Marks): TiptapJSON[] {
  const nodes: TiptapJSON[] = [];
  for (const item of content) {
    if (item.kind === "text" || item.kind === "break" || item.kind === "math") {
      if (item.kind === "text" && item.text.length === 0) continue;
      const node: TiptapJSON = item.kind === "break" ? { type: "hardBreak" }
        : item.kind === "math" ? { type: "inlineMath", attrs: { value: item.value } }
        : { type: "text", text: item.text };
      const applied: TiptapMark[] = [];
      if (marks.bold) applied.push({ type: "bold" });
      if (marks.italic) applied.push({ type: "italic" });
      if (marks.link) applied.push({ type: "link", attrs: { href: marks.link.url, title: marks.link.title ?? null } });
      if (applied.length > 0) node.marks = applied;
      nodes.push(node);
    } else if (item.kind === "strong") {
      nodes.push(...toTiptapInline(item.children, { ...marks, bold: true }));
    } else if (item.kind === "emphasis") {
      nodes.push(...toTiptapInline(item.children, { ...marks, italic: true }));
    } else if (item.kind === "link") {
      nodes.push(...toTiptapInline(item.children, { ...marks, link: { url: item.url, title: item.title } }));
    }
  }
  return nodes;
}

type Mark = { key: string; wrap: (children: InlineContent[]) => InlineContent };
type Leaf = { item: InlineContent; marks: Mark[] };

// Tie-break order when marks cover the same run.
const BOLD: Mark = { key: "bold", wrap: (children) => ({ kind: "strong", children }) };
const ITALIC: Mark = { key: "italic", wrap: (children) => ({ kind: "emphasis", children }) };

function fromTiptapInline(node: TiptapJSON, index: number): Leaf {
  if (!isTiptapJSON(node) || (node.type !== "text" && node.type !== "hardBreak" && node.type !== "inlineMath")) {
    throw new Error(`unsupported Tiptap node ${describeType(node)} at paragraph child ${index}`);
  }
  if (node.type === "inlineMath" && (typeof node.attrs?.value !== "string" || node.attrs.value.length === 0 ||
      node.content !== undefined)) {
    throw new Error(`inline math at paragraph child ${index} requires LaTeX source`);
  }

  if (node.type === "text" && (typeof node.text !== "string" || node.text.length === 0)) {
    throw new Error(`Tiptap text node at paragraph child ${index} must contain non-empty text`);
  }

  if (node.marks !== undefined && !Array.isArray(node.marks)) {
    throw new Error(`Tiptap marks at paragraph child ${index} must be an array`);
  }

  const marks: Mark[] = [];
  const seen = new Set<string>();
  for (const mark of node.marks ?? []) {
    if (!isTiptapJSON(mark) || typeof mark.type !== "string") {
      throw new Error(`unsupported Tiptap mark at paragraph child ${index}`);
    }
    if (mark.type !== "bold" && mark.type !== "italic" && mark.type !== "link") {
      throw new Error(`unsupported Tiptap mark "${mark.type}" at paragraph child ${index}`);
    }
    if (seen.has(mark.type)) {
      throw new Error(`duplicate Tiptap mark "${mark.type}" at paragraph child ${index}`);
    }
    seen.add(mark.type);
    marks.push(mark.type === "bold" ? BOLD : mark.type === "italic" ? ITALIC : linkMark(mark, index));
  }

  if (node.type === "hardBreak" && (node.text !== undefined || node.content !== undefined)) {
    throw new Error("hardBreak cannot contain text or children");
  }
  const item: InlineContent = node.type === "hardBreak" ? { kind: "break" }
    : node.type === "inlineMath" ? { kind: "math", value: String(node.attrs!.value) }
    : { kind: "text", text: node.text! };
  const order = [BOLD.key, ITALIC.key];
  return { item, marks: marks.sort((a, b) => rank(a, order) - rank(b, order)) };
}

/** Only the target is document semantics; target/rel/class are Tiptap presentation. */
function linkMark(mark: TiptapMark, index: number): Mark {
  const href = mark.attrs?.href;
  const title = mark.attrs?.title;
  if (typeof href !== "string" || href.length === 0) {
    throw new Error(`link at paragraph child ${index} requires a URL`);
  }
  if (title !== undefined && title !== null && typeof title !== "string") {
    throw new Error(`link title at paragraph child ${index} must be a string`);
  }
  const target: LinkTarget = typeof title === "string" ? { url: href, title } : { url: href };
  return {
    key: `link ${JSON.stringify([target.url, target.title ?? null])}`,
    wrap: (children) => ({ kind: "link", ...target, children }),
  };
}

function rank(mark: Mark, order: string[]): number {
  const index = order.indexOf(mark.key);
  return index < 0 ? order.length : index;
}

/**
 * Rebuild nested InlineContent from flat Tiptap marks: the mark covering the longest
 * run is outermost, so `**a [b](u) c**` and `[**a** b](u)` keep one strong / one link.
 * A contiguous run of the same link target is one link, as it is in the editor.
 */
function group(leaves: Leaf[]): InlineContent[] {
  const result: InlineContent[] = [];
  let index = 0;
  while (index < leaves.length) {
    const leaf = leaves[index];
    if (leaf.marks.length === 0) {
      result.push(leaf.item);
      index++;
      continue;
    }
    let best = leaf.marks[0];
    let end = index;
    for (const mark of leaf.marks) {
      let next = index;
      while (next < leaves.length && leaves[next].marks.some((other) => other.key === mark.key)) next++;
      // Never cut a link: a bold/italic run ends before a link that continues past it.
      if (!mark.key.startsWith("link ")) {
        while (next > index && next < leaves.length && sharedLink(leaves[next - 1], leaves[next])) next--;
      }
      if (next > end) {
        best = mark;
        end = next;
      }
    }
    const inner = leaves.slice(index, end).map((item) => ({ ...item, marks: item.marks.filter((mark) => mark.key !== best.key) }));
    result.push(best.wrap(group(inner)));
    index = end;
  }
  return result;
}

function sharedLink(left: Leaf, right: Leaf): boolean {
  return left.marks.some((mark) => mark.key.startsWith("link ") && right.marks.some((other) => other.key === mark.key));
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
