import type { EditableBlock, EditableDocument, InlineContent, ListContent, NodePath } from "@ieumdoc/core";
import { toTiptapContent, type TiptapJSON } from "./tiptap-inline.ts";

/**
 * Core → Tiptap: the editor document a Core read model projects to, and the session-only
 * locators (snapshot paths, new-block paths, applied block sources) both directions share.
 * Pure functions; nothing here collects edits or validates an editor change (tiptap-edits.ts).
 */

// Unsaved top-level paragraphs have no snapshot locator yet. This session-only
// marker stays in the session across saves; a newly opened document gets fresh snapshot paths. It is never persisted.
export const NEW_BLOCK_PREFIX = "new:";

const EMPTY_DOCUMENT_BLOCK_PATH = `${NEW_BLOCK_PREFIX}empty`;

export function isNewBlockPath(path: string): boolean {
  return path.startsWith(NEW_BLOCK_PREFIX);
}

/** Editor document attribute: MyST source applied to read-only snapshot blocks, by snapshot path,
 * with the block Core made of it. Part of the editor state, so Undo and Redo include it. */
export const BLOCK_SOURCES_ATTR = "blockSources";

export type AppliedBlockSources = Record<string, { source: string; block: EditableBlock }>;

export function blockSourcesOf(document: TiptapJSON): AppliedBlockSources {
  const value = document.attrs?.[BLOCK_SOURCES_ATTR];
  return value && typeof value === "object" ? value as AppliedBlockSources : {};
}

/** The snapshot as the session's applied block sources replaced it, in place. */
export function withBlockSources(document: EditableDocument, sources: AppliedBlockSources): EditableDocument {
  return { ...document, blocks: document.blocks.map(block => sources[pathKey(block.path)]?.block ?? block) };
}

/** A Tiptap baseline with the applied block sources' blocks in place of their snapshot nodes. */
export function withBlockSourceNodes(baseline: TiptapJSON, sources: AppliedBlockSources): TiptapJSON {
  if (Object.keys(sources).length === 0) return baseline;
  return { ...baseline, content: (baseline.content ?? []).map(node => {
    const applied = sources[sourcePathOf(node)];
    return applied ? toTiptapBlockNode(applied.block) : node;
  }) };
}

export function pathKey(path: NodePath): string {
  return path.join(",");
}

export function toTiptapDocument(document: EditableDocument): TiptapJSON {
  return {
    type: "doc",
    ...(document.headingNumbering ? { attrs: { headingNumbering: document.headingNumbering } } : {}),
    content: document.blocks.length > 0
      ? document.blocks.map(toTiptapBlockNode)
      : [{ type: "paragraph", attrs: { sourcePath: EMPTY_DOCUMENT_BLOCK_PATH } }],
  };
}

export function toTiptapBlockNode(block: EditableBlock): TiptapJSON {
  const node = toTiptapBlock(block);
  if (block.original) node.attrs = { ...node.attrs, original: block.original };
  if (block.numbered) node.attrs = { ...node.attrs, numbered: block.numbered };
  if (block.headingLevels) node.attrs = { ...node.attrs, headingLevels: block.headingLevels };
  if (block.footnotes) node.attrs = { ...node.attrs, footnotes: block.footnotes };
  return node;
}

export function toTiptapBlock(block: EditableBlock): TiptapJSON {
  if (block.block === "heading") {
    if (!block.editable) {
      return readonlyNode("readonlyHeading", block.path, {
        level: block.level,
        text: block.text,
      });
    }
    return {
      type: "heading",
      attrs: { level: block.level, sourcePath: pathKey(block.path) },
      content: paragraphContent(block.content),
    };
  }
  if (block.block === "paragraph") {
    if (!editableParagraph(block)) {
      return readonlyNode("readonlyParagraph", block.path, { text: block.text });
    }
    return {
      type: "paragraph",
      attrs: { sourcePath: pathKey(block.path) },
      content: paragraphContent(block.content),
    };
  }
  if (block.block === "admonition") {
    if (block.editable) {
      return {
        type: "admonition",
        attrs: { sourcePath: pathKey(block.path), variant: block.variant, text: block.text, editable: true },
        content: paragraphContent(block.content),
      };
    }
    return readonlyNode("admonition", block.path, {
      variant: block.variant,
      text: block.text,
      editable: false,
    });
  }
  if (block.block === "quote") {
    // Quote v1 holds one paragraph; other quotes are read-only like any unsupported block.
    return block.editable
      ? { type: "quote", attrs: { sourcePath: pathKey(block.path) }, content: paragraphContent(block.content) }
      : readonlyNode("unsupportedBlock", block.path, { text: block.text });
  }
  if (block.block === "divider") {
    return { type: "divider", attrs: { sourcePath: pathKey(block.path) } };
  }
  if (block.block === "figure") {
    return {
      type: "figure",
      attrs: {
        sourcePath: pathKey(block.path),
        label: block.label,
        imageUrl: block.imageUrl,
        imageAlt: block.imageAlt,
        ...(block.editable ? {} : { caption: block.caption.text }),
        editable: block.editable,
      },
      ...(block.editable ? { content: paragraphContent(block.caption.content) } : {}),
    };
  }
  if (block.block === "equation") {
    return readonlyNode("equation", block.path, {
      latex: block.latex,
      label: block.label,
    });
  }
  if (block.block === "code") {
    return {
      type: "codeBlock",
      attrs: { sourcePath: pathKey(block.path), language: block.language },
      content: block.code ? [{ type: "text", text: block.code }] : [],
    };
  }
  if (block.block === "list") {
    const node = listNode(block);
    return { ...node, attrs: { ...node.attrs, sourcePath: pathKey(block.path) } };
  }
  if (block.block === "table") {
    return {
      type: "table",
      attrs: { sourcePath: pathKey(block.path), label: block.label ?? "", caption: block.caption ?? [] },
      content: block.rows.map((row, rowIndex) => ({
        type: "tableRow",
        content: row.cells.map((cell, column): TiptapJSON => {
          const attrs = { header: cell.header, ...(cell.align ? { align: cell.align } : {}), [TABLE_CELL_SOURCE_ATTR]: `${rowIndex},${column}` };
          return cell.editable
            ? { type: "tableCell", attrs, content: paragraphContent(cell.content) }
            : { type: "readonlyTableCell", attrs: { ...attrs, text: cell.text } };
        }),
      })),
    };
  }
  if (block.block === "target") {
    return { type: "labelTarget", attrs: { sourcePath: pathKey(block.path), label: block.label } };
  }
  return readonlyNode("unsupportedBlock", block.path, { text: block.text, ...(block.footnote ? { footnote: block.footnote } : {}) });
}

function listNode(list: ListContent): TiptapJSON {
  return {
    type: list.ordered ? "orderedList" : "bulletList",
    ...(list.ordered ? { attrs: { start: list.start } } : {}),
    content: list.items.map(item => ({
      type: "listItem",
      content: [
        { type: "paragraph", content: paragraphContent(item.content) },
        ...(item.list ? [listNode(item.list)] : []),
      ],
    })),
  };
}

function readonlyNode(
  type: string,
  path: NodePath,
  attrs: Record<string, string | number | boolean>,
): TiptapJSON {
  return {
    type,
    attrs: { sourcePath: pathKey(path), ...attrs },
  };
}

export function paragraphContent(content: InlineContent[]): TiptapJSON[] {
  const projected = toTiptapContent(content);
  return projected.content?.[0]?.content ?? [];
}

/** Session-only cell attribute: the cell's `row,column` in the opening snapshot table, empty for a
 * cell added since Open/New. A snapshot locator like `sourcePath`, never persisted (ADR-0003). */
export const TABLE_CELL_SOURCE_ATTR = "sourceCell";

export function sourcePathOf(node: TiptapJSON | undefined): string {
  return String(node?.attrs?.sourcePath ?? "");
}

export function markKey(item: InlineContent): string {
  return item.kind === "link" ? `link ${JSON.stringify([item.url, item.title ?? null])}` : item.kind;
}

/**
 * Adjacent links with the same target (`[a](x)[b](x)`) become one link in the editor's
 * flat marks, so such a paragraph stays read-only rather than silently merging them.
 */
export function editableParagraph(block: EditableBlock): boolean {
  if (block.block !== "paragraph" || !block.editable) return false;
  // The link (if any) that owns each text/break leaf, in reading order.
  const owners: (InlineContent | undefined)[] = [];
  const walk = (items: InlineContent[], owner?: InlineContent): void => {
    for (const item of items) {
      if (item.kind === "link") walk(item.children, item);
      else if ("children" in item) walk(item.children, owner);
      else owners.push(owner);
    }
  };
  walk(block.content);
  return !owners.some((owner, index) => {
    const previous = owners[index - 1];
    return owner !== undefined && previous !== undefined && owner !== previous && markKey(owner) === markKey(previous);
  });
}
