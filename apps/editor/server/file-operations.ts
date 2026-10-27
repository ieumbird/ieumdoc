import fs from "node:fs";
import path from "node:path";
import { assertUnicode } from "@ieumdoc/file-commit";
import { validFileStem, type FileOperationRequest, type RenameFileRequest } from "../shared/file-operations.ts";
import { accessPath, FileAccessError, inside, LOCAL_FILE_ACCESS, RootAccess, type FileAccess } from "./file-access.ts";
import { loadDocumentFile, MEDIA_TYPES } from "./document-api.ts";
import { resolveMediaPath } from "./document-path.ts";
import { readModel } from "./document-replay.ts";

export class ReferencedImageError extends Error {
  constructor(readonly references: string[]) { super(`This image is referenced by: ${references.join(", ")}`); }
}

/** No retained roots or sessions: every request validates its chosen folder and file anew. */
function scope(request: FileOperationRequest, access: FileAccess) {
  if (!request || typeof request.root !== "string" || !request.root.trim() || typeof request.path !== "string" || !request.path.trim()) throw new Error("Folder and file paths are required.");
  assertUnicode(request.root); assertUnicode(request.path);
  const root = path.resolve(accessPath(request.root, access));
  const file = path.resolve(accessPath(request.path, access));
  if (!inside(root, file) || root === file || !fs.statSync(root).isDirectory()) throw new FileAccessError();
  // Reuse pinned-root identity checks, including Windows Unicode case-fold lookalikes.
  new RootAccess([root]).resolve(file);
  for (let current = file; ; current = path.dirname(current)) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new FileAccessError("Symlinks cannot be changed.");
    if (path.relative(root, current) === "") break;
  }
  if (!inside(fs.realpathSync(root), fs.realpathSync(file))) throw new FileAccessError();
  const owner = fs.lstatSync(file);
  if (!owner.isFile()) throw new FileAccessError("Only regular files can be changed.");
  return { root, file, owner };
}

function assertOwner(request: FileOperationRequest, owner: fs.Stats, access: FileAccess) {
  const current = scope(request, access);
  if (current.owner.dev !== owner.dev || current.owner.ino !== owner.ino || current.owner.birthtimeMs !== owner.birthtimeMs) throw new Error("The file changed during the operation.");
  return current.file;
}

/** The same validated deletion for permanent Host deletion and Electron shell.trashItem. */
export async function deleteFile(request: FileOperationRequest, access: FileAccess = LOCAL_FILE_ACCESS, remove: (file: string) => void | Promise<void> = fs.unlinkSync): Promise<{ path: string }> {
  const { file, owner } = scope(request, access);
  await remove(assertOwner(request, owner, access));
  return { path: file };
}

function imageReferences(root: string, file: string, openDocuments: RenameFileRequest["openDocuments"], access: FileAccess): string[] {
  const references = new Set<string>();
  const image = fs.statSync(file);
  const inspect = (documentPath: string, document: ReturnType<typeof readModel>["document"]) => {
    if (!inside(root, documentPath)) return;
    for (const block of document.blocks) {
      if (block.block !== "figure" || !block.imageUrl) continue;
      try {
        // Match the existing segment-encoded media request, including literal percent signs.
        const target = resolveMediaPath(block.imageUrl.split("/").map(encodeURIComponent).join("/"), documentPath, access);
        const referenced = fs.statSync(target);
        if (referenced.dev === image.dev && referenced.ino === image.ino) references.add(path.relative(root, documentPath));
      } catch { /* Remote, missing and out-of-scope media are not this local image. */ }
    }
  };
  const scan = (folder: string) => {
    for (const entry of fs.readdirSync(accessPath(folder, access), { withFileTypes: true })) {
      const target = path.join(folder, entry.name);
      if (entry.isDirectory()) scan(target);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".md") {
        try { inspect(target, loadDocumentFile(target, access).document); }
        catch { /* Unreadable and non-native files have no admitted Figure read model. */ }
      }
    }
  };
  scan(root);
  for (const opened of openDocuments ?? []) {
    if (!opened || typeof opened.path !== "string" || typeof opened.source !== "string") throw new Error("Invalid open document snapshot.");
    const documentPath = path.resolve(accessPath(opened.path, access));
    if (inside(root, documentPath)) inspect(documentPath, readModel(opened.source).document);
  }
  return [...references];
}

export function renameFile(request: RenameFileRequest, access: FileAccess = LOCAL_FILE_ACCESS): { path: string } {
  const { root, file, owner } = scope(request, access);
  if (typeof request.name !== "string" || !validFileStem(request.name)) throw new Error("Enter a valid file name without an extension or directory path.");
  const extension = path.extname(file);
  const leaf = request.name + extension;
  if (Buffer.byteLength(leaf, "utf8") > 255) throw new Error("The file name is too long.");
  const destination = path.join(path.dirname(file), leaf);
  if (destination === file) return { path: file };
  // Do not turn a no-extension or hidden entry into a different kind of tree item.
  if (path.extname(leaf) !== extension || leaf.startsWith(".")) throw new Error("The file extension must stay unchanged.");
  if (request.openDocuments !== undefined && !Array.isArray(request.openDocuments)) throw new Error("Invalid open document snapshots.");
  if (MEDIA_TYPES[extension.toLowerCase()]) {
    const references = imageReferences(root, file, request.openDocuments, access);
    if (references.length) throw new ReferencedImageError(references);
  }
  // Hard-link publication is exclusive on Windows and POSIX, unlike rename which can overwrite.
  // A failed publication leaves the original intact. Unsupported filesystems report the error.
  assertOwner(request, owner, access);
  // A case-only spelling resolves to this inode without being a distinct directory entry.
  // Enumerate exact spellings: Windows realpath preserves the caller's case. Existing hard
  // links have their own entry and still conflict, even when their inode is the same.
  if (fs.existsSync(destination) && !fs.readdirSync(path.dirname(file)).includes(path.basename(destination))) {
    assertOwner({ root, path: destination }, owner, access);
    fs.renameSync(assertOwner(request, owner, access), destination);
    return { path: destination };
  }
  try { fs.linkSync(file, accessPath(destination, access, true)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("A file with this name already exists.");
    throw error;
  }
  try {
    assertOwner({ root, path: destination }, owner, access);
    fs.unlinkSync(assertOwner(request, owner, access));
  } catch (error) {
    // Remove only the link we published, never another process's replacement.
    fs.unlinkSync(assertOwner({ root, path: destination }, owner, access));
    throw error;
  }
  return { path: destination };
}
