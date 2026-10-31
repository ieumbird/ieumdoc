import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { getEditableDocument, parse, serialize, type EditableBlock } from "@litzio/core";
import { convertDoclingDocument, readDoclingMap } from "../src/index.ts";
import type { Cell, SourceDocument, SourceItem } from "../src/source.ts";
import profile from "../profiles/litzio-pdf-en-v1.json" with { type: "json" };

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}/document.json`, import.meta.url), "utf8");
const ref = (self_ref: string) => ({ $ref: self_ref });
function text(index: number, value: string, extra: Partial<SourceItem> = {}): SourceItem {
  return { self_ref: `#/texts/${index}`, label: "text", text: value, orig: value,
    parent: ref("#/body"), children: [], content_layer: "body", ...extra } as SourceItem;
}
function source(texts: SourceItem[], extra: Partial<SourceDocument> = {}): SourceDocument {
  return { schema_name: "DoclingDocument", version: "1.10.0", name: "Synthetic API case",
    body: { self_ref: "#/body", label: "unspecified", children: texts.map(t => ref(t.self_ref)), name: "_root_" } as SourceItem,
    texts, tables: [], groups: [], pictures: [], pages: {}, ...extra };
}
const convert = (s: SourceDocument) => convertDoclingDocument(JSON.stringify(s));
const blocks = (markdown: string): EditableBlock[] => getEditableDocument(parse(markdown)).blocks;
function tableSource(num_rows: number, num_cols: number, table_cells: Cell[]): SourceDocument {
  return source([], { body: { self_ref: "#/body", label: "unspecified", children: [ref("#/tables/0")] },
    tables: [{ self_ref: "#/tables/0", label: "table", parent: ref("#/body"), children: [], data: { num_rows, num_cols, table_cells } }] });
}
const cell = (text: string, row: number, col: number, extra: Partial<Cell> = {}): Cell => ({ text,
  start_row_offset_idx: row, end_row_offset_idx: row + (extra.row_span ?? 1),
  start_col_offset_idx: col, end_col_offset_idx: col + (extra.col_span ?? 1), ...extra });
function tableRows(markdown: string): string[][] {
  const table = blocks(markdown).find(b => b.block === "table");
  assert.ok(table?.block === "table");
  return table.rows.map(row => row.cells.map(c => c.text));
}

for (const name of ["nist-sp1108r4", "synthetic"]) test(`${name}: whole saved Docling output has complete, canonical correspondence`, () => {
  const input = fixture(name), original = JSON.parse(input);
  const result = convertDoclingDocument(input);
  const root = new URL(`./fixtures/${name}/`, import.meta.url);
  const read = (file: string) => readFileSync(new URL(file, root));
  const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const record = JSON.parse(read("conversion-record.json").toString("utf8"));
  assert.equal(record.format, "litzio-docling-conversion");
  assert.equal(record.version, 1);
  assert.equal(record.status, "success");
  assert.deepEqual(record.profile, profile);
  assert.equal(record.source.sha256, digest(read("source.pdf")));
  assert.equal(record.source.bytes, read("source.pdf").length);
  assert.equal(record.document.sha256, digest(read("document.json")));
  assert.equal(record.document.pages, Object.keys(original.pages).length);
  assert.equal(record.verification.imageBytesMatchEmbedded, true);
  assert.equal(record.verification.jsonExceptImageUrisMatches, true);
  for (const image of record.images) {
    const bytes = read(image.path);
    assert.equal(bytes.length, image.bytes);
    assert.equal(digest(bytes), image.sha256);
    const uri = image.pointer.slice(1).split("/").reduce((value: any, key: string) => value[key.replaceAll("~1", "/").replaceAll("~0", "~")], original);
    assert.equal(uri, image.path);
  }
  assert.deepEqual(readdirSync(root, { recursive: true }).filter(file => /\.(?:png|jpg|webp)$/u.test(String(file))).map(String).map(file => file.replaceAll("\\", "/")).sort(),
    record.images.map((image: { path: string }) => image.path).sort());
  assert.equal(read("document.md").toString("utf8"), result.markdown);
  assert.deepEqual(readDoclingMap(read("document.docling-map.json").toString("utf8"), result.markdown), result.map);
  const map = readDoclingMap(JSON.stringify(result.map), result.markdown);
  assert.equal(serialize(parse(result.markdown)), result.markdown);
  assert.equal(getEditableDocument(parse(result.markdown)).headingNumbering, undefined);
  const all = [original.body, original.furniture, ...["texts", "groups", "tables", "pictures", "key_value_items", "form_items", "field_items", "field_regions"].flatMap(k => original[k] ?? [])].filter(Boolean);
  assert.deepEqual(new Set(map.items.map(x => x.self_ref)), new Set(all.map(x => x.self_ref)));
  for (const item of all) {
    const mapped = map.items.find(x => x.self_ref === item.self_ref)!;
    assert.deepEqual(mapped.provenance, item.prov ?? [], "page, bbox, coordinate origin and charspan must survive");
    if (item.content_layer === "furniture" || ["page_header", "page_footer"].includes(item.label)) assert.equal(mapped.status, "decoration");
    if (mapped.status === "converted") assert.ok(mapped.targets.length);
    else assert.ok(mapped.reason);
  }
  const headings = blocks(result.markdown).filter(b => b.block === "heading");
  assert.ok(headings.length > 0);
  const lastHeading = original.texts.filter((x: SourceItem) => x.label === "section_header" && x.content_layer === "body").at(-1);
  assert.ok(headings.some(b => b.block === "heading" && b.text === lastHeading.text), "whole document includes final heading");
  if (name === "synthetic") {
    const merged = original.tables.find((t: { data: { table_cells: { col_span: number }[] } }) => t.data.table_cells.some(c => c.col_span > 1));
    assert.ok(merged, "the saved real Docling output must contain the merged-header supplement");
    const mapped = map.items.find(x => x.self_ref === merged.self_ref)!;
    assert.equal(mapped.status, "converted");
    assert.deepEqual(tableRows(result.markdown), [
      ["Operating envelope / Band", "Operating envelope / Minimum", "Operating envelope / Maximum", "Review result / Status"],
      ["Normal", "0.2", "0.8", "Accept"], ["Emergency", "0.8", "1.0", "Review"],
    ]);
    assert.match(mapped.notes.join(" "), /Flattened 1 merged source cells across 3 grid positions/);
    assert.match(mapped.notes.join(" "), /Combined 2 leading column header rows/);
    assert.ok(map.items.some(x => x.status === "converted"));
    assert.ok(map.items.some(x => x.status === "decoration"));
  }
  assert.throws(() => readDoclingMap(JSON.stringify(map), result.markdown + "\n"), /Stale/);
});

test("source schema, version and graph failures refuse instead of silently skipping malformed input", () => {
  assert.throws(() => convertDoclingDocument('{"schema_name":"Other"}'), /Invalid DoclingDocument/);
  assert.throws(() => convert({ ...source([]), version: "1.11.0" } as unknown as SourceDocument), /Expected DoclingDocument 1.10.0/);
  assert.throws(() => convert(source([text(0, "text")], { body: { self_ref: "#/body", label: "unspecified", children: [ref("#/texts/999")] } })), /Dangling/);
  assert.throws(() => convert(source([text(0, "text", { parent: ref("#/texts/0"), children: [ref("#/texts/0")] })], { body: { self_ref: "#/body", label: "unspecified", children: [] } })), /cycle/);
  assert.throws(() => convert(source([text(0, "text", { parent: null })])), /Parent\/child/);
  assert.throws(() => convert(source([text(1, "wrong array position")])), /array position/);
});

test("multi-page provenance keeps each coordinate origin and applies the Docling default explicitly", () => {
  const s = source([text(0, "Continued paragraph", { prov: [
    { page_no: 1, bbox: { l: 1, t: 2, r: 4, b: 5 }, charspan: [0, 10] },
    { page_no: 2, bbox: { l: 2, t: 8, r: 5, b: 6, coord_origin: "BOTTOMLEFT" }, charspan: [10, 19] },
  ] })], { pages: { "1": { page_no: 1, size: { width: 10, height: 20 } }, "2": { page_no: 2, size: { width: 10, height: 20 } } } });
  const r = convert(s);
  assert.deepEqual(r.map.items.find(x => x.self_ref === "#/texts/0")!.provenance.map(p => [p.page_no, p.bbox.coord_origin, p.charspan]),
    [[1, "TOPLEFT", [0, 10]], [2, "BOTTOMLEFT", [10, 19]]]);
  const malformed = structuredClone(s);
  malformed.texts![0].prov![0].charspan = [0, "invalid" as unknown as number];
  assert.throws(() => convert(malformed), /Invalid DoclingDocument/);
});

test("decoration, unsupported content, missing images and unreachable elements are distinct from converted text", () => {
  const s = source([text(0, "1.2 Source number", { label: "section_header", level: 2 }),
    text(1, "Page 1", { label: "page_footer" }), text(2, "Unsupported underline", { formatting: { underline: true } }),
    text(3, "Unreachable", { parent: null })]);
  s.body!.children!.pop();
  s.pictures = [{ self_ref: "#/pictures/0", label: "picture", parent: ref("#/body"), children: [], prov: [] }];
  s.body!.children!.push(ref("#/pictures/0"));
  const result = convert(s);
  assert.equal(blocks(result.markdown)[0].block, "heading");
  assert.equal(blocks(result.markdown).length, 1);
  assert.equal(result.map.items.find(x => x.self_ref === "#/texts/1")!.status, "decoration");
  assert.match(result.map.items.find(x => x.self_ref === "#/texts/2")!.reason!, /Underline/);
  assert.equal(result.map.items.find(x => x.self_ref === "#/texts/3")!.reason, "unreachable");
  assert.match(result.map.items.find(x => x.self_ref === "#/pictures/0")!.reason!, /Missing/);
});

test("nested list item targets resolve through the public list model, including non-1 starts", () => {
  const s = source([text(0, "Outer first", { label: "list_item", marker: "3)", enumerated: true, parent: ref("#/groups/0"), children: [ref("#/groups/1")] }),
    text(1, "Outer second", { label: "list_item", marker: "4)", enumerated: true, parent: ref("#/groups/0") }),
    text(2, "Nested alphabetic", { label: "list_item", marker: "b)", enumerated: true, parent: ref("#/groups/1") })]);
  s.body!.children = [ref("#/groups/0")];
  s.groups = [{ self_ref: "#/groups/0", label: "ordered_list", parent: ref("#/body"), children: [ref("#/texts/0"), ref("#/texts/1")] },
    { self_ref: "#/groups/1", label: "list", parent: ref("#/texts/0"), children: [ref("#/texts/2")] }];
  const r = convert(s), list = blocks(r.markdown)[0];
  assert.equal(list.block, "list");
  if (list.block !== "list") return;
  assert.equal(list.start, 3);
  assert.equal(list.items[0].list?.style, "lower-alpha");
  assert.equal(list.items[0].list?.start, 2);
  const nested = r.map.items.find(x => x.self_ref === "#/texts/2")!;
  assert.deepEqual(nested.targets[0].item, [0, 0]);
  const tampered = structuredClone(r.map); tampered.items.find(x => x.self_ref === nested.self_ref)!.targets[0].item = [0, 999];
  assert.throws(() => readDoclingMap(JSON.stringify(tampered), r.markdown), /list item/);
});

test("standalone footnote digits stay literal; explicit owner relations create and locate final endnotes", () => {
  const s = source([text(0, "A literal value 108 is not an endnote call."), text(1, "108 Source note", { label: "footnote" }), text(2, "Later text")]);
  const plain = convert(s);
  assert.equal(blocks(plain.markdown).some(b => b.block === "footnote"), false);
  assert.match(plain.map.items.find(x => x.self_ref === "#/texts/1")!.notes.join(" "), /no endnote link inferred/);
  s.tables = [{ self_ref: "#/tables/0", label: "table", parent: ref("#/body"), children: [], footnotes: [ref("#/texts/1")],
    data: { num_rows: 1, num_cols: 1, table_cells: [{ text: "Header", start_row_offset_idx: 0, end_row_offset_idx: 1, start_col_offset_idx: 0, end_col_offset_idx: 1, column_header: true }] } }];
  s.body!.children!.push(ref("#/tables/0"));
  const r = convert(s);
  const note = r.map.items.find(x => x.self_ref === "#/texts/1")!;
  assert.equal(note.targets[0].role, "endnote");
  const endnote = blocks(r.markdown).at(-1)!;
  assert.equal(endnote.block, "footnote");
  assert.deepEqual(note.targets[0].path, endnote.path);
  assert.ok(blocks(r.markdown).some(b => b.block === "paragraph" && b.text.includes("108 is not")));
  const tampered = structuredClone(r.map); tampered.items.find(x => x.self_ref === note.self_ref)!.targets[0].label = "other";
  assert.throws(() => readDoclingMap(JSON.stringify(tampered), r.markdown), /endnote/);
});

test("merged body cells repeat across both axes; headers collapse and row roles become ordinary cells", () => {
  const s = tableSource(7, 3, [
    cell("Item", 0, 0, { column_header: true, row_span: 2 }),
    cell("Group", 0, 1, { column_header: true, col_span: 2 }),
    cell("Group", 1, 1, { column_header: true }), cell("Group", 1, 2, { column_header: true }),
    cell("Item", 2, 0, { column_header: true }), cell("Low", 2, 1, { column_header: true }), cell("High", 2, 2, { column_header: true }),
    cell("Row | label", 3, 0, { row_header: true, row_span: 2 }),
    cell("Shared *literal*", 3, 1, { row_span: 2, col_span: 2 }),
    cell("Section", 5, 0, { row_section: true, col_span: 3 }), cell("Last", 6, 0), cell("", 6, 1),
  ]);
  const r = convert(s), mapped = r.map.items.find(x => x.self_ref === "#/tables/0")!;
  assert.equal(mapped.status, "converted");
  assert.deepEqual(tableRows(r.markdown), [
    ["Item", "Group / Low", "Group / High"],
    ["Row | label", "Shared *literal*", "Shared *literal*"],
    ["Row | label", "Shared *literal*", "Shared *literal*"],
    ["Section", "Section", "Section"], ["Last", "", ""],
  ]);
  assert.match(mapped.notes.join(" "), /Flattened 5 merged source cells across 13 grid positions/);
  assert.match(mapped.notes.join(" "), /Combined 3 leading column header rows/);
  assert.match(mapped.notes.join(" "), /Converted 1 row header cells to ordinary cells/);
  assert.match(mapped.notes.join(" "), /Converted 1 row section cells to ordinary cells/);
  assert.equal(serialize(parse(r.markdown)), r.markdown);
  readDoclingMap(JSON.stringify(r.map), r.markdown);
});

test("partial and nonleading headers retain text; headerless tables keep an empty native header", () => {
  const partial = convert(tableSource(2, 2, [cell("Heading", 0, 0, { column_header: true }), cell("Also retained", 0, 1), cell("Value", 1, 0)]));
  assert.deepEqual(tableRows(partial.markdown), [["Heading", "Also retained"], ["Value", ""]]);
  assert.match(partial.map.items.find(x => x.self_ref === "#/tables/0")!.notes.join(" "), /Partial column header rows/);
  const nonleading = convert(tableSource(4, 2, [cell("First body", 0, 0, { row_header: true }),
    cell("Later heading", 2, 0, { column_header: true, col_span: 2 }), cell("Last", 3, 1)]));
  assert.deepEqual(tableRows(nonleading.markdown), [["", ""], ["First body", ""], ["", ""], ["Later heading", "Later heading"], ["", "Last"]]);
  const notes = nonleading.map.items.find(x => x.self_ref === "#/tables/0")!.notes.join(" ");
  assert.match(notes, /inserted empty native header/);
  assert.match(notes, /1 nonleading column header rows as ordinary body cells/);
});

test("invalid merged coordinates, inconsistent spans and overlaps refuse the table", () => {
  for (const cells of [
    [cell("Outside", 0, 0, { row_span: 3 })],
    [cell("Inconsistent", 0, 0, { col_span: 2, end_col_offset_idx: 1 })],
    [cell("Zero span", 0, 0, { row_span: 0 })],
    [cell("Negative", -1, 0)],
    [cell("Merged", 0, 0, { col_span: 2 }), cell("Overlap", 0, 1)],
  ]) {
    const r = convert(tableSource(2, 2, cells)), mapped = r.map.items.find(x => x.self_ref === "#/tables/0")!;
    assert.equal(mapped.status, "unsupported");
    assert.match(mapped.reason!, /Invalid\/overlapping table cell coordinates/);
    assert.deepEqual(mapped.targets, []);
    assert.deepEqual(mapped.notes, []);
  }
});

test("form tables remain unsupported, without discarding their independently convertible captions and notes", () => {
  const s = source([text(0, "Table caption", { label: "caption" }), text(1, "NOTE - table note", { label: "footnote" })]);
  s.tables = [{ self_ref: "#/tables/0", label: "table", parent: ref("#/body"), children: [], captions: [ref("#/texts/0")], footnotes: [ref("#/texts/1")],
    data: { num_rows: 1, num_cols: 2, table_cells: [cell("Fillable", 0, 0, { fillable: true, col_span: 2 })] } }];
  s.body!.children = [ref("#/tables/0"), ...s.body!.children!];
  const r = convert(s);
  assert.match(r.map.items.find(x => x.self_ref === "#/tables/0")!.reason!, /Fillable form cells/);
  assert.ok(blocks(r.markdown).some(b => b.block === "paragraph" && b.text === "Table caption"));
  assert.ok(blocks(r.markdown).some(b => b.block === "paragraph" && b.text === "NOTE - table note"));
  assert.equal(r.map.items.find(x => x.self_ref === "#/tables/0")!.targets.length, 0);
});

test("map version, status and target kind are validated independently of the document hash", () => {
  const r = convert(source([text(0, "Text")]));
  assert.throws(() => readDoclingMap(JSON.stringify({ ...r.map, version: 2 }), r.markdown), /format\/version/);
  const target = structuredClone(r.map); target.items.find(x => x.self_ref === "#/texts/0")!.targets[0].block = "table";
  assert.throws(() => readDoclingMap(JSON.stringify(target), r.markdown), /Missing target/);
  const status = structuredClone(r.map); status.items[0].status = "unsupported";
  assert.throws(() => readDoclingMap(JSON.stringify(status), r.markdown), /status/);
});

test("module imports only public Core API; Core never imports a module", () => {
  const root = new URL("../src/", import.meta.url);
  for (const name of readdirSync(root).filter(x => /\.(?:tsx?|css)$/u.test(x))) {
    const source = readFileSync(new URL(name, root), "utf8");
    if (/\.(?:tsx|css)$/u.test(name)) assert.doesNotMatch(source, /#[a-f\d]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/iu,
      `${name}: module UI colors must come from product tokens`);
    const imports = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/gu)].map(m => m[1]);
    for (const specifier of imports) {
      assert.ok(!specifier.includes("core/") && !specifier.includes("apps/") && !specifier.includes("myst-"), `${name}: ${specifier}`);
      if (specifier.startsWith(".")) assert.ok(new URL(specifier, root).href.startsWith(new URL("../", root).href));
    }
  }
  const manifest = JSON.parse(readFileSync(new URL("../../core/package.json", import.meta.url), "utf8"));
  assert.equal(Object.hasOwn(manifest.dependencies, "@litzio/docling"), false);
  // Core's existing public-api test additionally checks every Core source import.
});
