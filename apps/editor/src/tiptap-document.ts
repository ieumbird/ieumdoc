/**
 * The Editor ↔ Core bridge. Core → Tiptap projection lives in tiptap-projection.ts; Tiptap →
 * SupportedEdits collection and structure validation in tiptap-edits.ts. This module keeps the
 * bridge's public surface in one place.
 */
export type { TiptapJSON } from "./tiptap-inline.ts";
export type {
  HeadingEdit,
  HeadingLevelEdit,
  ParagraphEdit,
  EquationEdit,
  FigureEdit,
  AdmonitionEdit,
  TableCellEdit,
  TableShapeEdit,
  ListEdit,
  CodeEdit,
  LabelEdit,
  QuoteEdit,
  InsertEdit,
  OrderItem,
  SupportedEdits,
} from "../shared/document-protocol.ts";
export {
  BLOCK_SOURCES_ATTR,
  blockSourcesOf,
  isNewBlockPath,
  NEW_BLOCK_PREFIX,
  paragraphContent,
  pathKey,
  TABLE_CELL_SOURCE_ATTR,
  toTiptapBlockNode,
  toTiptapDocument,
  withBlockSourceNodes,
  withBlockSources,
  type AppliedBlockSources,
} from "./tiptap-projection.ts";
export {
  appliedDocument,
  assertSupportedDocumentChange,
  collectSupportedEdits,
  DELETED_PATHS_ATTR,
  deletedPathsOf,
  figureContent,
  freshBlockPath,
  isSessionPlaceholder,
  isSupportedDocumentChange,
  normalizeEngineDocument,
  tableCaption,
} from "./tiptap-edits.ts";
