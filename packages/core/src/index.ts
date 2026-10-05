/**
 * Public Core API. Consumers (CLI, Editor Host, automation) see `Document` as an
 * opaque handle; the MyST AST behind it stays inside Core. Every export below is
 * the Core implementation itself, typed with the opaque `Document` (no copy, no
 * wrapper at runtime). MyST types and raw tree access are never exported here.
 */
import type { Document } from "./document.ts";
import { inspectDocument as inspectTree } from "./document.ts";
import { getEditableDocument as editableTree } from "./editable.ts";
import { parse as parseTree } from "./myst/parse.ts";
import { canonicalWriteError as canonicalWriteErrorTree, serialize as serializeTree } from "./myst/serialize.ts";
import type { MystDocument } from "./myst/tree.ts";
import * as operations from "./operations.ts";
import { unresolvedReferences as unresolvedReferencesTree } from "./references.ts";
import { validateStructure as validateTree } from "./validation.ts";

export type { Document, NodePath, BlockSummary } from "./document.ts";
export type { EditableDocument, EditableBlock } from "./editable.ts";
export type { InlineContent, ReferenceRole } from "./inline.ts";
export type { AdmonitionVariant } from "./myst/admonition.ts";
export { ADMONITION_VARIANTS, isAdmonitionVariant } from "./myst/admonition.ts";
/** Paragraph offset length of inline content, as used by split and hard break offsets. */
export { inlineContentLength } from "./inline.ts";
export type { FigureContent } from "./figure.ts";
export type { ListContent, ListItemContent } from "./list.ts";
export type { CodeBlockContent } from "./code.ts";
export type { BlockConversion, TableCellInput } from "./operations.ts";
export type { UnresolvedReference } from "./references.ts";
export { figureContentError } from "./figure.ts";
export { labelError, labelKey } from "./label.ts";
export { sectionBoundaries, sectionMarker, sectionRange, type SectionMarker } from "./section.ts";
export { blockTargets, NUMBERED_KINDS, targetNumbers, type NumberedKind, type NumberedTargets } from "./numbering.ts";

type Opaque<T> = T extends MystDocument ? Document : T;
type Fenced<F> = F extends (...args: infer A) => infer R
  ? (...args: { [K in keyof A]: Opaque<A[K]> }) => Opaque<R>
  : never;

/** Type-only boundary: a Document is the internal tree, seen opaquely. */
function fence<F>(implementation: F): Fenced<F> {
  return implementation as unknown as Fenced<F>;
}

export const parse = fence(parseTree);
export const serialize = fence(serializeTree);
/** Why canonical write (serialize) would refuse the document, or undefined when it is writable. */
export const canonicalWriteError = fence(canonicalWriteErrorTree);
export const getEditableDocument = fence(editableTree);
export const inspectDocument = fence(inspectTree);
export const validateStructure = fence(validateTree);
/** Cross-references that name no target in this document; reported, never a write rule. */
export const unresolvedReferences = fence(unresolvedReferencesTree);

export const insertHardBreak = fence(operations.insertHardBreak);
export const splitParagraph = fence(operations.splitParagraph);
export const mergeParagraphWithPrevious = fence(operations.mergeParagraphWithPrevious);
export const replaceText = fence(operations.replaceText);
export const moveBlock = fence(operations.moveBlock);
export const moveSection = fence(operations.moveSection);
export const removeSection = fence(operations.removeSection);
export const insertParagraph = fence(operations.insertParagraph);
export const insertHeading = fence(operations.insertHeading);
export const insertAdmonition = fence(operations.insertAdmonition);
export const insertEquation = fence(operations.insertEquation);
export const insertFigure = fence(operations.insertFigure);
export const insertTable = fence(operations.insertTable);
export const insertTableRow = fence(operations.insertTableRow);
export const insertTableColumn = fence(operations.insertTableColumn);
export const removeTableRow = fence(operations.removeTableRow);
export const removeTableColumn = fence(operations.removeTableColumn);
export const moveTableRow = fence(operations.moveTableRow);
export const moveTableColumn = fence(operations.moveTableColumn);
export const updateTableColumnAlignment = fence(operations.updateTableColumnAlignment);
export const insertList = fence(operations.insertList);
export const updateList = fence(operations.updateList);
export const insertCodeBlock = fence(operations.insertCodeBlock);
export const updateCodeBlock = fence(operations.updateCodeBlock);
export const removeBlock = fence(operations.removeBlock);
export const updateNodeTextAtPath = fence(operations.updateNodeTextAtPath);
export const updateHeadingLevel = fence(operations.updateHeadingLevel);
export const convertBlock = fence(operations.convertBlock);
export const updateHeadingInlineContent = fence(operations.updateHeadingInlineContent);
export const updateEquationLatex = fence(operations.updateEquationLatex);
export const updateFigure = fence(operations.updateFigure);
export const updateTableCell = fence(operations.updateTableCell);
export const updateParagraphInlineContent = fence(operations.updateParagraphInlineContent);
export const updateAdmonitionInlineContent = fence(operations.updateAdmonitionInlineContent);
export const updateAdmonitionVariant = fence(operations.updateAdmonitionVariant);
export const insertQuote = fence(operations.insertQuote);
export const updateQuoteInlineContent = fence(operations.updateQuoteInlineContent);
export const insertDivider = fence(operations.insertDivider);
export const updateLabel = fence(operations.updateLabel);
export const validateFigure = operations.validateFigure;
