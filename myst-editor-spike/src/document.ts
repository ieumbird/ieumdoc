import { mystParse } from "myst-parser";
import { writeMd } from "myst-to-md";
import { VFile } from "vfile";
import type { MystNode, ParsedDocument } from "./types.ts";

export type { MystNode, ParsedDocument };

export function parseDocument(source: string): ParsedDocument {
  return { source, ast: mystParse(source) as MystNode };
}

export function replaceText(node: MystNode, from: string, to: string): boolean {
  let found = false;
  if (node.type === "text" && typeof node.value === "string" && node.value.includes(from)) {
    node.value = node.value.replaceAll(from, to);
    found = true;
  }
  for (const child of node.children ?? []) {
    if (replaceText(child, from, to)) found = true;
  }
  return found;
}

export function serializeDocument(original: ParsedDocument, editedAst: MystNode): string {
  const originalBlocks = original.ast.children ?? [];
  const editedBlocks = editedAst.children ?? [];
  if (originalBlocks.length !== editedBlocks.length) {
    throw new Error("This spike only supports in-place edits of existing blocks.");
  }

  const replacements: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < originalBlocks.length; i += 1) {
    const originalBlock = originalBlocks[i];
    const editedBlock = editedBlocks[i];
    if (sameContent(originalBlock, editedBlock)) continue;
    const position = originalBlock.position;
    if (!position) {
      throw new Error(`Block ${i} (${originalBlock.type}) is missing source position.`);
    }
    replacements.push({
      start: position.start.line,
      end: position.end.line,
      text: serializeBlock(editedBlock, originalBlock, original.source),
    });
  }

  if (replacements.length === 0) return original.source;
  return applyLineReplacements(original.source, replacements);
}

function serializeBlock(edited: MystNode, original: MystNode, source: string): string {
  // myst-to-md rewrites $$ math as a {math} directive. Keep the original source.
  if (original.type === "math" || edited.type === "math") {
    return sliceLines(source, requiredPosition(original));
  }
  // Preserve the original fence (`:::{note}` vs ```{note}) and rewrite the body only.
  if (original.type === "mystDirective" || original.type === "admonition") {
    return serializeDirective(edited, original, source);
  }
  return serializeWithMystToMd(edited);
}

function serializeDirective(edited: MystNode, original: MystNode, source: string): string {
  const originalSlice = sliceLines(source, requiredPosition(original));
  const lines = originalSlice.split("\n");
  const open = lines[0] ?? "";
  const close = lines.at(-1) ?? "";
  const bodyNode =
    edited.type === "mystDirective" ? (edited.children?.[0] ?? edited) : edited;
  const body =
    bodyNode.type === "admonition"
      ? (bodyNode.children ?? []).map((child) => serializeWithMystToMd(child)).join("\n\n")
      : serializeWithMystToMd(bodyNode);
  return `${open}\n${body}\n${close}`;
}

function serializeWithMystToMd(node: MystNode): string {
  const file = new VFile();
  writeMd(file, { type: "root", children: [stripPosition(node)] } as never);
  return String(file.result ?? "").trimEnd();
}

function sameContent(left: MystNode, right: MystNode): boolean {
  return JSON.stringify(stripPosition(left)) === JSON.stringify(stripPosition(right));
}

function stripPosition(node: MystNode): MystNode {
  const { position: _position, ...rest } = node;
  if (!rest.children) return rest;
  return { ...rest, children: rest.children.map(stripPosition) };
}

function requiredPosition(node: MystNode): NonNullable<MystNode["position"]> {
  if (!node.position) throw new Error(`Missing position on ${node.type} node.`);
  return node.position;
}

function sliceLines(source: string, position: NonNullable<MystNode["position"]>): string {
  const { lines } = splitSource(source);
  return lines.slice(position.start.line - 1, position.end.line).join("\n");
}

function applyLineReplacements(
  source: string,
  replacements: { start: number; end: number; text: string }[],
): string {
  const { lines, trailingNewline } = splitSource(source);
  const ordered = [...replacements].sort((a, b) => b.start - a.start);
  for (const replacement of ordered) {
    lines.splice(
      replacement.start - 1,
      replacement.end - replacement.start + 1,
      ...replacement.text.split("\n"),
    );
  }
  return lines.join("\n") + (trailingNewline ? "\n" : "");
}

function splitSource(source: string): { lines: string[]; trailingNewline: boolean } {
  const trailingNewline = source.endsWith("\n");
  const body = trailingNewline ? source.slice(0, -1) : source;
  return { lines: body.split("\n"), trailingNewline };
}
