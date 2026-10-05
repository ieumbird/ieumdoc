import { writeMd } from "myst-to-md";
import { VFile } from "vfile";
import { semanticDifference, semanticFingerprint } from "./fingerprint.ts";
import { FRONT_MATTER_FIELD, parse } from "./parse.ts";
import { prepareReferences } from "./reference.ts";
import { cloneDocument, type MystDocument, type MystNode } from "./tree.ts";

const LOSS = "Document contains semantic content that cannot be preserved in canonical Markdown";

/** Canonical serialization would lose semantics; `detail` names the node and reason. */
export class SemanticLossError extends Error {
  constructor(readonly detail: string, options?: ErrorOptions) {
    super(`${LOSS}: ${detail}`, options);
  }
}

/** Serialize for an operation's own round-trip check, reporting a loss as that operation's failure. */
export function serializeFor(document: MystDocument, failure: string): string {
  try {
    return serialize(document);
  } catch (error) {
    if (error instanceof SemanticLossError) throw new Error(`${failure} (${error.detail})`, { cause: error });
    throw error;
  }
}

/**
 * Canonical write path. Never returns Markdown that loses document semantics:
 * 1. myst-to-md diagnostics mean output it could not render;
 * 2. the reparsed Markdown must keep the original semantic fingerprint.
 */
export function serialize(document: MystDocument): string {
  const expected = semanticFingerprint(document);
  const tree = cloneDocument(document);
  prepareReferences(tree);
  const frontMatter = prepareWriter(tree);
  const file = new VFile();
  try {
    writeMd(file, tree as never);
  } catch (error) {
    assertNoSerializationDiagnostics(file);
    throw new SemanticLossError("serializer failed", { cause: error });
  }
  assertNoSerializationDiagnostics(file);
  const markdown = `${frontMatter}${String(file.result ?? "").trimEnd()}\n`;
  const difference = semanticDifference(expected, semanticFingerprint(parse(markdown)));
  if (difference) throw new SemanticLossError(difference);
  return markdown;
}

/** Adapt the MyST representation to the existing mdast writer, on the write-only clone.
 * The original fingerprint and the whole reparsed output still have to match. */
function prepareWriter(tree: MystDocument): string {
  let prefix = "";
  function visit(node: MystNode, index: number, parent?: MystNode): void {
    // Lifted roles can lack positions; diagnostics still identify their containing block.
    node.position ??= parent?.position;
    if (node[FRONT_MATTER_FIELD] !== undefined) {
      if (parent !== tree || index !== 0 || node[FRONT_MATTER_FIELD] !== true) {
        throw new SemanticLossError(`Block ${index + 1}: front matter must be closed and remain at the start of the document`);
      }
      prefix = `---\n${String(node.value ?? "")}\n---\n\n`;
    }
    // myst-to-md chooses its image directive by key presence, even for undefined
    // attributes emitted by myst-parser. Absent values must stay absent.
    for (const key of Object.keys(node)) if (node[key] === undefined) delete node[key];
    // MyST puts alignment on each cell; mdast-util-gfm-table expects columns on the table.
    // Nonuniform or unrepresentable alignment still fails the full fingerprint check.
    if (node.type === "table" && node.children?.[0]?.children?.some(cell => cell.align !== undefined)) {
      node.align = node.children[0].children.map(cell => cell.align ?? null);
    }
    // myst-to-md does not escape `$`, so literal dollars in text would reload as inline
    // math. Write each as `\$`; the writer emits `html` values verbatim.
    if (node.children?.some(child => child.type === "text" && String(child.value).includes("$"))) {
      node.children = node.children.flatMap(child => child.type === "text" ? escapeDollars(child) : [child]);
    }
    node.children?.forEach((child, childIndex) => visit(child, childIndex, node));
    // MyST lifts standalone images out of paragraphs. Restore the writer's flow
    // wrapper so adjacent text/images get a blank separator, not merged inline.
    if (["root", "blockquote", "listItem", "admonition"].includes(node.type)) {
      node.children = node.children?.map(child => child.type === "image"
        ? { type: "paragraph", children: [child] } : child);
    }
  }
  visit(tree, 0);
  if (prefix) tree.children.shift();
  return prefix;
}

function escapeDollars(text: MystNode): MystNode[] {
  return String(text.value).split("$").flatMap((value, index) => [
    ...(index > 0 ? [{ type: "html", value: "\\$" }] : []),
    ...(value ? [{ ...text, value }] : []),
  ]);
}

/**
 * Canonical writeability preflight: why the canonical write path would refuse this
 * document, or undefined when it can write it. It runs `serialize` itself, so its verdict
 * and reason are those of Save and `format` for the same snapshot. Nothing is written and
 * the document is not changed (serialize works on a clone).
 */
export function canonicalWriteError(document: MystDocument): string | undefined {
  try {
    serialize(document);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * myst-to-md reports nodes it cannot render (rule `md-renders`) on the VFile,
 * writes an empty string for them and continues. In myst-to-md 1.0.17 every
 * message it emits means lost output, and supported documents emit none, so any
 * message rejects the write. Revisit this policy if a version adds harmless ones.
 */
function assertNoSerializationDiagnostics(file: VFile): void {
  if (file.messages.length === 0) return;
  const reasons = [...new Set(file.messages.map((message) =>
    `${message.line ? `Line ${message.line}: ` : ""}${message.reason}`))];
  throw new SemanticLossError(reasons.join("; "));
}
