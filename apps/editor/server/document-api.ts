import { readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getEditableDocument,
  insertEquation,
  insertHeading,
  insertParagraph,
  parse,
  removeBlock,
  serialize,
  updateEquation,
  updateHeading,
  updateNodeTextAtPath,
  updateParagraphInlineContent,
  validateStructure,
  type Document,
  type EditableDocument,
  type InlineContent,
} from "@ieumdoc/core";
import type { BlockInsert, EquationEdit, HeadingEdit } from "../src/edits.ts";

export type TextEdit = {
  path: readonly number[];
  from: string;
  to: string;
};

export type ParagraphEdit = {
  path: readonly number[];
  content: InlineContent[];
};

const editorRoot = fileURLToPath(new URL("..", import.meta.url));
export const DOCUMENT_DIR = path.join(editorRoot, "document");
export const DOCUMENT_FILE = path.join(DOCUMENT_DIR, "per-block.md");

export type StructuralChange = {
  headings?: HeadingEdit[];
  equations?: EquationEdit[];
  insert?: BlockInsert;
  remove?: number;
};

export function loadEditableDocument(source: string): EditableDocument {
  return getEditableDocument(parse(source));
}

export function saveEdits(
  source: string,
  edits: TextEdit[],
  paragraphs: ParagraphEdit[] = [],
  structural: StructuralChange = {},
): { markdown: string; document: EditableDocument } {
  let document = parse(source);
  for (const edit of edits) {
    document = updateNodeTextAtPath(document, edit.path, edit.from, edit.to);
  }
  for (const paragraph of paragraphs) {
    document = updateParagraphInlineContent(document, paragraph.path, paragraph.content);
  }
  for (const heading of structural.headings ?? []) {
    document = updateHeading(document, heading.path, heading.text);
  }
  for (const equation of structural.equations ?? []) {
    document = updateEquation(document, equation.path, equation.latex);
  }
  if (structural.insert && structural.remove !== undefined) {
    throw new Error("saveEdits accepts only one structural change");
  }
  if (structural.insert) {
    document = applyInsert(document, structural.insert);
  }
  if (structural.remove !== undefined) {
    document = removeBlock(document, structural.remove);
  }
  validateStructure(document);
  const markdown = serialize(document);
  return { markdown, document: getEditableDocument(document) };
}

function applyInsert(document: Document, insert: BlockInsert): Document {
  if (insert.block === "paragraph") {
    const text = insert.text ?? "";
    // Canonical MyST parse drops a truly empty paragraph, so a new paragraph needs text.
    const seed = text.length > 0 ? text : " ";
    let next = insertParagraph(document, insert.index, seed);
    if (insert.content && insert.content.length > 0) {
      next = updateParagraphInlineContent(next, [insert.index], insert.content);
    }
    return next;
  }
  if (insert.block === "heading") {
    return insertHeading(document, insert.index, insert.text ?? "", insert.level ?? 1);
  }
  const latex = insert.latex ?? "x";
  return insertEquation(document, insert.index, latex);
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
      sendJson(res, 200, { document: loadEditableDocument(readFileSync(DOCUMENT_FILE, "utf8")) });
      return;
    }
    if (req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as {
        edits?: TextEdit[];
        paragraphs?: ParagraphEdit[];
        headings?: HeadingEdit[];
        equations?: EquationEdit[];
        insert?: BlockInsert;
        remove?: number;
      };
      const edits = Array.isArray(body.edits) ? body.edits : [];
      const paragraphs = Array.isArray(body.paragraphs) ? body.paragraphs : [];
      const saved = saveEdits(readFileSync(DOCUMENT_FILE, "utf8"), edits, paragraphs, {
        headings: Array.isArray(body.headings) ? body.headings : [],
        equations: Array.isArray(body.equations) ? body.equations : [],
        insert: body.insert,
        remove: Number.isInteger(body.remove) ? body.remove : undefined,
      });
      writeFileSync(DOCUMENT_FILE, saved.markdown);
      sendJson(res, 200, { document: saved.document });
      return;
    }
    res.statusCode = 405;
    res.end();
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
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
