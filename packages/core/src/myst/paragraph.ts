import { projectInlineContent, sameInlineContent, type InlineContent } from "../inline.ts";
import { parse } from "./parse.ts";
import { serialize, serializeFor } from "./serialize.ts";
import type { MystNode } from "./tree.ts";
import { DocumentWriteError } from "../write-error.ts";

/** Fail closed when Markdown cannot persist the requested inline semantics.
 * In particular, trailing breaks and whitespace-only split results are not
 * persistent paragraphs. Never insert padding or invisible placeholders. */
export function assertPersistentParagraph(node: MystNode): void {
  const content = projectInlineContent(node);
  if (!content || !hasParagraphContent(content)) {
    throw new DocumentWriteError("persistent paragraph must contain non-empty text", { action: "Enter text or delete this block." });
  }
  const failure = "paragraph edit cannot round-trip losslessly through canonical Markdown";
  const markdown = serializeFor({ type: "root", children: [node] }, failure);
  // UTF-8 files cannot retain an unpaired surrogate created by a UTF-16 split.
  if (new TextDecoder().decode(new TextEncoder().encode(markdown)) !== markdown) {
    throw new Error("paragraph edit cannot persist an unpaired UTF-16 surrogate");
  }
  // Footnote definitions after the paragraph complete its references (see `serializeFor`).
  const reparsed = parse(markdown).children.filter((block) => block.type !== "footnoteDefinition");
  const projected = reparsed.length === 1 && reparsed[0].type === "paragraph"
    ? projectInlineContent(reparsed[0]) : undefined;
  if (!projected || !sameInlineContent(content, projected) ||
      serialize(parse(markdown)) !== markdown) {
    throw new Error(failure);
  }
}

function hasParagraphContent(content: InlineContent[]): boolean {
  return content.some((item) => {
    if ("children" in item) return hasParagraphContent(item.children);
    if (item.kind === "text") return item.text.trim().length > 0;
    if (item.kind === "code") return item.value.length > 0;
    return item.kind === "math" || item.kind === "reference" || item.kind === "footnote" || item.kind === "citation";
  });
}
