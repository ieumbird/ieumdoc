import type { DocumentNode } from "../document.ts";
import { projectInlineContent, type InlineContent } from "../inline.ts";
import { parse } from "./parse.ts";
import { serialize, serializeFor } from "./serialize.ts";

/** Fail closed when Markdown cannot persist the requested inline semantics.
 * In particular, trailing breaks and whitespace-only split results are not
 * persistent paragraphs. Never insert padding or invisible placeholders. */
export function assertPersistentParagraph(node: DocumentNode): void {
  const content = projectInlineContent(node);
  if (!content || !semanticUnits(content).some((unit) => unit.kind === "text" && unit.text.trim().length > 0)) {
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
    if (item.kind === "strong" || item.kind === "emphasis") {
      return semanticUnits(item.children, [...new Set([...marks, item.kind])].sort());
    }
    // split("") deliberately counts UTF-16 units, not Unicode code points.
    return (item.kind === "text" ? item.text.split("") : ["\n"])
      .map((text) => ({ kind: item.kind, text, marks }));
  });
}
