import { isMap, isScalar, parseDocument } from "yaml";
import { inlineContentText, projectInlineContent, type InlineContent } from "../inline.ts";
import { DocumentWriteError, writeIssueOf, type WriteIssue } from "../write-error.ts";
import { validateStructure } from "../validation.ts";
import { supportedAdmonitionContent } from "./admonition.ts";
import { supportedCodeBlock } from "./code.ts";
import { supportedFigureContent } from "./figure.ts";
import { supportedFootnoteContent } from "./footnote.ts";
import { supportedListContent } from "./list.ts";
import { citationShorthand } from "./literal-syntax.ts";
import { FRONT_MATTER_FIELD, parse as parseTree } from "./parse.ts";
import { isDivider, supportedQuoteContent } from "./quote.ts";
import { supportedTargetLabel } from "./reference.ts";
import { serialize as serializeTree } from "./serialize.ts";
import { tableCellContent, tableOf, tableCaptionParagraph } from "./table.ts";
import type { MystDocument, MystNode } from "./tree.ts";
import { NUMBERED_KINDS, referenceTemplatesError, type NumberedKind } from "../numbering.ts";
import { referenceTemplateValue } from "./reference-templates.ts";
import { declaredBibliography } from "./citation.ts";

export type NativeDocumentErrorCode = "native-marker" | "native-metadata" | "native-content";
export class NativeDocumentError extends DocumentWriteError {
  constructor(readonly code: NativeDocumentErrorCode, reason: string, path?: number[], line?: number) {
    super(reason, { action: "Open an IeumDoc native document or create a new document. Automatic conversion is not supported.", path, line });
    this.name = "NativeDocumentError";
  }
}

function fields(node: MystNode, allowed: string[]): boolean {
  return Object.entries(node).every(([key, value]) => value === undefined ||
    ["type", "position", ...allowed].includes(key));
}

export function supportedHeadingContent(node: MystNode): InlineContent[] | undefined {
  if (!fields(node, ["depth", "children"]) || !Number.isInteger(node.depth) || node.depth < 1 || node.depth > 6) return undefined;
  const content = projectInlineContent(node);
  const breaks = (items: InlineContent[]): boolean => items.some(item => item.kind === "break" || ("children" in item && breaks(item.children)));
  return content && inlineContentText(content).length > 0 && !breaks(content) ? content : undefined;
}

/**
 * Whether source starts with frontmatter carrying the native marker `ieumdoc: 1`, read from the
 * leading frontmatter alone so a folder listing can tell native files apart without parsing them.
 * It is not admission: a marked file can still be rejected for its metadata or content.
 */
export function hasNativeMarker(source: string): boolean {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source.replace(/^\uFEFF/, ""));
  if (!match) return false;
  const yaml = parseDocument(match[1]!);
  const marker = isMap(yaml.contents) ? yaml.get("ieumdoc", true) : undefined;
  return isScalar(marker) && marker.value === 1;
}

/** Validate source metadata before accepting a file; canonicalization cannot detect duplicate YAML keys. */
function metadata(document: MystDocument): void {
  const first = document.children[0];
  if (first?.[FRONT_MATTER_FIELD] !== true) throw new NativeDocumentError("native-marker", "A native document requires leading frontmatter with ieumdoc: 1", [0], 1);
  const yaml = parseDocument(String(first.value ?? ""));
  if (yaml.errors.length || !isMap(yaml.contents)) throw new NativeDocumentError("native-metadata", `Invalid native frontmatter: ${yaml.errors[0]?.message ?? "expected a YAML mapping"}`, [0], 1);
  const marker = yaml.get("ieumdoc", true);
  if (!isScalar(marker) || marker.value !== 1) throw new NativeDocumentError("native-marker", "Unsupported native document marker; expected YAML number ieumdoc: 1", [0], 1);
  for (const pair of yaml.contents.items) {
    if (!isScalar(pair.key) || !["ieumdoc", "numbering", "bibliography"].includes(String(pair.key.value))) throw new NativeDocumentError("native-metadata", "Native frontmatter supports only ieumdoc, numbering and bibliography", [0], 1);
  }
  try { declaredBibliography(document); }
  catch (error) { throw new NativeDocumentError("native-metadata", (error as Error).message, [0], 1); }
  if (yaml.has("numbering")) {
    const numbering = yaml.get("numbering", true);
    if (!isMap(numbering) || numbering.items.some(pair => {
      if (!isScalar(pair.key)) return true;
      const key = pair.key.value;
      if (key === "headings") return !isScalar(pair.value) || typeof pair.value.value !== "boolean";
      if (key === "title") return !isScalar(pair.value) || pair.value.value !== false;
      if (!NUMBERED_KINDS.includes(key as NumberedKind)) return true;
      const template = referenceTemplateValue(pair.value);
      return template === undefined || referenceTemplatesError({ [String(key)]: template }) !== undefined;
    })) {
      throw new NativeDocumentError("native-metadata", "Numbering supports only headings: boolean, title: false and figure/table/equation templates", [0], 1);
    }
  }
}

function supportedBlock(node: MystNode): boolean {
  if (node.type === "heading") return supportedHeadingContent(node) !== undefined;
  if (node.type === "paragraph") return fields(node, ["children"]) && projectInlineContent(node) !== undefined;
  if (node.type === "admonition") return supportedAdmonitionContent(node) !== undefined;
  if (node.type === "blockquote") return supportedQuoteContent(node) !== undefined;
  if (node.type === "footnoteDefinition") return supportedFootnoteContent(node) !== undefined;
  if (node.type === "math") return fields(node, ["value", "label", "identifier"]) && typeof node.value === "string";
  if (node.type === "container" && node.kind === "figure") {
    return fields(node, ["kind", "children", "label", "identifier"]) && supportedFigureContent(node) !== undefined &&
      (node.children ?? []).every(child => child.type === "image"
        ? fields(child, ["url", "alt"]) : fields(child, ["children"]) && (child.children ?? []).every(paragraph => fields(paragraph, ["children"])));
  }
  const table = tableOf(node);
  if (table) {
    const caption = tableCaptionParagraph(node);
    return (!caption || projectInlineContent(caption) !== undefined) && fields(table, ["children"]) &&
      (table.children ?? []).length > 0 && (table.children ?? []).every(row => row.type === "tableRow" && fields(row, ["children"]) &&
        (row.children ?? []).every(cell => fields(cell, ["header", "align", "children"]) && tableCellContent(cell) !== undefined));
  }
  return isDivider(node) || supportedListContent(node) !== undefined || supportedCodeBlock(node) !== undefined || supportedTargetLabel(node) !== undefined;
}

/** Separate adjacent links with equal targets have no distinct native inline identity. */
function assertInlineContent(node: MystNode, path: number[]): void {
  if (["heading", "paragraph", "tableCell"].includes(node.type)) {
    const content = projectInlineContent(node);
    if (!content) throw new NativeDocumentError("native-content", "Unsupported native inline content", path, node.position?.start.line);
    let previous: Extract<InlineContent, { kind: "link" }> | undefined;
    const visit = (items: InlineContent[], owner?: Extract<InlineContent, { kind: "link" }>): void => {
      for (const item of items) {
        if (item.kind === "link") visit(item.children, item);
        else if ("children" in item) visit(item.children, owner);
        else {
          if (owner && previous && owner !== previous && owner.url === previous.url && owner.title === previous.title) {
            throw new NativeDocumentError("native-content", "Adjacent separate links with the same target are not supported", path, node.position?.start.line);
          }
          previous = owner;
        }
      }
    };
    visit(content);
  }
  node.children?.forEach((child, index) => assertInlineContent(child, [...path, index]));
}

export function assertNativeDocument(document: MystDocument): void {
  validateStructure(document);
  metadata(document);
  const shorthand = citationShorthand(document);
  if (shorthand) {
    const error = new NativeDocumentError("native-content",
      "Bracket citation shorthand is not supported; use an explicit citation role, or escape the opening bracket (\\[) or the @ (\\@) for literal text.",
      shorthand.path, shorthand.line);
    error.location.action = "Use {cite}, {cite:t} or {cite:p} for citations. For literal text, escape the opening bracket (\\[) or the @ (\\@).";
    throw error;
  }
  document.children.forEach((node, index) => {
    if (index === 0) return;
    if (!supportedBlock(node)) throw new NativeDocumentError("native-content", `Unsupported native content: ${node.type}${node.kind ? ` (${node.kind})` : ""}`, [index], node.position?.start.line);
    assertInlineContent(node, [index]);
  });
}

export function parseNativeDocument(source: string): MystDocument {
  const document = parseTree(source);
  assertNativeDocument(document);
  serializeTree(document);
  return document;
}

export function serializeNativeDocument(document: MystDocument): string {
  assertNativeDocument(document);
  const markdown = serializeTree(document);
  assertNativeDocument(parseTree(markdown));
  return markdown;
}

export function createDocument(): MystDocument {
  return parseNativeDocument("---\nieumdoc: 1\n---\n");
}

export function canonicalWriteIssue(document: MystDocument): WriteIssue | undefined {
  try { serializeNativeDocument(document); return undefined; }
  catch (error) { return writeIssueOf(error); }
}

export function canonicalWriteError(document: MystDocument): string | undefined {
  return canonicalWriteIssue(document)?.reason;
}
