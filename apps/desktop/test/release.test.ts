import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { readUpdateInfo, verifyRelease } from "../scripts/verify-release.ts";
import { signatureProblem } from "../src/signatures.ts";

const roots: string[] = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

/** A release folder as electron-builder leaves it, with optional faults. */
function release(version: string, faults: { file?: string; extraFile?: string; sha?: boolean; host?: boolean; publisher?: boolean } = {}): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "ieumdoc-release-"));
  roots.push(root);
  const name = `IeumDoc-Setup-${version}.exe`;
  const bytes = Buffer.from(`installer ${version}`);
  const sha512 = createHash("sha512").update(faults.sha ? Buffer.from("other") : bytes).digest("base64");
  writeFileSync(path.join(root, name), bytes);
  writeFileSync(path.join(root, `${name}.blockmap`), "blockmap");
  const yml = [`version: ${version}`, "files:", `  - url: ${name}`, `    sha512: ${sha512}`, `    size: ${bytes.length}`, `path: ${name}`, `sha512: ${sha512}`,
    "releaseDate: '2026-10-12T00:00:00.000Z'", ""].join("\n");
  writeFileSync(path.join(root, faults.file ?? (version.includes("-beta.") ? "beta.yml" : "latest.yml")), yml);
  if (faults.extraFile) writeFileSync(path.join(root, faults.extraFile), yml);
  mkdirSync(path.join(root, "win-unpacked", "resources"), { recursive: true });
  writeFileSync(path.join(root, "win-unpacked", "IeumDoc.exe"), bytes);
  writeFileSync(path.join(root, "win-unpacked", "resources", "app-update.yml"), ["owner: ieumbird", "repo: ieumdoc", "provider: github",
    ...(faults.host ? ["host: 127.0.0.1:47320", "protocol: http"] : []), ...(faults.publisher ? ["publisherName:", "  - IeumDoc"] : []),
    "updaterCacheDirName: ieumdoc-updater", ""].join("\n"));
  return root;
}

test("Stable and Beta releases verify with their own metadata file", () => {
  assert.deepEqual(verifyRelease({ tag: "v0.2.0", version: "0.2.0", release: release("0.2.0"), signed: false }).map((file) => path.basename(file)),
    ["IeumDoc-Setup-0.2.0.exe", "IeumDoc-Setup-0.2.0.exe.blockmap", "latest.yml"]);
  assert.deepEqual(verifyRelease({ tag: "v0.3.0-beta.1", version: "0.3.0-beta.1", release: release("0.3.0-beta.1"), signed: false }).map((file) => path.basename(file)),
    ["IeumDoc-Setup-0.3.0-beta.1.exe", "IeumDoc-Setup-0.3.0-beta.1.exe.blockmap", "beta.yml"]);
});

test("a release that would mislead updaters or name another version is refused", () => {
  const refuse = (pattern: RegExp, version: string, tag: string, faults: Parameters<typeof release>[1]) =>
    assert.throws(() => verifyRelease({ tag, version, release: release(version, faults), signed: false }), pattern);
  refuse(/latest\.yml must not be published with a beta release/, "0.3.0-beta.1", "v0.3.0-beta.1", { extraFile: "latest.yml" });
  refuse(/missing beta\.yml/, "0.3.0-beta.1", "v0.3.0-beta.1", { file: "latest.yml" });
  refuse(/sha512 does not match/, "0.2.0", "v0.2.0", { sha: true });
  refuse(/updates from a test host/, "0.2.0", "v0.2.0", { host: true });
  assert.throws(() => verifyRelease({ tag: "v0.2.1", version: "0.2.0", release: release("0.2.0"), signed: false }), /does not match the app version/);
  assert.throws(() => verifyRelease({ tag: "v0.2.0-rc.1", version: "0.2.0-rc.1", release: release("0.2.0-rc.1"), signed: false }), /is not vMAJOR/);
  assert.throws(() => readUpdateInfo("version: 0.2.0\nversion: 0.3.0\n"), /duplicated mapping key/);
  assert.throws(() => readUpdateInfo("- not a mapping\n"), /must be a YAML mapping/);
});

test("a valid signature must match both the file and an allowed publisher", () => {
  const file = path.resolve("installer.exe");
  const valid = { status: "Valid", path: file, subject: "CN=IeumDoc,O=IeumDoc contributors,C=KR" };
  assert.equal(signatureProblem(["CN=IeumDoc,O=IeumDoc contributors,C=KR"], file, valid), null);
  assert.equal(signatureProblem(["IeumDoc"], file, valid), null);
  assert.match(signatureProblem(["CN=IeumDoc,O=Other"], file, valid)!, /publisher does not match/);
  assert.match(signatureProblem([], file, valid)!, /no allowed publisher/);
  assert.match(signatureProblem(["IeumDoc"], file, { ...valid, status: "NotSigned" })!, /signature is NotSigned/);
  assert.match(signatureProblem(["IeumDoc"], file, { ...valid, path: path.resolve("other.exe") })!, /another file/);
});

test("a signed release must name the publisher updates are verified against", { skip: process.platform !== "win32" && "Authenticode is checked on Windows" }, () => {
  // The synthetic installer is not a signed executable: both it and the missing publisher are reported.
  assert.throws(() => verifyRelease({ tag: "v0.2.0", version: "0.2.0", release: release("0.2.0"), signed: true }),
    (error: Error) => /names no publisher/.test(error.message) && /IeumDoc-Setup-0\.2\.0\.exe signature is (?!Valid)\w+/.test(error.message));
});
