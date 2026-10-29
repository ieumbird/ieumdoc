// Spike (spike/docling-compare-1030): the chapter converter instrumented to also write <chapter>.docling-map.json,
// recording for every Docling item its prov bbox and the IeumDoc block (and list item / footnote) it produced.
// Markdown output is byte-identical to the uninstrumented converter. Usage: tsx convert-mapped.mjs <document.json> <dest> 7 <repo>
// Run with the repository's tsx, without installing anything:
// C:\Projects\ieumdoc\node_modules\.bin\tsx.cmd convert.mjs <document.json> [output-folder] [chapter=7] [ieumdoc-repo]
// Deterministic Docling adapter: no image OCR or per-item semantic correction.
// Furniture is excluded; image child text is represented by the image itself.
// Merged cells repeat their source text; genuine empty cells stay empty.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [input, destination = path.dirname(fileURLToPath(import.meta.url)), chapter = '7', repo = 'C:/Projects/ieumdoc'] = process.argv.slice(2);
if (!input) throw new Error('Usage: tsx convert.mjs <document.json> [output-folder] [chapter] [ieumdoc-repo]');
const core = await import(pathToFileURL(path.join(repo, 'packages/core/src/index.ts')).href);
const source = JSON.parse(fs.readFileSync(input, 'utf8'));
if (source.schema_name !== 'DoclingDocument' || source.version !== '1.10.0') throw new Error('Expected DoclingDocument 1.10.0');
const nodes = new Map(['texts', 'groups', 'tables', 'pictures'].flatMap(k => source[k] ?? []).map(x => [x.self_ref, x]));
const roots = source.body.children.map(r => nodes.get(r.$ref));
const start = roots.findIndex(x => x.label === 'section_header' && new RegExp(`^${chapter}\\.\\s`).test(x.text));
if (start < 0) throw new Error('Chapter not found');
let end = roots.findIndex((x, i) => i > start && x.label === 'section_header' && new RegExp(`^${Number(chapter) + 1}\\.\\s`).test(x.text));
if (end < 0) end = roots.length;
const selected = roots.slice(start, end);
const all = [];
function collect(x) { all.push(x); for (const r of x.children ?? []) collect(nodes.get(r.$ref)); }
selected.forEach(collect);
const clean = s => String(s ?? '').replace(/\s+/gu, ' ').trim();
const notes = new Map(all.filter(x => x.label === 'footnote').flatMap(x => {
  const m = /^(\d+)\s+(.+)$/u.exec(clean(x.text)); return m ? [[m[1], m[2]]] : [];
}));
const usedNotes = new Set();
function inline(value) {
  const s = clean(value), result = []; let last = 0;
  for (const m of s.matchAll(/\b\d+\b/gu)) {
    if (!notes.has(m[0])) continue;
    if (m.index > last) result.push({ kind: 'text', text: s.slice(last, m.index) });
    result.push({ kind: 'footnote', label: 'source-' + m[0] }); usedNotes.add(m[0]); last = m.index + m[0].length;
  }
  if (last < s.length) result.push({ kind: 'text', text: s.slice(last) });
  return result;
}
let doc = core.createDocument();
const map = new Map(); const mark = (x, block, extra = {}) => { if (x?.self_ref && !map.has(x.self_ref)) map.set(x.self_ref, { block, ...extra }); };
const topIndex = () => core.bodyEndIndex(doc);
const at = () => core.bodyEndIndex(doc);
function paragraph(s, x) { if (clean(s)) { mark(x, at(), { kind: 'paragraph' }); doc = core.insertParagraph(doc, at(), inline(s)); } else if (x) mark(x, null, { reason: 'empty' }); }
fs.mkdirSync(path.join(destination, 'assets'), { recursive: true });
function emit(x) {
  if (x.content_layer === 'furniture' || ['page_header', 'page_footer', 'caption'].includes(x.label)) { mark(x, null, { reason: x.content_layer === 'furniture' ? 'furniture' : x.label }); return; }
  if (x.label === 'footnote') return;
  if (x.label === 'section_header') { mark(x, at(), { kind: 'heading' }); doc = core.insertHeading(doc, at(), Math.min(6, Math.max(1, x.level)), clean(x.text)); return; }
  if (x.label === 'formula') { mark(x, at(), { kind: 'equation' }); doc = core.insertEquation(doc, at(), x.text); return; }
  if (x.label === 'table' || x.label === 'document_index') {
    const data = x.data, grid = Array.from({ length: data.num_rows }, () => Array(data.num_cols).fill(''));
    for (const c of data.table_cells) for (let r = c.start_row_offset_idx; r < c.end_row_offset_idx; r++)
      for (let col = c.start_col_offset_idx; col < c.end_col_offset_idx; col++) grid[r][col] = clean(c.text);
    const headers = [...new Set(data.table_cells.filter(c => c.column_header).map(c => c.start_row_offset_idx))].sort((a,b) => a-b);
    let rows = grid;
    if (headers.length > 1 && headers.every((r,i) => r === i)) {
      const head = grid[0].map((_, c) => [...new Set(headers.map(r => grid[r][c]).filter(Boolean))].join(' / '));
      rows = [head, ...grid.slice(headers.length)];
    } else if (!headers.length) rows = [Array(data.num_cols).fill(''), ...grid];
    const index = at(); mark(x, index, { kind: 'table' }); for (const r of x.captions) mark(nodes.get(r.$ref), index, { kind: 'caption' }); doc = core.insertTable(doc, index, rows.map(r => r.map(inline)));
    const caption = x.captions.map(r => clean(nodes.get(r.$ref).text)).join(' ');
    if (caption) doc = core.updateTableCaption(doc, [index], caption);
    const captions = new Set(x.captions.map(r => r.$ref));
    for (const r of x.children ?? []) if (!captions.has(r.$ref)) emit(nodes.get(r.$ref));
    return;
  }
  if (x.label === 'picture') {
    if (!x.image?.uri) throw new Error('Missing image: ' + x.self_ref);
    const imagePath = path.resolve(path.dirname(input), x.image.uri), name = path.basename(imagePath);
    if (!process.env.MAP_ONLY) fs.copyFileSync(imagePath, path.join(destination, 'assets', name));
    const caption = x.captions.map(r => clean(nodes.get(r.$ref).text)).join(' ');
    const childText = x.children.map(r => nodes.get(r.$ref)).filter(c => c.label !== 'caption').map(c => clean(c.text)).join('; ');
    mark(x, at(), { kind: 'figure' }); for (const r of x.captions) mark(nodes.get(r.$ref), at(), { kind: 'caption' }); for (const r of x.children ?? []) { const c = nodes.get(r.$ref); mark(c, at(), { kind: 'figure-text' }); }
    doc = core.insertFigure(doc, at(), { imageUrl: 'assets/' + name, imageAlt: childText || caption, caption });
    return;
  }
  if (x.label === 'list') {
    const children = x.children.map(r => nodes.get(r.$ref));
    if (children.every(c => c.label === 'list_item' && !c.children.length)) {
      const ordered = children.some(c => c.enumerated), marker = children[0]?.marker ?? '';
      // Native lists cannot retain alphabetic markers. Keep those markers as prose.
      if (ordered && children.some(c => /^[a-z]\)/iu.test(c.marker ?? ''))) {
        mark(x, at(), { kind: 'paragraph-list' }); for (const c of children) paragraph((c.marker ? c.marker + ' ' : '') + c.text, c);
        return;
      }
      const begin = /^\d+/u.test(marker) ? parseInt(marker) : /^[a-z]\)/iu.test(marker) ? marker.toLowerCase().charCodeAt(0) - 96 : 1;
      mark(x, at(), { kind: 'list' }); children.forEach((c, i) => mark(c, at(), { kind: 'list-item', item: i }));
      doc = core.insertList(doc, at(), { ordered, ...(ordered ? { start: begin } : {}), items: children.map(c => ({ content: inline(clean(c.text).replace(/^[\uF8E7—–•]\s*/u, '')) })) });
    } else { mark(x, at(), { kind: 'group' }); for (const child of children) emit(child); }
    return;
  }
  if (x.text !== undefined) paragraph(x.text, x);
  for (const r of x.children ?? []) emit(nodes.get(r.$ref));
}
selected.forEach(emit);
for (const [number, text] of notes) {
  const fn = all.find(x => x.label === 'footnote' && /^(\d+)\s/u.exec(clean(x.text))?.[1] === number);
  if (usedNotes.has(number)) { mark(fn, null, { kind: 'footnote', footnote: 'source-' + number }); } else mark(fn, at(), { kind: 'paragraph' });
  if (usedNotes.has(number)) doc = core.insertFootnoteDefinition(doc, at(), 'source-' + number, [{ kind: 'text', text }]);
  else paragraph(number + ' ' + text);
}
for (const x of all) if (x.label === 'footnote') mark(x, null, { reason: 'footnote-unparsed' });
for (const x of all) mark(x, null, { reason: 'group-only' });
const result = core.serialize(doc);
if (core.serialize(core.parse(result)) !== result) throw new Error('Canonical reopen mismatch');
const output = path.join(destination, `chapter-${chapter}.md`);
fs.writeFileSync(output, result, 'utf8');
// --- mapping sidecar ---
const parsed = core.parse(result);
const blockCount = core.bodyEndIndex(parsed);
const pagesUsed = new Set(all.flatMap(x => (x.prov ?? []).map(p => p.page_no)));
const lo = Math.min(...pagesUsed), hi = Math.max(...pagesUsed);
const every = [...nodes.values(), ...(source.furniture?.children ?? []).map(r => nodes.get(r.$ref)).filter(Boolean)];
const seen = new Set(); const items = [];
const inChapter = new Set(all.map(x => x.self_ref));
for (const x of [...nodes.values()]) {
  for (const [pi, p] of (x.prov ?? []).entries()) {
    if (p.page_no < lo || p.page_no > hi) continue;
    const m = map.get(x.self_ref);
    const entry = { ref: x.self_ref, label: x.label, layer: x.content_layer, page: p.page_no, bbox: p.bbox, text: clean(x.text ?? x.captions?.map(r => nodes.get(r.$ref)?.text).join(' ') ?? '').slice(0, 160), parent: x.parent?.$ref };
    if (!inChapter.has(x.self_ref)) Object.assign(entry, { block: null, reason: x.content_layer === 'furniture' ? 'furniture' : 'outside-chapter' });
    else if (m) Object.assign(entry, m);
    else Object.assign(entry, { block: null, reason: 'unmapped' });
    if (pi > 0) entry.continued = true;
    items.push(entry);
  }
}
const pages = {};
for (let n = lo; n <= hi; n++) { const pg = source.pages[String(n)]; const name = path.basename(pg.image?.uri ?? '');
  if (name) { fs.mkdirSync(path.join(destination, 'docling-pages'), { recursive: true }); fs.copyFileSync(path.resolve(path.dirname(input), pg.image.uri), path.join(destination, 'docling-pages', name)); }
  pages[n] = { size: pg.size, image: name ? { uri: 'docling-pages/' + name, dpi: pg.image.dpi, size: pg.image.size } : null }; }
// Sanity: every mapped block index must exist in the reopened document.
for (const it of items) if (it.block != null && !(it.block < blockCount)) throw new Error('Block out of range: ' + it.ref);
const blockTypes = parsed.children.map(c => c.type);
const sidecar = { blockTypes, schema: 'ieumdoc-docling-map/0', source: { name: source.name, version: source.version, origin: source.origin?.filename }, document: `chapter-${chapter}.md`, blockCount, pages, items };
fs.writeFileSync(path.join(destination, `chapter-${chapter}.docling-map.json`), JSON.stringify(sidecar, null, 1), 'utf8');
console.log(output);
