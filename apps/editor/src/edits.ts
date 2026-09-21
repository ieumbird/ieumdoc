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

export type HeadingEdit = {
  path: NodePath;
  text: string;
};

export type EquationEdit = {
  path: NodePath;
  latex: string;
};

export type BlockInsert = {
  index: number;
  block: "paragraph" | "heading" | "equation";
  text?: string;
  level?: number;
  latex?: string;
  content?: InlineContent[];
};

export function collectHeadingEdits(document: EditableDocument, drafts: Record<string, string>): HeadingEdit[] {
  const edits: HeadingEdit[] = [];
  for (const block of document.blocks) {
    if (block.block !== "heading") continue;
    const key = pathKey(block.path);
    if (key in drafts && drafts[key] !== block.text) {
      edits.push({ path: block.path, text: drafts[key] ?? "" });
    }
  }
  return edits;
}

export function collectEquationEdits(document: EditableDocument, drafts: Record<string, string>): EquationEdit[] {
  const edits: EquationEdit[] = [];
  for (const block of document.blocks) {
    if (block.block !== "equation") continue;
    const key = pathKey(block.path);
    if (key in drafts && drafts[key] !== block.latex) {
      edits.push({ path: block.path, latex: drafts[key] ?? "" });
    }
  }
  return edits;
}

export function mergeParagraphEdits(
  document: EditableDocument,
  drafts: Record<string, InlineContent[]>,
  overrides: ParagraphEdit[],
  omitIndex?: number,
): ParagraphEdit[] {
  const map = new Map<string, ParagraphEdit>();
  for (const edit of collectParagraphEdits(document, drafts)) {
    if (edit.path[0] === omitIndex) continue;
    map.set(pathKey(edit.path), edit);
  }
  for (const edit of overrides) {
    if (edit.path[0] === omitIndex) continue;
    map.set(pathKey(edit.path), edit);
  }
  return [...map.values()];
}

export function omitPathIndex<T extends { path: NodePath }>(edits: T[], index: number | undefined): T[] {
  if (index === undefined) return edits;
  return edits.filter((edit) => edit.path[0] !== index);
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
