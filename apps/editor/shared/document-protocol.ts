import type {
  AdmonitionVariant,
  CodeBlockContent,
  EditableDocument,
  FigureContent,
  InlineContent,
  ListContent,
  NodePath,
} from "@ieumdoc/core";

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

/** Rows and columns added to a table: each entry is the snapshot index, or null when added. */
export type TableShapeEdit = {
  path: NodePath;
  rows: (number | null)[];
  columns: (number | null)[];
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

/** An Equation or Figure label; an empty `to` removes it. */
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

export type InsertEdit =
  | { block: "paragraph"; content: InlineContent[] }
  | { block: "heading"; level: number; content: InlineContent[] }
  | { block: "admonition"; variant: AdmonitionVariant; content: InlineContent[] }
  | { block: "quote"; content: InlineContent[] }
  | { block: "divider" }
  | { block: "equation"; latex: string; label?: string }
  | ({ block: "figure"; label?: string } & FigureContent)
  | { block: "table"; rows: InlineContent[][][]; align?: ("left" | "center" | "right" | null)[] }
  | { block: "list"; list: ListContent }
  | ({ block: "code" } & CodeBlockContent);

export type OrderItem = { path: NodePath; part: number } | { insert: number };

export type SupportedEdits = {
  order?: OrderItem[];
  headings?: HeadingEdit[];
  headingLevels?: HeadingLevelEdit[];
  paragraphs?: ParagraphEdit[];
  equations?: EquationEdit[];
  figures?: FigureEdit[];
  cells?: TableCellEdit[];
  tables?: TableShapeEdit[];
  admonitions?: AdmonitionEdit[];
  quotes?: QuoteEdit[];
  lists?: ListEdit[];
  codes?: CodeEdit[];
  labels?: LabelEdit[];
  splits?: { path: NodePath; parts: InlineContent[][] }[];
  merges?: { paths: NodePath[]; parts: InlineContent[][] }[];
  inserts?: InsertEdit[];
  deletes?: NodePath[];
};

export type SaveRequest = SupportedEdits & {
  /** Optional document locator; the Host retains its default-file behavior. */
  path?: string;
  revision?: string;
  /** Session locators address this opening source, including across Save and engine history.
   * The previous accepted edits must reproduce the current disk before new edits can write. */
  base?: { source: string; savedEdits?: SupportedEdits };
};

export type DocumentFileResponse = {
  path: string;
  source: string;
  document: EditableDocument;
  revision: string;
  /** Why Core cannot write this snapshot as canonical Markdown, or null when Save can. */
  writeError: string | null;
};

/** The Editor always submits the acknowledged revision; the Host still checks it at runtime. */
export type SessionSaveRequest = SaveRequest & Required<Pick<SaveRequest, "revision">>;

/** Save acknowledges applied edits without replacing the Editor's opening source. */
export type SaveResponse = Omit<DocumentFileResponse, "source">;

export type SourceResponse = { markdown: string };

export type DocumentErrorResponse = { error: string; target?: OrderItem };
