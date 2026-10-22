import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { citationReport, parse, serialize, BIBLIOGRAPHY_LIMITS, type BibliographySource } from "@ieumdoc/core";

const text = readFileSync(new URL("fixtures/bibliography-v1.bib", import.meta.url), "utf8");
const doc = (keys: string, paths = ["refs.bib"]) => parse(`---\nieumdoc: 1\n${paths.length ? `bibliography: ${JSON.stringify(paths)}\n` : ""}---\n\n{cite:p}\`${keys}\`\n`);
const source = (text: string, source = "refs.bib"): BibliographySource => ({ source, status: "ok", text });
const evaluate = (keys: string, bib: string) => citationReport(doc(keys), [source(bib)]);

test("limited IEEE fixtures retain original types and exact initials, corporate names, edition, dates and punctuation", () => {
  const result = evaluate("article,conference,book,report,standard,online,misc,unicode", text);
  assert.deepEqual(result.readiness, { status: "evaluated", complete: true, diagnostics: [] });
  assert.deepEqual(result.references?.map(r => r.text), [
    "[1] W. Zhang, J. A. Smith, “Control Study,” Test Journal, vol. 12, no. 3, pp. 4-9, 2024. doi: 10.1234/example.",
    "[2] M. Kim, “Feedback,” in Test Conference, 2023, pp. 20-24.",
    "[3] J. Smith, A. Jones, eds., Systems, 2nd ed., Seoul: Example Press, 2020.",
    "[4] Research Institute, “Control Report,” Example Institute, R-42, 2022.",
    "[5] Safety Standard, STD-42, Standards Body, 2024.",
    "[6] Example Lab, “Control Guide,” Lab Website, 2024. [Online]. Available: https://example.org/guide. Accessed: Feb. 29, 2024.",
    "[7] “Technical Note,” Internal Bulletin, 2021.",
    "[8] K. Gödel, 한국연구원, “NASA와 한글 제어,” 가상 학술지, 2025.",
  ]);
  assert.deepEqual(result.references?.[0].parts.filter(p => p.emphasis), [{ text: "Test Journal", emphasis: true }]);
  assert.deepEqual(result.references?.[2].parts.filter(p => p.emphasis), [{ text: "Systems", emphasis: true }]);
});

test("converted book/document types never approve proceedings, webpage or unknown original entry kinds", () => {
  for (const type of ["proceedings", "webpage", "unknownkind", "incollection", "inbook", "phdthesis", "patent", "dataset", "software", "constructor", "__proto__"]) {
    const result = evaluate("key", `@${type}{key,author={Smith, Jane},title={Work},year={2024},publisher={Press}}`);
    assert.equal(result.readiness.complete, false, type);
    assert.ok(result.readiness.diagnostics.some(d => d.code === "bibliography-type-unsupported" && d.key === "key"), type);
    assert.equal(result.references?.[0].status, "incomplete");
    assert.equal(result.references?.[0].text, "[1] J. Smith. Work. 2024.");
  }
});

test("unsupported fields, conversion loss, complex names/dates and missing required fields produce minimal display", () => {
  for (const [bib, field] of [
    ["@article{key,author={Smith, Jane},title={Work},journal={J},year={2024},note={Important}}", "note"],
    ["@online{key,organization={Lab},title={Work},journaltitle={Dropped site},url={https://example.org},urldate={2024-02-29},year={2024}}", "journaltitle"],
    ["@standard{key,title={Safety},organization={Body},year={2024}}", "number"],
    ["@techreport{key,author={Smith, Jane},title={Report},number={R-1},year={2024}}", "institution"],
    ["@online{key,organization={Lab},title={Work},url={https://example.org},urldate={2024-02-30},year={2024}}", "accessed"],
    ["@article{key,author={Smith, Jr., John},title={Work},journal={J},year={2024}}", "author"],
    ["@article{key,author={Smith, Jane},title={\\emph{Work}},journal={J},year={2024}}", "title"],
    ["@article{key,author={Smith, Jane},title={Work},journal={J},year={2024},customfield={opaque}}", "customfield"],
  ]) {
    const result = evaluate("key", bib);
    assert.equal(result.readiness.complete, false, field);
    assert.ok(result.readiness.diagnostics.some(d => d.field === field), JSON.stringify(result));
    assert.equal(result.references?.[0].status, "incomplete");
    assert.equal(result.references?.[0].parts.length, 1);
  }
  const noYear = evaluate("key", "@online{key,organization={Lab},title={Work},url={https://example.org},urldate={2024-02-29}}");
  assert.match(noYear.references![0].text, /n\.d\./);
});

test("missing, unverified, duplicate and uncited entries remain distinct; numbering and source writing do not depend on resources", () => {
  const document = doc("article,missing,article");
  const before = serialize(document);
  const result = citationReport(document, [source(text)]);
  assert.equal(result.references?.[1].status, "unresolved");
  assert.equal(result.references?.[1].number, 2);
  assert.ok(result.readiness.diagnostics.some(d => d.code === "bibliography-entry-uncited" && d.severity === "info"));
  const unavailable = citationReport(doc("article,missing", ["refs.bib", "missing.bib"]), [source(text), { source: "missing.bib", status: "error", code: "bibliography-unreadable" }]);
  assert.deepEqual(unavailable.references?.map(r => r.status), ["unverified", "unverified"]);
  assert.ok(!unavailable.readiness.diagnostics.some(d => d.code === "citation-key-unresolved"));
  const duplicates = evaluate("article", text + "\n@article{article,title={Different}}\n");
  assert.equal(duplicates.references?.[0].status, "duplicate");
  assert.equal(duplicates.references?.[0].text, "[1] article");
  const across = citationReport(doc("article", ["refs.bib", "other.bib"]), [source(text), source(text, "other.bib")]);
  assert.equal(across.references?.[0].status, "duplicate");
  assert.equal(citationReport(doc("missing", []), []).references?.[0].status, "unresolved");
  assert.equal(serialize(document), before);
  assert.equal(result.citations[0].text, "[1], [2], [1]");
});

test("parser failures are resource warnings; no implicit input format or remote lookup; crossref fields are diagnosed", () => {
  for (const bib of ["@article{broken"]) {
    const result = evaluate("key", bib);
    assert.equal(result.readiness.complete, false);
    assert.equal(result.references?.[0].status, "unverified");
    assert.ok(result.readiness.diagnostics.some(d => d.code === "bibliography-invalid"));
  }
  // BibTeX permits free text outside entries. Force the library's BibTeX input path:
  // a URL/JSON string is an empty bibliography, never a different input plugin or network read.
  for (const ignored of ["https://example.org/refs.bib", '{"id":"remote","title":"JSON"}']) {
    assert.equal(evaluate("key", ignored).references?.[0].status, "unresolved");
  }
  const empty = evaluate("missing", "% empty bibliography\n");
  assert.equal(empty.references?.[0].status, "unresolved");
  const crossref = evaluate("child", "@inproceedings{child,author={Kim, Min},title={Child},crossref={parent}} @proceedings{parent,title={Proceedings},year={2024}}");
  assert.equal(crossref.references?.[0].status, "incomplete");
  assert.ok(crossref.readiness.diagnostics.some(d => d.field === "crossref"));
});

test("Core enforces snapshot byte, file and entry limits independently of the I/O adapter", () => {
  const tooBig = evaluate("article", text + "%".repeat(BIBLIOGRAPHY_LIMITS.fileBytes));
  assert.ok(tooBig.readiness.diagnostics.some(d => d.code === "bibliography-limit"));
  const paths = Array.from({ length: BIBLIOGRAPHY_LIMITS.files + 1 }, (_, i) => `${i}.bib`);
  const tooManyFiles = citationReport(doc("article", paths), paths.map(p => source(text, p)));
  assert.ok(tooManyFiles.readiness.diagnostics.some(d => d.code === "bibliography-limit" && d.source === "16.bib"));
  const entries = Array.from({ length: BIBLIOGRAPHY_LIMITS.entries + 1 }, (_, i) => `@misc{k${i},title={T},year={2024},url={https://example.org}}`).join("\n");
  assert.ok(evaluate("k0", entries).readiness.diagnostics.some(d => d.code === "bibliography-limit"));
  const atLimit = evaluate("k0", entries.slice(0, entries.lastIndexOf("\n")));
  assert.equal(atLimit.references?.[0].status, "complete");
  assert.equal(atLimit.readiness.complete, true);
  const sized = "%".repeat(BIBLIOGRAPHY_LIMITS.fileBytes);
  const four = ["a.bib", "b.bib", "c.bib", "d.bib"];
  assert.ok(!citationReport(doc("missing", four), four.map(p => source(sized, p))).readiness.diagnostics.some(d => d.code === "bibliography-limit"));
  const five = [...four, "e.bib"];
  assert.ok(citationReport(doc("missing", five), five.map((p, i) => source(i === 4 ? "%" : sized, p))).readiness.diagnostics.some(d => d.code === "bibliography-limit" && d.source === "e.bib"));

});


test("real Better BibTeX export keeps unsupported metadata explicit and source bytes untouched", () => {
  const exported = readFileSync(new URL("fixtures/better-bibtex-2419.bib", import.meta.url), "utf8");
  const result = evaluate("Astrakharchik2007", exported);
  assert.equal(result.references?.[0].status, "incomplete");
  for (const field of ["shorttitle", "month", "issn", "langid"]) {
    assert.ok(result.readiness.diagnostics.some(d => d.code === "bibliography-field-unsupported" && d.field === field), field);
  }
  assert.match(result.references![0].text, /Weakly interacting two-dimensional/);
  assert.equal(readFileSync(new URL("fixtures/better-bibtex-2419.bib", import.meta.url), "utf8"), exported);
  for (const [edition, expected] of [["11", "11th"], ["21", "21st"], ["22", "22nd"], ["23", "23rd"]]) {
    assert.match(evaluate("book", text.replace("edition={2}", `edition={${edition}}`)).references![0].text, new RegExp(`${expected} ed\\.`));
  }
});
