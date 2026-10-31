import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { convertDoclingFile, readDoclingMap } from "../src/index.ts";

test("file conversion makes a self-contained new bundle, preserves inputs and refuses existing output", () => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-docling-files-"));
  try {
    const input = fileURLToPath(new URL("./fixtures/nist-sp1108r4/document.json", import.meta.url));
    const before = readFileSync(input);
    const output = path.join(root, "result");
    const result = convertDoclingFile(input, output);
    assert.deepEqual(readFileSync(input), before);
    const markdown = readFileSync(path.join(output, "document.md"), "utf8");
    const mapText = readFileSync(path.join(output, "document.docling-map.json"), "utf8");
    const map = readDoclingMap(mapText, markdown);
    assert.equal(markdown, result.markdown);
    assert.ok(readdirSync(path.join(output, "assets")).length);
    for (const page of Object.values(map.pages)) {
      assert.ok(page.image?.uri.startsWith("assets/"));
      assert.ok(existsSync(path.join(output, page.image!.uri)));
    }
    assert.match(markdown, /assets\/[a-f0-9]+\.png/);
    assert.throws(() => convertDoclingFile(input, output), /already exists/);
    assert.equal(readFileSync(path.join(output, "document.docling-map.json"), "utf8"), mapText);
    const bad = path.join(root, "bad.json"), absent = path.join(root, "absent");
    writeFileSync(bad, Buffer.from([0xff, 0xfe]));
    assert.throws(() => convertDoclingFile(bad, absent), /encoded data/);
    assert.equal(existsSync(absent), false);
    writeFileSync(bad, "{}");
    assert.throws(() => convertDoclingFile(bad, absent), /Invalid DoclingDocument/);
    assert.equal(existsSync(absent), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("embedded pictures are copied, and resources outside the input folder are reported unavailable", () => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-docling-media-"));
  try {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ioAAAAASUVORK5CYII=", "base64");
    const source = { schema_name: "DoclingDocument", version: "1.10.0", name: "Embedded media",
      body: { self_ref: "#/body", label: "unspecified", children: [{ $ref: "#/pictures/0" }] },
      pictures: [{ self_ref: "#/pictures/0", label: "picture", parent: { $ref: "#/body" }, children: [],
        image: { uri: `data:image/png;base64,${png.toString("base64")}`, mimetype: "image/png", dpi: 72, size: { width: 1, height: 1 } } }] };
    const sourceFolder = path.join(root, "source");
    mkdirSync(sourceFolder);
    const input = path.join(sourceFolder, "input.json");
    writeFileSync(input, JSON.stringify(source));
    const output = path.join(root, "embedded");
    const converted = convertDoclingFile(input, output);
    assert.equal(converted.map.items.find(x => x.self_ref === "#/pictures/0")!.status, "converted");
    assert.deepEqual(readFileSync(path.join(output, "assets", readdirSync(path.join(output, "assets"))[0])), png);
    const absolute = path.join(sourceFolder, "contained.png");
    writeFileSync(absolute, png);
    source.pictures[0].image.uri = absolute;
    writeFileSync(input, JSON.stringify(source));
    const local = convertDoclingFile(input, path.join(root, "absolute"));
    assert.equal(local.map.items.find(x => x.self_ref === "#/pictures/0")!.status, "converted");
    writeFileSync(path.join(root, "outside.png"), png);
    source.pictures[0].image.uri = "../outside.png";
    writeFileSync(input, JSON.stringify(source));
    const unavailable = convertDoclingFile(input, path.join(root, "outside"));
    assert.equal(unavailable.map.items.find(x => x.self_ref === "#/pictures/0")!.status, "unsupported");
    assert.equal(existsSync(path.join(root, "outside/assets")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
