import type { Schema } from "@tiptap/pm/model";
import { reserveBlockPaths } from "./block-locators.ts";
import { DELETED_PATHS_ATTR, type TiptapJSON } from "./tiptap-document.ts";

/** Applied engine content only; no history, selection, property drafts or pending requests. */
export type EditorSnapshot = { editorDocument: TiptapJSON; savedDocument: TiptapJSON };

// ProseMirror supplies defaults, but must not discard any supplied field, node or mark.
function assertRetained(input: unknown, output: unknown): void {
  if (Array.isArray(input)) {
    if (!Array.isArray(output) || input.length !== output.length) throw new Error("Editor content would be lost");
    input.forEach((item, index) => assertRetained(item, output[index]));
  } else if (input !== null && typeof input === "object") {
    if (output === null || typeof output !== "object") throw new Error("Unsupported editor field");
    for (const [key, value] of Object.entries(input)) {
      if ((key === "content" || key === "marks") && Array.isArray(value) && value.length === 0 &&
          (output as Record<string, unknown>)[key] === undefined) continue;
      assertRetained(value, (output as Record<string, unknown>)[key]);
    }
  } else if (input !== output) throw new Error("Unsupported editor field");
}

/** Same-schema initialization, deliberately NOT canonical Save validation. */
export function prepareEditorSnapshot(schema: Schema, opening: TiptapJSON, snapshot: EditorSnapshot): EditorSnapshot {
  function prepare(input: TiptapJSON): TiptapJSON {
    if (input?.type !== "doc") throw new Error("Editor snapshot must contain a doc");
    const recorded: unknown = input.attrs?.[DELETED_PATHS_ATTR];
    // Older structureGuard normalization recorded the default empty locator as a
    // deletion when assigning a new engine block's locator. It addresses no block.
    // Remove only that proven sentinel; validate every real path and both snapshots.
    const deleted = Array.isArray(recorded) ? recorded.filter(path => path !== "") : recorded;
    const originalPaths = new Set(opening.content?.map(node => String(node.attrs?.sourcePath)));
    if (!Array.isArray(deleted) || !deleted.every(path => typeof path === "string" && originalPaths.has(path))) {
      throw new Error("Invalid editor deletion metadata");
    }
    const json = structuredClone(input);
    delete json.attrs![DELETED_PATHS_ATTR];
    const node = schema.nodeFromJSON(json);
    node.check();
    // Most schema attrs have no ProseMirror validator. Reject malformed primitive shapes
    // without checking semantic validity (labels, Unicode, required content, etc.).
    const checkAttrs = (attrs: Record<string, unknown>, specs: Record<string, { default?: unknown }> = {}) => {
      for (const [name, spec] of Object.entries(specs)) {
        const value = attrs[name];
        if (spec.default !== null && spec.default !== undefined &&
            (Array.isArray(spec.default) ? !Array.isArray(value) : typeof value !== typeof spec.default)) {
          throw new Error(`Invalid editor attribute ${name}`);
        }
      }
    };
    checkAttrs(node.attrs, node.type.spec.attrs);
    const numbering = node.attrs.headingNumbering;
    if (numbering !== null && (typeof numbering !== "object" ||
        !Array.isArray(numbering.enabled) || !numbering.enabled.every((value: unknown) => typeof value === "boolean") ||
        !Array.isArray(numbering.counts) || !numbering.counts.every((value: unknown) => value === null || typeof value === "number") ||
        !Array.isArray(numbering.enumerators) || !numbering.enumerators.every((value: unknown) => value === null || typeof value === "string") ||
        typeof numbering.offset !== "number")) throw new Error("Invalid editor heading numbering");
    node.descendants(child => {
      checkAttrs(child.attrs, child.type.spec.attrs);
      child.marks.forEach(mark => checkAttrs(mark.attrs, mark.type.spec.attrs));
    });
    const normalized = node.toJSON() as TiptapJSON;
    assertRetained(json, normalized);
    const seen = new Set<string>();
    for (const block of normalized.content ?? []) {
      const path = block.attrs?.sourcePath;
      if (typeof path !== "string" || !path) throw new Error("Missing editor block locator");
      for (const part of path.split(";")) {
        if (!originalPaths.has(part) && !/^new:(?:empty|(?:(?:engine|split):)?[1-9]\d*)$/.test(part)) {
          throw new Error("Unknown editor block locator");
        }
        // The engine keeps a shared locator on paragraph splits, including new paragraphs.
        if (seen.has(part) && block.type !== "paragraph") throw new Error("Duplicate editor block locator");
        seen.add(part);
      }
    }
    for (const path of originalPaths) {
      if (!path.startsWith("new:") && !seen.has(path) && !deleted.includes(path)) throw new Error("Missing editor deletion metadata");
    }
    return { ...normalized, attrs: { ...normalized.attrs, [DELETED_PATHS_ATTR]: [...deleted] } };
  }
  try {
    const result = { editorDocument: prepare(snapshot.editorDocument), savedDocument: prepare(snapshot.savedDocument) };
    reserveBlockPaths(result.editorDocument, result.savedDocument);
    return result;
  } catch (cause) {
    throw new Error(`Incompatible editor snapshot: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
