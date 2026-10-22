import { Cite, plugins } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import type { CitationReport } from "./citation.ts";

export const BIBLIOGRAPHY_LIMITS = Object.freeze({ files: 16, fileBytes: 1048576, totalBytes: 4194304, entries: 5000 });
export type BibliographySource = { source: string } & (
  { status: "ok"; text: string; revision?: string } |
  { status: "error"; code: "bibliography-unreadable" | "bibliography-invalid" | "bibliography-limit" | "bibliography-changed" });
export type BibliographyDiagnostic = { code: string; severity: "warning" | "info"; source?: string; key?: string; field?: string; path?: number[]; line?: number; column?: number };
export type BibliographyPart = { text: string; emphasis?: true };
export type BibliographyReference = { key: string; number: number; status: "complete" | "incomplete" | "unresolved" | "unverified" | "duplicate"; text: string; parts: BibliographyPart[] };
/** A citable key from the readable sources, in source order. Its formatting never affects readiness. */
export type BibliographyEntry = { key: string; source: string; status: "complete" | "incomplete" | "duplicate"; text: string };
export type BibliographyEvaluation = { references: BibliographyReference[]; entries: BibliographyEntry[]; readiness: {
  status: "evaluated"; complete: boolean; diagnostics: BibliographyDiagnostic[];
} };
type Raw = { type: string; label: string; properties: Record<string, string> };
type Entry = { raw: Raw; data: Record<string, unknown>; source: string };
const types: Record<string, string> = { article: "article-journal", inproceedings: "paper-conference", conference: "paper-conference", book: "book", techreport: "report", report: "report", standard: "standard", online: "webpage", misc: "document" };
const ignored = new Set(["abstract", "keywords", "file"]);
const common = ["title", "year", "date", "doi", "url"];
const fields: Record<string, string[]> = {
  article: ["journal", "journaltitle", "volume", "number", "pages"],
  inproceedings: ["booktitle", "pages"], conference: ["booktitle", "pages"],
  book: ["editor", "edition", "publisher", "address", "location"],
  techreport: ["institution", "number"], report: ["institution", "number"],
  standard: ["organization", "institution", "number"],
  online: ["organization", "urldate", "booktitle", "journaltitle"], misc: ["organization", "howpublished", "publisher"],
};
function string(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
function plain(value: string): boolean { return !/[<>\\]/u.test(value); }
function names(value: unknown): { text: string; valid: boolean } {
  if (value === undefined) return { text: "", valid: true };
  if (!Array.isArray(value)) return { text: "", valid: false };
  let valid = true;
  const text = value.map(name => {
    if (!name || typeof name !== "object" || Object.keys(name).some(k => !["given", "family", "literal"].includes(k))) valid = false;
    if (!name || typeof name !== "object") return "";
    if ([name.given, name.family, name.literal].some(value => value !== undefined && (typeof value !== "string" || !plain(value)))) valid = false;
    if (typeof name.literal === "string") return name.literal;
    if (!name.family) valid = false;
    const initials = string(name.given).split(/[\s-]+/u).filter(Boolean).map(part => `${Array.from(part)[0]}.`).join(" ");
    return [initials, string(name.family)].filter(Boolean).join(" ");
  }).filter(Boolean).join(", ");
  return { text, valid };
}
function date(value: unknown): number[] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const d = value as Record<string, unknown>;
  if (Object.keys(d).some(k => k !== "date-parts") || !Array.isArray(d["date-parts"]) || d["date-parts"].length !== 1) return undefined;
  const parts = d["date-parts"][0];
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 3 || parts.some(x => !Number.isInteger(x)) || parts[0] < 1 || (parts[1] !== undefined && (parts[1] < 1 || parts[1] > 12)) || (parts[2] !== undefined && (parts[2] < 1 || parts[2] > 31))) return undefined;
  if (parts.length === 3) {
    const actual = new Date(0); actual.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
    if (actual.getUTCFullYear() !== parts[0] || actual.getUTCMonth() !== parts[1] - 1 || actual.getUTCDate() !== parts[2]) return undefined;
  }
  return parts;
}
const months = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
function formatEntry(entry: Entry, diagnostics: BibliographyDiagnostic[]): { parts: BibliographyPart[]; complete: boolean } {
  const { raw, data: d, source } = entry;
  const start = diagnostics.length;
  const warn = (code: string, field?: string) => diagnostics.push({ code, severity: "warning", source, key: raw.label, ...(field ? { field } : {}) });
  if (!Object.hasOwn(types, raw.type) || d.type !== types[raw.type]) warn("bibliography-type-unsupported");
  const supported = new Set([...common, ...(raw.type === "standard" ? [] : ["author"]), ...(Object.hasOwn(fields, raw.type) ? fields[raw.type] : [])]);
  Object.keys(raw.properties).forEach(field => { if (!supported.has(field) && !ignored.has(field)) warn("bibliography-field-unsupported", field); });
  const author = names(d.author), editor = names(d.editor);
  if (!author.valid) warn("bibliography-field-unsupported", "author");
  if (!editor.valid) warn("bibliography-field-unsupported", "editor");
  const issued = date(d.issued), accessed = date(d.accessed);
  if (d.issued && !issued) warn("bibliography-field-unsupported", "issued");
  if (d.accessed && !accessed) warn("bibliography-field-unsupported", "accessed");
  if (author.text && editor.text) warn("bibliography-field-unsupported", "editor");
  const year = issued ? String(issued[0]) : "";
  const title = string(d.title), container = string(d["container-title"]), publisher = string(d.publisher);
  // The one explicitly accepted conversion supplement: standard.number.
  const number = raw.type === "standard" ? raw.properties.number ?? "" : string(d.number);
  if (raw.type === "standard" && d.number && string(d.number) !== number) warn("bibliography-field-unsupported", "number");
  const institution = publisher;
  const doi = string(d.DOI), url = string(d.URL);
  if (url) { try { if (!["http:", "https:"].includes(new URL(url).protocol)) warn("bibliography-field-unsupported", "URL"); }
    catch { warn("bibliography-field-unsupported", "URL"); } }
  if (raw.properties.year && year && raw.properties.year !== year) warn("bibliography-field-unsupported", "year");
  const authorOrInstitution = author.text || (["techreport", "report", "online"].includes(raw.type) || raw.properties.organization ? institution : "");
  const required: Record<string, string> = { title, year };
  if (["article", "inproceedings", "conference"].includes(raw.type)) Object.assign(required, { author: author.text, "container-title": container });
  if (raw.type === "book") Object.assign(required, { author: author.text || editor.text, publisher });
  if (["techreport", "report"].includes(raw.type)) Object.assign(required, { author: authorOrInstitution, institution, number });
  if (raw.type === "standard") Object.assign(required, { institution, number });
  if (raw.type === "online") Object.assign(required, { author: authorOrInstitution, URL: url, accessed: accessed?.length === 3 ? accessed.join("-") : "" });
  if (raw.type === "misc") Object.assign(required, { source: doi || url || publisher });
  for (const field of ["title", "container-title", "publisher", "publisher-place", "edition", "number", "volume", "issue", "page", "DOI", "URL"]) {
    if (!plain(string(d[field]))) warn("bibliography-field-unsupported", field);
  }
  if (raw.type === "standard" && (!plain(number) || /[{}]/u.test(number))) warn("bibliography-field-unsupported", "number");
  Object.entries(required).forEach(([field, value]) => { if (!value) warn("bibliography-field-missing", field); });
  // Detect meaningful fields that the converter dropped rather than silently blessing them.
  const mapped: Record<string, string> = { organization: "publisher", author: "author", editor: "editor", title: "title", journal: "container-title", journaltitle: "container-title", booktitle: "container-title", publisher: "publisher", institution: "publisher", volume: "volume", pages: "page", edition: "edition", doi: "DOI", url: "URL", howpublished: "publisher", address: "publisher-place", location: "publisher-place" };
  // Supported aliases may compete for one converted scalar. Presence alone cannot prove preservation.
  for (const target of new Set(Object.values(mapped))) {
    const original = Object.keys(mapped).filter(field => mapped[field] === target && supported.has(field) && raw.properties[field]);
    if (new Set(original.map(field => raw.properties[field])).size > 1) warn("bibliography-field-unsupported", original.join("/"));
  }
  Object.entries(mapped).forEach(([field, target]) => { if (supported.has(field) && raw.properties[field] && (target === "author" || target === "editor" ? !names(d[target]).text : !string(d[target]))) warn("bibliography-field-unsupported", field); });
  const locator = doi ? `doi: ${doi}` : url;
  if (diagnostics.length !== start) return { complete: false, parts: [{ text: [author.text || institution, title || raw.label, year || "n.d.", locator].filter(Boolean).map(part => part.endsWith(".") ? part : `${part}.`).join(" ") }] };
  const parts: BibliographyPart[] = [];
  const add = (text: string, emphasis = false) => { if (text) parts.push({ text, ...(emphasis ? { emphasis: true as const } : {}) }); };
  const comma = (value: string) => { if (value) add(`${value}, `); };
  const pages = string(d.page);
  if (raw.type === "standard") { comma(title); comma(number); comma(institution); }
  else if (raw.type === "book") {
    comma(author.text || `${editor.text}, ${Array.isArray(d.editor) && d.editor.length > 1 ? "eds." : "ed."}`);
    add(title, true); add(", ");
    const edition = string(d.edition); if (edition) comma(/^\d+$/.test(edition) ? `${edition}${Number(edition) % 100 >= 11 && Number(edition) % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[Number(edition) % 10] ?? "th"} ed.` : `${edition} ed.`);
    comma([string(d["publisher-place"]), publisher].filter(Boolean).join(": "));
  } else {
    comma(authorOrInstitution); add(`“${title},” `);
    if (raw.type === "article") { add(container, true); add(", "); comma(string(d.volume) && `vol. ${d.volume}`); comma(string(d.issue) && `no. ${d.issue}`); comma(pages && `pp. ${pages}`); }
    else if (["inproceedings", "conference"].includes(raw.type)) { add("in "); add(container, true); add(", "); }
    else if (["techreport", "report"].includes(raw.type)) { comma(institution); comma(number); }
    else if (raw.type === "misc") comma(publisher);
    else if (raw.type === "online") comma(container);
  }
  add(year);
  if (["inproceedings", "conference"].includes(raw.type) && pages) add(`, pp. ${pages}`);
  add(".");
  if (raw.type === "online") add(` [Online]. Available: ${url}. Accessed: ${months[accessed![1] - 1]} ${accessed![2]}, ${accessed![0]}.`);
  else if (locator) add(` ${locator}.`);
  return { complete: true, parts };
}

/** Pure snapshot evaluation shared by browser and Node. Never changes documents or sources. */
export function evaluateBibliography(report: Pick<CitationReport, "bibliography" | "citations">, sources: readonly BibliographySource[]): BibliographyEvaluation {
  const diagnostics: BibliographyDiagnostic[] = [];
  const entries = new Map<string, Entry[]>();
  let unavailable = false, bytes = 0, count = 0;
  for (const [index, source] of report.bibliography.entries()) {
    const candidates = sources.filter(item => item.source === source);
    const snapshot = candidates.length === 1 ? candidates[0] : undefined;
    let code: string | undefined;
    let location: { line?: number; column?: number } = {};
    if (index >= BIBLIOGRAPHY_LIMITS.files) code = "bibliography-limit";
    else if (!snapshot || snapshot.status === "error") code = snapshot?.status === "error" ? snapshot.code : "bibliography-unreadable";
    else {
      const size = new TextEncoder().encode(snapshot.text).length;
      bytes += size;
      if (size > BIBLIOGRAPHY_LIMITS.fileBytes || bytes > BIBLIOGRAPHY_LIMITS.totalBytes) code = "bibliography-limit";
      else try {
        const options = { forceType: "@biblatex/text", target: "@biblatex/entries+list", strict: true, generateGraph: false, maxChainLength: 10 };
        const raw: Raw[] = plugins.input.data(snapshot.text, "@biblatex/text");
        count += raw.length;
        if (count > BIBLIOGRAPHY_LIMITS.entries) code = "bibliography-limit";
        else {
          const converted = new Cite(raw, { ...options, forceType: "@biblatex/entries+list", target: "@csl/list+object" }).data;
          const byKey = new Map<string, Record<string, unknown>[]>();
          for (const data of converted) {
            const key = string(data["citation-key"] ?? data.id);
            byKey.set(key, [...(byKey.get(key) ?? []), data]);
          }
          for (const item of raw) {
            const matches = byKey.get(item.label) ?? [];
            const entry: Entry = { raw: item, data: matches.length === 1 ? matches[0] : {}, source };
            entries.set(item.label, [...(entries.get(item.label) ?? []), entry]);
          }
        }
      } catch (error) {
        code = "bibliography-invalid";
        const match = /at line (\d+) col (\d+)/.exec(error instanceof Error ? error.message : "");
        if (match) location = { line: Number(match[1]), column: Number(match[2]) };
      }
    }
    if (code) { unavailable = true; diagnostics.push({ code, severity: "warning", source, ...location }); }
  }
  const numbers = new Map<string, number>();
  report.citations.forEach(c => c.keys.forEach((key, i) => numbers.set(key, c.numbers[i])));
  for (const [key, matches] of entries) {
    if (matches.length > 1) matches.forEach(e => diagnostics.push({ code: "bibliography-key-duplicate", severity: "warning", source: e.source, key }));
    else if (!numbers.has(key)) diagnostics.push({ code: "bibliography-entry-uncited", severity: "info", source: matches[0].source, key });
  }
  const references = [...numbers].sort((a, b) => a[1] - b[1]).map(([key, number]): BibliographyReference => {
    const found = entries.get(key);
    let status: BibliographyReference["status"], parts: BibliographyPart[];
    if (!found || unavailable || found.length > 1) {
      status = found && found.length > 1 ? "duplicate" : unavailable ? "unverified" : "unresolved";
      if (status !== "duplicate") diagnostics.push({ code: status === "unverified" ? "citation-key-unverified" : "citation-key-unresolved", severity: "warning", key, path: report.citations.find(c => c.keys.includes(key))?.path });
      parts = [{ text: key }];
    } else {
      const formatted = formatEntry(found[0], diagnostics);
      status = formatted.complete ? "complete" : "incomplete"; parts = formatted.parts;
    }
    return { key, number, status, parts, text: `[${number}] ${parts.map(p => p.text).join("")}` };
  });
  diagnostics.forEach(d => { if (d.key && !d.path) d.path = report.citations.find(c => c.keys.includes(d.key!))?.path; });
  const available = [...entries].map(([key, matches]): BibliographyEntry => {
    if (matches.length > 1) return { key, source: matches[0].source, status: "duplicate", text: key };
    const formatted = formatEntry(matches[0], []);
    return { key, source: matches[0].source, status: formatted.complete ? "complete" : "incomplete", text: formatted.parts.map(p => p.text).join("") };
  });
  return { references, entries: available, readiness: { status: "evaluated", complete: !diagnostics.some(d => d.severity === "warning"), diagnostics } };
}
