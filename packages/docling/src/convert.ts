import {
  bodyEndIndex, createDocument, getEditableDocument, insertCodeBlock, insertEquation,
  insertFigure, insertFootnoteDefinition, insertHeading, insertList, insertParagraph,
  insertTable, parse, serialize, updateHeadingNumbering, updateTableCaption,
  type Document, type InlineContent, type ListContent, type ListStyle,
} from "@litzio/core";
import { createMap, readDoclingMap, type MapItem, type Target, type DoclingMap } from "./map.ts";
import { readSource, type SourceItem } from "./source.ts";

export type Conversion = { markdown: string; map: DoclingMap };
export type ConversionOptions = {
  /** Host-resolved image URIs; null explicitly reports an unavailable resource. */
  images?: ReadonlyMap<string, string | null>;
};
const clean = (value: string = ""): string => value.replace(/\s+/gu, " ").trim();
const decoration = (x: SourceItem): boolean => x.content_layer === "furniture" || ["page_header", "page_footer"].includes(x.label);

/** Whole-document interpretation only; Core owns all native document meaning and writes. */
export function convertDoclingDocument(input: string, options: ConversionOptions = {}): Conversion {
  const { source, nodes } = readSource(input);
  let doc = updateHeadingNumbering(createDocument(), false);
  const mappings = new Map<string, MapItem>([...nodes.values()].map(x => [x.self_ref, {
    self_ref: x.self_ref, label: x.label, content_layer: x.content_layer ?? "body", parent: x.parent?.$ref ?? null,
    provenance: (x.prov ?? []).map(p => ({ ...structuredClone(p), bbox: { ...p.bbox, coord_origin: p.bbox.coord_origin ?? "TOPLEFT" } })),
    status: decoration(x) ? "decoration" : "unsupported",
    reason: decoration(x) ? "furniture" : "unreachable", targets: [],
    notes: x.text !== undefined && clean(x.text) !== x.text ? ["Text whitespace normalized to a single line; source text remains in Docling input."] : [],
  }]));
  const entry = (x: SourceItem): MapItem => mappings.get(x.self_ref)!;
  function mark(x: SourceItem, targets: Target[], note?: string): void {
    if (decoration(x)) return;
    Object.assign(entry(x), { status: "converted", targets });
    delete entry(x).reason;
    if (note) entry(x).notes.push(note);
  }
  function refuse(x: SourceItem, reason: string): void { if (!decoration(x)) entry(x).reason = reason; }
  const children = (x: SourceItem): SourceItem[] => (x.children ?? []).map(r => nodes.get(r.$ref)!);
  const related = (x: SourceItem, key: "captions" | "footnotes"): SourceItem[] => (x[key] ?? []).map(r => nodes.get(r.$ref)!);
  const associated = new Set([...nodes.values()].flatMap(x => [...(x.captions ?? []), ...(x.footnotes ?? [])].map(r => r.$ref)));
  const pendingNotes = new Map<string, SourceItem>();
  const emitted = new Set<string>();
  function inline(x: SourceItem, text = x.text ?? ""): InlineContent[] {
    if (x.formatting?.underline) throw new Error("Underline has no native inline equivalent");
    const textValue = clean(text);
    let content: InlineContent[] = textValue ? [{ kind: "text", text: textValue }] : [];
    const f = x.formatting;
    if (f?.script && f.script !== "baseline") content = [{ kind: f.script === "sub" ? "subscript" : "superscript", children: content }];
    if (f?.strikethrough) content = [{ kind: "delete", children: content }];
    if (f?.italic) content = [{ kind: "emphasis", children: content }];
    if (f?.bold) content = [{ kind: "strong", children: content }];
    if (x.hyperlink) content = [{ kind: "link", url: x.hyperlink, children: content }];
    return content;
  }
  function noteCalls(x: SourceItem): InlineContent[] {
    return related(x, "footnotes").filter(n => {
      if (decoration(n) || !clean(n.text)) return false;
      try { inline(n); return true; } catch { return false; }
    }).map(n => {
      pendingNotes.set(n.self_ref, n);
      return { kind: "footnote", label: `docling-${n.self_ref.slice(2).replaceAll("/", "-")}` };
    });
  }
  function add(x: SourceItem, block: Target["block"], change: (doc: Document, index: number) => Document): Target {
    const index = bodyEndIndex(doc);
    // Core operations return a new document; failure never publishes the partial change.
    doc = change(doc, index);
    const target: Target = { path: [index], block, role: "block" };
    mark(x, [target]);
    return target;
  }
  function captions(x: SourceItem): InlineContent[] {
    return related(x, "captions").filter(c => !decoration(c)).flatMap((c, i) => [...(i ? [{ kind: "text" as const, text: " " }] : []), ...inline(c)]);
  }
  function descendants(x: SourceItem): SourceItem[] { return children(x).flatMap(c => [c, ...descendants(c)]); }

  function listContent(x: SourceItem, index: number, route: number[] = []): { list: ListContent; marks: [SourceItem, Target][] } {
    const items = children(x);
    if (!items.length || items.some(c => c.label !== "list_item" || decoration(c))) throw new Error("List has non-item children or is empty");
    const ordered = x.label === "ordered_list" || items.some(c => c.enumerated);
    if (items.some(c => Boolean(c.enumerated) !== ordered)) throw new Error("Mixed ordered and unordered list markers");
    let start = 1, style: ListStyle = "decimal", delimiter: "." | ")" = ".";
    if (ordered) {
      const first = /^(\d+|[a-zA-Z])[.)]$/u.exec(items[0].marker ?? "");
      if (!first) throw new Error("List marker is not supported by native lists");
      delimiter = items[0].marker!.endsWith(")") ? ")" : ".";
      if (/^\d+$/u.test(first[1])) start = Number(first[1]);
      else { style = first[1] === first[1].toUpperCase() ? "upper-alpha" : "lower-alpha"; start = first[1].toLowerCase().charCodeAt(0) - 96; }
      for (const [i, child] of items.entries()) {
        const marker = style === "decimal" ? String(start + i) : String.fromCharCode((style === "upper-alpha" ? 65 : 97) + start + i - 1);
        if (child.marker !== marker + delimiter) throw new Error("Nonsequential or mixed list markers");
      }
    } else if (items.some(c => c.marker && !["-", "*", "+", "•", "–", "—", "\uf8e7"].includes(c.marker))) {
      throw new Error("Unrecognized bullet marker");
    }
    const marks: [SourceItem, Target][] = [];
    const list: ListContent = { ordered, ...(ordered ? { start, style, delimiter } : {}), items: items.map((child, i) => {
      const nested = children(child);
      if (nested.length > 1 || nested.some(c => !["list", "ordered_list"].includes(c.label))) throw new Error("List item has unsupported nested structure");
      const item = [...route, i];
      marks.push([child, { path: [index], block: "list", role: "list-item", item }]);
      const sub = nested.length ? listContent(nested[0], index, item) : undefined;
      if (sub) marks.push([nested[0], { path: [index], block: "list", role: "list-item", item }], ...sub.marks);
      return { content: inline(child), ...(sub ? { list: sub.list } : {}) };
    }) };
    return { list, marks };
  }

  function emit(x: SourceItem, owned = false): void {
    if (emitted.has(x.self_ref)) return;
    if (pendingNotes.has(x.self_ref)) return;
    if (!owned && associated.has(x.self_ref)) return;
    emitted.add(x.self_ref);
    if (decoration(x)) { for (const child of children(x)) emit(child); return; }
    if (x.content_layer && x.content_layer !== "body") { refuse(x, `Unsupported content layer: ${x.content_layer}`); return; }
    const pendingBefore = new Set(pendingNotes.keys());
    try {
      if (["list", "ordered_list"].includes(x.label)) {
        try {
          const built = listContent(x, bodyEndIndex(doc));
          add(x, "list", (d, at) => insertList(d, at, built.list));
          for (const [child, target] of built.marks) { emitted.add(child.self_ref); mark(child, [target]); }
          return;
        } catch (error) {
          entry(x).notes.push(`Native list unavailable: ${(error as Error).message}; item markers retained as prose.`);
          for (const child of children(x)) emit(child);
          const targets = children(x).flatMap(c => entry(c).targets);
          if (targets.length) mark(x, targets); else refuse(x, "No convertible list items");
          return;
        }
      }
      if (x.label === "table" || x.label === "document_index") {
        const data = x.data;
        if (!data || data.num_rows < 1 || data.num_cols < 1) throw new Error("Empty table");
        if (data.num_rows * data.num_cols > 100000) throw new Error("Table exceeds conversion cell limit");
        if (data.table_cells.some(c => c.fillable)) throw new Error("Fillable form cells have no native table equivalent");
        const rows: string[][] = Array.from({ length: data.num_rows }, () => Array(data.num_cols).fill(""));
        const occupied = new Set<string>();
        const headerRows = new Set<number>();
        let mergedCells = 0, mergedPositions = 0;
        for (const cell of data.table_cells) {
          const r = cell.start_row_offset_idx, c = cell.start_col_offset_idx;
          const endRow = cell.end_row_offset_idx, endCol = cell.end_col_offset_idx;
          if (![r, c, endRow, endCol].every(Number.isInteger) || r < 0 || c < 0 || endRow > data.num_rows || endCol > data.num_cols ||
              endRow <= r || endCol <= c || endRow - r !== (cell.row_span ?? 1) || endCol - c !== (cell.col_span ?? 1)) {
            throw new Error("Invalid/overlapping table cell coordinates or inconsistent spans");
          }
          if (endRow - r > 1 || endCol - c > 1) { mergedCells++; mergedPositions += (endRow - r) * (endCol - c); }
          for (let row = r; row < endRow; row++) {
            if (cell.column_header) headerRows.add(row);
            for (let col = c; col < endCol; col++) {
              const key = `${row},${col}`;
              if (occupied.has(key)) throw new Error("Invalid/overlapping table cell coordinates");
              occupied.add(key); rows[row][col] = clean(cell.text);
            }
          }
        }
        const notes: string[] = [];
        if (mergedCells) notes.push(`Flattened ${mergedCells} merged source cells across ${mergedPositions} grid positions; repeated text in every covered position.`);
        let headerCount = 0;
        while (headerRows.has(headerCount)) headerCount++;
        if (headerCount > 1) {
          const header = Array.from({ length: data.num_cols }, (_, col) => {
            const parts: string[] = [];
            for (let row = 0; row < headerCount; row++) {
              const value = rows[row][col];
              if (value && value !== parts.at(-1)) parts.push(value);
            }
            return parts.join(" / ");
          });
          rows.splice(0, headerCount, header);
          notes.push(`Combined ${headerCount} leading column header rows into one using " / "; consecutive repeated labels appear once.`);
        }
        if (!headerCount) { rows.unshift(Array(data.num_cols).fill("")); notes.push("Headerless source table: inserted empty native header row."); }
        if (data.table_cells.some(c => c.start_row_offset_idx < headerCount && clean(c.text) && !c.column_header)) notes.push("Partial column header rows: retained all cell text in the native header.");
        const nonleadingHeaders = [...headerRows].filter(row => row >= headerCount).length;
        if (nonleadingHeaders) notes.push(`Retained ${nonleadingHeaders} nonleading column header rows as ordinary body cells.`);
        const rowHeaders = data.table_cells.filter(c => c.row_header).length, rowSections = data.table_cells.filter(c => c.row_section).length;
        if (rowHeaders) notes.push(`Converted ${rowHeaders} row header cells to ordinary cells.`);
        if (rowSections) notes.push(`Converted ${rowSections} row section cells to ordinary cells.`);
        const caption = [...captions(x), ...noteCalls(x)];
        const target = add(x, "table", (d, at) => {
          const next = insertTable(d, at, rows.map(row => row.map(text => [{ kind: "text", text }])));
          return caption.length ? updateTableCaption(next, [at], caption) : next;
        });
        entry(x).notes.push(...notes);
        for (const c of related(x, "captions")) { emitted.add(c.self_ref); mark(c, [{ ...target, role: "caption" }]); }
        for (const child of children(x)) emit(child);
        for (const note of related(x, "footnotes")) if (!pendingNotes.has(note.self_ref)) emit(note, true);
        return;
      }
      if (x.label === "picture") {
        const uri = x.image?.uri;
        const imageUrl = uri && (options.images?.has(uri) ? options.images.get(uri) : uri);
        if (!imageUrl) throw new Error("Missing or unavailable picture image");
        const caption = [...captions(x), ...noteCalls(x)];
        const inner = descendants(x).filter(c => !(x.captions ?? []).some(r => r.$ref === c.self_ref));
        const alt = inner.filter(c => !decoration(c)).map(c => clean(c.text)).filter(Boolean).join("; ");
        const target = add(x, "figure", (d, at) => insertFigure(d, at, { imageUrl, imageAlt: alt, caption }));
        for (const c of related(x, "captions")) { emitted.add(c.self_ref); mark(c, [{ ...target, role: "caption" }]); }
        for (const child of inner) {
          emitted.add(child.self_ref);
          mark(child, [{ ...target, role: "image-content" }], "Represented by source picture pixels; not recreated as native text/structure.");
        }
        for (const note of related(x, "footnotes")) if (!pendingNotes.has(note.self_ref)) emit(note, true);
        return;
      }
      if (x.label === "section_header" || x.label === "title") {
        if (!clean(x.text)) throw new Error("Empty heading");
        add(x, "heading", (d, at) => insertHeading(d, at, x.label === "title" ? 1 : x.level ?? 1, inline(x)));
      } else if (x.label === "formula") {
        if (!clean(x.text)) throw new Error("Empty source formula");
        add(x, "equation", (d, at) => insertEquation(d, at, x.text!));
        entry(x).notes.push("Docling formula text retained as LaTeX; equation-number and OCR correctness require source review.");
      } else if (x.label === "code") {
        add(x, "code", (d, at) => insertCodeBlock(d, at, { code: x.text ?? "", language: x.code_language === "unknown" ? "" : x.code_language ?? "" }));
      } else if (["text", "paragraph", "caption", "footnote", "list_item", "reference"].includes(x.label)) {
        if (!clean(x.text)) throw new Error("Empty text");
        const text = x.label === "list_item" && x.marker ? `${x.marker} ${x.text}` : x.text;
        add(x, "paragraph", (d, at) => insertParagraph(d, at, inline(x, text)));
        if (x.label === "footnote") entry(x).notes.push("No explicit inline call site: original footnote text retained as prose; no endnote link inferred.");
        if (x.label === "list_item") entry(x).notes.push("Source marker retained literally in prose.");
      } else if (["unspecified", "section", "chapter"].includes(x.label)) {
        for (const child of children(x)) emit(child);
        const targets = children(x).flatMap(c => entry(c).targets);
        if (targets.length) mark(x, targets.map(t => ({ ...t, role: "group" })), "Reading-order container; children supply native targets.");
        else refuse(x, "Empty container or no convertible children");
        return;
      } else {
        refuse(x, `Unsupported source label: ${x.label}`);
      }
    } catch (error) {
      for (const ref of pendingNotes.keys()) if (!pendingBefore.has(ref)) pendingNotes.delete(ref);
      refuse(x, (error as Error).message);
    }
    for (const child of children(x)) emit(child);
    // On a refused owner, preserve caption/footnote text independently instead of losing it.
    if (entry(x).status !== "converted") for (const child of [...related(x, "captions"), ...related(x, "footnotes")]) emit(child, true);
  }
  if (source.body) emit(source.body);
  if (source.furniture) emit(source.furniture);
  for (const [ref, note] of pendingNotes) {
    const label = `docling-${ref.slice(2).replaceAll("/", "-")}`;
    doc = insertFootnoteDefinition(doc, bodyEndIndex(doc), label, inline(note));
    emitted.add(ref);
    entry(note).notes.push("Explicit owner footnotes relation; call appended to owner caption. Original text/number retained; display number follows Core.");
    mark(note, [{ path: [], block: "footnote", role: "endnote", label }]);
  }
  const markdown = serialize(doc);
  const reopened = parse(markdown);
  if (serialize(reopened) !== markdown) throw new Error("Canonical reopen mismatch");
  const blocks = getEditableDocument(reopened).blocks;
  for (const item of mappings.values()) for (const target of item.targets) {
    if (target.role === "endnote") target.path = [...blocks.find(b => b.block === "footnote" && b.label === target.label)!.path];
  }
  const map = createMap(source, input, markdown, [...mappings.values()]);
  // The page-image resolver uses the same asset namespace as native Figures.
  for (const page of Object.values(map.pages)) if (page.image && options.images?.has(page.image.uri)) {
    const uri = options.images.get(page.image.uri);
    page.image = uri ? { ...page.image, uri } : null;
  }
  readDoclingMap(JSON.stringify(map), markdown);
  return { markdown, map };
}
