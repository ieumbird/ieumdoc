import type { MystNode } from "./myst/tree.ts";

export type InlineContent =
  | { kind: "break" }
  | {
      kind: "text";
      text: string;
    }
  | {
      /** Inline math: its LaTeX source. Display equations are blocks, not inline content. */
      kind: "math";
      value: string;
    }
  | {
      kind: "strong";
      children: InlineContent[];
    }
  | {
      kind: "emphasis";
      children: InlineContent[];
    }
  | {
      /** An ordinary Markdown link. Semantic cross-references are not links. */
      kind: "link";
      url: string;
      title?: string;
      children: InlineContent[];
    };

/** The mark an item applies to its content, for comparing rendered semantics:
 * strong/emphasis nesting is irrelevant, a link's target is part of the mark. */
export function inlineMarkKey(item: InlineContent): string | undefined {
  if (item.kind === "strong" || item.kind === "emphasis") return item.kind;
  if (item.kind === "link") return `link ${JSON.stringify([item.url, item.title ?? null])}`;
  return undefined;
}

const LINK_FIELDS = new Set(["type", "url", "title", "children", "position"]);

export function projectInlineContent(node: MystNode): InlineContent[] | undefined {
  return projectNodes(node.children ?? []);
}

export function inlineContentToNodes(content: InlineContent[]): MystNode[] {
  return content.map(inlineToNode);
}

/** Readable text: inline math appears as its `$source$`. */
export function inlineContentText(content: InlineContent[]): string {
  return content
    .map((item) => (item.kind === "text" ? item.text : item.kind === "break" ? "\n"
      : item.kind === "math" ? `$${item.value}$` : inlineContentText(item.children)))
    .join("");
}

function projectNodes(nodes: MystNode[]): InlineContent[] | undefined {
  const content: InlineContent[] = [];
  for (const node of nodes) {
    const item = projectNode(node);
    if (!item) return undefined;
    content.push(item);
  }
  return content;
}

function projectNode(node: MystNode): InlineContent | undefined {
  if (node.type === "break") return { kind: "break" };
  if (node.type === "inlineMath" && typeof node.value === "string" && node.value.length > 0 &&
      Object.keys(node).every((key) => key === "type" || key === "value" || key === "position")) {
    return { kind: "math", value: node.value };
  }
  if (node.type === "text") {
    return { kind: "text", text: typeof node.value === "string" ? node.value : "" };
  }
  if (node.type === "strong" || node.type === "emphasis") {
    const children = projectNodes(node.children ?? []);
    if (!children) return undefined;
    return { kind: node.type, children };
  }
  // Only plain links with visible text: `[](#x)`, `{download}` (static) and links
  // around code, images or other nodes stay unsupported.
  if (node.type === "link" && typeof node.url === "string" && node.url.length > 0 &&
      (node.title === undefined || typeof node.title === "string") &&
      Object.keys(node).every((key) => LINK_FIELDS.has(key))) {
    const children = projectNodes(node.children ?? []);
    if (!children || inlineContentText(children).length === 0 || containsLink(children)) return undefined;
    return { kind: "link", url: node.url, ...(node.title !== undefined ? { title: node.title } : {}), children };
  }
  return undefined;
}

function containsLink(content: InlineContent[]): boolean {
  return content.some((item) => item.kind === "link" || ("children" in item && containsLink(item.children)));
}

function inlineToNode(item: InlineContent): MystNode {
  if (item.kind === "break") return { type: "break" };
  if (item.kind === "math") return { type: "inlineMath", value: item.value };
  if (item.kind === "text") {
    return { type: "text", value: item.text };
  }
  if (item.kind === "strong" || item.kind === "emphasis") {
    return { type: item.kind, children: item.children.map(inlineToNode) };
  }
  if (item.kind === "link") {
    const node: MystNode = { type: "link", url: item.url, children: item.children.map(inlineToNode) };
    if (item.title !== undefined) node.title = item.title;
    return node;
  }
  throw new Error("unsupported InlineContent");
}

export function assertInlineContent(content: InlineContent[]): void {
  if (!Array.isArray(content)) {
    throw new Error("InlineContent must be an array");
  }
  for (const item of content) {
    if (!item || typeof item !== "object") {
      throw new Error("InlineContent item must be an object");
    }
    if (item.kind === "break") continue;
    if (item.kind === "math") {
      if (typeof item.value !== "string" || item.value.length === 0 || /[\r\n]/.test(item.value)) {
        throw new Error("inline math must be non-empty single-line LaTeX");
      }
      continue;
    }
    if (item.kind === "text") {
      if (typeof item.text !== "string") {
        throw new Error("text InlineContent requires a string");
      }
      continue;
    }
    if (item.kind === "strong" || item.kind === "emphasis") {
      assertInlineContent(item.children);
      continue;
    }
    if (item.kind === "link") {
      if (typeof item.url !== "string" || item.url.length === 0 || /\s/.test(item.url)) {
        throw new Error("link URL must be non-empty and contain no whitespace");
      }
      if (item.title !== undefined && (typeof item.title !== "string" || /[\r\n]/.test(item.title))) {
        throw new Error("link title must be a single-line string");
      }
      assertInlineContent(item.children);
      if (inlineContentText(item.children).length === 0) {
        throw new Error("link text cannot be empty");
      }
      if (containsLink(item.children)) {
        throw new Error("links cannot contain links");
      }
      continue;
    }
    throw new Error("unsupported InlineContent kind");
  }
}

/** Rendered offsets use JavaScript UTF-16 code units; a break and inline math each have length one.
 * Marks contribute only their children. No grapheme segmentation is performed. */
export function inlineContentLength(content: InlineContent[]): number {
  return content.reduce((length, item) => length + (item.kind === "text" ? item.text.length
    : item.kind === "break" || item.kind === "math" ? 1 : inlineContentLength(item.children)), 0);
}

export function splitInlineContent(content: InlineContent[], offset: number): [InlineContent[], InlineContent[]] {
  const left: InlineContent[] = [];
  const right: InlineContent[] = [];
  let remaining = offset;
  for (const item of content) {
    const length = inlineContentLength([item]);
    if (remaining <= 0) right.push(item);
    else if (remaining >= length) left.push(item);
    else if (item.kind === "text") {
      left.push({ kind: "text", text: item.text.slice(0, remaining) });
      right.push({ kind: "text", text: item.text.slice(remaining) });
    } else if ("children" in item) {
      const [a, b] = splitInlineContent(item.children, remaining);
      if (a.length) left.push({ ...item, children: a });
      if (b.length) right.push({ ...item, children: b });
    }
    remaining -= length;
  }
  return [left, right];
}

/** Coalesce adjacent equal marks so Markdown delimiters cannot collide.
 * Adjacent links stay separate: `[a](x)[b](x)` is two links. */
export function concatenateInlineContent(...parts: InlineContent[][]): InlineContent[] {
  const result: InlineContent[] = [];
  for (const item of parts.flat()) {
    const current = "children" in item
      ? { ...item, children: concatenateInlineContent(item.children) } : { ...item };
    const previous = result.at(-1);
    if (previous?.kind === "text" && current.kind === "text") previous.text += current.text;
    else if ((previous?.kind === "strong" || previous?.kind === "emphasis") &&
      (current.kind === "strong" || current.kind === "emphasis") && previous.kind === current.kind) {
      previous.children = concatenateInlineContent(previous.children, current.children);
    } else result.push(current);
  }
  return result;
}

export function insertInlineBreak(content: InlineContent[], offset: number): InlineContent[] {
  let remaining = offset;
  for (const [index, item] of content.entries()) {
    const length = inlineContentLength([item]);
    if (remaining > 0 && remaining < length && "children" in item) {
      return [...content.slice(0, index), { ...item, children: insertInlineBreak(item.children, remaining) }, ...content.slice(index + 1)];
    }
    remaining -= length;
  }
  const [left, right] = splitInlineContent(content, offset);
  return concatenateInlineContent(left, [{ kind: "break" }], right);
}
