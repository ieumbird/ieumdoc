import type { BibliographySource } from "@ieumdoc/core";
import type {
  AdmonitionVariant,
  CodeBlockContent,
  EditableBlock,
  EditableDocument,
  FigureContent,
  InlineContent,
  ListContent,
  NodePath,
} from "@ieumdoc/core";
import type { NativeDocumentErrorCode, WriteIssue } from "@ieumdoc/core";
import type { SaveFailure } from "./save-error.ts";

/** Read-only recovery mode of document-source; disk is null only for an absent file. */
export type RecoveryPreviewResponse = {
  disk: { source: string; revision: string; document?: EditableDocument; error?: string } | null;
  markdown?: string;
  error?: string;
  failure?: SaveFailure;
};

// Browser Editor/local Host data contract, not a Core operation or backend architecture.
// Paths in edits address the session's opening snapshot, including after Save.
/** The new inline content of an editable Heading. */
export type HeadingEdit = {
  path: NodePath;
  content: InlineContent[];
};

export type HeadingLevelEdit = {
  path: NodePath;
  from: number;
  to: number;
};

export type ParagraphEdit = {
  path: NodePath;
  content: InlineContent[];
};

export type EquationEdit = {
  path: NodePath;
  from: string;
  to: string;
};

export type FigureEdit = {
  path: NodePath;
  from: FigureContent;
  to: FigureContent;
};

/** A simple admonition's new kind and/or body; absent fields are unchanged. */
export type AdmonitionEdit = {
  path: NodePath;
  variant?: AdmonitionVariant;
  content?: InlineContent[];
};

/** The new inline content of an editable table cell; empty clears it. */
export type TableCellEdit = {
  path: NodePath;
  content: InlineContent[];
};

/** A table's new grid: each row and column is its snapshot index, or null when added. Snapshot
 * rows and columns that are absent were removed; the order of the others is their new order. */
export type TableShapeEdit = {
  path: NodePath;
  rows: (number | null)[];
  columns: (number | null)[];
  /** Each column's alignment in the new grid, when any differs from the snapshot. */
  align?: ("left" | "center" | "right" | null)[];
  /** Content typed into added cells, by position in the new grid. */
  cells: { row: number; column: number; content: InlineContent[] }[];
};

/** The new language and code of an editable code block. */
export type CodeEdit = {
  path: NodePath;
  code: CodeBlockContent;
};

/** The whole new content of an editable list. */
export type ListEdit = {
  path: NodePath;
  list: ListContent;
};

/** An Equation, Figure, Table or section target label; an empty `to` removes it (never a target's). */
export type LabelEdit = {
  path: NodePath;
  from: string;
  to: string;
};

/** The new paragraph content of an editable Quote. */
export type QuoteEdit = {
  path: NodePath;
  content: InlineContent[];
};

/** The new paragraph content of an editable footnote definition; its label stays. */
export type FootnoteEdit = {
  path: NodePath;
  content: InlineContent[];
};

export type InsertEdit =
  | { block: "paragraph"; content: InlineContent[] }
  | { block: "heading"; level: number; content: InlineContent[] }
  | { block: "admonition"; variant: AdmonitionVariant; content: InlineContent[] }
  | { block: "quote"; content: InlineContent[] }
  | { block: "footnote"; label: string; content: InlineContent[] }
  | { block: "divider" }
  | { block: "equation"; latex: string; label?: string; enumerator?: string }
  | ({ block: "figure"; label?: string; enumerator?: string } & FigureContent)
  | { block: "table"; rows: InlineContent[][][]; align?: ("left" | "center" | "right" | null)[]; caption?: InlineContent[]; label?: string; enumerator?: string }
  | { block: "list"; list: ListContent }
  | ({ block: "code" } & CodeBlockContent)
  /** A `(label)=` target, labeling the block after it (a section heading in the Editor). */
  | { block: "target"; label: string };

export type OrderItem = { path: NodePath; part: number } | { insert: number };

export type SupportedEdits = {
  /** Staged document-relative declarations; [] removes the optional field through Core. */
  bibliography?: string[];
  /** Default document policy: H1 title, numbered H2-H6; false disables heading numbers. */
  headingNumbering?: boolean;
  referenceTemplates?: import("@ieumdoc/core").ReferenceTemplateUpdate;
  order?: OrderItem[];
  headings?: HeadingEdit[];
  headingLevels?: HeadingLevelEdit[];
  paragraphs?: ParagraphEdit[];
  equations?: EquationEdit[];
  figures?: FigureEdit[];
  cells?: TableCellEdit[];
  tables?: TableShapeEdit[];
  tableCaptions?: { path: NodePath; content: InlineContent[] }[];
  admonitions?: AdmonitionEdit[];
  quotes?: QuoteEdit[];
  footnotes?: FootnoteEdit[];
  lists?: ListEdit[];
  codes?: CodeEdit[];
  labels?: LabelEdit[];
  /** Authored fixed numbers; empty `to` clears through Core updateEnumerator. */
  enumerators?: { path: NodePath; from: string; to: string }[];
  splits?: { path: NodePath; parts: InlineContent[][] }[];
  merges?: { paths: NodePath[]; parts: InlineContent[][] }[];
  inserts?: InsertEdit[];
  deletes?: NodePath[];
};

export type SaveRequest = SupportedEdits & {
  path: string;
  revision: string;
  /** Session locators address this opening source, including across Save and engine history.
   * The previous accepted edits must reproduce the current disk before new edits can write. */
  base: { source: string; savedEdits?: SupportedEdits };
};

export type SampleDocuments = { ko: string; en: string };

export type SampleAvailability = { samples?: SampleDocuments; sampleProblem?: "conflict" | "unavailable" };

export type DocumentFileResponse = SampleAvailability & {
  /** Per-open dependency context; changing the Sidebar never changes this value. */
  bibliographyRoot?: string;
  bibliography?: { declarations: string[]; sources?: BibliographySource[] };
  path: string;
  source: string;
  document: EditableDocument;
  revision: string;
  /** Why Core cannot write this snapshot as canonical Markdown, or null when Save can. */
  /** False when the source writes footnote definitions elsewhere than after the body in endnote
   * order: the first Save moves them there, as Source shows. Opening never writes. */
  endnotesInPlace: boolean;
};

/**
 * The Host's answer to the first request, which names no document, when it opens none: the
 * Editor starts without a document. `samples` offers writable localized samples the user may open.
 */
export type DocumentStartResponse = SampleAvailability & { start: true; allowedRoots?: string[] };

/** Save acknowledges applied edits without replacing the Editor's opening source. */
export type SaveResponse = Pick<DocumentFileResponse, "revision">;

export type SourceResponse = { markdown: string };

export type DocumentErrorResponse = { error: string; code?: NativeDocumentErrorCode; issue?: WriteIssue; target?: OrderItem; failure?: SaveFailure };

/** One entry of a folder listing: a regular sub-folder, or a regular `.md` file (an image file when choosing an image). */
/**
 * A listed folder, document, image or other regular file. In the sidebar listing, `native` tells whether a
 * document starts with the native marker; it is absent when the file could not be read.
 */
export type FolderEntry = { name: string; kind: "folder" | "document" | "image" | "file"; path: string; native?: boolean };

/**
 * One level of a folder the user chose (`root`). `path` is the listed folder inside it and
 * `parent` the folder above it, absent at the root.
 */
export type FolderResponse = { root: string; path: string; parent?: string; entries: FolderEntry[] };

/** A folder on the way from the filesystem root to a browsed folder. */
export type FolderCrumb = { name: string; path: string };

/** One level of any folder while choosing which folder to open; `crumbs` ends with `path`. */
export type FolderBrowseResponse = { path: string; crumbs: FolderCrumb[]; entries: FolderEntry[] };

export type FolderPlace = { kind: "home" | "documents" | "drive" | "root"; name: string; path: string };

export type FolderPlacesResponse = { places: FolderPlace[] };

/** Creates the folder `name` directly inside the existing folder `parent`. */
export type FolderCreateRequest = { parent: string; name: string };

export type FolderCreateResponse = { path: string };
