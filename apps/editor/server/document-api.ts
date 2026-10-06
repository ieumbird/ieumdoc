import { createHash, randomUUID } from "node:crypto";
import fs, { readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, serialize, type EditableDocument } from "@ieumdoc/core";
import {
  applyBlockSource,
  readModel,
  SaveContentError,
  saveEdits,
  validateFigureRequest,
} from "./document-replay.ts";

import type {
  BlockSourceRequest,
  SaveRequest,
  DocumentFileResponse,
  SaveResponse,
  SourceResponse,
  DocumentErrorResponse,
} from "../shared/document-protocol.ts";
export type {
  HeadingEdit,
  HeadingLevelEdit,
  ParagraphEdit,
  EquationEdit,
  FigureEdit,
  AdmonitionEdit,
  TableCellEdit,
  TableShapeEdit,
  ListEdit,
  CodeEdit,
  LabelEdit,
  QuoteEdit,
  InsertEdit,
  OrderItem,
  SupportedEdits,
  SaveRequest,
  DocumentFileResponse,
} from "../shared/document-protocol.ts";
export { applyBlockSource, loadEditableDocument, saveEdits, validateFigureRequest } from "./document-replay.ts";

function errorPayload(error: unknown): DocumentErrorResponse {
  return { error: error instanceof Error ? error.message : String(error),
    ...(error instanceof SaveContentError && error.target ? { target: error.target } : {}) };
}

export const DOCUMENT_CONFLICT_MESSAGE = "Document changed outside the editor. Your edits are kept. Use Source to copy applied content, or Reload to discard local changes and open the disk version.";

const EMPTY_DOCUMENT_MARKDOWN = serialize(parse(""));

export class DocumentConflictError extends Error {
  constructor() {
    super(DOCUMENT_CONFLICT_MESSAGE);
    this.name = "DocumentConflictError";
  }
}

const editorRoot = fileURLToPath(new URL("..", import.meta.url));

export const DOCUMENT_DIR = path.join(editorRoot, "document");

const DEFAULT_DOCUMENT_PATH = path.join(DOCUMENT_DIR, "technical-document.md");

export function resolveDocumentPath(requestedPath?: string): string {
  const candidate = requestedPath?.trim() || DEFAULT_DOCUMENT_PATH;
  const resolved = path.resolve(candidate);
  if (path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("document path must point to a .md file");
  }
  return resolved;
}

export function documentRevision(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function loadDocumentFile(requestedPath?: string): DocumentFileResponse {
  const filePath = resolveDocumentPath(requestedPath);
  const source = readFileSync(filePath, "utf8");
  return { path: filePath, source, ...readModel(source), revision: documentRevision(source) };
}

export function createDocumentFile(requestedPath?: string): DocumentFileResponse {
  if (!requestedPath?.trim()) {
    throw new Error("document path is required");
  }
  const filePath = resolveDocumentPath(requestedPath);
  const parentDirectory = path.dirname(filePath);
  try {
    if (!statSync(parentDirectory).isDirectory()) {
      throw new Error("parent directory does not exist");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "parent directory does not exist") throw error;
    throw new Error("parent directory does not exist");
  }
  try {
    writeFileSync(filePath, EMPTY_DOCUMENT_MARKDOWN, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("file already exists");
    }
    throw error;
  }
  return loadDocumentFile(filePath);
}

export function saveDocumentFile(
  requestedPath: string | undefined,
  request: SaveRequest,
): DocumentFileResponse & { markdown: string } {
  const filePath = resolveDocumentPath(requestedPath);
  const saved = commitDocumentSave(
    () => readFileSync(filePath, "utf8"),
    (markdown) => replaceDocumentFile(filePath, markdown, request.revision),
    request,
  );
  return { ...saved, source: saved.markdown, path: filePath };
}

/** Finish writing beside the destination before replacing it; a failed write keeps the original. */
function replaceDocumentFile(filePath: string, markdown: string, revision: string | undefined): void {
  // Preserve a symlink itself by replacing its resolved target.
  const target = fs.realpathSync(filePath);
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, markdown, { encoding: "utf8", flag: "wx", mode: statSync(target).mode });
    if (documentRevision(readFileSync(target, "utf8")) !== revision) throw new DocumentConflictError();
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/**
 * The canonical Markdown this save request would write, through the same Core
 * save path. The file is only read, never written.
 */
export function previewDocumentFile(requestedPath: string | undefined, request: SaveRequest): SourceResponse {
  const filePath = resolveDocumentPath(requestedPath);
  if (request.base) {
    // A preview describes this session, even after an external conflict. Validate its
    // acknowledged revision without writing or requiring the disk to remain unchanged.
    const previous = request.base.savedEdits
      ? saveEdits(request.base.source, request.base.savedEdits).markdown : request.base.source;
    return { markdown: saveCurrentDocument(previous, request).markdown };
  }
  return { markdown: saveCurrentDocument(readFileSync(filePath, "utf8"), request).markdown };
}

export function saveCurrentDocument(
  source: string,
  request: SaveRequest,
): { markdown: string; document: EditableDocument; writeError: string | null; revision: string } {
  if (request.revision !== documentRevision(source)) {
    throw new DocumentConflictError();
  }
  const base = sessionSource(source, request);
  const saved = saveEdits(base, {
    sources: request.sources ?? [],
    headings: request.headings ?? [],
    headingLevels: request.headingLevels ?? [],
    paragraphs: request.paragraphs ?? [],
    equations: request.equations ?? [],
    figures: request.figures ?? [],
    cells: request.cells ?? [],
    ...(request.headingNumbering === undefined ? {} : { headingNumbering: request.headingNumbering }),
    tables: request.tables ?? [],
    tableCaptions: request.tableCaptions ?? [],
    admonitions: request.admonitions ?? [],
    quotes: request.quotes ?? [],
    lists: request.lists ?? [],
    codes: request.codes ?? [],
    labels: request.labels ?? [],
    splits: request.splits ?? [],
    merges: request.merges ?? [],
    inserts: request.inserts ?? [],
    deletes: request.deletes ?? [],
    order: request.order,
  });
  return { ...saved, revision: documentRevision(saved.markdown) };
}

function sessionSource(source: string, request: SaveRequest): string {
  if (request.base === undefined) return source;
  const base = request.base;
  if (!base || typeof base.source !== "string") throw new Error("invalid session source");
  // This is not a raw Markdown replacement API. A different baseline is accepted only
  // when replaying the previously saved Core operations reproduces the actual file.
  if (base.source !== source && (!base.savedEdits || saveEdits(base.source, base.savedEdits).markdown !== source)) {
    throw new DocumentConflictError();
  }
  return base.source;
}

export function commitDocumentSave(
  readSource: () => string,
  writeSource: (markdown: string) => void,
  request: SaveRequest,
): { markdown: string; document: EditableDocument; writeError: string | null; revision: string } {
  const source = readSource();
  const saved = saveCurrentDocument(source, request);
  writeSource(saved.markdown);
  return saved;
}

export async function handleDocumentRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): Promise<void> {
  const requestUrl = new URL(req.url ?? "", "http://localhost");
  const url = requestUrl.pathname;
  if (url.startsWith("/document/")) {
    serveMedia(url.slice("/document/".length), res, requestUrl.searchParams.get("path") ?? undefined);
    return;
  }
  if (url === "/api/figure-validation") {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      sendJson(res, 200, { error: validateFigureRequest(JSON.parse(await readBody(req))) ?? null });
    } catch (error) {
      sendJson(res, 400, errorPayload(error));
    }
    return;
  }
  if (url === "/api/block-source") {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      sendJson(res, 200, applyBlockSource(JSON.parse(await readBody(req)) as BlockSourceRequest));
    } catch (error) {
      sendJson(res, 400, errorPayload(error));
    }
    return;
  }
  if (url === "/api/document-source") {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      const body = JSON.parse(await readBody(req)) as SaveRequest;
      sendJson(res, 200, previewDocumentFile(typeof body.path === "string" ? body.path : undefined, saveRequestOf(body)));
    } catch (error) {
      sendJson(res, error instanceof DocumentConflictError ? 409 : 400, errorPayload(error));
    }
    return;
  }
  if (url !== "/api/document") {
    next();
    return;
  }

  try {
    if (req.method === "GET") {
      sendJson(res, 200, loadDocumentFile(requestUrl.searchParams.get("path") ?? undefined));
      return;
    }
    if (req.method === "PUT") {
      const body = JSON.parse(await readBody(req)) as { path?: unknown };
      const created = createDocumentFile(typeof body.path === "string" ? body.path : undefined);
      sendJson(res, 201, created);
      return;
    }
    if (req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as SaveRequest;
      try {
        const saved = saveDocumentFile(typeof body.path === "string" ? body.path : undefined, saveRequestOf(body));
        sendJson(res, 200, { path: saved.path, document: saved.document, revision: saved.revision, writeError: saved.writeError } satisfies SaveResponse);
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
    sendJson(res, 400, errorPayload(error));
  }
}

function saveRequestOf(body: SaveRequest): SaveRequest {
  return {
    revision: body.revision,
    base: body.base,
    sources: Array.isArray(body.sources) ? body.sources : [],
    headings: Array.isArray(body.headings) ? body.headings : [],
    headingLevels: Array.isArray(body.headingLevels) ? body.headingLevels : [],
    paragraphs: Array.isArray(body.paragraphs) ? body.paragraphs : [],
    equations: Array.isArray(body.equations) ? body.equations : [],
    figures: Array.isArray(body.figures) ? body.figures : [],
    cells: Array.isArray(body.cells) ? body.cells : [],
    ...(body.headingNumbering === undefined ? {} : { headingNumbering: body.headingNumbering }),
    tables: Array.isArray(body.tables) ? body.tables : [],
    tableCaptions: Array.isArray(body.tableCaptions) ? body.tableCaptions : [],
    admonitions: Array.isArray(body.admonitions) ? body.admonitions : [],
    quotes: Array.isArray(body.quotes) ? body.quotes : [],
    lists: Array.isArray(body.lists) ? body.lists : [],
    codes: Array.isArray(body.codes) ? body.codes : [],
    labels: Array.isArray(body.labels) ? body.labels : [],
    splits: Array.isArray(body.splits) ? body.splits : [],
    merges: Array.isArray(body.merges) ? body.merges : [],
    inserts: Array.isArray(body.inserts) ? body.inserts : [],
    deletes: Array.isArray(body.deletes) ? body.deletes : [],
    order: body.order,
  };
}

export function resolveMediaPath(assetPath: string, documentPath?: string): string {
  const decodedPath = decodeURIComponent(assetPath);
  const documentFile = resolveDocumentPath(documentPath);
  const documentDirectory = path.dirname(documentFile);
  if (!decodedPath || decodedPath.includes("\0") || path.isAbsolute(decodedPath) || path.win32.isAbsolute(decodedPath) || /^[A-Za-z]:/.test(decodedPath)) {
    throw new Error("media path must be relative to the document");
  }
  if (/%(?:2e|2f|5c|00)/i.test(decodedPath)) {
    throw new Error("media path escapes the document directory");
  }
  const resolved = path.resolve(documentDirectory, decodedPath);
  const relative = path.relative(documentDirectory, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("media path escapes the document directory");
  }
  // Existing media (and the nearest existing parent) must also stay inside the real boundary.
  const root = fs.realpathSync(documentDirectory);
  let existing = resolved;
  while (!fs.existsSync(existing) && existing !== documentDirectory) existing = path.dirname(existing);
  const actual = path.relative(root, fs.realpathSync(existing));
  if (actual === ".." || actual.startsWith(`..${path.sep}`) || path.isAbsolute(actual)) {
    throw new Error("media symlink escapes the document directory");
  }
  return resolved;
}

function serveMedia(assetPath: string, res: ServerResponse, documentPath?: string): void {
  let file: string;
  try {
    file = resolveMediaPath(assetPath, documentPath);
  } catch {
    res.statusCode = 400;
    res.end();
    return;
  }
  try {
    const data = readFileSync(file);
    res.statusCode = 200;
    res.setHeader("Content-Type", path.extname(file).toLowerCase() === ".svg" ? "image/svg+xml" : path.extname(file).toLowerCase() === ".png" ? "image/png" : "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
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
