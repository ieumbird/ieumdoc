import type { EditableDocument, InlineContent, NodePath } from "@ieumdoc/core";

export type TextEdit = {
  path: NodePath;
  from: string;
  to: string;
};

export type ParagraphEdit = {
  path: NodePath;
  content: InlineContent[];
};

export function pathKey(path: NodePath): string {
  return path.join(",");
}

export function collectEdits(document: EditableDocument, drafts: Record<string, string>): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const target of editableTextTargets(document)) {
    const key = pathKey(target.path);
    if (key in drafts && drafts[key] !== target.text) {
      edits.push({ path: target.path, from: target.text, to: drafts[key] });
    }
  }
  return edits;
}

export function collectParagraphEdits(
  document: EditableDocument,
  drafts: Record<string, InlineContent[]>,
): ParagraphEdit[] {
  const edits: ParagraphEdit[] = [];
  for (const target of editableParagraphs(document)) {
    const key = pathKey(target.path);
    if (key in drafts && JSON.stringify(drafts[key]) !== JSON.stringify(target.content)) {
      edits.push({ path: target.path, content: drafts[key] });
    }
  }
  return edits;
}

export function editableParagraphs(document: EditableDocument): { path: NodePath; content: InlineContent[]; text: string }[] {
  return document.blocks.flatMap((block) =>
    block.block === "paragraph" && block.editable
      ? [{ path: block.path, content: block.content, text: block.text }]
      : [],
  );
}

export function editableTextTargets(document: EditableDocument): { path: NodePath; text: string }[] {
  const targets: { path: NodePath; text: string }[] = [];
  for (const block of document.blocks) {
    if (block.block === "figure" && block.caption.editable) {
      targets.push({ path: block.caption.path, text: block.caption.text });
    } else if (block.block === "table") {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          if (cell.editable) {
            targets.push({ path: cell.path, text: cell.text });
          }
        }
      }
    }
  }
  return targets;
}
