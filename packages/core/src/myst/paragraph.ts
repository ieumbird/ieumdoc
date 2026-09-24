import { inlineMarkKey, projectInlineContent, type InlineContent } from "../inline.ts";
import { parse } from "./parse.ts";
import { serialize, serializeFor } from "./serialize.ts";
import type { MystNode } from "./tree.ts";

/** Fail closed when Markdown cannot persist the requested inline semantics.
 * In particular, trailing breaks and whitespace-only split results are not
 * persistent paragraphs. Never insert padding or invisible placeholders. */
export function assertPersistentParagraph(node: MystNode): void {
  const content = projectInlineContent(node);
  if (!content || !semanticUnits(content).some((unit) =>
    unit.kind === "math" || unit.kind === "reference" || (unit.kind === "text" && unit.text.trim().length > 0))) {
    throw new Error("persistent paragraph must contain non-empty text");
  }
  const failure = "paragraph edit cannot round-trip losslessly through canonical Markdown";
  const markdown = serializeFor({ type: "root", children: [node] }, failure);
  // UTF-8 files cannot retain an unpaired surrogate created by a UTF-16 split.
  if (new TextDecoder().decode(new TextEncoder().encode(markdown)) !== markdown) {
    throw new Error("paragraph edit cannot persist an unpaired UTF-16 surrogate");
  }
  const reparsed = parse(markdown);
  const projected = reparsed.children.length === 1 && reparsed.children[0].type === "paragraph"
    ? projectInlineContent(reparsed.children[0]) : undefined;
  if (!projected || JSON.stringify(semanticUnits(content)) !== JSON.stringify(semanticUnits(projected)) ||
      serialize(reparsed) !== markdown) {
    throw new Error(failure);
  }
}

function semanticUnits(content: InlineContent[], marks: string[] = []): { kind: string; text: string; marks: string[] }[] {
  return content.flatMap((item) => {
    const mark = inlineMarkKey(item);
    if (mark !== undefined && "children" in item) {
      return semanticUnits(item.children, [...new Set([...marks, mark])].sort());
    }
    // Inline math is one unit carrying its source.
    if (item.kind === "math") return [{ kind: "math", text: item.value, marks }];
    if (item.kind === "reference") return [{ kind: "reference", text: `${item.role} ${item.label}`, marks }];
    // split("") deliberately counts UTF-16 units, not Unicode code points.
    return (item.kind === "text" ? item.text.split("") : ["\n"])
      .map((text) => ({ kind: item.kind, text, marks }));
  });
}
