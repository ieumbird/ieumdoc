import { readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getEditableDocument,
  parse,
  replaceEditableBlocks,
  serialize,
  validateStructure,
  type EditableDocument,
} from "@ieumdoc/core";

const editorRoot = fileURLToPath(new URL("..", import.meta.url));
export const DOCUMENT_DIR = path.join(editorRoot, "document");
export const DOCUMENT_FILE = path.join(DOCUMENT_DIR, "technical-document.md");

export function loadEditableDocument(source: string): EditableDocument {
  return getEditableDocument(parse(source));
}

/** Tiptap JSON is converted in apps/editor and never becomes a Core API type. */
export function saveEditorDocument(
  source: string,
  editable: EditableDocument,
): { markdown: string; document: EditableDocument } {
  const document = replaceEditableBlocks(parse(source), editable);
  validateStructure(document);
  const markdown = serialize(document);
  const reparsed = parse(markdown);
  validateStructure(reparsed);
  return { markdown, document: getEditableDocument(reparsed) };
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
      const body = JSON.parse(await readBody(req)) as { document?: EditableDocument };
      if (!body.document) throw new Error("POST /api/document requires a semantic document");
      const saved = saveEditorDocument(readFileSync(DOCUMENT_FILE, "utf8"), body.document);
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
