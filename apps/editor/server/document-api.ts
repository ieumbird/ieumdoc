import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getEditableDocument,
  parse,
  serialize,
  splitParagraph,
  updateNodeTextAtPath,
  updateParagraphInlineContent,
  validateStructure,
  type EditableBlock,
  type EditableDocument,
  type InlineContent,
  type NodePath,
} from "@ieumdoc/core";

export type HeadingEdit = {
  path: NodePath;
  from: string;
  to: string;
};

export type ParagraphEdit = {
  path: NodePath;
  content: InlineContent[];
};

export type SupportedEdits = {
  headings?: HeadingEdit[];
  paragraphs?: ParagraphEdit[];
  splits?: { path: NodePath; parts: InlineContent[][] }[];
};

export type SaveRequest = SupportedEdits & {
  revision?: string;
};

export const DOCUMENT_CONFLICT_MESSAGE = "Document changed outside the editor. Reload before saving.";

export class DocumentConflictError extends Error {
  constructor() {
    super(DOCUMENT_CONFLICT_MESSAGE);
    this.name = "DocumentConflictError";
  }
}

const editorRoot = fileURLToPath(new URL("..", import.meta.url));
export const DOCUMENT_DIR = path.join(editorRoot, "document");
export const DOCUMENT_FILE = path.join(DOCUMENT_DIR, "technical-document.md");

export function loadEditableDocument(source: string): EditableDocument {
  return getEditableDocument(parse(source));
}

export function documentRevision(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function saveCurrentDocument(
  source: string,
  request: SaveRequest,
): { markdown: string; document: EditableDocument; revision: string } {
  if (request.revision !== documentRevision(source)) {
    throw new DocumentConflictError();
  }
  const saved = saveEdits(source, {
    headings: request.headings ?? [],
    paragraphs: request.paragraphs ?? [],
    splits: request.splits ?? [],
  });
  return { ...saved, revision: documentRevision(saved.markdown) };
}

export function commitDocumentSave(
  readSource: () => string,
  writeSource: (markdown: string) => void,
  request: SaveRequest,
): { markdown: string; document: EditableDocument; revision: string } {
  const source = readSource();
  const saved = saveCurrentDocument(source, request);
  writeSource(saved.markdown);
  return saved;
}

export function saveEdits(
  source: string,
  edits: SupportedEdits,
): { markdown: string; document: EditableDocument } {
  const editable = loadEditableDocument(source);
  let document = parse(source);
  for (const edit of edits.headings ?? []) {
    assertPath(edit.path, "heading");
    const block = blockAt(editable, edit.path);
    if (block?.block !== "heading" || !block.editable) {
      throw new Error(`heading edit is not allowed at [${edit.path.join(",")}]`);
    }
    if (edit.from !== block.text) {
      throw new Error(`heading text does not match at [${edit.path.join(",")}]`);
    }
    if (edit.to.length === 0) {
      throw new Error("empty heading text cannot be saved");
    }
    document = updateNodeTextAtPath(document, edit.path, edit.from, edit.to);
  }
  for (const paragraph of edits.paragraphs ?? []) {
    assertPath(paragraph.path, "paragraph");
    const block = blockAt(editable, paragraph.path);
    if (block?.block !== "paragraph" || !block.editable) {
      throw new Error(`paragraph edit is not allowed at [${paragraph.path.join(",")}]`);
    }
    if (inlineText(paragraph.content).length === 0) {
      throw new Error("empty paragraph cannot be saved");
    }
    document = updateParagraphInlineContent(document, paragraph.path, paragraph.content);
  }
  const splits = edits.splits ?? [];
  const seen = new Set<number>();
  for (const split of splits) {
    assertPath(split.path, "split");
    const block = blockAt(editable, split.path);
    if (split.path.length !== 1 || block?.block !== "paragraph" || !block.editable ||
        !Array.isArray(split.parts) || split.parts.length < 2 || seen.has(split.path[0]) ||
        (edits.paragraphs ?? []).some(edit => edit.path.join(",") === split.path.join(","))) {
      throw new Error("invalid paragraph split");
    }
    seen.add(split.path[0]);
  }
  // Descending snapshot paths keep subsequent targets unchanged. Core owns both
  // inline replacement and splitting; the Editor never reconstructs the AST.
  for (const split of [...splits].sort((a, b) => b.path[0] - a.path[0])) {
    document = updateParagraphInlineContent(document, split.path, split.parts.flat());
    const lengths = split.parts.map(part => inlineText(part).length);
    let offset = lengths.reduce((sum, length) => sum + length, 0);
    for (let index = lengths.length - 1; index > 0; index--) {
      offset -= lengths[index];
      document = splitParagraph(document, split.path, offset);
    }
  }
  validateStructure(document);
  const markdown = serialize(document);
  return { markdown, document: getEditableDocument(parse(markdown)) };
}

export async function handleDocumentRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): Promise<void> {
  const url = req.url?.split("?")[0] ?? "";
  if (url.startsWith("/document/")) {
    serveMedia(url, res);
    return;
  }
  if (url !== "/api/document") {
    next();
    return;
  }

  try {
    if (req.method === "GET") {
      const source = readFileSync(DOCUMENT_FILE, "utf8");
      sendJson(res, 200, {
        document: loadEditableDocument(source),
        revision: documentRevision(source),
      });
      return;
    }
    if (req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as SaveRequest;
      try {
        const saved = commitDocumentSave(
          () => readFileSync(DOCUMENT_FILE, "utf8"),
          (markdown) => writeFileSync(DOCUMENT_FILE, markdown),
          {
            revision: body.revision,
            headings: Array.isArray(body.headings) ? body.headings : [],
            paragraphs: Array.isArray(body.paragraphs) ? body.paragraphs : [],
            splits: Array.isArray(body.splits) ? body.splits : [],
          },
        );
        sendJson(res, 200, { document: saved.document, revision: saved.revision });
      } catch (error) {
        if (error instanceof DocumentConflictError) {
          sendJson(res, 409, { error: error.message });
          return;
        }
        throw error;
      }
      return;
    }
    res.statusCode = 405;
    res.end();
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}

function blockAt(document: EditableDocument, path: NodePath): EditableBlock | undefined {
  return document.blocks.find(
    (block) => block.path.length === path.length && block.path.every((part, index) => part === path[index]),
  );
}

function assertPath(path: NodePath, label: string): void {
  if (!Array.isArray(path) || path.length === 0 || path.some((index) => !Number.isInteger(index) || index < 0)) {
    throw new Error(`${label} path is invalid`);
  }
}

function inlineText(content: InlineContent[]): string {
  if (!Array.isArray(content)) return "";
  return content.map((item) => (item.kind === "text" ? item.text : item.kind === "break" ? "\n" : inlineText(item.children))).join("");
}

function serveMedia(url: string, res: ServerResponse): void {
  const name = path.basename(url);
  if (name !== url.slice("/document/".length) || name.includes("..")) {
    res.statusCode = 400;
    res.end();
    return;
  }
  const file = path.join(DOCUMENT_DIR, name);
  try {
    const data = readFileSync(file);
    res.statusCode = 200;
    res.setHeader("Content-Type", name.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream");
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end();
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
