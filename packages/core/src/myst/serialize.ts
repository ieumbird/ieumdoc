import { writeMd } from "myst-to-md";
import { VFile } from "vfile";
import { semanticDifferenceIssue, semanticFingerprint } from "./fingerprint.ts";
import { DocumentWriteError, writeIssueOf, type WriteIssue } from "../write-error.ts";
import { completeFootnotes, endnotePlacement, footnoteWriteIssue } from "./footnote.ts";
import { isFigure } from "./figure.ts";
import { FRONT_MATTER_FIELD, parse } from "./parse.ts";
import { prepareReferences } from "./reference.ts";
import { isTableDirective, tableOf, tableCaptionParagraph } from "./table.ts";
import { cloneDocument, type MystDocument, type MystNode } from "./tree.ts";

const LOSS = "Document contains semantic content that cannot be preserved in canonical Markdown";

/** Canonical serialization would lose semantics; `detail` names the node and reason. */
export class SemanticLossError extends DocumentWriteError {
  constructor(readonly detail: string, options?: ErrorOptions & Partial<Omit<WriteIssue, "reason">>) {
    super(`${LOSS}: ${detail}`, { action: options?.action ?? "Review this content and simplify or replace the unsupported content before saving.",
      ...(options?.path ? { path: options.path } : {}), ...(options?.line ? { line: options.line } : {}) }, options);
  }
}

/** Serialize for an operation's own round-trip check, reporting a loss as that operation's failure.
 * Its footnotes are completed: they are the document's write rule, not the operation's. */
export function serializeFor(document: MystDocument, failure: string): string {
  try {
    return serialize(completeFootnotes(document));
  } catch (error) {
    if (error instanceof SemanticLossError) throw new Error(`${failure} (${error.detail})`, { cause: error });
    throw error;
  }
}

/**
 * Canonical write path. Never returns Markdown that loses document semantics:
 * 1. myst-to-md diagnostics mean output it could not render;
 * 2. the reparsed Markdown must keep the original semantic fingerprint.
 * Footnote definitions are written after the body in endnote order, wherever the tree holds
 * them (`endnotePlacement`); parse reads them back in that order, so writing is idempotent.
 */
export function serialize(document: MystDocument): string {
  // The fingerprint would also catch these, but not name the footnote.
  const footnotes = footnoteWriteIssue(document);
  if (footnotes) throw new SemanticLossError(footnotes.reason, footnotes);
  const tree = cloneDocument(document);
  const originalIndex = new Map(tree.children.map((node, index) => [node, index]));
  tree.children = endnotePlacement(tree);
  const blockPaths = tree.children.map(node => [originalIndex.get(node)!]);
  const expected = semanticFingerprint(tree);
  tree.children = tree.children.map((node, index) => {
    try {
      const flow = { type: "root", children: [node] };
      prepareReferences(flow);
      return flow.children[0];
    }
    catch (error) {
      throw new DocumentWriteError(error instanceof Error ? error.message : String(error), {
        path: blockPaths[index], action: "Review this reference or target and replace it with a supported reference or plain text.",
      }, { cause: error });
    }
  });
  const frontMatter = prepareWriter(tree, blockPaths);
  const file = new VFile();
  try {
    writeMd(file, tree as never);
  } catch (error) {
    assertNoSerializationDiagnostics(file, document);
    throw new SemanticLossError("serializer failed", { cause: error,
      action: "IeumDoc could not serialize this document. Keep your edits and report this error; no specific content cause was identified." });
  }
  assertNoSerializationDiagnostics(file, document);
  // Normalize the complete output, including preserved source, before semantic verification.
  const markdown = `${frontMatter}${String(file.result ?? "").trimEnd()}\n`.replace(/\r\n?/g, "\n");
  const difference = semanticDifferenceIssue(expected, semanticFingerprint(parse(markdown)));
  if (difference) throw new SemanticLossError(difference.reason, {
    ...(difference.blockIndex !== undefined ? { path: blockPaths[difference.blockIndex] } : {}),
  });
  return markdown;
}

/** Write one flow node with myst-to-md, for a directive whose body IeumDoc writes itself. */
function render(value: MystNode): string {
  const file = new VFile();
  writeMd(file, { type: "root", children: [value] } as never);
  assertNoSerializationDiagnostics(file);
  return String(file.result ?? "").trimEnd();
}

/** Adapt the MyST representation to the existing mdast writer, on the write-only clone.
 * The original fingerprint and the whole reparsed output still have to match. */
function prepareWriter(tree: MystDocument, blockPaths: number[][]): string {
  let prefix = "";
  function visit(node: MystNode, index: number, parent?: MystNode, path: number[] = []): void {
    try { prepare(node, index, parent, path); }
    catch (error) {
      if (error instanceof DocumentWriteError) {
        if (!error.location.path?.length && path.length) error.location.path = path;
        throw error;
      }
      const issue = writeIssueOf(error);
      throw new DocumentWriteError(issue.reason, { action: issue.action, path: issue.path ?? path,
        ...(issue.line ? { line: issue.line } : {}) }, { cause: error });
    }
  }
  function prepare(node: MystNode, index: number, parent: MystNode | undefined, path: number[]): void {
    // Lifted roles can lack positions; diagnostics still identify their containing block.
    node.position ??= parent?.position;
    if (node[FRONT_MATTER_FIELD] !== undefined) {
      if (parent !== tree || index !== 0 || node[FRONT_MATTER_FIELD] !== true) {
        throw new SemanticLossError(`Block ${index + 1}: front matter must be closed and remain at the start of the document`, {
          path, action: "Close the front matter with --- and keep it at the start of the file, then Reload." });
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
    // myst-to-md writes inline math as the `{math}` role; write MyST's usual `$...$`.
    if (node.children?.some(child => child.type === "inlineMath")) {
      node.children = node.children.map((child, index, siblings) => isDollarMath(child, siblings[index - 1])
        ? { type: "html", value: `$${child.value}$` } : child);
    }
    node.children?.forEach((child, childIndex) => visit(child, childIndex, node,
      node === tree ? blockPaths[childIndex] : [...path, childIndex]));
    // Keep supported table directives as GFM tables. The upstream list-table writer
    // wraps cells in paragraphs and drops column alignment. The full guard still applies.
    if (isTableDirective(node)) {
      const caption = tableCaptionParagraph(node);
      const body = render(tableOf(node)!);
      const title = caption ? render(caption) : "";
      if (/[\r\n]/.test(title)) throw new SemanticLossError("table caption must fit on one line", { path,
        action: "Remove line breaks from the table caption." });
      const fence = ":".repeat(Math.max(3, ...[...body.matchAll(/^(:{3,})/gm)].map(match => match[1].length + 1)));
      node.type = "html";
      node.value = `${fence}{table}${title ? ` ${title}` : ""}\n${node.label ? `:name: ${node.label}\n` : ""}\n${body}\n${fence}`;
      delete node.children;
    }
    // myst-to-md writes a Figure only from its image. A pending Figure (no content, at most its
    // caption) is the same directive without an argument; MyST reads it back as the same
    // container. Only this shape is written here: a Figure with other content, a legend or
    // subfigures still goes to myst-to-md and fails closed. The full guard still applies.
    if (isFigure(node) && !node.subcontainer && (node.children ?? []).length <= 1 &&
        (node.children ?? []).every(child => child.type === "caption")) {
      const caption = (node.children ?? []).flatMap(child => child.children ?? []).map(render).join("\n\n");
      const fence = ":".repeat(Math.max(3, ...[...caption.matchAll(/^(:{3,})/gm)].map(match => match[1].length + 1)));
      node.type = "html";
      node.value = `${fence}{figure}\n${node.label ? `:name: ${node.label}\n` : ""}${caption ? `\n${caption}\n` : ""}${fence}`;
      delete node.children;
    }
  }
  visit(tree, 0);
  if (prefix) tree.children.shift();
  return prefix;
}

/** Whether inline math can be written as `$...$`. The value must not hold `$` or end in a
 * backslash that would escape the closing `$`. The writer turns a line ending before an `html`
 * node into a space, so math right after a line break keeps the role. */
function isDollarMath(node: MystNode, previous: MystNode | undefined): boolean {
  return node.type === "inlineMath" && typeof node.value === "string" && /^[^$\r\n]*[^$\r\n\\]$/.test(node.value) &&
    Object.keys(node).every(key => key === "type" || key === "value" || key === "position") &&
    previous?.type !== "break" && !(previous?.type === "text" && /[\r\n]$/.test(String(previous.value)));
}

function escapeDollars(text: MystNode): MystNode[] {
  return String(text.value).split("$").flatMap((value, index) => [
    ...(index > 0 ? [{ type: "html", value: "\\$" }] : []),
    ...(value ? [{ ...text, value }] : []),
  ]);
}

/**
 * Canonical writeability preflight: why the canonical write path would refuse this
 * document, or undefined when it can write it. It runs the canonical write itself, so its verdict
 * and reason are those of Save and `format` for the same snapshot. Nothing is written and
 * the document is not changed (serialize works on a clone).
 */
export function canonicalWriteError(document: MystDocument): string | undefined {
  return canonicalWriteIssue(document)?.reason;
}

export function canonicalWriteIssue(document: MystDocument): WriteIssue | undefined {
  try {
    serialize(document);
    return undefined;
  } catch (error) {
    return writeIssueOf(error);
  }
}

/**
 * myst-to-md reports nodes it cannot render (rule `md-renders`) on the VFile,
 * writes an empty string for them and continues. In myst-to-md 1.0.17 every
 * message it emits means lost output, and supported documents emit none, so any
 * message rejects the write. Revisit this policy if a version adds harmless ones.
 */
function assertNoSerializationDiagnostics(file: VFile, document?: MystDocument): void {
  if (file.messages.length === 0) return;
  const reasons = [...new Set(file.messages.map((message) =>
    `${message.line ? `Line ${message.line}: ` : ""}${message.reason}`))];
  const line = file.messages[0]?.line;
  const index = line == null ? -1 : document?.children.findIndex(node =>
    node.position !== undefined && node.position.start.line <= line && node.position.end.line >= line) ?? -1;
  throw new SemanticLossError(reasons.join("; "), { ...(line ? { line } : {}), ...(index >= 0 ? { path: [index] } : {}) });
}
