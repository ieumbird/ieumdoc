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
  mergeParagraphWithPrevious,
  moveBlock,
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
  order?: { path: NodePath; part: number }[];
  headings?: HeadingEdit[];
  paragraphs?: ParagraphEdit[];
  splits?: { path: NodePath; parts: InlineContent[][] }[];
  merges?: { paths: NodePath[]; parts: InlineContent[][] }[];
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
    merges: request.merges ?? [],
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
  // Locators address this save's source snapshot, then each split result.
  // Core alone performs every persistent move, merge, content update and split.
  const locators = editable.blocks.map(block => ({ path: block.path, part: 0 }));
  const key = (item: { path: NodePath; part: number }) => `${item.path.join(",")}:${item.part}`;
  const move = (from: number, to: number) => {
    document = moveBlock(document, from, to);
    locators.splice(to, 0, locators.splice(from, 1)[0]);
  };
  for (const group of [...groups].sort((a, b) => b.paths[0][0] - a.paths[0][0])) {
    // Reordered neighbors may originate at non-adjacent snapshot paths.
    for (let index = 1; index < group.paths.length; index++) {
      const from = locators.findIndex(item => key(item) === key({path: group.paths[index], part: 0}));
      let previous = locators.findIndex(item => key(item) === key({path: group.paths[index - 1], part: 0}));
      if (from < previous) previous--;
      move(from, previous + 1);
    }
    const start = locators.findIndex(item => key(item) === key({path: group.paths[0], part: 0}));
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
  if (edits.order !== undefined) {
    if (!Array.isArray(edits.order) || edits.order.length !== locators.length) throw new Error("invalid block order");
    const expected = new Set(locators.map(key));
    for (const item of edits.order) {
      assertPath(item.path, "order");
      if (item.path.length !== 1 || !Number.isInteger(item.part) || !expected.delete(key(item))) throw new Error("invalid block order");
    }
    for (const [to, item] of edits.order.entries()) {
      const from = locators.findIndex(locator => key(locator) === key(item));
      if (from !== to) move(from, to);
    }
  }
  validateStructure(document);
  const markdown = serialize(document);
  const reloaded = getEditableDocument(parse(markdown));
  const expectedBlocks = getEditableDocument(document).blocks;
  // Save acknowledgement needs one reloaded locator per submitted block.
  // Some unsupported read-only combinations serialize with extra separators.
  if (reloaded.blocks.length !== expectedBlocks.length || reloaded.blocks.some((block, index) => block.block !== expectedBlocks[index].block)) {
    throw new Error("Canonical save changed block boundaries; this order cannot be saved");
  }
  return { markdown, document: reloaded };
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
            merges: Array.isArray(body.merges) ? body.merges : [],
            order: body.order,
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
