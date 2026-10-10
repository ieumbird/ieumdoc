import fs, { readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, serialize } from "@ieumdoc/core";
import { commitFile, FileChangedError, textRevision } from "@ieumdoc/file-commit";
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
  SupportedEdits,
  DocumentFileResponse,
  SaveResponse,
  SourceResponse,
  DocumentErrorResponse,
  FolderBrowseResponse,
  FolderCrumb,
  FolderEntry,
  FolderPlacesResponse,
  FolderResponse,
} from "../shared/document-protocol.ts";

/** Internal file helpers may replay directly against a supplied disk snapshot. HTTP always requires a session. */
type FileSaveRequest = SupportedEdits & { revision?: string; base?: SaveRequest["base"] };

function errorPayload(error: unknown): DocumentErrorResponse {
  return { error: error instanceof Error ? error.message : String(error),
    ...(error instanceof SaveContentError && error.target ? { target: error.target } : {}) };
}

export const DOCUMENT_CONFLICT_MESSAGE = "Document changed outside the editor. Your edits are kept. Use Source to copy applied content, or Reload to discard local changes and open the disk version.";

const EMPTY_DOCUMENT_MARKDOWN = serialize(parse(""));

const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};

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

export const documentRevision = textRevision;

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
  request: FileSaveRequest,
): SaveResponse & { path: string; markdown: string } {
  const filePath = resolveDocumentPath(requestedPath);
  const saved = commitDocumentSave(
    () => readFileSync(filePath, "utf8"),
    (markdown) => replaceDocumentFile(filePath, markdown, request.revision),
    request,
  );
  return { ...saved, path: filePath };
}

/** The shared file commit; a failed write keeps the original. */
function replaceDocumentFile(filePath: string, markdown: string, revision: string | undefined): void {
  if (revision === undefined) throw new DocumentConflictError();
  try {
    commitFile(filePath, markdown, revision);
  } catch (error) {
    if (error instanceof FileChangedError) throw new DocumentConflictError();
    throw error;
  }
}

/**
 * The canonical Markdown this save request would write, through the same Core
 * save path. The file is only read, never written.
 */
export function previewDocumentFile(requestedPath: string | undefined, request: FileSaveRequest): SourceResponse {
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
  request: FileSaveRequest,
): { markdown: string; revision: string } {
  if (request.revision !== documentRevision(source)) {
    throw new DocumentConflictError();
  }
  const base = sessionSource(source, request);
  const saved = saveEdits(base, request);
  return { ...saved, revision: documentRevision(saved.markdown) };
}

function sessionSource(source: string, request: FileSaveRequest): string {
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
  request: FileSaveRequest,
): { markdown: string; revision: string } {
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
      const request = saveRequestOf(JSON.parse(await readBody(req)));
      sendJson(res, 200, previewDocumentFile(request.path, request));
    } catch (error) {
      sendJson(res, error instanceof DocumentConflictError ? 409 : 400, errorPayload(error));
    }
    return;
  }
  if (url === "/api/folder-browse" || url === "/api/folder-places") {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      sendJson(res, 200, url === "/api/folder-places" ? folderPlaces() : browseFolder(requestUrl.searchParams.get("path") ?? undefined));
    } catch (error) {
      sendJson(res, 400, errorPayload(error));
    }
    return;
  }
  if (url === "/api/folder") {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      sendJson(res, 200, listFolder(requestUrl.searchParams.get("root") ?? undefined, requestUrl.searchParams.get("path") ?? undefined));
    } catch (error) {
      sendJson(res, 400, errorPayload(error));
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
      const request = saveRequestOf(JSON.parse(await readBody(req)));
      try {
        const saved = saveDocumentFile(request.path, request);
        sendJson(res, 200, { revision: saved.revision } satisfies SaveResponse);
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

function saveRequestOf(value: unknown): SaveRequest {
  if (!isObject(value) || typeof value.path !== "string" || !value.path.trim()) throw new Error("document path is required");
  if (typeof value.revision !== "string" || !/^[a-f0-9]{64}$/.test(value.revision)) throw new Error("invalid document revision");
  if (!isObject(value.base) || typeof value.base.source !== "string") throw new Error("invalid session source");
  const savedEdits = value.base.savedEdits === undefined ? undefined : supportedEditsOf(value.base.savedEdits);
  return { ...supportedEditsOf(value), path: value.path, revision: value.revision,
    base: { source: value.base.source, ...(savedEdits === undefined ? {} : { savedEdits }) } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function supportedEditsOf(value: unknown): SupportedEdits {
  if (!isObject(value)) throw new Error("invalid session edits");
  for (const key of ["sources", "headings", "headingLevels", "paragraphs", "equations", "figures", "cells", "tables", "tableCaptions",
    "admonitions", "quotes", "footnotes", "lists", "codes", "labels", "splits", "merges", "inserts", "deletes", "order"] as const) {
    if (value[key] !== undefined && !Array.isArray(value[key])) throw new Error(`invalid ${key} edits`);
  }
  if (value.headingNumbering !== undefined && typeof value.headingNumbering !== "boolean") throw new Error("invalid heading numbering");
  return value as SupportedEdits;
}

const entryOrder = new Intl.Collator(undefined, { numeric: true });

/**
 * One level of a folder the user chose. Only regular folders and regular `.md` files are listed:
 * hidden entries and symlinks are left out, and a requested folder must stay inside the chosen
 * one, symlinks resolved. Nothing is remembered between requests.
 */
export function listFolder(requestedRoot: string | undefined, requestedPath?: string): FolderResponse {
  if (!requestedRoot?.trim()) throw new Error("folder path is required");
  const root = path.resolve(requestedRoot.trim());
  const folder = requestedPath?.trim() ? path.resolve(requestedPath.trim()) : root;
  if (!isInside(root, folder)) throw new Error("folder is outside the chosen folder");
  return readFolder(folder, () => {
    if (!isInside(fs.realpathSync(root), fs.realpathSync(folder))) throw new Error("folder symlink escapes the chosen folder");
    return { root, path: folder, ...(path.relative(root, folder) === "" ? {} : { parent: path.dirname(folder) }) };
  });
}

/**
 * One level of any folder, for choosing which folder to open: the same entries as `listFolder`,
 * and the folders from the filesystem root down to it. Only names are returned, never content.
 */
export function browseFolder(requestedPath: string | undefined): FolderBrowseResponse {
  if (!requestedPath?.trim()) throw new Error("folder path is required");
  const folder = path.resolve(requestedPath.trim());
  return readFolder(folder, () => {
    const crumbs: FolderCrumb[] = [];
    for (let current = folder; ; current = path.dirname(current)) {
      const root = path.dirname(current) === current;
      crumbs.unshift({ name: root ? current.replace(/[\\/]+$/, "") || current : path.basename(current), path: current });
      if (root) break;
    }
    return { path: folder, crumbs };
  });
}

/** Where choosing a folder can start: the home and Documents folders, then each drive or `/`. */
export function folderPlaces(): FolderPlacesResponse {
  const home = os.homedir();
  const documents = path.join(home, "Documents");
  const drives = process.platform === "win32"
    ? [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map(letter => `${letter}:\\`).filter(drive => fs.existsSync(drive))
    : ["/"];
  return {
    places: [
      { kind: "home", name: "Home", path: home },
      ...(isDirectory(documents) ? [{ kind: "documents" as const, name: "Documents", path: documents }] : []),
      ...drives.map(drive => ({ kind: "drive" as const, name: drive, path: drive })),
    ],
  };
}

function isDirectory(candidate: string): boolean {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

/** Reads one level after `check` accepts the folder; filesystem failures become plain messages. */
function readFolder<T>(folder: string, check: () => T): T & { entries: FolderEntry[] } {
  try {
    if (!statSync(folder).isDirectory()) throw new Error("folder path must point to a directory");
    const result = check();
    const entries = fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry): FolderEntry[] => {
      if (entry.name.startsWith(".")) return [];
      const kind = entry.isDirectory() ? "folder" : entry.isFile() && path.extname(entry.name).toLowerCase() === ".md" ? "document" : undefined;
      return kind ? [{ name: entry.name, kind, path: path.join(folder, entry.name) }] : [];
    });
    entries.sort((a, b) => (a.kind === b.kind ? entryOrder.compare(a.name, b.name) : a.kind === "folder" ? -1 : 1));
    return { ...result, entries };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new Error("folder does not exist");
    if (code === "ENOTDIR") throw new Error("folder path must point to a directory");
    if (code === "EACCES" || code === "EPERM") throw new Error("folder cannot be read: permission denied");
    throw error;
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return !(relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
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
    res.setHeader("Content-Type", MEDIA_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
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
