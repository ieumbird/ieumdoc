import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { listenForFetch } from "../../../test/helpers/fetch-server.ts";
import { convertDoclingPdf, readDoclingMap } from "../src/index.ts";
import profile from "../profiles/litzio-pdf-en-v1.json" with { type: "json" };
import { doclingFailureOf } from "../src/server-types.ts";

test("public failure causes distinguish explicit missing models from redacted and other model errors", () => {
  assert.equal(doclingFailureOf({ failure: { message: "Model 'CodeFormulaV2' not found in artifacts_path." } }).code, "model-missing");
  assert.equal(doclingFailureOf({ error_message: "Internal processing error.", failure: null }).code, "server");
  assert.equal(doclingFailureOf({ error_message: "The required model execution failed." }).code, "server");
  assert.equal(doclingFailureOf({ errors: [{ error_message: "Required model is missing." }] }).code, "model-missing");
});

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ioAAAAASUVORK5CYII=", "base64");
const image = () => ({ uri: `data:image/png;base64,${png.toString("base64")}`, mimetype: "image/png", dpi: 72, size: { width: 1, height: 1 } });
function document() {
  return { schema_name: "DoclingDocument", version: "1.10.0", name: "REST case",
    origin: { mimetype: "application/pdf", binary_hash: 0, filename: "input.pdf" },
    body: { self_ref: "#/body", children: [{ $ref: "#/pictures/0" }] },
    pictures: [{ self_ref: "#/pictures/0", label: "picture", parent: { $ref: "#/body" }, children: [], image: image() }],
    pages: { "63": { page_no: 63, size: { width: 100, height: 100 }, image: image() } } };
}
type Mode = "ok" | "version" | "openapi" | "ready" | "submit" | "submit-timeout" | "failure" | "partial" | "timeout" | "download-timeout" | "schema" | "image" | "result" | "graph" | "task-id" | "source-changed" | "output-race";
async function fixture(mode: Mode = "ok") {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-rest-test-"));
  const input = path.join(root, "input.pdf"), output = path.join(root, "output");
  writeFileSync(input, "%PDF-1.7\nfixture");
  const requests: string[] = []; let polls = 0; let fields: FormData | undefined;
  const original = document();
  if (mode === "schema") original.version = "1.11.0";
  if (mode === "image") original.pictures[0].image.uri = "https://example.invalid/image.png";
  if (mode === "graph") original.body.children = [{ $ref: "#/pictures/99" }];
  const responseText = JSON.stringify({ status: mode === "result" ? "partial_success" : "success", document: { json_content: original }, errors: [], processing_time: 1 })
    .replace('"binary_hash":0', '"binary_hash":18446744073709551615');
  const spec = JSON.stringify({ info: { version: mode === "openapi" ? "1.31.0" : "1.32.0" } });
  const server = createServer(async (req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader("content-type", "application/json");
    if (req.url === "/version") res.end(JSON.stringify({ "docling-serve": mode === "version" ? "1.31.0" : "1.32.0", docling: "2.124.0" }));
    else if (req.url === "/ready") { res.statusCode = mode === "ready" ? 503 : 200; res.end("{}"); }
    else if (req.url === "/openapi.json") res.end(spec);
    else if (req.url === "/v1/convert/file/async") {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      fields = await new Response(Buffer.concat(chunks), { headers: { "content-type": req.headers["content-type"]! } }).formData();
      if (mode === "submit-timeout") return;
      res.statusCode = mode === "submit" ? 500 : 200;
      res.end(JSON.stringify({ task_id: "job-123", task_status: "pending" }));
    } else if (req.url === "/v1/status/poll/job-123") {
      polls++;
      const state = mode === "failure" ? "failure" : mode === "partial" ? "partial_success" : mode === "timeout" || polls === 1 ? "started" : "success";
      res.end(JSON.stringify({ task_id: mode === "task-id" ? "wrong-job" : "job-123", task_status: state, error_message: "server evidence" }));
    } else if (req.url === "/v1/result/job-123") {
      if (mode === "download-timeout") { res.write('{"status":'); return; }
      if (mode === "source-changed") writeFileSync(input, "%PDF-1.7\nchanged by another writer");
      if (mode === "output-race") { mkdirSync(output); writeFileSync(path.join(output, "sentinel"), "keep"); }
      res.end(responseText);
    } else { res.statusCode = 404; res.end("{}"); }
  });
  await listenForFetch(server);
  const address = server.address() as { port: number };
  return { input, output, original, responseText, spec, requests, fields: () => fields!,
    options: { server: `http://127.0.0.1:${address.port}`, pollIntervalMs: 1, timeoutMs: 5000 },
    close: async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); rmSync(root, { recursive: true, force: true }); } };
}

test("official REST submits the fixed multipart profile, polls and produces an exact lightweight source/native bundle", async () => {
  const f = await fixture();
  try {
    const before = readFileSync(f.input);
    const record = await convertDoclingPdf(f.input, f.output, f.options);
    assert.deepEqual(readFileSync(f.input), before);
    assert.deepEqual(f.requests, ["GET /version", "GET /ready", "GET /openapi.json", "POST /v1/convert/file/async", "GET /v1/status/poll/job-123", "GET /v1/status/poll/job-123", "GET /v1/result/job-123"]);
    for (const [key, value] of Object.entries(profile.request)) assert.deepEqual(f.fields().getAll(key), (Array.isArray(value) ? value : [value]).map(v => typeof v === "string" ? v : JSON.stringify(v)), key);
    assert.equal(f.fields().get("page_range"), null, "official default converts the complete PDF");
    assert.deepEqual(Buffer.from(await (f.fields().get("files") as File).arrayBuffer()), before);
    assert.equal(record.profile.profile_id, "litzio-pdf-en-v1");
    const hash = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
    assert.deepEqual(record.response, { sha256: hash(f.responseText), bytes: Buffer.byteLength(f.responseText) });
    assert.equal(record.server.openapiSha256, hash(f.spec));
    assert.equal(record.source.sha256, hash(before));
    const savedText = readFileSync(path.join(f.output, "document.json"), "utf8");
    assert.match(savedText, /"binary_hash":18446744073709551615[,}]/u, "uint64 metadata must not be rounded by JSON.parse");
    const saved = JSON.parse(savedText);
    assert.equal(saved.pages["63"].image.uri, "pages/page-063.png");
    assert.equal(saved.pictures[0].image.uri, "pictures/picture-000.png");
    assert.equal(saved.body.label, undefined, "validation defaults must not leak into saved source JSON");
    for (const item of record.images) {
      assert.deepEqual(readFileSync(path.join(f.output, item.path)), png);
      assert.equal(item.sha256, hash(png));
    }
    saved.pages["63"].image.uri = f.original.pages["63"].image.uri;
    saved.pictures[0].image.uri = f.original.pictures[0].image.uri;
    assert.deepEqual(saved, JSON.parse(f.responseText).document.json_content, "only image addresses may change");
    const markdown = readFileSync(path.join(f.output, "document.md"), "utf8");
    const map = readDoclingMap(readFileSync(path.join(f.output, "document.docling-map.json"), "utf8"), markdown);
    assert.equal(map.source.sha256, record.document.sha256);
    assert.equal(map.pages["63"].image!.uri, "pages/page-063.png");
    assert.match(markdown, /pictures\/picture-000.png/);
    assert.deepEqual(readdirSync(f.output).sort(), ["conversion-record.json", "document.docling-map.json", "document.json", "document.md", "pages", "pictures"]);
    assert.equal(record.verification.imageBytesMatchEmbedded, true);
    assert.equal(record.verification.jsonExceptImageUrisMatches, true);
    const n = f.requests.length;
    await assert.rejects(convertDoclingPdf(f.input, f.output, f.options), /already exists/);
    assert.equal(f.requests.length, n, "no submission when output exists");
  } finally { await f.close(); }
});

for (const [mode, error] of Object.entries({ version: /Expected docling-serve/, openapi: /OpenAPI version/, ready: /HTTP 503/, submit: /HTTP 500/,
  failure: /failure: server evidence/, partial: /partial_success/, timeout: /Timed out.*job-123/, "download-timeout": /Timed out.*job-123/,
  "submit-timeout": /Timed out.*submission is never automatically retried/,
  schema: /Expected DoclingDocument 1.10.0/, image: /Expected embedded/, result: /not a complete success/, graph: /Dangling reference/,
  "task-id": /task ID mismatch/, "source-changed": /Source PDF changed/ })) {
  test(`REST ${mode} refuses output and does not retry submission`, async () => {
    const f = await fixture(mode as Mode);
    try {
      await assert.rejects(convertDoclingPdf(f.input, f.output, { ...f.options, timeoutMs: mode.includes("timeout") ? 2000 : 5000, pollIntervalMs: 20 }), error);
      assert.equal(existsSync(f.output), false);
      assert.ok(f.requests.filter(r => r.startsWith("POST")).length <= 1);
      if (["version", "openapi", "ready"].includes(mode)) assert.equal(f.requests.some(r => r.startsWith("POST")), false);
    } finally { await f.close(); }
  });
}

test("an output created by another writer during conversion is preserved", async () => {
  const f = await fixture("output-race");
  try {
    await assert.rejects(convertDoclingPdf(f.input, f.output, f.options), /EEXIST/);
    assert.deepEqual(readdirSync(f.output), ["sentinel"]);
    assert.equal(readFileSync(path.join(f.output, "sentinel"), "utf8"), "keep");
  } finally { await f.close(); }
});
