// Core's own tests inspect the MyST tree behind a Document, so they import the
// unfenced implementations directly. This is test-only and never a package export;
// consumers use the package root, where Document is opaque (see public-api.test.ts).
export { parse } from "../src/myst/parse.ts";
export { serialize } from "../src/myst/serialize.ts";
export { cloneDocument, getNode, type MystDocument, type MystNode } from "../src/myst/tree.ts";
export { inspectDocument, type BlockSummary, type NodePath } from "../src/document.ts";
export { getEditableDocument, type EditableBlock, type EditableDocument } from "../src/editable.ts";
export type { InlineContent } from "../src/inline.ts";
export { figureContentError, type FigureContent } from "../src/figure.ts";
export * from "../src/operations.ts";
export { validateStructure } from "../src/validation.ts";
