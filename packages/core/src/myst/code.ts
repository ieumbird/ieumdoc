import type { CodeBlockContent } from "../code.ts";
import type { MystNode } from "./tree.ts";

const CODE_FIELDS = new Set(["type", "lang", "value", "position"]);

/**
 * Code block v1 authoring supports plain fenced or indented code: a language and
 * literal code. `{code-block}` containers with captions or labels, front matter and
 * other code-like nodes stay read-only so an edit never drops their options.
 */
export function supportedCodeBlock(node: MystNode): CodeBlockContent | undefined {
  if (node.type !== "code" || typeof node.value !== "string" ||
      (node.lang !== undefined && typeof node.lang !== "string") ||
      // myst-parser records an undefined `meta` on fenced code; undefined means absent.
      !Object.keys(node).every((key) => CODE_FIELDS.has(key) || node[key] === undefined)) return undefined;
  return { language: node.lang ?? "", code: node.value };
}

/** The MyST structure myst-parser produces for a fenced code block of this content. */
export function createCodeNode(content: CodeBlockContent): MystNode {
  return { type: "code", lang: content.language, value: content.code };
}
