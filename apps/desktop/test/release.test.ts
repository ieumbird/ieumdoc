import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { readUpdateInfo, verifyBlockmap, verifyRelease, writeReleaseArtifactPaths } from "../scripts/verify-release.ts";
import { brand } from "../../../brand.ts";
import { signatureProblem } from "../src/signatures.ts";
import { publishVerifiedRelease, releaseMode, resolveRelease, type ReleaseApi } from "../scripts/release.ts";

const roots: string[] = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

/** A release folder as electron-builder leaves it, with optional faults. */
function release(version: string, faults: { file?: string; extraFile?: string; sha?: boolean; host?: boolean; publisher?: boolean } = {}): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-release-"));
  roots.push(root);
  const name = `Litzio-Setup-${version}.exe`;
  const bytes = Buffer.from(`installer ${version}`);
  const sha512 = createHash("sha512").update(faults.sha ? Buffer.from("other") : bytes).digest("base64");
  writeFileSync(path.join(root, name), bytes);
  writeFileSync(path.join(root, `${name}.blockmap`), "blockmap");
  const yml = [`version: ${version}`, "files:", `  - url: ${name}`, `    sha512: ${sha512}`, `    size: ${bytes.length}`, `path: ${name}`, `sha512: ${sha512}`,
    "releaseDate: '2026-10-12T00:00:00.000Z'", ""].join("\n");
  writeFileSync(path.join(root, faults.file ?? (version.includes("-beta.") ? "beta.yml" : "latest.yml")), yml);
  if (faults.extraFile) writeFileSync(path.join(root, faults.extraFile), yml);
  mkdirSync(path.join(root, "win-unpacked", "resources"), { recursive: true });
  writeFileSync(path.join(root, "win-unpacked", "Litzio.exe"), bytes);
  writeFileSync(path.join(root, "win-unpacked", "resources", "app-update.yml"), ["owner: litzio", "repo: litzio", "provider: github",
    ...(faults.host ? ["host: 127.0.0.1:47320", "protocol: http"] : []), ...(faults.publisher ? ["publisherName:", "  - Litzio"] : []),
    "updaterCacheDirName: litzio-updater", ""].join("\n"));
  return root;
}

test("Stable and Beta releases verify with their own metadata file", () => {
  assert.deepEqual(verifyRelease({ tag: "v0.2.0", version: "0.2.0", release: release("0.2.0"), signed: false }).map((file) => path.basename(file)),
    ["Litzio-Setup-0.2.0.exe", "Litzio-Setup-0.2.0.exe.blockmap", "latest.yml"]);
  assert.deepEqual(verifyRelease({ tag: "v0.3.0-beta.1", version: "0.3.0-beta.1", release: release("0.3.0-beta.1"), signed: false }).map((file) => path.basename(file)),
    ["Litzio-Setup-0.3.0-beta.1.exe", "Litzio-Setup-0.3.0-beta.1.exe.blockmap", "beta.yml"]);
});

test("custom Stable/Beta manifests survive the workflow artifact upload and download layout", () => {
  const channels = brand.updates.channels as { stable: string; beta: string }, original = { ...channels };
  try {
    Object.assign(channels, { stable: "proof-stable", beta: "proof-beta" });
    for (const [version, manifest] of [["0.2.0", "proof-stable.yml"], ["0.3.0-beta.1", "proof-beta.yml"]] as const) {
      const source = release(version, { file: manifest });
      writeFileSync(path.join(source, "unrelated.yml"), "not a release asset");
      const options = { tag: `v${version}`, version, release: source, signed: false };
      const verified = verifyRelease(options), output = path.join(source, "github-output");
      writeReleaseArtifactPaths(verified, source, output);
      const paths = /^paths<<([^\n]+)\n([\s\S]*)\n\1\n$/u.exec(readFileSync(output, "utf8"))![2]!.split("\n");
      assert.deepEqual(paths.map(file => path.basename(file)), [`Litzio-Setup-${version}.exe`, `Litzio-Setup-${version}.exe.blockmap`, manifest, "win-unpacked"]);
      const downloaded = mkdtempSync(path.join(os.tmpdir(), "litzio-downloaded-")); roots.push(downloaded);
      for (const file of paths) cpSync(file, path.join(downloaded, path.basename(file)), { recursive: true });
      assert.deepEqual(verifyRelease({ ...options, release: downloaded }).map(file => path.basename(file)), verified.map(file => path.basename(file)));
      assert.equal(readFileSync(path.join(downloaded, manifest), "utf8"), readFileSync(path.join(source, manifest), "utf8"));
    }
  } finally { Object.assign(channels, original); }
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
  const valid = { status: "Valid", path: file, subject: "CN=Litzio,O=Litzio contributors,C=KR" };
  assert.equal(signatureProblem(["CN=Litzio,O=Litzio contributors,C=KR"], file, valid), null);
  assert.equal(signatureProblem(["Litzio"], file, valid), null);
  assert.match(signatureProblem(["CN=Litzio,O=Other"], file, valid)!, /publisher does not match/);
  assert.match(signatureProblem([], file, valid)!, /no allowed publisher/);
  assert.match(signatureProblem(["Litzio"], file, { ...valid, status: "NotSigned" })!, /signature is NotSigned/);
  assert.match(signatureProblem(["Litzio"], file, { ...valid, path: path.resolve("other.exe") })!, /another file/);
});

test("a signed release must name the publisher updates are verified against", { skip: process.platform !== "win32" && "Authenticode is checked on Windows" }, () => {
  // The synthetic installer is not a signed executable: both it and the missing publisher are reported.
  assert.throws(() => verifyRelease({ tag: "v0.2.0", version: "0.2.0", release: release("0.2.0"), signed: true }),
    (error: Error) => /names no publisher/.test(error.message) && /Litzio-Setup-0\.2\.0\.exe signature is (?!Valid)\w+/.test(error.message));
});

test("the builder blockmap is bound to this installer, including chunk checksums", async () => {
  const root = release("0.2.0");
  const installer = path.join(root, "Litzio-Setup-0.2.0.exe");
  const blockmap = `${installer}.blockmap`;
  const require = createRequire(import.meta.url);
  const builder = createRequire(require.resolve("electron-builder"));
  const { buildBlockMap } = builder("app-builder-lib/out/targets/blockmap/blockmap.js");
  await buildBlockMap(installer, "gzip", blockmap);
  await verifyBlockmap(installer, blockmap);
  writeFileSync(installer, "another installer of the same length");
  await assert.rejects(verifyBlockmap(installer, blockmap), /does not match the installer/);
});

test("manual release modes reject unsigned Stable and unsafe tags", () => {
  assert.equal(releaseMode("unsigned-beta", "v0.0.1-beta.2"), "unsigned-beta");
  assert.equal(releaseMode("signed", "v1.0.0"), "signed");
  for (const tag of ["v1.0.0", "v1.0.0-rc.1", "v01.0.0-beta.2", "v1.0.0-beta.02", "--help", "v1.0.0-beta.2\n", "v1.0.0-beta.2\r", "v1.0.0-beta.2\nBAD=1"]) {
    assert.throws(() => releaseMode("unsigned-beta", tag));
  }
  assert.throws(() => releaseMode("publish", "v1.0.0"));
});

test("preflight accepts only an existing, version-matched tag in the captured master history", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-release-git-")); roots.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "master"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  mkdirSync(path.join(root, "apps/desktop"), { recursive: true });
  writeFileSync(path.join(root, "apps/desktop/package.json"), '{"version":"0.0.1-beta.2"}');
  git("add", "."); git("commit", "-m", "Fixture"); git("tag", "-a", "v0.0.1-beta.2", "-m", "Fixture tag");
  const master = git("rev-parse", "HEAD");
  git("tag", "v0.0.1-beta.3");
  git("switch", "-c", "other"); writeFileSync(path.join(root, "other.txt"), "other"); git("add", "."); git("commit", "-m", "Other fixture"); git("tag", "v0.0.1-beta.4"); git("switch", "master");
  const origin = path.join(root, "origin.git"); git("clone", "--bare", root, origin); git("remote", "add", "origin", origin);
  assert.equal(resolveRelease(root, "v0.0.1-beta.2", "unsigned-beta", master).commit, master);
  assert.throws(() => resolveRelease(root, "v0.0.1-beta.9", "unsigned-beta", master));
  assert.throws(() => resolveRelease(root, "v0.0.1-beta.3", "unsigned-beta", master), /package version differ/);
  assert.throws(() => resolveRelease(root, "v0.0.1-beta.4", "unsigned-beta", master), /trusted master history/);
  git("--git-dir", origin, "update-ref", "-d", "refs/tags/v0.0.1-beta.2");
  assert.throws(() => resolveRelease(root, "v0.0.1-beta.2", "unsigned-beta", master), /Remote release tag/);
});

test("publication uses a new Draft ID, checks all uploaded hashes and activates only at the end", () => {
  const tag = "v0.0.1-beta.2";
  const files = verifyRelease({ tag, version: tag.slice(1), signed: false, release: release(tag.slice(1)) });
  for (const fault of ["none", "collision", "page2-draft", "upload", "asset-set", "digest", "state", "changed-tag", "activate"] as const) {
    const calls: { endpoint: string; method: string; body?: object }[] = [];
    const draft = { id: 123, tag_name: tag, draft: true, prerelease: true, assets: [] as object[] };
    const api: ReleaseApi = (endpoint, method = "GET", body, file) => {
      calls.push({ endpoint, method, body });
      if (endpoint.includes("?per_page")) {
        if (fault === "collision") return [{ tag_name: tag }];
        if (fault === "page2-draft") return endpoint.endsWith("page=1") ? Array.from({ length: 100 }, () => ({ tag_name: "v0.0.0-beta.1" })) : [{ tag_name: tag, draft: true }];
        return [];
      }
      if (endpoint === "repos/litzio/litzio/releases") { assert.equal(method, "POST"); assert.equal((body as { make_latest: string }).make_latest, "false"); return draft; }
      if (file) {
        if (fault === "upload") throw new Error("Partial upload");
        draft.assets.push({ name: path.basename(file), size: statSync(file).size, state: fault === "state" ? "starter" : "uploaded",
          digest: fault === "digest" ? "sha256:wrong" : `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}` });
        return {};
      }
      assert.equal(endpoint, "repos/litzio/litzio/releases/123", "never resolve a Draft by tag");
      if (method === "PATCH") {
        assert.equal((body as { make_latest: string }).make_latest, "false");
        if (fault === "activate") throw new Error("Lost response");
        return { ...draft, draft: false };
      }
      return fault === "asset-set" ? { ...draft, assets: draft.assets.slice(1) } : draft;
    };
    const run = () => publishVerifiedRelease({ tag, mode: "unsigned-beta", files, beforeActivate: () => { if (fault === "changed-tag") throw new Error("Tag changed"); } }, api);
    if (fault === "none") { assert.equal(run().draft, false); assert.equal(calls.at(-1)?.method, "PATCH"); }
    else {
      assert.throws(run, fault === "activate" ? /confirmation required/ : fault.includes("draft") || fault === "collision" ? /already exists/ : /remains Draft/);
      assert.equal(calls.some((call) => call.method === "PATCH"), fault === "activate", fault);
    }
  }
  assert.throws(() => publishVerifiedRelease({ tag, mode: "verify", files, beforeActivate() {} }, () => { throw new Error("Must not call GitHub"); }), /cannot publish/);
});
