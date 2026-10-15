import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertUnicode } from "@ieumdoc/file-commit";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";

const editorRoot = fileURLToPath(new URL("..", import.meta.url));

export const DOCUMENT_DIR = path.join(editorRoot, "document");

const DEFAULT_DOCUMENT_PATH = path.join(DOCUMENT_DIR, "technical-document.md");

export function resolveDocumentPath(requestedPath?: string, access: FileAccess = LOCAL_FILE_ACCESS, create = false): string {
  const candidate = requestedPath?.trim() || DEFAULT_DOCUMENT_PATH;
  const resolved = path.resolve(accessPath(candidate, access, create));
  if (path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("document path must point to a .md file");
  }
  return resolved;
}

export function resolveMediaPath(assetPath: string, documentPath?: string, access: FileAccess = LOCAL_FILE_ACCESS): string {
  const decodedPath = decodeURIComponent(assetPath);
  assertUnicode(decodedPath);
  const documentFile = resolveDocumentPath(documentPath, access);
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
  return accessPath(resolved, access, true);
}
