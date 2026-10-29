import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { fullFormats } from "ajv-formats/dist/formats.js";
import schema from "../schema/docling-document-1.10.0.json" with { type: "json" };

export type Ref = { $ref: string };
export type ImageRef = { uri: string; mimetype: string; dpi: number; size: { width: number; height: number } };
export type Provenance = { page_no: number; bbox: { l: number; t: number; r: number; b: number; coord_origin?: "TOPLEFT" | "BOTTOMLEFT" }; charspan: number[] };
export type Cell = {
  text: string; row_span?: number; col_span?: number;
  start_row_offset_idx: number; end_row_offset_idx: number;
  start_col_offset_idx: number; end_col_offset_idx: number;
  column_header?: boolean; row_header?: boolean; row_section?: boolean; fillable?: boolean;
};
export type SourceItem = {
  self_ref: string; label: string; content_layer?: string; parent?: Ref | null;
  children?: Ref[]; prov?: Provenance[]; text?: string; level?: number;
  formatting?: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; script?: string } | null;
  hyperlink?: string | null; marker?: string; enumerated?: boolean; code_language?: string;
  captions?: Ref[]; footnotes?: Ref[]; references?: Ref[]; image?: ImageRef | null;
  data?: { num_rows: number; num_cols: number; table_cells: Cell[] };
};
export type SourceDocument = {
  schema_name: "DoclingDocument"; version: "1.10.0"; name: string;
  body?: SourceItem; furniture?: SourceItem;
  texts?: SourceItem[]; tables?: SourceItem[]; pictures?: SourceItem[]; groups?: SourceItem[];
  key_value_items?: SourceItem[]; form_items?: SourceItem[]; field_regions?: SourceItem[]; field_items?: SourceItem[];
  pages?: Record<string, { page_no: number; size: { width: number; height: number }; image?: ImageRef | null }>;
};
// Pydantic emits Python named-group syntax in the SemVer pattern. Translate the
// group spelling for JavaScript without changing the accepted language.
let validate: ValidateFunction | undefined;
// Pydantic's path annotation accepts filesystem spelling without platform access
// checks. Resource confinement is the local file adapter's separate responsibility.
export const collections = ["texts", "tables", "pictures", "groups", "key_value_items", "form_items", "field_regions", "field_items"] as const;

/** Version-pinned official schema, followed by reference/reading-order integrity. Never mutates input. */
export function readSource(text: string): { source: SourceDocument; nodes: Map<string, SourceItem> } {
  const input: unknown = JSON.parse(text.replace(/^\uFEFF/u, ""));
  validate ??= new Ajv2020({ strict: false, formats: { ...fullFormats, path: { type: "string", validate: () => true } } })
    .compile(JSON.parse(JSON.stringify(schema).replaceAll("(?P<", "(?<")));
  if (!validate(input)) throw new Error(`Invalid DoclingDocument: ${JSON.stringify(validate.errors?.slice(0, 4))}`);
  const source = input as SourceDocument;
  if (source.schema_name !== "DoclingDocument" || source.version !== "1.10.0") throw new Error("Expected DoclingDocument 1.10.0");
  const nodes = new Map<string, SourceItem>();
  if (source.body) source.body.label ??= "unspecified";
  if (source.furniture) source.furniture.label ??= "unspecified";
  const defaultLabels = { texts: "text", tables: "table", pictures: "picture", groups: "unspecified",
    key_value_items: "key_value_region", form_items: "form", field_regions: "field_region", field_items: "field_item" };
  for (const key of collections) for (const item of source[key] ?? []) {
    item.label ??= key === "texts" && item.level !== undefined ? "section_header"
      : key === "texts" && item.enumerated !== undefined ? "list_item"
      : key === "texts" && item.code_language !== undefined ? "code" : defaultLabels[key];
  }
  for (const item of [source.body, source.furniture, ...collections.flatMap(key => source[key] ?? [])]) {
    if (!item) continue;
    if (nodes.has(item.self_ref)) throw new Error(`Duplicate self_ref: ${item.self_ref}`);
    nodes.set(item.self_ref, item);
  }
  for (const [key, root] of [["body", source.body], ["furniture", source.furniture]] as const) {
    if (root && root.self_ref !== `#/${key}`) throw new Error(`Invalid ${key} root self_ref`);
  }
  for (const key of collections) for (const [i, item] of (source[key] ?? []).entries()) {
    if (item.self_ref !== `#/${key}/${i}`) throw new Error(`self_ref does not match array position: ${item.self_ref}`);
  }
  const owners = new Map<string, string>();
  for (const item of nodes.values()) {
    for (const ref of [...(item.children ?? []), ...(item.captions ?? []), ...(item.footnotes ?? []), ...(item.references ?? []), ...(item.parent ? [item.parent] : [])]) {
      if (!nodes.has(ref.$ref)) throw new Error(`Dangling reference ${ref.$ref} from ${item.self_ref}`);
    }
    for (const ref of item.children ?? []) {
      if (owners.has(ref.$ref)) throw new Error(`Repeated reading-order child: ${ref.$ref}`);
      owners.set(ref.$ref, item.self_ref);
      if (nodes.get(ref.$ref)!.parent?.$ref !== item.self_ref) throw new Error(`Parent/child mismatch: ${ref.$ref}`);
    }
    for (const p of item.prov ?? []) {
      if (!source.pages?.[String(p.page_no)]) throw new Error(`Missing provenance page ${p.page_no}: ${item.self_ref}`);
    }
  }
  const active = new Set<string>(), done = new Set<string>();
  function visit(item: SourceItem): void {
    if (active.has(item.self_ref)) throw new Error(`Reading-order cycle: ${item.self_ref}`);
    if (done.has(item.self_ref)) return;
    active.add(item.self_ref);
    for (const ref of item.children ?? []) visit(nodes.get(ref.$ref)!);
    active.delete(item.self_ref); done.add(item.self_ref);
  }
  for (const item of nodes.values()) visit(item);
  return { source, nodes };
}
