import fs, { readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { createDocument, hasNativeMarker, serialize, NativeDocumentError, writeIssueOf } from "@ieumdoc/core";
import { assertUnicode, commitFile, decodeUtf8, FileChangedError, textRevision } from "@ieumdoc/file-commit";
import { accessPath, fileErrorMessage, fileErrorStatus, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import { readRequestBody, RequestBodyError } from "./request-body.ts";
import { requestQuery } from "./request-query.ts";
import { resolveDocumentPath, resolveMediaPath } from "./document-path.ts";
export { DOCUMENT_DIR, resolveDocumentPath, resolveMediaPath } from "./document-path.ts";
import {
  readModel,
  SaveContentError,
  saveEdits,
  validateFigureRequest,
} from "./document-replay.ts";

import type {
  SaveRequest,
  SupportedEdits,
  DocumentFileResponse,
  SaveResponse,
  SourceResponse,
  DocumentErrorResponse,
  FolderBrowseResponse,
  FolderCreateResponse,
  FolderCrumb,
  FolderEntry,
  FolderPlacesResponse,
  FolderResponse,
} from "../shared/document-protocol.ts";
import type { SaveFailure } from "../shared/save-error.ts";

/** Internal file helpers may replay directly against a supplied disk snapshot. HTTP always requires a session. */
type FileSaveRequest = SupportedEdits & { revision?: string; base?: SaveRequest["base"] };

function errorPayload(error: unknown, access: FileAccess = LOCAL_FILE_ACCESS): DocumentErrorResponse {
  return { error: error instanceof NativeDocumentError ? error.message : fileErrorMessage(error instanceof SaveContentError && error.phase === "file" ? error.cause ?? error : error, access),
    ...(error instanceof NativeDocumentError ? { code: error.code, issue: writeIssueOf(error) } : {}),
    ...(error instanceof SaveContentError ? { target: error.target, failure: {
      phase: error.phase, action: error.action, target: error.target, block: error.block, cell: error.cell, line: error.line,
    } } : {}),
    ...(error instanceof DocumentConflictError ? { failure: { phase: "revision", action:
      "Keep editing, or copy applied content from Source. Reload only when you are ready to discard local changes." } satisfies SaveFailure } : {}),
  };
}

function fileStep<T>(apply: () => T): T {
  try { return apply(); }
  catch (error) {
    if (error instanceof DocumentConflictError) throw error;
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const action = code === "EACCES" || code === "EPERM" ? "Check file/folder write permission and whether another application has locked the file."
      : code === "ENOSPC" ? "Free disk space before trying to save again."
      : code === "EROFS" ? "The filesystem is read-only. Use a writable location."
      : code === "ENOENT" ? "Check that the document and its parent folder still exist."
      : "Check the document location, file permissions and available disk space. If the problem persists, report this error.";
    throw new SaveContentError(error instanceof Error ? error.message : String(error), undefined, { phase: "file", action, cause: error });
  }
}

export const DOCUMENT_CONFLICT_MESSAGE = "Document changed outside the editor. Your edits are kept. Use Source to copy applied content, or Reload to discard local changes and open the disk version.";

const EMPTY_DOCUMENT_MARKDOWN = serialize(createDocument());

/** Media a document can show from beside it, by extension; also what choosing an image lists. */
export const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};

export class DocumentConflictError extends Error {
  constructor() {
    super(DOCUMENT_CONFLICT_MESSAGE);
    this.name = "DocumentConflictError";
  }
}

export const documentRevision = textRevision;

export function loadDocumentFile(requestedPath?: string, access: FileAccess = LOCAL_FILE_ACCESS): DocumentFileResponse {
  const filePath = resolveDocumentPath(requestedPath, access);
  const source = decodeUtf8(readFileSync(filePath));
  return { path: filePath, source, ...readModel(source), revision: documentRevision(source) };
}

export function createDocumentFile(requestedPath?: string, access: FileAccess = LOCAL_FILE_ACCESS): DocumentFileResponse {
  if (!requestedPath?.trim()) {
    throw new Error("document path is required");
  }
  const filePath = resolveDocumentPath(requestedPath, access, true);
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
    writeFileSync(accessPath(filePath, access, true), EMPTY_DOCUMENT_MARKDOWN, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("file already exists");
    }
    throw error;
  }
  return loadDocumentFile(filePath, access);
}

export function saveDocumentFile(
  requestedPath: string | undefined,
  request: FileSaveRequest,
  access: FileAccess = LOCAL_FILE_ACCESS,
): SaveResponse & { path: string; markdown: string } {
  const filePath = fileStep(() => resolveDocumentPath(requestedPath, access));
  const saved = commitDocumentSave(
    () => fileStep(() => decodeUtf8(readFileSync(accessPath(filePath, access)))),
    (markdown) => fileStep(() => replaceDocumentFile(accessPath(filePath, access), markdown, request.revision)),
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
export function previewDocumentFile(requestedPath: string | undefined, request: FileSaveRequest, access: FileAccess = LOCAL_FILE_ACCESS): SourceResponse {
  const filePath = resolveDocumentPath(requestedPath, access);
  if (request.base) {
    // A preview describes this session, even after an external conflict. Validate its
    // acknowledged revision without writing or requiring the disk to remain unchanged.
    const previous = request.base.savedEdits
      ? saveEdits(request.base.source, request.base.savedEdits).markdown : request.base.source;
    return { markdown: saveCurrentDocument(previous, request).markdown };
  }
  return { markdown: saveCurrentDocument(decodeUtf8(readFileSync(filePath)), request).markdown };
}

export function saveCurrentDocument(
  source: string,
  request: FileSaveRequest,
): { markdown: string; revision: string } {
  if (request.revision !== documentRevision(source)) {
    throw new DocumentConflictError();
  }
  const base = sessionSource(source, request);
  let saved: { markdown: string };
  try { saved = saveEdits(base, request); }
  catch (error) {
    if (error instanceof SaveContentError) throw error;
    throw new SaveContentError(error instanceof Error ? error.message : String(error), undefined, { cause: error });
  }
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
  access: FileAccess = LOCAL_FILE_ACCESS,
  bodyLimit = Infinity,
): Promise<void> {
  const readBody = async (request: IncomingMessage) => decodeUtf8(await readRequestBody(request, bodyLimit));
  const failure = (error: unknown) => sendJson(res,
    error instanceof DocumentConflictError ? 409 : error instanceof RequestBodyError ? error.status
      : fileErrorStatus(error instanceof SaveContentError && error.phase === "file" ? error.cause : error),
    errorPayload(error, access));
  let query: URLSearchParams;
  try { query = requestQuery(req.url ?? ""); }
  catch (error) { failure(error); return; }
  const url = new URL(req.url ?? "", "http://localhost").pathname;
  if (url.startsWith("/document/")) {
    if (req.method !== "GET" && req.method !== "HEAD") { res.statusCode = 405; res.end(); return; }
    serveMedia(url.slice("/document/".length), res, query.get("path") ?? undefined, access, req.method === "HEAD");
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
      failure(error);
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
      sendJson(res, 200, previewDocumentFile(request.path, request, access));
    } catch (error) {
      failure(error);
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
      sendJson(res, 200, url === "/api/folder-places" ? folderPlaces(access)
        : browseFolder(query.get("path") ?? undefined, access, query.get("files") === "image" ? "image" : "document"));
    } catch (error) {
      failure(error);
    }
    return;
  }
  if (url === "/api/folder") {
    if (req.method !== "GET" && req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      if (req.method === "POST") {
        const body = JSON.parse(await readBody(req)) as { parent?: unknown; name?: unknown };
        sendJson(res, 201, createFolder(typeof body.parent === "string" ? body.parent : undefined, typeof body.name === "string" ? body.name : undefined, access));
        return;
      }
      sendJson(res, 200, listFolder(query.get("root") ?? undefined, query.get("path") ?? undefined, access));
    } catch (error) {
      failure(error);
    }
    return;
  }
  if (url !== "/api/document") {
    next();
    return;
  }

  try {
    if (req.method === "GET") {
      const requestedPath = query.get("path") ?? undefined;
      if (access && !requestedPath?.trim()) {
        sendJson(res, 200, { start: true, allowedRoots: access.roots });
      } else sendJson(res, 200, loadDocumentFile(requestedPath, access));
      return;
    }
    if (req.method === "PUT") {
      const body = JSON.parse(await readBody(req)) as { path?: unknown };
      const created = createDocumentFile(typeof body.path === "string" ? body.path : undefined, access);
      sendJson(res, 201, created);
      return;
    }
    if (req.method === "POST") {
      const request = saveRequestOf(JSON.parse(await readBody(req)));
      try {
        const saved = saveDocumentFile(request.path, request, access);
        sendJson(res, 200, { revision: saved.revision } satisfies SaveResponse);
      } catch (error) {
        if (error instanceof DocumentConflictError) {
          sendJson(res, 409, errorPayload(error, access));
          return;
        }
        throw error;
      }
      return;
    }
    res.statusCode = 405;
    res.end();
  } catch (error) {
    failure(error);
  }
}

function saveRequestOf(value: unknown): SaveRequest {
  if (!isObject(value) || typeof value.path !== "string" || !value.path.trim()) throw new Error("document path is required");
  const { path, revision, base, ...edits } = value;
  if (typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision)) throw new Error("invalid document revision");
  if (!isObject(base) || typeof base.source !== "string") throw new Error("invalid session source");
  const savedEdits = base.savedEdits === undefined ? undefined : supportedEditsOf(base.savedEdits);
  return { ...supportedEditsOf(edits), path, revision,
    base: { source: base.source, ...(savedEdits === undefined ? {} : { savedEdits }) } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function supportedEditsOf(value: unknown): SupportedEdits {
  if (!isObject(value)) throw new Error("invalid session edits");
  const arrayFields = ["headings", "headingLevels", "paragraphs", "equations", "figures", "cells", "tables", "tableCaptions",
    "admonitions", "quotes", "footnotes", "lists", "codes", "labels", "splits", "merges", "inserts", "deletes", "order"] as const;
  for (const key of Object.keys(value)) {
    if (key !== "headingNumbering" && !arrayFields.some(field => field === key)) throw new Error(`invalid ${key} edits`);
  }
  for (const key of arrayFields) {
    if (value[key] !== undefined && !Array.isArray(value[key])) throw new Error(`invalid ${key} edits`);
  }
  if (value.headingNumbering !== undefined && typeof value.headingNumbering !== "boolean") throw new Error("invalid heading numbering");
  return value as SupportedEdits;
}

const entryOrder = new Intl.Collator(undefined, { numeric: true });

/**
 * One level of a folder the user chose. Only regular folders and regular `.md` files are listed:
 * hidden entries and symlinks are left out, and a requested folder must stay inside the chosen
 * one, symlinks resolved. Each document says whether its leading frontmatter carries the native
 * marker, so the tree can set apart files IeumDoc will not open. Nothing is remembered between requests.
 */
export function listFolder(requestedRoot: string | undefined, requestedPath?: string, access: FileAccess = LOCAL_FILE_ACCESS): FolderResponse {
  if (!requestedRoot?.trim()) throw new Error("folder path is required");
  const root = path.resolve(accessPath(requestedRoot.trim(), access));
  const folder = path.resolve(accessPath(requestedPath?.trim() || root, access));
  if (!isInside(root, folder)) throw new Error("folder is outside the chosen folder");
  const listed = readFolder(folder, "document", () => {
    if (!isInside(fs.realpathSync(root), fs.realpathSync(folder))) throw new Error("folder symlink escapes the chosen folder");
    return { root, path: folder, ...(path.relative(root, folder) === "" ? {} : { parent: path.dirname(folder) }) };
  });
  return { ...listed, entries: listed.entries.map(entry => entry.kind === "document" ? withNativeMarker(entry) : entry) };
}

// Native frontmatter holds only `ieumdoc` and `numbering`, so its start is enough to find the marker.
const MARKER_PREFIX_BYTES = 4096;

/** Reads the start of a listed document for its marker; an unreadable file stays unmarked either way. */
function withNativeMarker(entry: FolderEntry): FolderEntry {
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(entry.path, "r");
    const prefix = Buffer.alloc(MARKER_PREFIX_BYTES);
    const length = fs.readSync(descriptor, prefix, 0, MARKER_PREFIX_BYTES, 0);
    return { ...entry, native: hasNativeMarker(new TextDecoder().decode(prefix.subarray(0, length))) };
  } catch {
    return entry;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

/**
 * One level of any folder, for choosing which folder to open: the same entries as `listFolder`,
 * and the folders from the filesystem root down to it. Choosing an image lists images instead of
 * Markdown files. Only names are returned, never content.
 */
export function browseFolder(requestedPath: string | undefined, access: FileAccess = LOCAL_FILE_ACCESS, files: FileKind = "document"): FolderBrowseResponse {
  if (!requestedPath?.trim()) throw new Error("folder path is required");
  const folder = path.resolve(accessPath(requestedPath.trim(), access));
  const boundary = access?.boundary(folder);
  return readFolder(folder, files, () => {
    const crumbs: FolderCrumb[] = [];
    for (let current = folder; ; current = path.dirname(current)) {
      const root = boundary ? path.relative(boundary, current) === "" : path.dirname(current) === current;
      crumbs.unshift({ name: root && !boundary ? current.replace(/[\\/]+$/, "") || current : path.basename(current) || current, path: current });
      if (root) break;
    }
    return { path: folder, crumbs };
  });
}

/** Where choosing a folder can start: the home and Documents folders, then each drive or `/`. */
export function folderPlaces(access: FileAccess = LOCAL_FILE_ACCESS): FolderPlacesResponse {
  if (access) return { places: access.roots.map(root => ({ kind: "root", name: path.basename(root) || root, path: access.resolve(root) })) };
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

/**
 * Creates one folder inside an existing folder; an existing file or folder is never replaced.
 * The name is a single portable name, so the folder can be listed and moved between systems.
 */
export function createFolder(requestedParent: string | undefined, requestedName: string | undefined, access: FileAccess = LOCAL_FILE_ACCESS): FolderCreateResponse {
  if (!requestedParent?.trim()) throw new Error("folder path is required");
  const name = requestedName ?? "";
  assertUnicode(name);
  if (!name.trim()) throw new Error("folder name is required");
  if (name === "." || name === ".." || /[\\/]/.test(name)) throw new Error("folder name cannot contain a directory path");
  // Hidden folders are not listed, so one created here would seem to disappear.
  if (name.startsWith(".")) throw new Error("folder name cannot start with a dot");
  if (/[<>:"|?*\u0000-\u001f]/.test(name)) throw new Error("folder name cannot contain < > : \" | ? * or control characters");
  if (/[. ]$/.test(name)) throw new Error("folder name cannot end with a dot or space");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) throw new Error("folder name is reserved on Windows");
  const parent = path.resolve(accessPath(requestedParent.trim(), access));
  const folder = accessPath(path.join(parent, name), access, true);
  try {
    if (!statSync(parent).isDirectory()) throw new Error("folder path must point to a directory");
    fs.mkdirSync(folder);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") throw new Error("a file or folder with that name already exists");
    if (code === "ENOENT") throw new Error("folder does not exist");
    if (code === "ENOTDIR") throw new Error("folder path must point to a directory");
    if (code === "EACCES" || code === "EPERM") throw new Error("folder cannot be created: permission denied");
    throw error;
  }
  return { path: folder };
}

function isDirectory(candidate: string): boolean {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

type FileKind = Exclude<FolderEntry["kind"], "folder">;
const fileKinds: Record<FileKind, (extension: string) => boolean> = {
  document: extension => extension === ".md",
  image: extension => Object.hasOwn(MEDIA_TYPES, extension),
};

/** Reads one level after `check` accepts the folder; filesystem failures become plain messages. */
function readFolder<T>(folder: string, files: FileKind, check: () => T): T & { entries: FolderEntry[] } {
  try {
    if (!statSync(folder).isDirectory()) throw new Error("folder path must point to a directory");
    const result = check();
    const entries = fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry): FolderEntry[] => {
      if (entry.name.startsWith(".")) return [];
      const kind = entry.isDirectory() ? "folder" : entry.isFile() && fileKinds[files](path.extname(entry.name).toLowerCase()) ? files : undefined;
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

function serveMedia(assetPath: string, res: ServerResponse, documentPath?: string, access: FileAccess = LOCAL_FILE_ACCESS, head = false): void {
  let file: string;
  try {
    file = resolveMediaPath(assetPath, documentPath, access);
  } catch (error) {
    res.statusCode = fileErrorStatus(error);
    res.end();
    return;
  }
  try {
    const data = readFileSync(accessPath(file, access));
    res.statusCode = 200;
    res.setHeader("Content-Type", MEDIA_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(head ? undefined : data);
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
