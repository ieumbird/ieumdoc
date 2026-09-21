import type { DocumentNode } from "./document.ts";

export type InlineContent =
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
    .map((item) => (item.kind === "text" ? item.text : inlineContentText(item.children)))
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
