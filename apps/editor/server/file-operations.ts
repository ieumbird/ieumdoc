import fs from "node:fs";
import path from "node:path";
import { assertUnicode, commitFile, FileChangedError, preflightFileCommit, textRevision } from "@ieumdoc/file-commit";
import { parse, serialize, updateMediaReferences } from "@ieumdoc/core";
import { validFileStem, type FileOperationRequest, type RenameFileRequest, type FileOperationResponse } from "../shared/file-operations.ts";
import { accessPath, FileAccessError, inside, LOCAL_FILE_ACCESS, RootAccess, type FileAccess } from "./file-access.ts";
import { loadDocumentFile, MEDIA_TYPES } from "./document-api.ts";
import { resolveMediaPath } from "./document-path.ts";
import { readModel } from "./document-replay.ts";

export class ReferencedImageError extends Error {
  constructor(readonly references: string[]) { super(`Save these documents before renaming the image: ${references.join(", ")}`); }
}

export class ImageRenameError extends Error {
  constructor(message: string, readonly updatedDocuments: string[], readonly skippedDocuments: string[]) { super(message); }
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

function imageReferences(root: string, file: string, destination: string, openDocuments: RenameFileRequest["openDocuments"], access: FileAccess) {
  const documents: { loaded: ReturnType<typeof loadDocumentFile>; sources: Set<string> }[] = [];
  const references = new Set<string>(), skipped: string[] = [];
  const image = fs.statSync(file);
  const inspect = (documentPath: string, document: ReturnType<typeof readModel>["document"]) => {
    const sources = new Set<string>();
    if (!inside(root, documentPath)) return sources;
    for (const block of document.blocks) {
      if (block.block !== "figure" || !block.imageUrl) continue;
      try {
        // Match the existing segment-encoded media request, including literal percent signs.
        const target = resolveMediaPath(block.imageUrl.split("/").map(encodeURIComponent).join("/"), documentPath, access);
        const referenced = fs.statSync(target);
        if (referenced.dev === image.dev && referenced.ino === image.ino) sources.add(block.imageUrl);
      } catch { /* Remote, missing and out-of-scope media are not this local image. */ }
    }
    return sources;
  };
  const scan = (folder: string) => {
    for (const entry of fs.readdirSync(accessPath(folder, access), { withFileTypes: true })) {
      const target = path.join(folder, entry.name);
      if (entry.isDirectory()) scan(target);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".md") {
        let loaded: ReturnType<typeof loadDocumentFile>;
        try { loaded = loadDocumentFile(target, access); }
        catch { skipped.push(path.relative(root, target)); continue; }
        const sources = inspect(target, loaded.document);
        if (!sources.size) continue;
        references.add(target);
        documents.push({ loaded, sources });
      }
    }
  };
  scan(root);
  const dirty = new Set<string>();
  for (const opened of openDocuments ?? []) {
    if (!opened || typeof opened.path !== "string" || (opened.source !== undefined && typeof opened.source !== "string")) throw new Error("Invalid open document snapshot.");
    const documentPath = path.resolve(accessPath(opened.path, access));
    if (!inside(root, documentPath)) continue;
    if (references.has(documentPath) || (opened.source !== undefined && inspect(documentPath, readModel(opened.source).document).size)) dirty.add(path.relative(root, documentPath));
  }
  if (dirty.size) throw new ReferencedImageError([...dirty]);
  const changes = documents.map(({ loaded, sources }) => {
    // A hard-link alias may be reachable where the newly named image is not. Preserve
    // the existing media boundary: refuse the whole plan rather than write a broken URL.
    const to = `./${path.relative(path.dirname(loaded.path), destination).split(path.sep).join("/")}`;
    resolveMediaPath(to.split("/").map(encodeURIComponent).join("/"), loaded.path, access);
    const markdown = serialize(updateMediaReferences(parse(loaded.source), [...sources].map(from => ({ from, to }))));
    preflightFileCommit(loaded.path, markdown, loaded.revision);
    return { path: loaded.path, source: loaded.source, revision: loaded.revision, markdown };
  });
  return { changes, skipped };
}

export function renameFile(request: RenameFileRequest, access: FileAccess = LOCAL_FILE_ACCESS): FileOperationResponse {
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
  const plan = MEDIA_TYPES[extension.toLowerCase()] ? imageReferences(root, file, destination, request.openDocuments, access) : { changes: [], skipped: [] };
  // Hard-link publication is exclusive on Windows and POSIX, unlike rename which can overwrite.
  // A failed publication leaves the original intact. Unsupported filesystems report the error.
  assertOwner(request, owner, access);
  // A case-only spelling resolves to this inode without being a distinct directory entry.
  // Enumerate exact spellings: Windows realpath preserves the caller's case. Existing hard
  // links have their own entry and still conflict, even when their inode is the same.
  const caseOnly = fs.existsSync(destination) && !fs.readdirSync(path.dirname(file)).includes(path.basename(destination));
  if (caseOnly) {
    assertOwner({ root, path: destination }, owner, access);
    fs.renameSync(assertOwner(request, owner, access), destination);
  } else try { fs.linkSync(file, accessPath(destination, access, true)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("A file with this name already exists.");
    throw error;
  }
  const rollbackCandidates: typeof plan.changes = [];
  let pending: (typeof plan.changes)[number] | undefined;
  const hasOriginalContent = (change: (typeof plan.changes)[number]): boolean => {
    try {
      const target = scope({ root, path: change.path }, access).file;
      return fs.readFileSync(target).equals(Buffer.from(change.source, "utf8"));
    } catch { return false; } // Unreadable/uncertain state must retain the image and be reported.
  };
  try {
    for (const change of plan.changes) {
      // Recheck root/symlink policy immediately before each replacement as well as revision.
      scope({ root, path: change.path }, access);
      pending = change;
      commitFile(change.path, change.markdown, change.revision);
      rollbackCandidates.push(change);
      pending = undefined;
    }
    assertOwner({ root, path: destination }, owner, access);
    if (!caseOnly) fs.unlinkSync(assertOwner(request, owner, access));
  } catch (error) {
    // commitFile may throw from temporary cleanup AFTER replacing the document. Only
    // its explicit revision conflict proves refusal before replacement. Keep every
    // other interrupted attempt; actual bytes and revision checks decide restoration.
    if (pending && !(error instanceof FileChangedError)) rollbackCandidates.push(pending);
    const remaining: string[] = [], failures: string[] = [], cleanupFailures: string[] = [];
    for (const change of [...rollbackCandidates].reverse()) {
      if (hasOriginalContent(change)) continue;
      try {
        scope({ root, path: change.path }, access);
        commitFile(change.path, change.source, textRevision(change.markdown));
      } catch (cause) {
        if (hasOriginalContent(change)) cleanupFailures.push(`${change.path}: ${String(cause)}`);
        else { remaining.push(change.path); failures.push(`${change.path}: ${String(cause)}`); }
      }
    }
    if (!remaining.length) {
      try {
        if (caseOnly) fs.renameSync(assertOwner({ root, path: destination }, owner, access), file);
        else fs.unlinkSync(assertOwner({ root, path: destination }, owner, access));
      } catch (cause) { failures.push(`${destination}: ${String(cause)}`); }
    }
    throw new ImageRenameError(`File rename failed: ${String(error)}. ${failures.length
      ? `Rollback incomplete. Image paths: ${file} (${fs.existsSync(file) ? "present" : "absent"}), ${destination} (${fs.existsSync(destination) ? "present" : "absent"}). Documents requiring review: ${remaining.join(", ") || "none"}. ${failures.join("; ")}`
      : "Image publication and committed document changes rolled back; external changes preserved."}${cleanupFailures.length
      ? ` Cleanup errors after verified content restoration: ${cleanupFailures.join("; ")}` : ""}`, remaining, plan.skipped);
  }
  return { path: destination, updatedDocuments: plan.changes.map(change => change.path), skippedDocuments: plan.skipped };
}
