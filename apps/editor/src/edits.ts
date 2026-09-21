import type { EditableDocument, NodePath } from "@ieumdoc/core";

export type TextEdit = {
  path: NodePath;
  from: string;
  to: string;
};

export function pathKey(path: NodePath): string {
  return path.join(",");
}

export function collectEdits(document: EditableDocument, drafts: Record<string, string>): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const target of editableTargets(document)) {
    const key = pathKey(target.path);
    if (key in drafts && drafts[key] !== target.text) {
      edits.push({ path: target.path, from: target.text, to: drafts[key] });
    }
  }
  return edits;
}

export function editableTargets(document: EditableDocument): { path: NodePath; text: string }[] {
  const targets: { path: NodePath; text: string }[] = [];
  for (const block of document.blocks) {
    if (block.block === "paragraph" && block.editable) {
      targets.push({ path: block.path, text: block.text });
    } else if (block.block === "figure" && block.caption.editable) {
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
