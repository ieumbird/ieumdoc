import type { DocumentNode } from "./document.ts";

export type InlineContent =
  | { kind: "break" }
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "strong";
      children: InlineContent[];
    }
  | {
      kind: "emphasis";
      children: InlineContent[];
    };

export function projectInlineContent(node: DocumentNode): InlineContent[] | undefined {
  return projectNodes(node.children ?? []);
}

export function inlineContentToNodes(content: InlineContent[]): DocumentNode[] {
  return content.map(inlineToNode);
}

export function inlineContentText(content: InlineContent[]): string {
  return content
    .map((item) => (item.kind === "text" ? item.text : item.kind === "break" ? "\n" : inlineContentText(item.children)))
    .join("");
}

function projectNodes(nodes: DocumentNode[]): InlineContent[] | undefined {
  const content: InlineContent[] = [];
  for (const node of nodes) {
    const item = projectNode(node);
    if (!item) return undefined;
    content.push(item);
  }
  return content;
}

function projectNode(node: DocumentNode): InlineContent | undefined {
  if (node.type === "break") return { kind: "break" };
  if (node.type === "text") {
    return { kind: "text", text: typeof node.value === "string" ? node.value : "" };
  }
  if (node.type === "strong" || node.type === "emphasis") {
    const children = projectNodes(node.children ?? []);
    if (!children) return undefined;
    return { kind: node.type, children };
  }
  return undefined;
}

function inlineToNode(item: InlineContent): DocumentNode {
  if (item.kind === "break") return { type: "break" };
  if (item.kind === "text") {
    return { type: "text", value: item.text };
  }
  if (item.kind === "strong" || item.kind === "emphasis") {
    return { type: item.kind, children: item.children.map(inlineToNode) };
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
    throw new Error("unsupported InlineContent kind");
  }
}

/** Rendered offsets use JavaScript UTF-16 code units; a break has length one.
 * Marks contribute only their children. No grapheme segmentation is performed. */
export function inlineContentLength(content: InlineContent[]): number {
  return inlineContentText(content).length;
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
    } else if (item.kind !== "break") {
      const [a, b] = splitInlineContent(item.children, remaining);
      if (a.length) left.push({ ...item, children: a });
      if (b.length) right.push({ ...item, children: b });
    }
    remaining -= length;
  }
  return [left, right];
}

/** Coalesce adjacent equal marks so Markdown delimiters cannot collide. */
export function concatenateInlineContent(...parts: InlineContent[][]): InlineContent[] {
  const result: InlineContent[] = [];
  for (const item of parts.flat()) {
    const current = item.kind === "strong" || item.kind === "emphasis"
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
    if (remaining > 0 && remaining < length && (item.kind === "strong" || item.kind === "emphasis")) {
      return [...content.slice(0, index), { ...item, children: insertInlineBreak(item.children, remaining) }, ...content.slice(index + 1)];
    }
    remaining -= length;
  }
  const [left, right] = splitInlineContent(content, offset);
  return concatenateInlineContent(left, [{ kind: "break" }], right);
}
