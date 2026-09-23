import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getEditableDocument,
  insertParagraph,
  parse,
  removeBlock,
  serialize,
  splitParagraph,
  mergeParagraphWithPrevious,
  moveBlock,
  updateNodeTextAtPath,
  updateEquationLatex,
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

export type EquationEdit = {
  path: NodePath;
  from: string;
  to: string;
};

export type OrderItem = { path: NodePath; part: number } | { insert: number };

export type SupportedEdits = {
  order?: OrderItem[];
  headings?: HeadingEdit[];
  paragraphs?: ParagraphEdit[];
  equations?: EquationEdit[];
  splits?: { path: NodePath; parts: InlineContent[][] }[];
  merges?: { paths: NodePath[]; parts: InlineContent[][] }[];
  inserts?: InlineContent[][];
  deletes?: NodePath[];
};

export type SaveRequest = SupportedEdits & {
  revision?: string;
};

export type DocumentFileResponse = {
  path: string;
  document: EditableDocument;
  revision: string;
};

export const DOCUMENT_CONFLICT_MESSAGE = "Document changed outside the editor. Reload before saving.";
const EMPTY_DOCUMENT_MARKDOWN = serialize({ type: "root", children: [] });

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

export function loadEditableDocument(source: string): EditableDocument {
  return getEditableDocument(parse(source));
}

export function documentRevision(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function loadDocumentFile(requestedPath?: string): DocumentFileResponse {
  const filePath = resolveDocumentPath(requestedPath);
  const source = readFileSync(filePath, "utf8");
  return {
    path: filePath,
    document: loadEditableDocument(source),
    revision: documentRevision(source),
  };
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
    (markdown) => writeFileSync(filePath, markdown),
    request,
  );
  return { ...saved, path: filePath };
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
    equations: request.equations ?? [],
    splits: request.splits ?? [],
    merges: request.merges ?? [],
    inserts: request.inserts ?? [],
    deletes: request.deletes ?? [],
    order: request.order,
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
  for (const equation of edits.equations ?? []) {
    assertPath(equation.path, "equation");
    const block = blockAt(editable, equation.path);
    if (block?.block !== "equation") {
      throw new Error(`equation edit is not allowed at [${equation.path.join(",")}]`);
    }
    document = updateEquationLatex(document, equation.path, equation.from, equation.to);
  }
  const splits = edits.splits ?? [];
  const merges = edits.merges ?? [];
  if (splits.some(split => !Array.isArray(split.parts) || split.parts.length < 2) ||
      merges.some(merge => !Array.isArray(merge.paths) || merge.paths.length < 2)) {
    throw new Error("invalid paragraph split or merge");
  }
  const groups = [
    ...splits.map(split => ({ paths: [split.path], parts: split.parts })),
    ...merges,
  ];
  const seen = new Set<number>();
  for (const group of groups) {
    if (!Array.isArray(group.parts) || group.parts.length === 0) throw new Error("invalid paragraph parts");
    for (const [index, path] of group.paths.entries()) {
      assertPath(path, "paragraph");
      const block = blockAt(editable, path);
      if (path.length !== 1 || block?.block !== "paragraph" || !block.editable || seen.has(path[0]) ||
          (!edits.order && index > 0 && path[0] !== group.paths[index - 1][0] + 1) ||
          (edits.paragraphs ?? []).some(edit => edit.path.join(",") === path.join(","))) {
        throw new Error("invalid paragraph split or merge");
      }
      seen.add(path[0]);
    }
  }
  const inserts = edits.inserts ?? [];
  const deletes = edits.deletes ?? [];
  const edited = new Set([
    ...(edits.headings ?? []).map(edit => edit.path),
    ...(edits.paragraphs ?? []).map(edit => edit.path),
    ...(edits.equations ?? []).map(edit => edit.path),
    ...groups.flatMap(group => group.paths),
  ].map(path => path.join(",")));
  const deleted = new Set<string>();
  for (const path of deletes) {
    assertPath(path, "delete");
    if (path.length !== 1 || !blockAt(editable, path) || edited.has(path.join(",")) || deleted.has(path.join(","))) {
      throw new Error("invalid block deletion");
    }
    deleted.add(path.join(","));
  }
  if (inserts.some(content => !Array.isArray(content) || inlineText(content).length === 0)) {
    throw new Error("empty paragraph cannot be saved");
  }
  if ((inserts.length > 0 || deletes.length > 0) && edits.order === undefined) {
    throw new Error("block insertion or deletion requires a block order");
  }
  // Locators address this save's source snapshot, then each split result.
  // Core alone performs every persistent move, merge, content update and split.
  const locators: Locator[] = editable.blocks.map(block => ({ path: block.path, part: 0 }));
  const move = (from: number, to: number) => {
    document = moveBlock(document, from, to);
    locators.splice(to, 0, locators.splice(from, 1)[0]);
  };
  for (const group of [...groups].sort((a, b) => b.paths[0][0] - a.paths[0][0])) {
    // Reordered neighbors may originate at non-adjacent snapshot paths.
    for (let index = 1; index < group.paths.length; index++) {
      const from = locators.findIndex(item => locatorKey(item) === locatorKey({path: group.paths[index], part: 0}));
      let previous = locators.findIndex(item => locatorKey(item) === locatorKey({path: group.paths[index - 1], part: 0}));
      if (from < previous) previous--;
      move(from, previous + 1);
    }
    const start = locators.findIndex(item => locatorKey(item) === locatorKey({path: group.paths[0], part: 0}));
    for (let index = group.paths.length - 1; index > 0; index--) {
      document = mergeParagraphWithPrevious(document, [start + index]);
    }
    document = updateParagraphInlineContent(document, [start], group.parts.flat());
    const lengths = group.parts.map(part => inlineText(part).length);
    let offset = lengths.reduce((sum, length) => sum + length, 0);
    for (let index = lengths.length - 1; index > 0; index--) {
      offset -= lengths[index];
      document = splitParagraph(document, [start], offset);
    }
    locators.splice(start, group.paths.length, ...group.parts.map((_, part) => ({path: group.paths[0], part})));
  }
  for (const path of deletes) {
    const index = locators.findIndex(item => locatorKey(item) === locatorKey({path, part: 0}));
    document = removeBlock(document, index);
    locators.splice(index, 1);
  }
  for (const [insert, content] of inserts.entries()) {
    // New paragraphs start at the end; the requested order places them.
    const index = locators.length;
    document = insertParagraph(document, index, inlineText(content));
    document = updateParagraphInlineContent(document, [index], content);
    locators.push({ insert });
  }
  if (edits.order !== undefined) {
    if (!Array.isArray(edits.order) || edits.order.length !== locators.length) throw new Error("invalid block order");
    const expected = new Set(locators.map(locatorKey));
    for (const item of edits.order) {
      if ("insert" in item) {
        if (!Number.isInteger(item.insert) || !expected.delete(locatorKey(item))) throw new Error("invalid block order");
        continue;
      }
      assertPath(item.path, "order");
      if (item.path.length !== 1 || !Number.isInteger(item.part) || !expected.delete(locatorKey(item))) throw new Error("invalid block order");
    }
    for (const [to, item] of edits.order.entries()) {
      const from = locators.findIndex(locator => locatorKey(locator) === locatorKey(item));
      if (from !== to) move(from, to);
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
  const requestUrl = new URL(req.url ?? "", "http://localhost");
  const url = requestUrl.pathname;
  if (url.startsWith("/document/")) {
    serveMedia(url.slice("/document/".length), res, requestUrl.searchParams.get("path") ?? undefined);
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
      const body = JSON.parse(await readBody(req)) as SaveRequest & { path?: unknown };
      try {
        const saved = saveDocumentFile(typeof body.path === "string" ? body.path : undefined, {
          revision: body.revision,
          headings: Array.isArray(body.headings) ? body.headings : [],
          paragraphs: Array.isArray(body.paragraphs) ? body.paragraphs : [],
          equations: Array.isArray(body.equations) ? body.equations : [],
          splits: Array.isArray(body.splits) ? body.splits : [],
          merges: Array.isArray(body.merges) ? body.merges : [],
          inserts: Array.isArray(body.inserts) ? body.inserts : [],
          deletes: Array.isArray(body.deletes) ? body.deletes : [],
          order: body.order,
        });
        sendJson(res, 200, { path: saved.path, document: saved.document, revision: saved.revision });
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

type Locator = OrderItem;

function locatorKey(item: Locator): string {
  return "insert" in item ? `insert:${item.insert}` : `${item.path.join(",")}:${item.part}`;
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

export function resolveMediaPath(assetPath: string, documentPath?: string): string {
  const decodedPath = decodeURIComponent(assetPath);
  const documentFile = resolveDocumentPath(documentPath);
  const documentDirectory = path.dirname(documentFile);
  if (!decodedPath || decodedPath.includes("\0") || path.isAbsolute(decodedPath)) {
    throw new Error("media path must be relative to the document");
  }
  const resolved = path.resolve(documentDirectory, decodedPath);
  const relative = path.relative(documentDirectory, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("media path escapes the document directory");
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
    res.setHeader("Content-Type", path.extname(file).toLowerCase() === ".svg" ? "image/svg+xml" : "application/octet-stream");
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
